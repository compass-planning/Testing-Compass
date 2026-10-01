"""Iter 10 — Branded email HTML header + history-drill-in payload fields."""
import os, pyotp, pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
PWD = "Compass2026!"


def _login(email):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": PWD}, timeout=20).json()
    if r.get("status") == "mfa_setup":
        secret = r["secret"]
    elif r.get("status") == "mfa_required":
        pytest.skip("account already enrolled; reset first")
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


class TestBrandedEmailHeader:
    def test_email_uses_branded_firm_name(self, advisor):
        # set branding
        advisor.put(f"{API}/advisor/branding",
                    json={"firm_name": "TEST_Iter10 Firm", "cover_note": "", "logo": ""})
        p = {"household_id": "client_a1"}
        r = advisor.post(f"{API}/report/email", params=p,
                         json={"recipient": "delivered@resend.dev", "net_worth": 500000,
                               "protection_score": 77, "retirement_success": 82})
        assert r.status_code == 200, r.text
        # reset to default
        advisor.put(f"{API}/advisor/branding",
                    json={"firm_name": "Compass Planning", "cover_note": "", "logo": ""})


class TestHistoryDrillin:
    def test_history_row_has_drillin_fields(self, advisor):
        p = {"household_id": "client_a1"}
        payload = {"recipient": "delivered@resend.dev", "net_worth": 777777,
                   "protection_score": 88, "retirement_success": 91}
        s = advisor.post(f"{API}/report/email", params=p, json=payload)
        assert s.status_code == 200, s.text
        h = advisor.get(f"{API}/report/history", params=p)
        assert h.status_code == 200
        rows = h.json()
        assert len(rows) >= 1
        row = rows[0]
        # these fields power the history-modal
        for k in ("recipient", "sent_at", "net_worth", "protection_score", "retirement_success"):
            assert k in row, f"missing field {k} in history row: {row}"
        assert row["net_worth"] == 777777
        assert row["protection_score"] == 88
        assert row["retirement_success"] == 91
