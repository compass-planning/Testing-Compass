"""Iter36 backend tests:
- Cross-border Save/Saved per household (advisor client_a1)
- /report/pdf includes cross-border section (200 + non-empty)
- Expanded state tax: progressive (CA, NY), flat (OR=9.9%, GA, CO), no-tax (TX, FL, WA)
- Enterprise invite endpoint (/api/enterprise/clients/invite) tier gating + create
"""
import os
import time
import secrets as _s
import pyotp
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not available"
API = f"{BASE_URL}/api"
TOTP_SECRET = os.environ.get("TEST_TOTP_SECRET", "JBSWY3DPEHPK3PXP")


def _login(email: str, password: str = os.environ.get("TEST_PASSWORD", "Compass2026!")) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] in ("mfa_required", "mfa_setup"), data
    code = pyotp.TOTP(TOTP_SECRET).now()
    r2 = requests.post(f"{API}/auth/mfa/verify",
                       json={"challenge": data["challenge"], "code": code}, timeout=20)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["status"] == "authenticated", d2
    return d2["token"]


@pytest.fixture(scope="module")
def advisor_token():
    return _login("advisor@compass.ca")


@pytest.fixture(scope="module")
def enterprise_token():
    return _login("scott@sweston.ca")


# ── Cross-border save/saved (advisor household client_a1) ─────────────────────
class TestCrossBorderSave:
    def test_save_dual_cb(self, advisor_token):
        headers = {"Authorization": f"Bearer {advisor_token}"}
        body = {"ca_resident": True, "us_citizen": True, "us_green_card": False,
                "ca_citizen": True, "annual_income": 120000.0, "filing_status": "single",
                "state": "CA", "avg_annual_earnings": 60000.0, "claim_age": 67}
        r = requests.post(f"{API}/plan/crossborder/save?household_id=client_a1",
                          json=body, headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "result" in data and "jurisdiction" in data["result"]

    def test_get_saved_cb(self, advisor_token):
        headers = {"Authorization": f"Bearer {advisor_token}"}
        r = requests.get(f"{API}/plan/crossborder/saved?household_id=client_a1",
                         headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec is not None, "No saved record returned"
        assert rec.get("household_id") == "client_a1"
        assert "result" in rec and "inputs" in rec

    def test_report_pdf_includes_cb(self, advisor_token):
        headers = {"Authorization": f"Bearer {advisor_token}"}
        r = requests.get(f"{API}/report/pdf?household_id=client_a1",
                         headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").lower().startswith("application/pdf")
        assert len(r.content) > 1500, f"PDF too small: {len(r.content)}"


# ── Expanded state tax tests via /plan/crossborder (us_green_card non-CA) ─────
class TestStateTaxDepth:
    def _run(self, token, state):
        headers = {"Authorization": f"Bearer {token}"}
        body = {"ca_resident": False, "us_citizen": False, "us_green_card": True,
                "ca_citizen": False, "annual_income": 120000.0, "filing_status": "single",
                "state": state, "avg_annual_earnings": 60000.0, "claim_age": 67}
        r = requests.post(f"{API}/plan/crossborder", json=body, headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        return r.json()

    @pytest.mark.parametrize("state,expected_nonzero", [
        ("CA", True), ("NY", True), ("OR", True), ("GA", True), ("CO", True),
        ("TX", False), ("FL", False), ("WA", False),
    ])
    def test_state_tax(self, advisor_token, state, expected_nonzero):
        res = self._run(advisor_token, state)
        ust = res.get("us_tax") or {}
        assert ust.get("state") == state
        tax = ust.get("state_tax", 0)
        note = ust.get("state_note", "")
        if expected_nonzero:
            assert tax > 0, f"{state} expected non-zero tax, got {tax}; note={note}"
        else:
            assert tax == 0, f"{state} expected 0, got {tax}"
            assert "No state income tax" in note

    def test_or_rate_in_note(self, advisor_token):
        res = self._run(advisor_token, "OR")
        note = (res.get("us_tax") or {}).get("state_note", "")
        assert "9.90" in note or "9.9" in note, note


# ── Enterprise invite endpoint ───────────────────────────────────────────────
class TestEnterpriseInvite:
    def test_advisor_forbidden(self, advisor_token):
        headers = {"Authorization": f"Bearer {advisor_token}"}
        r = requests.post(f"{API}/enterprise/clients/invite",
                          json={"hid": "any", "email": f"x{_s.token_hex(3)}@test.co",
                                "full_name": "X", "base_url": BASE_URL},
                          headers=headers, timeout=20)
        assert r.status_code == 403, r.text

    def test_enterprise_household_not_found(self, enterprise_token):
        headers = {"Authorization": f"Bearer {enterprise_token}"}
        r = requests.post(f"{API}/enterprise/clients/invite",
                          json={"hid": "nope-xyz", "email": f"x{_s.token_hex(3)}@test.co",
                                "full_name": "X", "base_url": BASE_URL},
                          headers=headers, timeout=20)
        assert r.status_code == 404, r.text

    def test_enterprise_invite_success(self, enterprise_token):
        headers = {"Authorization": f"Bearer {enterprise_token}"}
        # Find a household in the enterprise's corp via /enterprise/overview
        r = requests.get(f"{API}/enterprise/overview", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        payload = r.json()
        households = payload.get("households_list") or []
        assert len(households) > 0, payload
        hid = households[0].get("id")
        assert hid, households[0]
        email = f"TEST_iter36_{_s.token_hex(4)}@example.com"
        body = {"hid": hid, "email": email, "full_name": "TEST Iter36",
                "base_url": BASE_URL}
        r2 = requests.post(f"{API}/enterprise/clients/invite",
                           json=body, headers=headers, timeout=30)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["email"] == email.lower()
        assert "activation_link" in d

        # Duplicate email → 409
        r3 = requests.post(f"{API}/enterprise/clients/invite",
                           json=body, headers=headers, timeout=20)
        assert r3.status_code == 409, r3.text
