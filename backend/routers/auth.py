"""Auth routes: register, login, TOTP MFA, security question, password reset/change, activate."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from security import (
    hash_password, verify_password, create_access_token, decode_token,
    create_scoped_token, generate_totp_secret, totp_uri, verify_totp,
    qr_data_url, hash_answer, verify_answer,
)
from repository import repo
from models import (
    _id, RegisterInput, LoginInput, MFAVerifyInput, SecurityQuestionInput,
    ForgotInput, ResetInput,
)
from deps import get_current_user, _public, audit, scope_context, SECURITY_QUESTIONS

router = APIRouter()


def _issue_session(user: dict):
    if user.get("must_change_password"):
        change_token = create_scoped_token({"sub": user["id"]}, 10, "password_change")
        return {"status": "password_change_required", "change_token": change_token}
    token = create_access_token(user["id"], user["email"])
    audit(user, "auth.login", "session", f"{user['tier']} sign-in (MFA verified)")
    return {"status": "authenticated", "token": token, "user": _public(user)}


@router.post("/auth/register")
async def register(body: RegisterInput):
    email = body.email.lower()
    if repo.find_user_by_email(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    client_id = "client_" + _id()[:8]
    user = {
        "id": _id(), "email": email, "password_hash": hash_password(body.password),
        "name": body.name, "tier": "solo", "role": "solo_user",
        "scope": {"corp_id": None, "org_id": None, "advisor_id": None, "client_id": client_id},
        "mfa_enabled": False,
        "consent": {"marketing": False, "data_processing": body.consent_data_processing,
                    "crm_sharing": False, "updated_at": datetime.now(timezone.utc).isoformat()},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    repo.insert_user(user)
    repo.create("shared", "retention_schedule", {
        "id": _id(), "store": "shared", "scope": {"client_id": client_id},
        "controller": "self", "tier": "solo", "policy": "30_day_purge_on_optout",
        "opt_out_at": None, "purge_at": None, "status": "active",
    })
    audit(user, "auth.register", "account", "Solo self-signup")
    return {"status": "registered"}


@router.post("/auth/login")
async def login(body: LoginInput):
    user = repo.find_user_by_email(body.email.lower())
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="This account has been suspended. Please contact your administrator.")
    if user.get("mfa_enabled") and user.get("mfa_secret"):
        challenge = create_scoped_token({"sub": user["id"]}, 10, "mfa_verify")
        return {"status": "mfa_required", "challenge": challenge}
    secret = generate_totp_secret()
    challenge = create_scoped_token({"sub": user["id"], "pending_secret": secret}, 10, "mfa_setup")
    uri = totp_uri(secret, user["email"])
    return {"status": "mfa_setup", "challenge": challenge, "secret": secret,
            "otpauth_uri": uri, "qr": qr_data_url(uri)}


@router.get("/auth/security-questions")
async def list_security_questions():
    return {"questions": SECURITY_QUESTIONS}


@router.post("/auth/mfa/verify")
async def mfa_verify(body: MFAVerifyInput):
    try:
        p = decode_token(body.challenge)
    except Exception:
        raise HTTPException(status_code=401, detail="Challenge expired — please sign in again")
    if p.get("type") not in ("mfa_verify", "mfa_setup"):
        raise HTTPException(status_code=401, detail="Invalid challenge")
    user = repo.find_user_by_id(p["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    secret = p.get("pending_secret") if p["type"] == "mfa_setup" else user.get("mfa_secret")
    if not verify_totp(secret, body.code):
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    if p["type"] == "mfa_setup":
        repo.update_user(user["id"], {"mfa_enabled": True, "mfa_secret": secret})
        user = repo.find_user_by_id(user["id"])
    if not user.get("security_question"):
        setup_token = create_scoped_token({"sub": user["id"]}, 10, "security_setup")
        return {"status": "security_required", "setup_token": setup_token, "questions": SECURITY_QUESTIONS}
    return _issue_session(user)


@router.post("/auth/security-question")
async def set_security_question(body: SecurityQuestionInput):
    try:
        p = decode_token(body.setup_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    if p.get("type") != "security_setup":
        raise HTTPException(status_code=401, detail="Invalid token")
    user = repo.find_user_by_id(p["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    repo.update_user(user["id"], {"security_question": body.question,
                                  "security_answer_hash": hash_answer(body.answer)})
    return _issue_session(repo.find_user_by_id(user["id"]))


@router.post("/auth/forgot-password")
async def forgot_password(body: ForgotInput):
    user = repo.find_user_by_email(body.email.lower())
    if not user or not user.get("security_question"):
        return {"question": None, "mfa": False}
    return {"question": user["security_question"], "mfa": bool(user.get("mfa_enabled"))}


@router.post("/auth/reset-password")
async def reset_password(body: ResetInput):
    user = repo.find_user_by_email(body.email.lower())
    if not user:
        raise HTTPException(status_code=404, detail="No account found for that email")
    if not (user.get("security_answer_hash") and verify_answer(body.answer, user["security_answer_hash"])):
        raise HTTPException(status_code=401, detail="Security answer is incorrect")
    if user.get("mfa_enabled") and not verify_totp(user.get("mfa_secret"), body.code):
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    repo.update_user(user["id"], {"password_hash": hash_password(body.new_password)})
    audit(user, "auth.reset", "account", "Password reset via security question + TOTP")
    return {"ok": True}


class ChangePasswordInput(BaseModel):
    change_token: str
    new_password: str = Field(min_length=8)


@router.post("/auth/change-password")
async def change_password(body: ChangePasswordInput):
    try:
        p = decode_token(body.change_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    if p.get("type") != "password_change":
        raise HTTPException(status_code=401, detail="Invalid token")
    user = repo.find_user_by_id(p["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if verify_password(body.new_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Choose a password different from your current one")
    repo.update_user(user["id"], {"password_hash": hash_password(body.new_password),
                                  "must_change_password": False})
    audit(user, "auth.password_change", "account", "First-login forced password change")
    return _issue_session(repo.find_user_by_id(user["id"]))


import time

# --- brute-force guard for self-service password change (5 fails / 15 min per user) ---
_PW_FAILS: dict = {}
_PW_LIMIT, _PW_WINDOW = 5, 900


def _pw_rate_blocked(uid: str) -> bool:
    now = time.time()
    hist = [t for t in _PW_FAILS.get(uid, []) if now - t < _PW_WINDOW]
    _PW_FAILS[uid] = hist
    return len(hist) >= _PW_LIMIT


def _pw_record_fail(uid: str):
    _PW_FAILS.setdefault(uid, []).append(time.time())


class SelfChangePasswordInput(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.post("/auth/change-password-self")
async def change_password_self(body: SelfChangePasswordInput, user: dict = Depends(get_current_user)):
    if _pw_rate_blocked(user["id"]):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again in 15 minutes.")
    u = repo.find_user_by_id(user["id"])
    if not u or not verify_password(body.current_password, u["password_hash"]):
        _pw_record_fail(user["id"])
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if verify_password(body.new_password, u["password_hash"]):
        raise HTTPException(status_code=400, detail="Choose a password different from your current one")
    repo.update_user(u["id"], {"password_hash": hash_password(body.new_password)})
    _PW_FAILS.pop(user["id"], None)
    audit(u, "auth.password_change", "account", "Self-service password change")
    return {"ok": True}


ALLOWED_IDLE = [5, 15, 30]


class SecuritySettingsInput(BaseModel):
    idle_minutes: int


@router.get("/auth/security-settings")
async def get_security_settings(user: dict = Depends(get_current_user)):
    ss = user.get("security_settings") or {}
    return {"idle_minutes": ss.get("idle_minutes", 15)}


@router.put("/auth/security-settings")
async def put_security_settings(body: SecuritySettingsInput, user: dict = Depends(get_current_user)):
    if body.idle_minutes not in ALLOWED_IDLE:
        raise HTTPException(status_code=400, detail="Inactivity window must be 5, 15 or 30 minutes")
    ss = dict(user.get("security_settings") or {})
    ss["idle_minutes"] = body.idle_minutes
    repo.update_user(user["id"], {"security_settings": ss})
    audit(user, "auth.security_settings", "account", f"Idle timeout set to {body.idle_minutes}m")
    return {"idle_minutes": body.idle_minutes}


class ActivateInput(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


@router.post("/auth/activate")
async def activate_account(body: ActivateInput):
    try:
        p = decode_token(body.token)
    except Exception:
        raise HTTPException(status_code=401, detail="This link has expired — ask your advisor to resend it")
    if p.get("type") != "activate":
        raise HTTPException(status_code=401, detail="Invalid activation link")
    u = repo.find_user_by_id(p["sub"])
    if not u:
        raise HTTPException(status_code=404, detail="Account not found")
    repo.update_user(u["id"], {"password_hash": hash_password(body.new_password), "must_change_password": False})
    return {"ok": True, "email": u["email"]}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return _public(user)


@router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}
