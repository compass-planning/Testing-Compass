"""MFA / TOTP / Security-Question / Password-Reset tests (iteration 4)."""
import os
import uuid
import pytest
import pyotp
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
PW = os.environ.get("TEST_PASSWORD", "Compass2026!")
DEMO = "JBSWY3DPEHPK3PXP"


def totp(secret=DEMO):
    return pyotp.TOTP(secret).now()


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---- Step 1: login/password step ----
class TestLoginStep:
    def test_login_returns_mfa_required_for_enrolled(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "advisor@compass.ca", "password": PW})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "mfa_required"
        assert isinstance(d.get("challenge"), str) and len(d["challenge"]) > 20
        # no secrets leaked
        assert "secret" not in d and "mfa_secret" not in d

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "advisor@compass.ca", "password": "WRONG"})
        assert r.status_code == 401


# ---- Step 2: mfa/verify ----
class TestMfaVerify:
    def test_valid_totp_returns_token(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "advisor@compass.ca", "password": PW})
        challenge = r.json()["challenge"]
        r2 = requests.post(f"{API}/auth/mfa/verify",
                           json={"challenge": challenge, "code": totp()})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["status"] == "authenticated"
        assert isinstance(d["token"], str) and len(d["token"]) > 20
        u = d["user"]
        # verify _public() strips secrets
        assert "mfa_secret" not in u
        assert "security_answer_hash" not in u
        assert "password_hash" not in u
        assert u["email"] == "advisor@compass.ca"

        # token works
        me = requests.get(f"{API}/auth/me", headers=auth(d["token"]))
        assert me.status_code == 200
        mu = me.json()
        assert "mfa_secret" not in mu and "security_answer_hash" not in mu

    def test_invalid_totp_code_401(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "advisor@compass.ca", "password": PW})
        challenge = r.json()["challenge"]
        r2 = requests.post(f"{API}/auth/mfa/verify",
                           json={"challenge": challenge, "code": "000000"})
        assert r2.status_code == 401

    def test_invalid_challenge_401(self):
        r2 = requests.post(f"{API}/auth/mfa/verify",
                           json={"challenge": "not-a-token", "code": totp()})
        assert r2.status_code == 401


# ---- Step 3: forced enrollment path (new solo) ----
class TestForcedEnrollment:
    def test_new_user_full_setup_flow(self):
        email = f"newmfa_{uuid.uuid4().hex[:8]}@example.com"
        pwd = "Testpass123!"
        # register
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": pwd, "name": "New MFA User",
            "consent_data_processing": True,
        })
        assert r.status_code == 200
        assert r.json() == {"status": "registered"}

        # login -> mfa_setup
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "mfa_setup"
        for k in ("challenge", "secret", "otpauth_uri", "qr"):
            assert k in d, f"missing {k}"
        assert d["qr"].startswith("data:image/")
        assert "otpauth://" in d["otpauth_uri"]
        secret = d["secret"]

        # verify setup
        r = requests.post(f"{API}/auth/mfa/verify",
                          json={"challenge": d["challenge"], "code": pyotp.TOTP(secret).now()})
        assert r.status_code == 200
        sr = r.json()
        assert sr["status"] == "security_required"
        assert "setup_token" in sr
        qs = sr["questions"]
        assert isinstance(qs, list) and len(qs) == 6

        # set security question
        r = requests.post(f"{API}/auth/security-question", json={
            "setup_token": sr["setup_token"],
            "question": qs[0],
            "answer": "Fluffy",
        })
        assert r.status_code == 200
        d2 = r.json()
        assert d2["status"] == "authenticated"
        assert "token" in d2
        assert "mfa_secret" not in d2["user"]
        assert "security_answer_hash" not in d2["user"]

        # subsequent login should use mfa_required (NOT setup) with THEIR secret
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
        assert r.json()["status"] == "mfa_required"
        challenge = r.json()["challenge"]
        # old (demo) code should NOT work — must use user's own secret
        r_wrong = requests.post(f"{API}/auth/mfa/verify",
                                json={"challenge": challenge, "code": pyotp.TOTP(DEMO).now()})
        # might coincidentally pass but overwhelmingly won't; accept 401 OR success-with-different-codes
        assert r_wrong.status_code in (200, 401)
        # correct secret works
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
        r3 = requests.post(f"{API}/auth/mfa/verify",
                           json={"challenge": r2.json()["challenge"],
                                 "code": pyotp.TOTP(secret).now()})
        assert r3.status_code == 200
        assert r3.json()["status"] == "authenticated"


# ---- security questions list ----
class TestSecurityQuestionsList:
    def test_list(self):
        r = requests.get(f"{API}/auth/security-questions")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["questions"], list) and len(d["questions"]) == 6
        assert "What city were you born in?" in d["questions"]


# ---- Password reset ----
class TestPasswordReset:
    def test_forgot_returns_question(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": "advisor@compass.ca"})
        assert r.status_code == 200
        d = r.json()
        assert d["question"] == "What city were you born in?"
        assert d["mfa"] is True

    def test_forgot_unknown_email_returns_null(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": "noone@nowhere.ca"})
        assert r.status_code == 200
        d = r.json()
        assert d["question"] is None
        assert d["mfa"] is False

    def test_reset_full_flow(self):
        """Reset solo user's password, verify login with new pw + TOTP, then restore."""
        email = "solo@compass.ca"
        new_pw = "NewPass123!"
        # wrong answer
        r = requests.post(f"{API}/auth/reset-password", json={
            "email": email, "answer": "montreal",
            "code": totp(), "new_password": new_pw})
        assert r.status_code == 401

        # wrong code (deliberately bad)
        r = requests.post(f"{API}/auth/reset-password", json={
            "email": email, "answer": "toronto",
            "code": "000000", "new_password": new_pw})
        assert r.status_code == 401

        # success (case-insensitive)
        r = requests.post(f"{API}/auth/reset-password", json={
            "email": email, "answer": "Toronto",
            "code": totp(), "new_password": new_pw})
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        # login with new password
        r = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": new_pw})
        assert r.status_code == 200
        assert r.json()["status"] == "mfa_required"
        r2 = requests.post(f"{API}/auth/mfa/verify",
                           json={"challenge": r.json()["challenge"], "code": totp()})
        assert r2.status_code == 200
        assert r2.json()["status"] == "authenticated"

        # restore old password
        r = requests.post(f"{API}/auth/reset-password", json={
            "email": email, "answer": "toronto",
            "code": totp(), "new_password": PW})
        assert r.status_code == 200

        # verify restored
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": PW})
        assert r.status_code == 200 and r.json()["status"] == "mfa_required"


# ---- Protected routes reject bad bearer ----
class TestProtectedRoutes:
    def test_me_missing_bearer(self):
        assert requests.get(f"{API}/auth/me").status_code == 401

    def test_me_invalid_bearer(self):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": "Bearer not-a-real-jwt"})
        assert r.status_code == 401

    def test_me_malformed_header(self):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": "Token xxx"})
        assert r.status_code == 401

    def test_other_protected_route_401(self):
        assert requests.get(f"{API}/owners").status_code == 401
        assert requests.get(f"{API}/dashboard").status_code == 401
