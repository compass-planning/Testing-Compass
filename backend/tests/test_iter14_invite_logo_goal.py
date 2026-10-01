"""Iteration 14 backend tests:
   1) Onboarding starter goal (POST /api/goals during household creation)
   2) Logo cleanup (DELETE /api/advisor/branding/logo)
   3) Client invite + first-login flow (temp password → MFA → security → password change)
"""
import os
import time
import pyotp
import pytest
import requests
from datetime import datetime, timezone

from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADVISOR_EMAIL = "advisor@compass.ca"
PWD = "Compass2026!"


# ---------- helpers ----------
def _reset_advisor_mfa():
    import subprocess
    subprocess.run(
        ["python", "-c",
         "from dotenv import load_dotenv;from pathlib import Path;load_dotenv(Path('.env'));"
         "from repository import repo;u=repo.find_user_by_email('advisor@compass.ca');"
         "repo.update_user(u['id'],{'mfa_enabled':False,'mfa_secret':None,'must_change_password':False})"],
        cwd="/app/backend", check=False,
    )


def _login_advisor():
    r = requests.post(f"{API}/auth/login", json={"email": ADVISOR_EMAIL, "password": PWD})
    r.raise_for_status()
    j = r.json()
    if j["status"] == "mfa_setup":
        secret = j["secret"]
        code = pyotp.TOTP(secret).now()
        v = requests.post(f"{API}/auth/mfa/verify", json={"challenge": j["challenge"], "code": code}).json()
        if v["status"] == "security_required":
            v = requests.post(f"{API}/auth/security-question",
                              json={"setup_token": v["setup_token"], "question": v["questions"][0], "answer": "toronto"}).json()
        return v["token"], secret
    elif j["status"] == "mfa_required":
        # should not happen after reset but fallback
        raise RuntimeError("Advisor MFA still enrolled; reset first")
    raise RuntimeError(j)


@pytest.fixture(scope="module")
def advisor_token():
    _reset_advisor_mfa()
    token, _secret = _login_advisor()
    yield token
    _reset_advisor_mfa()


@pytest.fixture
def h(advisor_token):
    return {"Authorization": f"Bearer {advisor_token}", "Content-Type": "application/json"}


# ---------- Feature 1: Starter goal via /api/goals ----------
class TestStarterGoal:
    def test_household_without_starter_is_needs_setup(self, h):
        # create a brand-new household (no goals)
        r = requests.post(f"{API}/owners", headers=h, json={
            "full_name": "TEST_ITER14 NoGoal Primary",
            "province": "ON", "relationship": "self", "annual_income": 100000,
        })
        assert r.status_code == 200, r.text
        cid = r.json()["scope"]["client_id"]
        lst = requests.get(f"{API}/advisor/clients", headers=h).json()
        row = next((x for x in lst if x["client_id"] == cid), None)
        assert row is not None
        assert row["needs_setup"] is True
        assert row["goals"] == 0
        # cleanup
        requests.delete(f"{API}/owners/{r.json()['id']}", headers=h)

    def test_household_with_starter_goal_clears_needs_setup(self, h):
        r = requests.post(f"{API}/owners", headers=h, json={
            "full_name": "TEST_ITER14 Starter Primary",
            "province": "ON", "relationship": "self", "annual_income": 100000,
        })
        assert r.status_code == 200
        cid = r.json()["scope"]["client_id"]
        owner_id = r.json()["id"]
        year = datetime.now(timezone.utc).year + 30
        g = requests.post(f"{API}/goals", headers=h, params={"household_id": cid}, json={
            "title": "Retirement", "category": "retirement",
            "target_amount": 1_000_000, "current_amount": 0,
            "target_year": year, "monthly_contribution": 0, "growth_rate": 5,
        })
        assert g.status_code == 200, g.text
        lst = requests.get(f"{API}/advisor/clients", headers=h).json()
        row = next((x for x in lst if x["client_id"] == cid), None)
        assert row is not None
        assert row["goals"] >= 1
        assert row["needs_setup"] is False
        requests.delete(f"{API}/owners/{owner_id}", headers=h)


# ---------- Feature 2: Logo delete ----------
class TestLogoCleanup:
    def test_upload_then_delete_logo_clears_fields_and_public_404(self, h):
        # upload a tiny PNG (1x1 transparent)
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00"
               b"\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("logo.png", png, "image/png")}
        up = requests.post(f"{API}/advisor/branding/logo",
                           headers={"Authorization": h["Authorization"]}, files=files)
        assert up.status_code == 200, up.text
        # set logo_url too via PUT branding
        me = requests.get(f"{API}/auth/me", headers=h).json()
        uid = me["id"]
        put = requests.put(f"{API}/advisor/branding", headers=h, json={
            "firm_name": "Compass Planning", "cover_note": "",
            "logo": "", "logo_url": f"{BASE_URL}/api/public/logo/{uid}",
        })
        assert put.status_code == 200
        # public endpoint works before delete
        pub = requests.get(f"{BASE_URL}/api/public/logo/{uid}")
        assert pub.status_code == 200
        # DELETE
        d = requests.delete(f"{API}/advisor/branding/logo", headers=h)
        assert d.status_code == 200, d.text
        br = requests.get(f"{API}/advisor/branding", headers=h).json()
        assert br.get("logo", "") == ""
        assert br.get("logo_url", "") == ""
        pub2 = requests.get(f"{BASE_URL}/api/public/logo/{uid}")
        assert pub2.status_code == 404


# ---------- Feature 3: Client invite + first-login ----------
class TestClientInvite:
    def test_invite_and_first_login_flow(self, h):
        # pick an existing household
        lst = requests.get(f"{API}/advisor/clients", headers=h).json()
        cid = "client_a1"
        assert any(x["client_id"] == cid for x in lst)

        test_email = f"delivered+iter14_{int(time.time())}@example.com"
        inv = requests.post(f"{API}/advisor/clients/invite", headers=h, json={
            "email": test_email, "full_name": "TEST_ITER14 Invited", "client_id": cid,
        })
        assert inv.status_code == 200, inv.text
        temp_pw = inv.json()["temp_password"]
        assert temp_pw and temp_pw.startswith("Cmps-")

        # duplicate → 409
        dup = requests.post(f"{API}/advisor/clients/invite", headers=h, json={
            "email": test_email, "full_name": "TEST_ITER14 dup", "client_id": cid,
        })
        assert dup.status_code == 409

        # 1) login with temp password → mfa_setup
        r = requests.post(f"{API}/auth/login", json={"email": test_email, "password": temp_pw}).json()
        assert r["status"] == "mfa_setup", r
        secret = r["secret"]
        challenge = r["challenge"]

        # 2) verify TOTP → security_required
        code = pyotp.TOTP(secret).now()
        v = requests.post(f"{API}/auth/mfa/verify", json={"challenge": challenge, "code": code}).json()
        assert v["status"] == "security_required", v
        setup_token = v["setup_token"]

        # 3) set security question → password_change_required
        sq = requests.post(f"{API}/auth/security-question", json={
            "setup_token": setup_token, "question": v["questions"][0], "answer": "montreal",
        }).json()
        assert sq["status"] == "password_change_required", sq
        change_token = sq["change_token"]

        # 4) change password → authenticated
        new_pw = "ClientNew2026!"
        cp = requests.post(f"{API}/auth/change-password", json={
            "change_token": change_token, "new_password": new_pw,
        }).json()
        assert cp["status"] == "authenticated", cp
        client_token = cp["token"]

        # old temp password no longer works
        bad = requests.post(f"{API}/auth/login", json={"email": test_email, "password": temp_pw})
        assert bad.status_code == 401

        # client can GET /api/owners for their household
        ch = {"Authorization": f"Bearer {client_token}"}
        own = requests.get(f"{API}/owners", headers=ch)
        assert own.status_code == 200
        owners = own.json()
        assert len(owners) >= 1
        assert all(o.get("scope", {}).get("client_id") == cid for o in owners)

        # client adds a goal → visible to advisor goal_count
        before = requests.get(f"{API}/advisor/clients", headers=h).json()
        before_count = next(x for x in before if x["client_id"] == cid)["goals"]
        gr = requests.post(f"{API}/goals", headers={**ch, "Content-Type": "application/json"}, json={
            "title": "TEST_ITER14 Client Goal", "category": "retirement",
            "target_amount": 50000, "current_amount": 0, "target_year": 2050,
        })
        assert gr.status_code == 200, gr.text
        after = requests.get(f"{API}/advisor/clients", headers=h).json()
        after_count = next(x for x in after if x["client_id"] == cid)["goals"]
        assert after_count == before_count + 1

        # ---- cleanup ----
        # delete the goal
        try:
            requests.delete(f"{API}/goals/{gr.json()['id']}", headers=ch)
        except Exception:
            pass
        # delete the invited user from Mongo
        import subprocess
        subprocess.run(
            ["python", "-c",
             f"from dotenv import load_dotenv;from pathlib import Path;load_dotenv(Path('.env'));"
             f"from dotenv import load_dotenv;from pathlib import Path;load_dotenv(Path('.env'));"
             f"import os;from pymongo import MongoClient;"
             f"c=MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']];"
             f"r=c['shared__users'].delete_one({{'email':'{test_email}'}});print('deleted',r.deleted_count)"],
            cwd="/app/backend", check=False,
        )
