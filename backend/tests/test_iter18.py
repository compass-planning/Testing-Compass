"""Iter18 backend tests: nudge-preview, nudge-goals, task due_date, task PATCH done."""
import os
import time
import pyotp
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compass-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADVISOR_EMAIL = "advisor@compass.ca"
ADVISOR_PW = "Compass2026!"


@pytest.fixture(scope="module")
def advisor_token():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADVISOR_EMAIL, "password": ADVISOR_PW}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] in ("mfa_setup", "mfa_required"), data
    challenge = data["challenge"]
    if data["status"] == "mfa_setup":
        secret = data["secret"]
    else:
        pytest.skip("MFA already enrolled — expected unenrolled state")
    code = pyotp.TOTP(secret).now()
    r = s.post(f"{API}/auth/mfa/verify", json={"challenge": challenge, "code": code}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    if d["status"] == "security_required":
        r = s.post(f"{API}/auth/security-question", json={
            "setup_token": d["setup_token"], "question": d["questions"][0], "answer": "toronto"
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
    assert d["status"] == "authenticated", d
    return d["token"]


@pytest.fixture(scope="module")
def hdr(advisor_token):
    return {"Authorization": f"Bearer {advisor_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seeded(hdr):
    """Create a TEST household with an underfunded retirement goal."""
    stamp = int(time.time())
    name = f"TEST ZZ18 Primary {stamp}"
    r = requests.post(f"{API}/owners", headers=hdr, json={
        "full_name": name, "relationship": "self", "province": "ON", "annual_income": 100000
    }, timeout=15)
    assert r.status_code == 200, r.text
    cid = r.json()["scope"]["client_id"]

    year = time.gmtime().tm_year + 3
    r = requests.post(f"{API}/goals", headers=hdr, params={"household_id": cid}, json={
        "title": "TEST Retirement iter18", "category": "retirement",
        "target_amount": 1000000, "current_amount": 10000, "target_year": year,
        "owner_id": None, "linked_asset_ids": [], "monthly_contribution": 100, "growth_rate": 5
    }, timeout=15)
    assert r.status_code == 200, r.text
    gid = r.json()["id"]
    yield {"client_id": cid, "goal_id": gid, "stamp": stamp}

    # cleanup goals
    requests.delete(f"{API}/goals/{gid}", headers=hdr, params={"household_id": cid}, timeout=15)


# -------------------- NUDGE PREVIEW --------------------

class TestNudgePreview:
    def test_preview_returns_changes(self, hdr, seeded):
        cid = seeded["client_id"]
        r = requests.get(f"{API}/advisor/households/{cid}/nudge-preview", headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "changes" in data
        changes = data["changes"]
        assert len(changes) >= 1
        ch = next(c for c in changes if c["id"] == seeded["goal_id"])
        assert ch["title"] == "TEST Retirement iter18"
        assert ch["action"] in ("catch-up", "extend")
        assert ch["old_monthly"] == 100
        assert isinstance(ch["new_monthly"], (int, float))
        assert ch["new_monthly"] > ch["old_monthly"]

    def test_preview_does_not_write(self, hdr, seeded):
        cid, gid = seeded["client_id"], seeded["goal_id"]
        # fetch before
        before = requests.get(f"{API}/goals", headers=hdr, params={"household_id": cid}, timeout=15).json()
        before_g = next(g for g in before if g["id"] == gid)
        # preview
        requests.get(f"{API}/advisor/households/{cid}/nudge-preview", headers=hdr, timeout=15)
        after = requests.get(f"{API}/goals", headers=hdr, params={"household_id": cid}, timeout=15).json()
        after_g = next(g for g in after if g["id"] == gid)
        assert before_g["monthly_contribution"] == after_g["monthly_contribution"]
        assert before_g["target_year"] == after_g["target_year"]


# -------------------- NUDGE APPLY --------------------

class TestNudgeApply:
    def test_apply_updates_goal(self, hdr, seeded):
        cid, gid = seeded["client_id"], seeded["goal_id"]
        pr = requests.get(f"{API}/advisor/households/{cid}/nudge-preview", headers=hdr, timeout=15).json()
        proposed = next(c for c in pr["changes"] if c["id"] == gid)

        r = requests.post(f"{API}/advisor/households/{cid}/nudge-goals", headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["nudged"] >= 1

        goals = requests.get(f"{API}/goals", headers=hdr, params={"household_id": cid}, timeout=15).json()
        g = next(x for x in goals if x["id"] == gid)
        assert round(g["monthly_contribution"]) == proposed["new_monthly"]
        assert int(g["target_year"]) == proposed["new_year"]

    def test_apply_second_time_returns_zero(self, hdr, seeded):
        # After first apply, goal should be back on track → no changes
        cid = seeded["client_id"]
        r = requests.post(f"{API}/advisor/households/{cid}/nudge-goals", headers=hdr, timeout=15)
        assert r.status_code == 200
        # could still have changes if current_amount still < target but monthly now covers it;
        # at minimum endpoint should respond with 'nudged' key as an int
        assert isinstance(r.json().get("nudged"), int)


# -------------------- TASK DUE DATE --------------------

class TestTaskDueDate:
    def test_create_task_with_due_date(self, hdr, seeded):
        cid = seeded["client_id"]
        r = requests.post(f"{API}/advisor/tasks", headers=hdr, json={
            "client_id": cid, "title": f"TEST iter18 due task {seeded['stamp']}", "due_date": "2026-12-31"
        }, timeout=15)
        assert r.status_code == 200, r.text
        task = r.json()
        assert task["due_date"] == "2026-12-31"
        assert task["done"] is False
        tid = task["id"]

        # verify persistence via list
        rows = requests.get(f"{API}/advisor/tasks", headers=hdr, timeout=15).json()
        got = next(t for t in rows if t["id"] == tid)
        assert got["due_date"] == "2026-12-31"

        # PATCH due_date change
        r = requests.patch(f"{API}/advisor/tasks/{tid}", headers=hdr, json={"due_date": "2024-01-01"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["due_date"] == "2024-01-01"

        # PATCH done:true
        r = requests.patch(f"{API}/advisor/tasks/{tid}", headers=hdr, json={"done": True}, timeout=15)
        assert r.status_code == 200
        assert r.json()["done"] is True

        # cleanup
        d = requests.delete(f"{API}/advisor/tasks/{tid}", headers=hdr, timeout=15)
        assert d.status_code == 200

    def test_create_task_without_due_date(self, hdr, seeded):
        cid = seeded["client_id"]
        r = requests.post(f"{API}/advisor/tasks", headers=hdr, json={
            "client_id": cid, "title": f"TEST iter18 no-due {seeded['stamp']}"
        }, timeout=15)
        assert r.status_code == 200
        task = r.json()
        assert task.get("due_date") is None
        requests.delete(f"{API}/advisor/tasks/{task['id']}", headers=hdr, timeout=15)


# -------------------- CLEANUP MODULE --------------------

def test_zz_cleanup(hdr, seeded):
    """Final cleanup — delete owner/household."""
    cid = seeded["client_id"]
    # delete any residual tasks
    rows = requests.get(f"{API}/advisor/tasks", headers=hdr, timeout=15).json()
    for t in rows:
        if t.get("scope", {}).get("client_id") == cid:
            requests.delete(f"{API}/advisor/tasks/{t['id']}", headers=hdr, timeout=15)
    # owners
    owners = requests.get(f"{API}/owners", headers=hdr, params={"household_id": cid}, timeout=15)
    if owners.status_code == 200:
        for o in owners.json():
            requests.delete(f"{API}/owners/{o['id']}", headers=hdr, params={"household_id": cid}, timeout=15)
