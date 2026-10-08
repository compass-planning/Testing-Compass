"""Phase 1d tests — PDF export, protection score in advisor roster, insights history, estate waterfall data."""
import os
import pyotp
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOTP_SECRET = os.environ.get("TEST_TOTP_SECRET", "JBSWY3DPEHPK3PXP")


def _login(email: str, password: str = os.environ.get("TEST_PASSWORD", "Compass2026!")) -> str:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    data = r.json()
    assert data["status"] in ("mfa_required", "mfa_setup"), data
    code = pyotp.TOTP(TOTP_SECRET).now()
    r2 = s.post(f"{API}/auth/mfa/verify", json={"challenge": data["challenge"], "code": code}, timeout=30)
    assert r2.status_code == 200, f"mfa verify: {r2.status_code} {r2.text}"
    d2 = r2.json()
    assert d2.get("status") == "authenticated", d2
    return d2["token"]


@pytest.fixture(scope="module")
def advisor_token():
    return _login("advisor@compass.ca")


@pytest.fixture(scope="module")
def enterprise_token():
    return _login("scott@sweston.ca")


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- PDF Export ----------------
class TestReportPDF:
    def test_advisor_pdf_download(self, advisor_token):
        r = requests.get(f"{API}/report/pdf?household_id=client_a1", headers=_hdr(advisor_token), timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower() and ".pdf" in cd.lower(), f"missing content-disposition: {cd}"
        assert r.content[:4] == b"%PDF", f"body does not start with %PDF: {r.content[:20]!r}"
        assert len(r.content) > 500, "pdf unreasonably small"

    def test_advisor_pdf_requires_household(self, advisor_token):
        # No household_id -> 400
        r = requests.get(f"{API}/report/pdf", headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_enterprise_pdf_forbidden(self, enterprise_token):
        r = requests.get(f"{API}/report/pdf", headers=_hdr(enterprise_token), timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------------- Advisor Roster: protection_score ----------------
class TestAdvisorRosterProtection:
    def test_roster_includes_protection_fields(self, advisor_token):
        r = requests.get(f"{API}/advisor/clients", headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200, r.text
        clients = r.json()
        assert isinstance(clients, list) and len(clients) >= 1
        for c in clients:
            assert "protection_score" in c, f"missing protection_score in {c}"
            assert "protection_analyses" in c, f"missing protection_analyses in {c}"
            assert c["protection_score"] is None or (
                isinstance(c["protection_score"], int) and 0 <= c["protection_score"] <= 100
            ), f"bad protection_score: {c}"
            assert isinstance(c["protection_analyses"], int)

    def test_client_a1_has_protection_score(self, advisor_token):
        # Ensure at least one plan_protection record for client_a1 exists so score is a number
        requests.post(
            f"{API}/plan/protection?household_id=client_a1",
            json={"name": "TEST_life_seed", "kind": "life", "life_gap": 0, "notes": "test"},
            headers=_hdr(advisor_token), timeout=30,
        )
        r = requests.get(f"{API}/advisor/clients", headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200
        clients = r.json()
        a1 = next((c for c in clients if c.get("client_id") == "client_a1" or c.get("id") == "client_a1"), None)
        assert a1 is not None, f"client_a1 not found in roster: {[c.get('client_id') or c.get('id') for c in clients]}"
        assert a1["protection_score"] is not None, f"client_a1 should have a protection_score: {a1}"
        assert a1["protection_analyses"] >= 1


# ---------------- Insights History ----------------
class TestInsightsHistory:
    def test_history_appends_and_returns_newest_first(self, advisor_token):
        # Generate twice
        r1 = requests.post(f"{API}/plan/insights/generate?household_id=client_a1",
                           headers=_hdr(advisor_token), timeout=60)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/plan/insights/generate?household_id=client_a1",
                           headers=_hdr(advisor_token), timeout=60)
        assert r2.status_code == 200, r2.text

        # history
        rh = requests.get(f"{API}/plan/insights/history?household_id=client_a1",
                          headers=_hdr(advisor_token), timeout=30)
        assert rh.status_code == 200, rh.text
        hist = rh.json()
        assert isinstance(hist, list), hist
        assert len(hist) >= 2, f"expected >=2 history entries, got {len(hist)}"
        assert len(hist) <= 10, f"history should be capped at 10, got {len(hist)}"
        # newest first: compare generated_at descending
        ts = [h.get("generated_at") for h in hist if h.get("generated_at")]
        assert ts == sorted(ts, reverse=True), f"not newest-first: {ts}"
        # entries contain insights payload
        assert isinstance(hist[0].get("insights"), list)

    def test_latest_insights_still_available(self, advisor_token):
        r = requests.get(f"{API}/plan/insights?household_id=client_a1",
                         headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d is not None
        assert isinstance(d.get("insights"), list) and len(d["insights"]) >= 1
        assert d.get("generated_by") in ("ai", "fallback")
