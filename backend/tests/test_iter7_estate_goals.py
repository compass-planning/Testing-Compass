"""Iter 7 — Estate CRUD scoping + Goal.linked_asset_ids persistence."""
import os, pyotp, pytest, requests, time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compass-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PWD = os.environ.get("TEST_PASSWORD", "Compass2026!")
DEMO_SECRET = "JBSWY3DPEHPK3PXP"


def _login(email):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": PWD}, timeout=20).json()
    if r.get("status") == "mfa_setup":
        secret = r["secret"]
    elif r.get("status") == "mfa_required":
        secret = DEMO_SECRET
    else:
        pytest.skip(f"Unexpected login: {r}")
    code = pyotp.TOTP(secret).now()
    v = s.post(f"{API}/auth/mfa/verify", json={"challenge": r["challenge"], "code": code}, timeout=20).json()
    if v.get("status") == "security_required":
        v = s.post(f"{API}/auth/security-question", json={"setup_token": v["setup_token"], "question": v["questions"][0], "answer": "toronto"}, timeout=20).json()
    assert v.get("status") == "authenticated", v
    s.headers.update({"Authorization": f"Bearer {v['token']}"})
    return s


@pytest.fixture(scope="module")
def advisor():
    return _login("advisor@compass.ca")


@pytest.fixture(scope="module")
def enterprise():
    return _login("scott@sweston.ca")


# ---------- Estate CRUD ----------
class TestEstate:
    def test_advisor_requires_household(self, advisor):
        r = advisor.post(f"{API}/plan/estate", json={"kind": "beneficiary", "asset": "RRSP", "beneficiary": "Mai", "allocation": 100})
        assert r.status_code == 400

    def test_create_beneficiary_and_document(self, advisor):
        p = {"household_id": "client_a1"}
        b = advisor.post(f"{API}/plan/estate", params=p, json={"kind": "beneficiary", "asset": "RRSP", "beneficiary": "TEST_Mai", "allocation": 100})
        assert b.status_code in (200, 201), b.text
        bid = b.json()["id"]
        d = advisor.post(f"{API}/plan/estate", params=p, json={"kind": "document", "asset": "Will", "doc_type": "will", "status": "current"})
        assert d.status_code in (200, 201)
        did = d.json()["id"]

        lst = advisor.get(f"{API}/plan/estate", params=p).json()
        kinds = {x["id"]: x for x in lst}
        assert bid in kinds and kinds[bid]["kind"] == "beneficiary" and kinds[bid]["allocation"] == 100
        assert did in kinds and kinds[did]["kind"] == "document" and kinds[did]["status"] == "current"

        # Update
        u = advisor.put(f"{API}/plan/estate/{bid}", params=p, json={"allocation": 75})
        assert u.status_code == 200
        after = {x["id"]: x for x in advisor.get(f"{API}/plan/estate", params=p).json()}
        assert after[bid]["allocation"] == 75

        # Delete
        assert advisor.delete(f"{API}/plan/estate/{bid}", params=p).status_code in (200, 204)
        assert advisor.delete(f"{API}/plan/estate/{did}", params=p).status_code in (200, 204)
        after = {x["id"] for x in advisor.get(f"{API}/plan/estate", params=p).json()}
        assert bid not in after and did not in after

    def test_enterprise_readonly_403(self, enterprise):
        r = enterprise.post(f"{API}/plan/estate", params={"household_id": "corp_sweston"}, json={"kind": "beneficiary", "asset": "x", "beneficiary": "y", "allocation": 50})
        assert r.status_code == 403


# ---------- Goal linked_asset_ids ----------
class TestGoalLinked:
    def test_create_update_linked(self, advisor):
        p = {"household_id": "client_a1"}
        payload = {"title": "TEST_Retirement Goal", "target_amount": 500000, "current_amount": 0, "target_year": 2040, "linked_asset_ids": ["a1", "a2"]}
        r = advisor.post(f"{API}/goals", params=p, json=payload)
        assert r.status_code in (200, 201), r.text
        gid = r.json()["id"]
        assert r.json().get("linked_asset_ids") == ["a1", "a2"]

        got = advisor.get(f"{API}/goals", params=p).json()
        mine = [g for g in got if g["id"] == gid][0]
        assert mine.get("linked_asset_ids") == ["a1", "a2"]

        upd = advisor.put(f"{API}/goals/{gid}", params=p, json={**payload, "linked_asset_ids": ["a3"]})
        assert upd.status_code == 200
        assert upd.json().get("linked_asset_ids") == ["a3"]

        got2 = advisor.get(f"{API}/goals", params=p).json()
        mine2 = [g for g in got2 if g["id"] == gid][0]
        assert mine2.get("linked_asset_ids") == ["a3"]

        # clear
        upd2 = advisor.put(f"{API}/goals/{gid}", params=p, json={**payload, "linked_asset_ids": []})
        assert upd2.status_code == 200
        got3 = advisor.get(f"{API}/goals", params=p).json()
        mine3 = [g for g in got3 if g["id"] == gid][0]
        assert mine3.get("linked_asset_ids") in ([], None)

        advisor.delete(f"{API}/goals/{gid}", params=p)
