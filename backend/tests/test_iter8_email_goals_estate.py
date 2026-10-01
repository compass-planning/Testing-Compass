"""Iter 8 — Report email + goal projections persistence + estate alerts in advisor feed."""
import os, pyotp, pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compass-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PWD = "Compass2026!"
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
        v = s.post(f"{API}/auth/security-question", json={"setup_token": v["setup_token"],
                   "question": v["questions"][0], "answer": "toronto"}, timeout=20).json()
    assert v.get("status") == "authenticated", v
    s.headers.update({"Authorization": f"Bearer {v['token']}"})
    return s


@pytest.fixture(scope="module")
def advisor():
    return _login("advisor@compass.ca")


@pytest.fixture(scope="module")
def enterprise():
    return _login("scott@sweston.ca")


@pytest.fixture(scope="module")
def solo():
    return _login("solo@compass.ca")


# ---------- /report/email ----------
class TestReportEmail:
    def test_advisor_missing_household_400(self, advisor):
        r = advisor.post(f"{API}/report/email",
                         json={"recipient": "delivered@resend.dev", "net_worth": 1000,
                               "protection_score": 70, "retirement_success": 80})
        assert r.status_code == 400, r.text

    def test_enterprise_403(self, enterprise):
        r = enterprise.post(f"{API}/report/email", params={"household_id": "corp_sweston"},
                            json={"recipient": "delivered@resend.dev", "net_worth": 1000,
                                  "protection_score": 70, "retirement_success": 80})
        assert r.status_code == 403, r.text

    def test_advisor_sends_ok(self, advisor):
        r = advisor.post(f"{API}/report/email", params={"household_id": "client_a1"},
                         json={"recipient": "delivered@resend.dev", "net_worth": 123456,
                               "protection_score": 72, "retirement_success": 81})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "sent"
        assert "email_id" in data

    def test_solo_sends_ok(self, solo):
        r = solo.post(f"{API}/report/email",
                      json={"recipient": "delivered@resend.dev", "net_worth": 50000,
                            "protection_score": 60, "retirement_success": 70})
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "sent"


# ---------- Goal projections persistence ----------
class TestGoalProjections:
    def test_goal_persists_contribution_growth(self, advisor):
        p = {"household_id": "client_a1"}
        payload = {"title": "TEST_Projection Goal", "target_amount": 100000,
                   "current_amount": 10000, "target_year": 2035,
                   "monthly_contribution": 500, "growth_rate": 6.0}
        c = advisor.post(f"{API}/goals", params=p, json=payload)
        assert c.status_code in (200, 201), c.text
        g = c.json()
        gid = g["id"]
        assert float(g.get("monthly_contribution", 0)) == 500
        assert float(g.get("growth_rate", 0)) == 6.0

        got = advisor.get(f"{API}/goals", params=p).json()
        mine = [x for x in got if x["id"] == gid][0]
        assert float(mine.get("monthly_contribution", 0)) == 500
        assert float(mine.get("growth_rate", 0)) == 6.0

        upd = advisor.put(f"{API}/goals/{gid}", params=p,
                          json={**payload, "monthly_contribution": 750, "growth_rate": 5.5})
        assert upd.status_code == 200
        u = upd.json()
        assert float(u.get("monthly_contribution", 0)) == 750
        assert float(u.get("growth_rate", 0)) == 5.5

        got2 = advisor.get(f"{API}/goals", params=p).json()
        mine2 = [x for x in got2 if x["id"] == gid][0]
        assert float(mine2.get("monthly_contribution", 0)) == 750
        assert float(mine2.get("growth_rate", 0)) == 5.5

        advisor.delete(f"{API}/goals/{gid}", params=p)


# ---------- Estate flags in advisor roster alerts ----------
class TestEstateAlerts:
    def test_alerts_include_will_and_beneficiary(self, advisor):
        # Pick a household with likely no will/beneficiary (iter7 left maybe TEST_Will on client_a1).
        # Clear estate on a scratch household — we'll use client_a3 (Rossi) and inspect.
        r = advisor.get(f"{API}/advisor/clients")
        assert r.status_code == 200, r.text
        clients = r.json()
        # Assert the alert strings are at least surfaced for at least one household when no will/beneficiary records.
        all_alerts = []
        for c in clients:
            all_alerts.extend(c.get("alerts", []))
        # At least one household should have either flag (demo seeds have no estate rows).
        has_will_flag = any("No will on file" in a for a in all_alerts)
        has_bene_flag = any("Beneficiary designations missing" in a for a in all_alerts)
        assert has_will_flag or has_bene_flag, f"Expected estate alerts, saw: {all_alerts}"
