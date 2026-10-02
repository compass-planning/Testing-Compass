"""Iter37 backend tests:
- Cross-border one-pager PDF endpoint (/api/report/crossborder-pdf) requires saved analysis; 200 after save; 403 for enterprise.
- RESP family save/saved + Education section in /report/pdf.
- OH progressive state tax (~$2,223 on $120k, 'Progressive state tax' note); TX zero / 'No state income tax'.
- Enterprise invite_status populates after invite (pending pill).
"""
import os, secrets as _s, pyotp, requests, pytest

def _url():
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=",1)[1].strip()
    except Exception:
        return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _url() or "").rstrip("/")
assert BASE_URL
API = f"{BASE_URL}/api"
TOTP = "JBSWY3DPEHPK3PXP"
HID = "client_a1"


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Compass2026!"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    code = pyotp.TOTP(TOTP).now()
    r2 = requests.post(f"{API}/auth/mfa/verify", json={"challenge": d["challenge"], "code": code}, timeout=20)
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


@pytest.fixture(scope="module")
def advisor():
    return _login("advisor@compass.ca")


@pytest.fixture(scope="module")
def enterprise():
    return _login("scott@sweston.ca")


# ── OH progressive state tax ───────────────────────────────────────────────
class TestOHProgressive:
    def test_oh_120k_us_person(self, advisor):
        h = {"Authorization": f"Bearer {advisor}"}
        body = {"ca_resident": False, "us_citizen": False, "us_green_card": True,
                "ca_citizen": False, "annual_income": 120000.0, "filing_status": "single",
                "state": "OH", "avg_annual_earnings": 60000.0, "claim_age": 67}
        r = requests.post(f"{API}/plan/crossborder?household_id={HID}", json=body, headers=h, timeout=20)
        assert r.status_code == 200, r.text
        us = r.json().get("us_tax") or {}
        assert us.get("state_tax") and 2100 <= us["state_tax"] <= 2350, us
        assert "Progressive" in (us.get("state_note") or ""), us

    def test_tx_zero(self, advisor):
        h = {"Authorization": f"Bearer {advisor}"}
        body = {"ca_resident": False, "us_citizen": False, "us_green_card": True,
                "ca_citizen": False, "annual_income": 120000.0, "filing_status": "single",
                "state": "TX", "avg_annual_earnings": 60000.0, "claim_age": 67}
        r = requests.post(f"{API}/plan/crossborder?household_id={HID}", json=body, headers=h, timeout=20)
        assert r.status_code == 200
        us = r.json().get("us_tax") or {}
        assert us.get("state_tax") == 0
        assert "No state income tax" in (us.get("state_note") or "")

    def test_ny_progressive(self, advisor):
        h = {"Authorization": f"Bearer {advisor}"}
        body = {"ca_resident": False, "us_citizen": False, "us_green_card": True,
                "ca_citizen": False, "annual_income": 120000.0, "filing_status": "single",
                "state": "NY", "avg_annual_earnings": 60000.0, "claim_age": 67}
        r = requests.post(f"{API}/plan/crossborder?household_id={HID}", json=body, headers=h, timeout=20)
        assert r.status_code == 200
        us = r.json().get("us_tax") or {}
        assert us.get("state_tax") and us["state_tax"] > 0
        assert "Progressive" in (us.get("state_note") or "")


# ── Cross-border one-pager PDF ─────────────────────────────────────────────
class TestCrossBorderOnePager:
    def test_404_before_save_or_200_after(self, advisor):
        h = {"Authorization": f"Bearer {advisor}"}
        # Save first (idempotent upsert)
        body = {"ca_resident": True, "us_citizen": True, "us_green_card": False,
                "ca_citizen": True, "annual_income": 120000.0, "filing_status": "single",
                "state": "CA", "avg_annual_earnings": 60000.0, "claim_age": 67}
        rs = requests.post(f"{API}/plan/crossborder/save?household_id={HID}", json=body, headers=h, timeout=20)
        assert rs.status_code == 200 and rs.json().get("ok") is True, rs.text
        # Now one-pager
        r = requests.get(f"{API}/report/crossborder-pdf?household_id={HID}", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 1000

    def test_enterprise_forbidden(self, enterprise):
        h = {"Authorization": f"Bearer {enterprise}"}
        r = requests.get(f"{API}/report/crossborder-pdf", headers=h, timeout=20)
        assert r.status_code == 403


# ── RESP family save + report inclusion ────────────────────────────────────
class TestRespFamily:
    def test_save_family(self, advisor):
        h = {"Authorization": f"Bearer {advisor}"}
        body = {"family_income": 48000, "children": [
            {"name": "First child", "current_age": 5, "current_resp_balance": 2000, "monthly_contribution": 150, "post_secondary_start_age": 18},
            {"name": "Second child", "current_age": 2, "current_resp_balance": 500, "monthly_contribution": 100, "post_secondary_start_age": 18},
        ]}
        r = requests.post(f"{API}/plan/education/save?household_id={HID}", json=body, headers=h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert len(d["per_child"]) == 2
        assert d["combined"]["projectedValue"] > 0

    def test_saved_returns(self, advisor):
        h = {"Authorization": f"Bearer {advisor}"}
        r = requests.get(f"{API}/plan/education/saved?household_id={HID}", headers=h, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d and len(d.get("children") or []) == 2

    def test_full_plan_pdf_200(self, advisor):
        h = {"Authorization": f"Bearer {advisor}"}
        r = requests.get(f"{API}/report/pdf?household_id={HID}", headers=h, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type","").startswith("application/pdf")
        assert len(r.content) > 2000


# ── Enterprise invite_status ────────────────────────────────────────────────
class TestEnterpriseInviteStatus:
    def test_invite_and_status(self, enterprise):
        h = {"Authorization": f"Bearer {enterprise}"}
        r = requests.get(f"{API}/enterprise/overview", headers=h, timeout=20)
        assert r.status_code == 200
        households = r.json().get("households_list") or []
        assert households, "No enterprise households"
        hid = households[0]["id"]
        # pick a unique email
        email = f"TEST_iter37_{_s.token_hex(3)}@example.com"
        inv = requests.post(f"{API}/enterprise/clients/invite",
                            json={"hid": hid, "email": email, "full_name": "Iter37 Test"},
                            headers=h, timeout=20)
        assert inv.status_code == 200, inv.text
        # Re-fetch overview, confirm invite_status == 'pending' for this household
        r2 = requests.get(f"{API}/enterprise/overview", headers=h, timeout=20)
        assert r2.status_code == 200
        households2 = r2.json().get("households_list") or []
        row = next((x for x in households2 if x["id"] == hid), None)
        assert row and row.get("invite_status") == "pending", row
