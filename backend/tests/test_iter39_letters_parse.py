"""Iter39/40 backend tests: Letters & Policies Importer (POST /api/plan/letters/parse)."""
import io
import os
import pyotp
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
PWD = os.environ.get("TEST_PASSWORD", "Compass2026!")
TOTP = "JBSWY3DPEHPK3PXP"
HID = "client_a1"


def _login(email):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": PWD})
    assert r.status_code == 200, r.text
    j = r.json()
    code = pyotp.TOTP(TOTP).now()
    r = s.post(f"{BASE}/api/auth/mfa/verify", json={"challenge": j["challenge"], "code": code})
    assert r.status_code == 200, r.text
    j2 = r.json()
    assert j2["status"] == "authenticated", j2
    s.headers.update({"Authorization": f"Bearer {j2['token']}"})
    return s


def _make_pdf(text: str) -> bytes:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 750
    for line in text.split("\n"):
        c.drawString(72, y, line)
        y -= 16
        if y < 72:
            c.showPage()
            y = 750
    c.save()
    return buf.getvalue()


def _make_empty_pdf() -> bytes:
    # PDF with no text (empty page)
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture(scope="module")
def advisor():
    return _login("advisor@compass.ca")


@pytest.fixture(scope="module")
def enterprise():
    return _login("scott@sweston.ca")


POLICY_TEXT = """Sun Life Financial — Policy Confirmation
Insured: Linh Nguyen
Policy Type: Term Life Insurance (20-year)
Policy Number: SL-TL-998877
Coverage Amount: $750,000
Annual Premium: $820.00
Renewal Date: 2035-07-01

Manulife — Disability Income Coverage
Insured: Linh Nguyen
Policy Type: Disability
Policy Number: MN-DI-443322
Monthly Benefit: $5,500
Annual Premium: $1,240
Renewal Date: 2032-05-15
"""


class TestLettersParse:
    def test_parse_text_pdf_returns_policies(self, advisor):
        pdf = _make_pdf(POLICY_TEXT)
        files = {"file": ("policy.pdf", pdf, "application/pdf")}
        r = advisor.post(f"{BASE}/api/plan/letters/parse?household_id={HID}", files=files)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "policies" in j and isinstance(j["policies"], list)
        assert j["chars"] > 50, j
        # Claude should return at least one policy
        assert len(j["policies"]) >= 1, j
        p0 = j["policies"][0]
        for k in ["policy_type", "carrier", "coverage", "premium", "insured", "policy_number", "renewal_date"]:
            assert k in p0

    def test_parse_scanned_pdf_returns_422(self, advisor):
        pdf = _make_empty_pdf()
        files = {"file": ("blank.pdf", pdf, "application/pdf")}
        r = advisor.post(f"{BASE}/api/plan/letters/parse?household_id={HID}", files=files)
        assert r.status_code == 422, r.text

    def test_parse_blocked_for_enterprise(self, enterprise):
        pdf = _make_pdf(POLICY_TEXT)
        files = {"file": ("policy.pdf", pdf, "application/pdf")}
        r = enterprise.post(f"{BASE}/api/plan/letters/parse?household_id=client_sweston_1", files=files)
        assert r.status_code == 403, r.text

    def test_parse_empty_file_returns_400(self, advisor):
        files = {"file": ("empty.pdf", b"", "application/pdf")}
        r = advisor.post(f"{BASE}/api/plan/letters/parse?household_id={HID}", files=files)
        # Empty file -> 400
        assert r.status_code in (400, 422), r.text

    def test_insurance_create_after_parse(self, advisor):
        """Verify the UI accept flow: POST /plan/insurance with extracted fields persists."""
        body = {
            "policy_type": "Term Life",
            "carrier": "TEST_Sun Life",
            "coverage": 750000,
            "premium": 820,
            "insured": "TEST_Linh Nguyen",
            "policy_number": "TEST-SL-998877",
            "renewal_date": "2035-07-01",
            "source": "imported",
        }
        r = advisor.post(f"{BASE}/api/plan/insurance?household_id={HID}", json=body)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert created.get("carrier") == "TEST_Sun Life"
        pid = created.get("id")
        assert pid
        # Verify persistence
        r2 = advisor.get(f"{BASE}/api/plan/insurance?household_id={HID}")
        assert r2.status_code == 200
        ids = [p["id"] for p in r2.json()]
        assert pid in ids
        # Cleanup
        advisor.delete(f"{BASE}/api/plan/insurance/{pid}?household_id={HID}")
