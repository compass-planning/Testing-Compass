"""Iter 9 — Firm branding sync (server-side), report history, goal nudge alert."""
import os, pyotp, pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
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
    v = s.post(f"{API}/auth/mfa/verify",
               json={"challenge": r["challenge"], "code": code}, timeout=20).json()
    if v.get("status") == "security_required":
        v = s.post(f"{API}/auth/security-question",
                   json={"setup_token": v["setup_token"],
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


# ---------- Firm branding sync ----------
class TestBranding:
    def test_advisor_put_and_get_persists(self, advisor):
        payload = {"firm_name": "TEST_Compass Firm", "cover_note": "TEST cover note here", "logo": ""}
        r = advisor.put(f"{API}/advisor/branding", json=payload)
        assert r.status_code == 200, r.text
        got = advisor.get(f"{API}/advisor/branding")
        assert got.status_code == 200
        data = got.json()
        assert data.get("firm_name") == "TEST_Compass Firm"
        assert data.get("cover_note") == "TEST cover note here"

    def test_enterprise_put_forbidden(self, enterprise):
        r = enterprise.put(f"{API}/advisor/branding",
                           json={"firm_name": "Nope", "cover_note": "", "logo": ""})
        assert r.status_code == 403, r.text

    def test_branding_persists_new_request(self, advisor):
        # subsequent GET on same account proves server-side persistence (not browser)
        r = advisor.get(f"{API}/advisor/branding")
        assert r.status_code == 200
        assert r.json().get("firm_name") == "TEST_Compass Firm"

    def test_reset_branding_to_default(self, advisor):
        # cleanup: reset
        advisor.put(f"{API}/advisor/branding",
                    json={"firm_name": "Compass Planning", "cover_note": "", "logo": ""})


# ---------- Report history ----------
class TestReportHistory:
    def test_email_then_history_newest_first(self, advisor):
        p = {"household_id": "client_a1"}
        # Send one
        r = advisor.post(f"{API}/report/email", params=p,
                         json={"recipient": "delivered@resend.dev", "net_worth": 111,
                               "protection_score": 70, "retirement_success": 80})
        assert r.status_code == 200, r.text
        h = advisor.get(f"{API}/report/history", params=p)
        assert h.status_code == 200, h.text
        rows = h.json()
        assert isinstance(rows, list) and len(rows) >= 1
        assert rows[0]["recipient"] == "delivered@resend.dev"
        assert rows[0]["household_id"] == "client_a1"
        # newest first
        if len(rows) >= 2:
            assert rows[0]["sent_at"] >= rows[1]["sent_at"]

    def test_history_scoped_to_household(self, advisor):
        # client_a2 should not see client_a1 rows
        r = advisor.get(f"{API}/report/history", params={"household_id": "client_a2"})
        assert r.status_code == 200
        for row in r.json():
            assert row["household_id"] == "client_a2"

    def test_solo_history_works(self, solo):
        solo.post(f"{API}/report/email",
                  json={"recipient": "delivered@resend.dev", "net_worth": 5000,
                        "protection_score": 65, "retirement_success": 72})
        r = solo.get(f"{API}/report/history")
        assert r.status_code == 200
        assert len(r.json()) >= 1


# ---------- Goal nudges ----------
class TestGoalNudge:
    def test_behind_schedule_alert_appears(self, advisor):
        p = {"household_id": "client_a1"}
        # Create a goal that cannot possibly be funded by target_year
        payload = {"title": "TEST_Behind Goal", "target_amount": 1_000_000,
                   "current_amount": 100, "target_year": 2027,
                   "monthly_contribution": 50, "growth_rate": 2.0}
        c = advisor.post(f"{API}/goals", params=p, json=payload)
        assert c.status_code in (200, 201), c.text
        gid = c.json()["id"]
        try:
            r = advisor.get(f"{API}/advisor/clients")
            assert r.status_code == 200
            a1 = next((x for x in r.json() if x.get("client_id") == "client_a1"), None)
            assert a1 is not None
            alerts = a1.get("alerts", [])
            assert any("behind projected schedule" in a for a in alerts), f"Expected nudge, saw: {alerts}"
        finally:
            advisor.delete(f"{API}/goals/{gid}", params=p)
