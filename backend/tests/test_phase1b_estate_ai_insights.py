"""Phase 1b/1c tests — estate/tax engines, AI insights, Save Protection, report email with gaps."""
import os
import pyotp
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOTP_SECRET = "JBSWY3DPEHPK3PXP"


def _login(email: str, password: str = "Compass2026!") -> str:
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


# ---------------- Estate engine ----------------
class TestEstate:
    def test_estate_on_1_5m(self, advisor_token):
        payload = {
            "province": "ON", "grossEstateValue": 1_500_000,
            "rrspRrifBalance": 400_000, "nonRegInvestments": 200_000, "nonRegCostBase": 120_000,
        }
        r = requests.post(f"{API}/plan/estate/analysis?household_id=client_a1",
                          json=payload, headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Probate: 50000 * 0.005 (=250) + (1500000-50000)*0.015 (=21750) = 22000
        assert d["probate"]["probateFee"] == 22000, d["probate"]
        assert d["terminalTax"]["estimatedTax"] > 0
        assert d["grossEstateValue"] == 1_500_000
        assert d["netToHeirs"] > 0
        assert d["totalSettlementCost"] == round(d["probate"]["probateFee"] + d["terminalTax"]["estimatedTax"])

    def test_estate_qc_zero_probate(self, advisor_token):
        r = requests.post(f"{API}/plan/estate/analysis?household_id=client_a1",
                          json={"province": "QC", "grossEstateValue": 1_000_000}, headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["probate"]["probateFee"] == 0

    def test_estate_ab_capped(self, advisor_token):
        r = requests.post(f"{API}/plan/estate/analysis?household_id=client_a1",
                          json={"province": "AB", "grossEstateValue": 5_000_000}, headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["probate"]["probateFee"] <= 525


# ---------------- Tax calc ----------------
class TestTaxCalc:
    def test_tax_calc_on_95k(self, advisor_token):
        r = requests.post(f"{API}/plan/tax/calc?household_id=client_a1",
                          json={"income": 95000, "province": "ON", "age": 40}, headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "total_tax" in d
        assert d["total_tax"] > 15000 and d["total_tax"] < 25000
        assert 0 < d["marginalRate"] < 1
        assert d["afterTaxIncome"] == round(95000 - d["total_tax"])


# ---------------- AI insights ----------------
class TestInsights:
    def test_insights_generate(self, advisor_token):
        r = requests.post(f"{API}/plan/insights/generate?household_id=client_a1",
                          headers=_hdr(advisor_token), timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["generated_by"] in ("ai", "fallback"), d
        assert isinstance(d["insights"], list) and len(d["insights"]) >= 1
        for i in d["insights"]:
            assert "severity" in i and "title" in i and "body" in i
        assert "generated_at" in d

    def test_insights_get_latest(self, advisor_token):
        # ensure one exists first
        requests.post(f"{API}/plan/insights/generate?household_id=client_a1",
                      headers=_hdr(advisor_token), timeout=60)
        r = requests.get(f"{API}/plan/insights?household_id=client_a1", headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d is not None
        assert isinstance(d.get("insights"), list) and len(d["insights"]) >= 1


# ---------------- Save Protection ----------------
class TestSaveProtection:
    def test_advisor_post_protection(self, advisor_token):
        payload = {"name": "TEST_life", "kind": "life", "life_gap": 500000, "notes": "test"}
        r = requests.post(f"{API}/plan/protection?household_id=client_a1",
                          json=payload, headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec.get("id")
        # GET list
        r2 = requests.get(f"{API}/plan/protection?household_id=client_a1", headers=_hdr(advisor_token), timeout=30)
        assert r2.status_code == 200
        rows = r2.json()
        assert any(x.get("id") == rec["id"] for x in rows), "created protection not in list"

    def test_overview_protection_count(self, advisor_token):
        r = requests.get(f"{API}/plan/overview?household_id=client_a1", headers=_hdr(advisor_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "protectionAnalyses" in d
        assert isinstance(d["protectionAnalyses"], int)
        assert d["protectionAnalyses"] >= 1

    def test_enterprise_blocked(self, enterprise_token):
        r = requests.post(f"{API}/plan/protection",
                          json={"name": "x", "kind": "life"}, headers=_hdr(enterprise_token), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


# ---------------- Report email with protection gaps ----------------
class TestReportEmailProtection:
    def test_email_accepts_protection_gaps(self, advisor_token):
        payload = {
            "recipient": "test@example.com",
            "net_worth": 500000, "protection_score": 70, "retirement_success": 65,
            "life_gap": 250000, "di_monthly_gap": 1200, "ltc_gap": 50000,
        }
        r = requests.post(f"{API}/report/email?household_id=client_a1",
                          json=payload, headers=_hdr(advisor_token), timeout=30)
        # Must not be 422 (validation error). Email provider may be unavailable in preview.
        assert r.status_code != 422, f"validation error for new fields: {r.text}"
        assert r.status_code in (200, 429, 502, 503), f"unexpected: {r.status_code} {r.text}"
