"""Iter11 — First-login forced password change flow for solo@compass.ca.

Covers:
  1. mfa_setup on first login (unenrolled)
  2. mfa/verify returns password_change_required (not authenticated)
  3. change-password rejects same password (400)
  4. change-password with NEW pw returns authenticated token
  5. /auth/me shows must_change_password=False
  6. Other accounts (advisor) do NOT get forced-change
After the run we reset solo back to the forced-change state.
"""
import os
import sys
import pyotp
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
SOLO = "solo@compass.ca"
ADVISOR = "advisor@compass.ca"
PASSWORD = "Compass2026!"
NEW_PW = "NewTempPass9!"


def _reset_solo():
    """Reset solo account to forced-change state (idempotent)."""
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path("/app/backend/.env"))
    from repository import repo
    from security import hash_password
    u = repo.find_user_by_email(SOLO)
    repo.update_user(u["id"], {
        "password_hash": hash_password(PASSWORD),
        "must_change_password": True,
        "mfa_enabled": False,
        "mfa_secret": None,
    })


@pytest.fixture(scope="module", autouse=True)
def ensure_solo_reset_before_and_after():
    _reset_solo()
    yield
    _reset_solo()


def _login_and_verify(email, password):
    """Login + MFA verify. Returns the verify response JSON."""
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "mfa_setup", f"expected mfa_setup, got {data}"
    secret = data["secret"]
    challenge = data["challenge"]
    code = pyotp.TOTP(secret).now()
    v = requests.post(f"{API}/auth/mfa/verify",
                      json={"challenge": challenge, "code": code}, timeout=15)
    assert v.status_code == 200, v.text
    return v.json()


class TestForcedPasswordChange:

    def test_solo_full_flow(self):
        verify = _login_and_verify(SOLO, PASSWORD)
        # Security question already on file, so should go straight to password_change_required
        assert verify["status"] == "password_change_required", f"got {verify}"
        change_token = verify["change_token"]

        # Reuse of same pw must 400
        r_same = requests.post(f"{API}/auth/change-password",
                               json={"change_token": change_token, "new_password": PASSWORD},
                               timeout=15)
        assert r_same.status_code == 400
        assert "different" in r_same.json().get("detail", "").lower()

        # Too short -> validation 422
        r_short = requests.post(f"{API}/auth/change-password",
                                json={"change_token": change_token, "new_password": "abc"},
                                timeout=15)
        assert r_short.status_code == 422

        # Successful change -> authenticated
        r_ok = requests.post(f"{API}/auth/change-password",
                             json={"change_token": change_token, "new_password": NEW_PW},
                             timeout=15)
        assert r_ok.status_code == 200, r_ok.text
        body = r_ok.json()
        assert body["status"] == "authenticated"
        assert "token" in body and len(body["token"]) > 20
        assert body["user"]["email"] == SOLO

        # /auth/me must_change_password=False
        me = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {body['token']}"}, timeout=15)
        assert me.status_code == 200
        assert me.json().get("must_change_password") is False

    def test_advisor_not_forced(self):
        # Reset advisor MFA first so we hit mfa_setup path (predictable)
        sys.path.insert(0, "/app/backend")
        from dotenv import load_dotenv
        from pathlib import Path
        load_dotenv(Path("/app/backend/.env"))
        from repository import repo
        u = repo.find_user_by_email(ADVISOR)
        repo.update_user(u["id"], {"mfa_enabled": False, "mfa_secret": None})

        verify = _login_and_verify(ADVISOR, PASSWORD)
        assert verify["status"] == "authenticated", f"advisor should not be forced-change, got {verify}"
        assert "token" in verify
        # /auth/me should show must_change_password False (or absent) for advisor
        me = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {verify['token']}"}, timeout=15)
        assert me.status_code == 200
        assert me.json().get("must_change_password") in (False, None)
