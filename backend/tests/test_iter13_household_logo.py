"""Iteration 13 tests — household onboarding w/ spouse+income, needs_setup badge,
logo upload to object storage, public logo endpoint, and email-with-hosted-logo."""
import io
import os
import re
import pyotp
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
PASS = os.environ.get("TEST_PASSWORD", "Compass2026!")


# ----- auth helper -----
def _reset_advisor_mfa():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from repository import repo
    u = repo.find_user_by_email("advisor@compass.ca")
    repo.update_user(u["id"], {"mfa_enabled": False, "mfa_secret": None,
                               "branding": {"firm_name": "Compass Planning", "cover_note": "",
                                            "logo": "", "logo_url": ""}})


def _login(email: str) -> dict:
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": PASS}).json()
    if r.get("status") == "mfa_setup":
        secret = r["secret"]; ch = r["challenge"]
    elif r.get("status") == "mfa_required":
        pytest.skip("Need unenrolled advisor; please reset MFA first")
    else:
        pytest.fail(f"login: {r}")
    code = pyotp.TOTP(secret).now()
    v = s.post(f"{BASE}/api/auth/mfa/verify", json={"challenge": ch, "code": code}).json()
    if v.get("status") == "security_required":
        tok = v["setup_token"]
        v = s.post(f"{BASE}/api/auth/security-question",
                   json={"setup_token": tok, "question": v["questions"][0], "answer": "toronto"}).json()
    assert v.get("status") == "authenticated", v
    s.headers["Authorization"] = f"Bearer {v['token']}"
    return {"session": s, "user": v["user"]}


@pytest.fixture(scope="module")
def advisor():
    _reset_advisor_mfa()
    ctx = _login("advisor@compass.ca")
    yield ctx
    _reset_advisor_mfa()


# ===== 1. Household onboarding: primary + optional spouse with incomes =====
class TestHouseholdOnboarding:
    def test_create_primary_only(self, advisor):
        s = advisor["session"]
        payload = {"full_name": "TEST_ITER13 PrimaryOnly", "relationship": "self",
                   "province": "ON", "annual_income": 95000}
        r = s.post(f"{BASE}/api/owners", json=payload)
        assert r.status_code == 200, r.text
        owner = r.json()
        cid = owner["scope"]["client_id"]
        assert cid and not cid.startswith("client_a")
        # Scoped GET
        rows = s.get(f"{BASE}/api/owners?household_id={cid}").json()
        assert len(rows) == 1
        assert rows[0]["full_name"] == payload["full_name"]
        assert rows[0].get("annual_income") == 95000
        # cleanup
        s.delete(f"{BASE}/api/owners/{owner['id']}")

    def test_create_primary_plus_spouse(self, advisor):
        s = advisor["session"]
        p = {"full_name": "TEST_ITER13 Primary", "relationship": "self",
             "province": "BC", "annual_income": 120000}
        r1 = s.post(f"{BASE}/api/owners", json=p); assert r1.status_code == 200, r1.text
        primary = r1.json(); cid = primary["scope"]["client_id"]
        assert cid and not cid.startswith("client_a")
        sp = {"full_name": "TEST_ITER13 Spouse", "relationship": "spouse",
              "province": "BC", "annual_income": 60000}
        r2 = s.post(f"{BASE}/api/owners?household_id={cid}", json=sp)
        assert r2.status_code == 200, r2.text
        spouse = r2.json()
        assert spouse["scope"]["client_id"] == cid
        rows = s.get(f"{BASE}/api/owners?household_id={cid}").json()
        names = sorted(r["full_name"] for r in rows)
        incomes = {r["full_name"]: r.get("annual_income") for r in rows}
        assert names == ["TEST_ITER13 Primary", "TEST_ITER13 Spouse"]
        assert incomes["TEST_ITER13 Primary"] == 120000
        assert incomes["TEST_ITER13 Spouse"] == 60000
        rels = {r["full_name"]: r["relationship"] for r in rows}
        assert rels["TEST_ITER13 Primary"] == "self"
        assert rels["TEST_ITER13 Spouse"] == "spouse"
        for r in rows:
            s.delete(f"{BASE}/api/owners/{r['id']}")


# ===== 2. Needs Setup badge =====
class TestNeedsSetup:
    def test_new_empty_household_needs_setup_and_excluded_from_avg(self, advisor):
        s = advisor["session"]
        # Create empty household
        r = s.post(f"{BASE}/api/owners", json={
            "full_name": "TEST_ITER13 NeedsSetup", "relationship": "self", "province": "ON"})
        assert r.status_code == 200
        owner = r.json(); cid = owner["scope"]["client_id"]
        try:
            clients = s.get(f"{BASE}/api/advisor/clients").json()
            new = next((c for c in clients if c["client_id"] == cid), None)
            assert new is not None
            assert new.get("needs_setup") is True
            assert new.get("status") == "Needs Setup"
            assert new.get("score") is None
            # seeded ones still scored
            for sid in ("client_a1", "client_a2", "client_a3"):
                seeded = next((c for c in clients if c["client_id"] == sid), None)
                assert seeded, f"Missing seeded {sid}"
                assert seeded.get("needs_setup") is False
                assert isinstance(seeded.get("score"), int)
                assert seeded.get("status") in ("On Track", "Needs Review", "At Risk")
        finally:
            s.delete(f"{BASE}/api/owners/{owner['id']}")


# ===== 3. Branding logo upload + public GET + email embeds hosted URL =====
_PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02"
        b"\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00"
        b"\x03\x00\x01\xa7\xa3\xd7\xa5\x00\x00\x00\x00IEND\xaeB`\x82")


class TestBrandingLogo:
    def test_upload_public_get_and_email_embed(self, advisor):
        s = advisor["session"]; uid = advisor["user"]["id"]
        # Upload (must not send Content-Type: application/json)
        up = requests.post(
            f"{BASE}/api/advisor/branding/logo",
            headers={"Authorization": s.headers["Authorization"]},
            files={"file": ("logo.png", io.BytesIO(_PNG), "image/png")},
        )
        assert up.status_code == 200, up.text
        assert "logo_path" in up.json()

        # Persist logo_url (what frontend does)
        logo_url = f"{BASE}/api/public/logo/{uid}"
        pr = s.put(f"{BASE}/api/advisor/branding",
                   json={"firm_name": "TEST_ITER13 Firm", "cover_note": "",
                         "logo": "", "logo_url": logo_url})
        assert pr.status_code == 200
        assert pr.json()["logo_url"] == logo_url
        # merge preserved logo_path
        assert pr.json().get("logo_path")

        # Public GET: no auth
        anon = requests.get(logo_url)
        assert anon.status_code == 200, anon.text
        assert anon.headers.get("content-type", "").startswith("image/")
        assert anon.content[:4] == b"\x89PNG"

        # Email a report; backend will render html w/ hosted <img src>
        clients = s.get(f"{BASE}/api/advisor/clients").json()
        a1 = next(c for c in clients if c["client_id"] == "client_a1")
        er = s.post(f"{BASE}/api/report/email?household_id=client_a1",
                    json={"recipient": "delivered+iter13@resend.dev",
                          "net_worth": a1.get("net_worth", 0),
                          "protection_score": a1.get("score") or 0,
                          "retirement_success": 60})
        assert er.status_code == 200, er.text
        assert er.json().get("status") == "sent"

        # Verify report log recorded
        hist = s.get(f"{BASE}/api/report/history?household_id=client_a1").json()
        assert any(h.get("recipient") == "delivered+iter13@resend.dev" for h in hist)

        # Also verify render_report_html directly — includes the <img src=https://...>
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from email_service import render_report_html
        html = render_report_html("Nguyen", 100000, 70, 60, [], firm_name="TEST_ITER13 Firm",
                                  logo_url=logo_url)
        assert f'<img src="{logo_url}"' in html
        assert "TEST_ITER13 Firm" in html

    def test_branding_remove_clears_logo_url(self, advisor):
        s = advisor["session"]
        r = s.put(f"{BASE}/api/advisor/branding",
                  json={"firm_name": "Compass Planning", "cover_note": "",
                        "logo": "", "logo_url": ""})
        assert r.status_code == 200
        assert r.json()["logo_url"] == ""
