"""Iter12 — Backend tests for advisor New Household creation and branding cover_note.

Covers:
  1. POST /api/owners (as advisor, no household_id) -> creates a NEW client_id distinct from
     existing (client_a1/a2/a3), and that household subsequently appears in /api/advisor/clients.
  2. The new household's owner list (scoped) starts with only the primary 'self' member.
  3. PUT /api/advisor/branding persists cover_note; GET returns it.
"""
import os
import sys
import pyotp
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADVISOR = "advisor@compass.ca"
PASSWORD = "Compass2026!"
EXISTING = {"client_a1", "client_a2", "client_a3"}


def _reset_advisor_mfa():
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path("/app/backend/.env"))
    from repository import repo
    u = repo.find_user_by_email(ADVISOR)
    repo.update_user(u["id"], {"mfa_enabled": False, "mfa_secret": None})


def _login_advisor():
    r = requests.post(f"{API}/auth/login", json={"email": ADVISOR, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "mfa_setup", data
    secret = data["secret"]
    challenge = data["challenge"]
    code = pyotp.TOTP(secret).now()
    v = requests.post(f"{API}/auth/mfa/verify", json={"challenge": challenge, "code": code}, timeout=15).json()
    assert v["status"] == "authenticated", v
    return v["token"]


@pytest.fixture(scope="module")
def token():
    _reset_advisor_mfa()
    tok = _login_advisor()
    yield tok
    # cleanup: reset advisor MFA back off
    _reset_advisor_mfa()


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestAdvisorBranding:
    def test_branding_cover_note_persists(self, auth):
        payload = {"firm_name": "Compass Planning", "cover_note": "TEST_ITER12 cover note for book review."}
        r = requests.put(f"{API}/advisor/branding", json=payload, headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/advisor/branding", headers=auth, timeout=15)
        assert g.status_code == 200
        body = g.json()
        assert body.get("cover_note") == payload["cover_note"]
        assert body.get("firm_name") == "Compass Planning"


class TestNewHousehold:
    created_cid = None

    def test_create_household_without_household_id_creates_new_client(self, auth):
        name = "TEST_ITER12 Blake"
        r = requests.post(
            f"{API}/owners",
            json={"full_name": name, "relationship": "self", "province": "ON"},
            headers=auth,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        owner = r.json()
        cid = owner["scope"]["client_id"]
        assert cid not in EXISTING, f"expected fresh client_id, got existing {cid}"
        assert owner["full_name"] == name
        assert owner["relationship"] == "self"
        TestNewHousehold.created_cid = cid

    def test_new_household_in_advisor_clients(self, auth):
        cid = TestNewHousehold.created_cid
        assert cid, "create test must run first"
        r = requests.get(f"{API}/advisor/clients", headers=auth, timeout=15)
        assert r.status_code == 200
        households = {c["client_id"]: c for c in r.json()}
        assert cid in households, f"new household {cid} missing from /advisor/clients"
        hh = households[cid]
        # New household should start with 1 member (the primary self), no accounts
        assert len(hh.get("members", [])) == 1
        assert hh.get("primary", "").startswith("TEST_ITER12")
        assert hh.get("assets", 0) == 0
        assert hh.get("goals", 0) == 0

    def test_scoped_owner_list_only_primary(self, auth):
        cid = TestNewHousehold.created_cid
        assert cid, "create test must run first"
        r = requests.get(f"{API}/owners?household_id={cid}", headers=auth, timeout=15)
        assert r.status_code == 200
        owners = r.json()
        assert len(owners) == 1
        assert owners[0]["relationship"] == "self"
        assert owners[0]["full_name"].startswith("TEST_ITER12")

    def test_cleanup_delete_test_household(self, auth):
        """Delete the TEST_ owner to leave DB clean."""
        cid = TestNewHousehold.created_cid
        if not cid:
            pytest.skip("nothing to clean")
        r = requests.get(f"{API}/owners?household_id={cid}", headers=auth, timeout=15)
        for o in r.json():
            requests.delete(f"{API}/owners/{o['id']}", headers=auth, timeout=15)
        # After cleanup, household should disappear from advisor clients
        r2 = requests.get(f"{API}/advisor/clients", headers=auth, timeout=15)
        assert cid not in {c["client_id"] for c in r2.json()}
