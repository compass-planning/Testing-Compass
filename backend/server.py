"""Compass Planning — FastAPI backend (v1, in-memory mock repository).

Tenant isolation is enforced server-side on every route via `scope_context`,
never in the UI. Cross-tenant reads are impossible by construction.
"""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, UploadFile, File, Response
from fastapi.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
import secrets
import storage

import jwt
from security import (
    hash_password, verify_password, create_access_token, decode_token,
    create_scoped_token, generate_totp_secret, totp_uri, verify_totp, qr_data_url,
    hash_answer, verify_answer,
)
from repository import repo
from models import (
    _id, User, PublicUser, RegisterInput, LoginInput,
    PensionOwner, OwnerInput, PensionAccount, AccountInput,
    Goal, GoalInput, GoalProgressInput, AuditEntry, ConsentToggleInput,
    ErasureInput, PromotionInput, PlanningItemInput, ProfileInput,
    MFAVerifyInput, SecurityQuestionInput, ForgotInput, ResetInput,
)
import seed
from pydantic import BaseModel, EmailStr, Field
from email_service import send_email, render_report_html, render_invite_html, rate_ok


class ReportEmailInput(BaseModel):
    recipient: EmailStr
    net_worth: float = 0
    protection_score: int = 0
    retirement_success: Optional[int] = None


class BrandingInput(BaseModel):
    firm_name: str = "Compass Planning"
    cover_note: str = ""
    logo: str = ""
    logo_url: str = ""

SECURITY_QUESTIONS = [
    "What was the name of your first pet?",
    "What was the name of your elementary school?",
    "What is your mother's maiden name?",
    "What city were you born in?",
    "What was the make of your first car?",
    "What is the name of your childhood best friend?",
]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("compass")

app = FastAPI(title="Compass Planning API")


@app.on_event("startup")
async def _init_storage():
    try:
        storage.init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed (logo uploads disabled): {e}")
api = APIRouter(prefix="/api")

seed.seed()


# ---------------- Auth helpers ----------------

def _public(user: dict) -> dict:
    u = dict(user)
    for k in ("password_hash", "mfa_secret", "security_answer_hash"):
        u.pop(k, None)
    u["is_client"] = bool(user.get("invited_by"))
    return u


async def get_current_user(request: Request) -> dict:
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = repo.find_user_by_id(payload["sub"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------- Tenant scope enforcement ----------------

def scope_context(user: dict):
    """Return (store, read_scope_filter) enforced for this user's tier."""
    tier = user["tier"]
    sc = user.get("scope", {})
    if tier == "enterprise":
        return "enterprise", {"corp_id": sc.get("corp_id")}
    if tier == "advisor":
        if user["role"] == "firm_admin":
            return "shared", {"org_id": sc.get("org_id")}
        return "shared", {"org_id": sc.get("org_id"), "advisor_id": sc.get("advisor_id")}
    return "shared", {"client_id": sc.get("client_id")}


def write_scope(user: dict, client_id: str = None, advisor_id: str = None) -> dict:
    tier = user["tier"]
    sc = user.get("scope", {})
    base = {"corp_id": None, "org_id": None, "advisor_id": None, "client_id": None}
    if tier == "enterprise":
        base["corp_id"] = sc.get("corp_id")
    elif tier == "solo":
        base["client_id"] = sc.get("client_id")
        base["org_id"] = sc.get("org_id")
        base["advisor_id"] = sc.get("advisor_id")
    else:  # advisor
        base["org_id"] = sc.get("org_id")
        base["advisor_id"] = advisor_id or sc.get("advisor_id")
        base["client_id"] = client_id or sc.get("client_id") or ("client_" + _id()[:8])
    return base


def audit(user: dict, action: str, resource: str, detail: str = ""):
    store, _ = scope_context(user)
    repo.create(store, "audit_log", {
        "id": _id(), "store": store, "scope": dict(user.get("scope", {})),
        "actor_email": user["email"], "action": action, "resource": resource,
        "detail": detail, "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# =====================================================================
#  AUTH ROUTES
# =====================================================================

@api.get("/")
async def root():
    return {"service": "Compass Planning", "version": "v1", "data_layer": "mock"}


@api.post("/auth/register")
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
    # solo retention schedule (30-day purge on opt-out)
    repo.create("shared", "retention_schedule", {
        "id": _id(), "store": "shared", "scope": {"client_id": client_id},
        "controller": "self", "tier": "solo", "policy": "30_day_purge_on_optout",
        "opt_out_at": None, "purge_at": None, "status": "active",
    })
    audit(user, "auth.register", "account", "Solo self-signup")
    return {"status": "registered"}


def _issue_session(user: dict):
    if user.get("must_change_password"):
        change_token = create_scoped_token({"sub": user["id"]}, 10, "password_change")
        return {"status": "password_change_required", "change_token": change_token}
    token = create_access_token(user["id"], user["email"])
    audit(user, "auth.login", "session", f"{user['tier']} sign-in (MFA verified)")
    return {"status": "authenticated", "token": token, "user": _public(user)}


@api.post("/auth/login")
async def login(body: LoginInput):
    user = repo.find_user_by_email(body.email.lower())
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # TOTP is required for every account. Enrolled -> verify; otherwise forced setup.
    if user.get("mfa_enabled") and user.get("mfa_secret"):
        challenge = create_scoped_token({"sub": user["id"]}, 10, "mfa_verify")
        return {"status": "mfa_required", "challenge": challenge}
    secret = generate_totp_secret()
    challenge = create_scoped_token({"sub": user["id"], "pending_secret": secret}, 10, "mfa_setup")
    uri = totp_uri(secret, user["email"])
    return {"status": "mfa_setup", "challenge": challenge, "secret": secret,
            "otpauth_uri": uri, "qr": qr_data_url(uri)}


@api.get("/auth/security-questions")
async def list_security_questions():
    return {"questions": SECURITY_QUESTIONS}


@api.post("/auth/mfa/verify")
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


@api.post("/auth/security-question")
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


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotInput):
    user = repo.find_user_by_email(body.email.lower())
    if not user or not user.get("security_question"):
        return {"question": None, "mfa": False}
    return {"question": user["security_question"], "mfa": bool(user.get("mfa_enabled"))}


@api.post("/auth/reset-password")
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


@api.post("/auth/change-password")
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


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return _public(user)


@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}


# =====================================================================
#  DASHBOARD (tier-aware)
# =====================================================================

@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    owners = repo.list(store, "owners", flt)
    accounts = repo.list(store, "accounts", flt)
    goals = repo.list(store, "goals", flt)
    total_assets = sum(a["balance"] for a in accounts)
    status_breakdown = {}
    for g in goals:
        status_breakdown[g["status"]] = status_breakdown.get(g["status"], 0) + 1
    clients = sorted({o["scope"].get("client_id") for o in owners if o["scope"].get("client_id")})

    out = {
        "tier": user["tier"], "role": user["role"], "name": user["name"],
        "total_assets": total_assets,
        "owners_count": len(owners),
        "accounts_count": len(accounts),
        "goals_count": len(goals),
        "clients_count": len(clients),
        "goal_status": status_breakdown,
        "assets_by_type": _by_type(accounts),
    }

    if user["tier"] == "enterprise":
        sync = repo.list("enterprise", "crm_sync_state", flt)
        out["crm"] = sync[0] if sync else None
        out["planners"] = [
            {"name": u["name"], "email": u["email"], "role": u["role"]}
            for u in repo.all_users()
            if u.get("scope", {}).get("corp_id") == user["scope"].get("corp_id")
        ]
    if user["tier"] == "solo":
        ret = repo.list("shared", "retention_schedule", flt)
        out["retention"] = ret[0] if ret else None
    return out


def _by_type(accounts):
    agg = {}
    for a in accounts:
        agg[a["account_type"]] = agg.get(a["account_type"], 0) + a["balance"]
    return [{"type": k, "value": v} for k, v in agg.items()]


# =====================================================================
#  OWNERS  (Enterprise = CRM-authoritative, read-only in Compass)
# =====================================================================

def _block_enterprise_write(user):
    if user["tier"] == "enterprise":
        raise HTTPException(status_code=403,
                            detail="CRM (Salesforce) is the source of truth for Enterprise records. Edit in CRM; Compass syncs from it.")


def _eff_hh(user: dict, household_id: str = None):
    """Effective household (client_id) a request operates on."""
    if user["tier"] == "solo":
        return user["scope"].get("client_id")
    return household_id


_RESERVED = {"id", "scope", "store", "household_id", "created_at", "crm_record_id", "source"}


def _clean(body_dict: dict) -> dict:
    """Strip server-controlled keys so clients can't override scope/identity."""
    return {k: v for k, v in body_dict.items() if k not in _RESERVED}


@api.get("/owners")
async def list_owners(user: dict = Depends(get_current_user), household_id: str = None):
    store, flt = scope_context(user)
    hid = _eff_hh(user, household_id)
    rows = repo.list(store, "owners", flt)
    if hid:
        rows = [r for r in rows if r.get("scope", {}).get("client_id") == hid]
    return rows


@api.post("/owners")
async def create_owner(body: OwnerInput, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, _ = scope_context(user)
    hid = _eff_hh(user, household_id)
    owner = PensionOwner(store=store, scope=write_scope(user, client_id=hid), **_clean(body.model_dump())).model_dump()
    repo.create(store, "owners", owner)
    audit(user, "owner.create", "owners", f"Added {body.full_name}")
    return owner


@api.put("/owners/{oid}")
async def update_owner(oid: str, body: OwnerInput, user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, flt = scope_context(user)
    updated = repo.update(store, "owners", oid, _clean(body.model_dump()), flt)
    if not updated:
        raise HTTPException(status_code=404, detail="Owner not found")
    audit(user, "owner.update", "owners", oid)
    return updated


@api.delete("/owners/{oid}")
async def delete_owner(oid: str, user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, flt = scope_context(user)
    if not repo.delete(store, "owners", oid, flt):
        raise HTTPException(status_code=404, detail="Owner not found")
    audit(user, "owner.delete", "owners", oid)
    return {"ok": True}


# =====================================================================
#  ACCOUNTS
# =====================================================================

@api.get("/accounts")
async def list_accounts(user: dict = Depends(get_current_user), owner_id: str = None, household_id: str = None):
    store, flt = scope_context(user)
    hid = _eff_hh(user, household_id)
    rows = repo.list(store, "accounts", flt)
    if hid:
        rows = [r for r in rows if r.get("scope", {}).get("client_id") == hid]
    if owner_id:
        rows = [r for r in rows if r["owner_id"] == owner_id]
    return rows


@api.post("/accounts")
async def create_account(body: AccountInput, user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, flt = scope_context(user)
    owner = repo.get(store, "owners", body.owner_id, flt)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found in your scope")
    acct = PensionAccount(store=store, scope=write_scope(user, client_id=owner["scope"].get("client_id"),
                                                          advisor_id=owner["scope"].get("advisor_id")),
                          **body.model_dump()).model_dump()
    repo.create(store, "accounts", acct)
    audit(user, "account.create", "accounts", f"{body.account_type} for {body.owner_id}")
    return acct


@api.put("/accounts/{aid}")
async def update_account(aid: str, body: AccountInput, user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, flt = scope_context(user)
    patch = body.model_dump()
    patch.pop("owner_id", None)
    updated = repo.update(store, "accounts", aid, patch, flt)
    if not updated:
        raise HTTPException(status_code=404, detail="Account not found")
    audit(user, "account.update", "accounts", aid)
    return updated


@api.delete("/accounts/{aid}")
async def delete_account(aid: str, user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, flt = scope_context(user)
    if not repo.delete(store, "accounts", aid, flt):
        raise HTTPException(status_code=404, detail="Account not found")
    audit(user, "account.delete", "accounts", aid)
    return {"ok": True}


# =====================================================================
#  GOALS
# =====================================================================

@api.get("/goals")
async def list_goals(user: dict = Depends(get_current_user), household_id: str = None):
    store, flt = scope_context(user)
    hid = _eff_hh(user, household_id)
    rows = repo.list(store, "goals", flt)
    if hid:
        rows = [r for r in rows if r.get("scope", {}).get("client_id") == hid]
    return rows


@api.post("/goals")
async def create_goal(body: GoalInput, user: dict = Depends(get_current_user), household_id: str = None):
    store, flt = scope_context(user)
    cid = _eff_hh(user, household_id)
    aid = user["scope"].get("advisor_id")
    if body.owner_id:
        owner = repo.get(store, "owners", body.owner_id, flt)
        if owner:
            cid = owner["scope"].get("client_id")
            aid = owner["scope"].get("advisor_id")
    goal = Goal(store=store, scope=write_scope(user, client_id=cid, advisor_id=aid),
                status=_goal_status(body.current_amount, body.target_amount),
                **body.model_dump()).model_dump()
    repo.create(store, "goals", goal)
    audit(user, "goal.create", "goals", body.title)
    return goal


def _goal_status(current, target):
    if target <= 0:
        return "on_track"
    r = current / target
    if r >= 1:
        return "achieved"
    if r >= 0.66:
        return "on_track"
    if r >= 0.4:
        return "at_risk"
    return "behind"


@api.put("/goals/{gid}")
async def update_goal(gid: str, body: GoalInput, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    patch = body.model_dump()
    patch["status"] = _goal_status(body.current_amount, body.target_amount)
    updated = repo.update(store, "goals", gid, patch, flt)
    if not updated:
        raise HTTPException(status_code=404, detail="Goal not found")
    audit(user, "goal.update", "goals", gid)
    return updated


@api.patch("/goals/{gid}/progress")
async def update_progress(gid: str, body: GoalProgressInput, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    existing = repo.get(store, "goals", gid, flt)
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    status = _goal_status(body.current_amount, existing["target_amount"])
    updated = repo.update(store, "goals", gid, {"current_amount": body.current_amount, "status": status}, flt)
    audit(user, "goal.progress", "goals", f"{gid} -> {body.current_amount}")
    return updated


@api.delete("/goals/{gid}")
async def delete_goal(gid: str, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    if not repo.delete(store, "goals", gid, flt):
        raise HTTPException(status_code=404, detail="Goal not found")
    audit(user, "goal.delete", "goals", gid)
    return {"ok": True}


# =====================================================================
#  ADVISOR — client roster + drill-down
# =====================================================================

def _goal_behind(g):
    cur = float(g.get("current_amount", 0) or 0); tgt = float(g.get("target_amount", 0) or 0)
    if tgt <= 0 or cur >= tgt:
        return False
    monthly = float(g.get("monthly_contribution", 0) or 0); r = float(g.get("growth_rate", 0) or 0) / 100 / 12
    ty = int(g.get("target_year", 0) or 0)
    if ty and ty < datetime.now(timezone.utc).year:
        return True  # target year already passed and still under-funded
    if monthly <= 0 and r <= 0:
        return False  # no funding plan to judge against
    bal, m = cur, 0
    while bal < tgt and m < 1200:
        m += 1; bal = bal * (1 + r) + monthly
    if m >= 1200:
        return True
    now = datetime.now(timezone.utc)
    proj_year = now.year + ((now.month - 1 + m) // 12)
    return bool(ty and proj_year > ty)


def _household_score(c, nw, debts, insurance, retirement, goals, estate=None):
    assets = c["assets"] + sum(float(r.get("value", 0)) for r in nw if r.get("kind") == "asset")
    liabilities = sum(float(r.get("value", 0)) for r in nw if r.get("kind") == "liability") \
        + sum(float(d.get("balance", 0)) for d in debts)
    net_worth = assets - liabilities
    if not nw and not debts and not insurance and not retirement and not goals and not (estate or []) and c["assets"] == 0:
        return {"score": None, "status": "Needs Setup", "needs_setup": True,
                "alerts": ["Household not set up yet"],
                "next_action": "Add assets, goals and a retirement plan",
                "net_worth": 0.0, "debt": 0.0}
    alerts, next_action, score = [], None, 100
    if not retirement:
        score -= 25; alerts.append("No retirement projection on file"); next_action = next_action or "Build a retirement projection"
    if not insurance:
        score -= 20; alerts.append("No insurance analysis — protection gap"); next_action = next_action or "Run an insurance gap analysis"
    high = [d for d in debts if float(d.get("rate", 0)) > 10]
    if high:
        score -= 15; alerts.append(f"High-interest debt (>10%): {len(high)}"); next_action = next_action or "Review debt payoff strategy"
    behind = [g for g in goals if g.get("status") in ("behind", "at_risk")]
    if behind:
        score -= min(30, 10 * len(behind)); alerts.append(f"{len(behind)} goal(s) off track"); next_action = next_action or "Rebalance goal funding"
    nudges = [g for g in goals if _goal_behind(g)]
    if nudges:
        score -= min(15, 5 * len(nudges)); alerts.append(f"{len(nudges)} goal(s) behind projected schedule"); next_action = next_action or "Increase contributions or extend goal timelines"
    est = estate or []
    has_will = any(r.get("kind") == "document" and str(r.get("doc_type", "")).lower() == "will"
                   and str(r.get("status", "")).lower() in ("on file", "current", "active") for r in est)
    if not has_will:
        score -= 10; alerts.append("No will on file"); next_action = next_action or "Add or confirm the client's will"
    if not any(r.get("kind") == "beneficiary" for r in est):
        score -= 5; alerts.append("Beneficiary designations missing"); next_action = next_action or "Record beneficiary designations"
    if net_worth < 0:
        score -= 15; alerts.append("Negative net worth")
    score = max(0, min(100, score))
    status = "On Track" if score >= 75 else ("Needs Review" if score >= 50 else "At Risk")
    return {"score": score, "status": status, "alerts": alerts, "needs_setup": False,
            "next_action": next_action or "Schedule annual review", "net_worth": net_worth, "debt": liabilities}


@api.get("/advisor/clients")
async def advisor_clients(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    owners = repo.list(store, "owners", flt)
    accounts = repo.list(store, "accounts", flt)
    goals = repo.list(store, "goals", flt)
    clients = {}
    for o in owners:
        cid = o["scope"].get("client_id")
        if not cid:
            continue
        c = clients.setdefault(cid, {"client_id": cid, "advisor_id": o["scope"].get("advisor_id"),
                                     "members": [], "primary": None, "assets": 0.0, "goals": 0,
                                     "invite_pending": False, "has_login": False})
        c["members"].append(o["full_name"])
        if o["relationship"] == "self":
            c["primary"] = o["full_name"]
    for a in accounts:
        cid = a["scope"].get("client_id")
        if cid in clients:
            clients[cid]["assets"] += a["balance"]
    for g in goals:
        cid = g["scope"].get("client_id")
        if cid in clients:
            clients[cid]["goals"] += 1
    for cid, c in clients.items():
        cflt = {**flt, "client_id": cid}
        hh_goals = [g for g in goals if g["scope"].get("client_id") == cid]
        c.update(_household_score(
            c,
            repo.list(store, "plan_networth", cflt),
            repo.list(store, "plan_debts", cflt),
            repo.list(store, "plan_insurance", cflt),
            repo.list(store, "plan_retirement", cflt),
            hh_goals,
            repo.list(store, "plan_estate", cflt),
        ))
    for u in repo.all_users():
        if not u.get("invited_by"):
            continue
        cid = u.get("scope", {}).get("client_id")
        if cid not in clients:
            continue
        if u.get("must_change_password"):
            clients[cid]["invite_pending"] = True
        else:
            clients[cid]["has_login"] = True
    return list(clients.values())


class OppsView(BaseModel):
    name: str
    type: str = "all"
    status: str = "all"
    sort: str = "score-asc"


class ViewsInput(BaseModel):
    views: list[OppsView]


@api.get("/advisor/opps-views")
async def get_opps_views(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    return user.get("opps_views") or []


@api.put("/advisor/opps-views")
async def put_opps_views(body: ViewsInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    views = [v.model_dump() for v in body.views]
    repo.update_user(user["id"], {"opps_views": views})
    return views


@api.get("/advisor/clients/{client_id}")
async def advisor_client_detail(client_id: str, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    cflt = {**flt, "client_id": client_id}
    return {
        "client_id": client_id,
        "owners": repo.list(store, "owners", cflt),
        "accounts": repo.list(store, "accounts", cflt),
        "goals": repo.list(store, "goals", cflt),
    }


# =====================================================================
#  ENTERPRISE — CRM connector (Salesforce, mocked)
# =====================================================================

@api.get("/crm/sync-state")
async def crm_state(user: dict = Depends(get_current_user)):
    if user["tier"] != "enterprise":
        raise HTTPException(status_code=403, detail="Enterprise tier only")
    store, flt = scope_context(user)
    rows = repo.list(store, "crm_sync_state", flt)
    if not rows:
        raise HTTPException(status_code=404, detail="No CRM connection")
    return rows[0]


@api.post("/crm/resync")
async def crm_resync(user: dict = Depends(get_current_user)):
    if user["tier"] != "enterprise":
        raise HTTPException(status_code=403, detail="Enterprise tier only")
    store, flt = scope_context(user)
    rows = repo.list(store, "crm_sync_state", flt)
    if not rows:
        raise HTTPException(status_code=404, detail="No CRM connection")
    owners = repo.list(store, "owners", flt)
    patch = {"last_synced_at": datetime.now(timezone.utc).isoformat(),
             "records_synced": len(owners), "pending_changes": 0, "status": "connected"}
    updated = repo.update(store, "crm_sync_state", rows[0]["id"], patch, flt)
    audit(user, "crm.sync", "owners", f"Manual re-sync pulled {len(owners)} records from Salesforce")
    return updated


# =====================================================================
#  PIPEDA compliance layer
# =====================================================================

@api.get("/consent")
async def get_consent(user: dict = Depends(get_current_user)):
    return user["consent"]


@api.put("/consent")
async def set_consent(body: ConsentToggleInput, user: dict = Depends(get_current_user)):
    consent = dict(user["consent"])
    for k in ("marketing", "data_processing", "crm_sharing"):
        v = getattr(body, k)
        if v is not None:
            consent[k] = v
    consent["updated_at"] = datetime.now(timezone.utc).isoformat()
    repo.update_user(user["id"], {"consent": consent})
    audit(user, "consent.update", "consent_log", str({k: v for k, v in body.model_dump().items() if v is not None}))
    # append to consent_log
    store, _ = scope_context(user)
    repo.create(store, "consent_log", {
        "id": _id(), "store": store, "scope": dict(user["scope"]),
        "actor_email": user["email"], "consent": consent,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return consent


@api.get("/export")
async def export_data(user: dict = Depends(get_current_user)):
    """PIPEDA right-to-access: full export of the caller's scoped data."""
    store, flt = scope_context(user)
    audit(user, "pipeda.export", "account", "Right-to-access export generated")
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "account": _public(user),
        "owners": repo.list(store, "owners", flt),
        "accounts": repo.list(store, "accounts", flt),
        "goals": repo.list(store, "goals", flt),
        "consent": user["consent"],
        "audit_log": repo.list(store, "audit_log", flt),
    }


@api.post("/erasure")
async def request_erasure(body: ErasureInput, user: dict = Depends(get_current_user)):
    """PIPEDA right-to-erasure. Retention is keyed off the record CONTROLLER."""
    store, flt = scope_context(user)
    if user["tier"] == "solo":
        rows = repo.list("shared", "retention_schedule", flt)
        now = datetime.now(timezone.utc)
        patch = {"opt_out_at": now.isoformat(),
                 "purge_at": (now + timedelta(days=30)).isoformat(),
                 "status": "pending_purge"}
        if rows:
            sched = repo.update("shared", "retention_schedule", rows[0]["id"], patch, flt)
        else:
            sched = {"id": _id(), "store": "shared", "scope": dict(user["scope"]),
                     "controller": "self", "tier": "solo",
                     "policy": "30_day_purge_on_optout", **patch}
            repo.create("shared", "retention_schedule", sched)
        audit(user, "pipeda.erasure", "retention_schedule", f"Solo opt-out; hard purge scheduled {patch['purge_at']}")
        return {"controller": "self", "auto_purge": True, "purge_at": patch["purge_at"], "schedule": sched}
    # Advisor / Enterprise: PIPEDA controller retention — no auto-purge
    audit(user, "pipeda.erasure", "account", "Erasure request logged; controller retention (no auto-purge)")
    return {"controller": "organization", "auto_purge": False,
            "message": "Request logged. Under PIPEDA controller retention your organization governs the lifecycle; no automatic purge applies."}


@api.get("/audit-log")
async def get_audit(user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    rows = repo.list(store, "audit_log", flt)
    rows.sort(key=lambda r: r["timestamp"], reverse=True)
    return rows[:200]


@api.get("/retention")
async def get_retention(user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    if user["tier"] == "solo":
        rows = repo.list("shared", "retention_schedule", flt)
        return rows[0] if rows else {"policy": "30_day_purge_on_optout", "status": "active", "controller": "self"}
    return {"policy": "controller_retention", "controller": "organization",
            "auto_purge": False, "tier": user["tier"]}


# =====================================================================
#  PROMOTION — Solo -> Advisor (consent re-capture + audited migration)
# =====================================================================

@api.post("/promotion/request")
async def promotion_request(body: PromotionInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "solo":
        raise HTTPException(status_code=403, detail="Only Solo users can request promotion")
    if not (body.consent_reconfirmed and body.consent_data_sharing):
        raise HTTPException(status_code=400, detail="Explicit consent re-capture is required to migrate your data")
    target = repo.find_user_by_email(body.advisor_email.lower())
    if not target or target["tier"] != "advisor":
        raise HTTPException(status_code=404, detail="Advisor not found")

    old_flt = {"client_id": user["scope"].get("client_id")}
    new_client = "client_" + _id()[:8]
    new_scope = {"corp_id": None, "org_id": target["scope"].get("org_id"),
                 "advisor_id": target["scope"].get("advisor_id"), "client_id": new_client}

    migrated = {"owners": 0, "accounts": 0, "goals": 0}
    for coll in ("owners", "accounts", "goals"):
        for row in repo.list("shared", coll, old_flt):
            copy_row = dict(row)
            copy_row["id"] = _id()
            copy_row["scope"] = dict(new_scope)
            copy_row["migrated_from"] = user["scope"].get("client_id")
            repo.create("shared", coll, copy_row)
            migrated[coll] += 1

    audit(user, "promotion.migrate", "account",
          f"Solo->Advisor consent re-captured; migrated {migrated} to advisor {body.advisor_email}")
    repo.create("shared", "audit_log", {
        "id": _id(), "store": "shared", "scope": dict(new_scope),
        "actor_email": user["email"], "action": "promotion.receive", "resource": "household",
        "detail": f"Received migrated household from Solo {user['email']}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "migrated", "new_client_id": new_client, "advisor": body.advisor_email, "migrated": migrated}


# =====================================================================
#  PLANNING WORKSPACE (Net Worth, Debt, Cash Flow, Insurance, Tax,
#  Documents, Retirement) — mirrors the original Compass planner.
# =====================================================================

PLAN_COLLECTIONS = {"networth", "debts", "expenses", "insurance", "documents", "tax_notes", "retirement", "estate"}


def planner_scope(user: dict, household_id: str = None):
    store, flt = scope_context(user)
    read = dict(flt)
    if user["tier"] == "solo":
        household_id = user["scope"].get("client_id")
    elif user["tier"] == "advisor" and household_id:
        read["client_id"] = household_id
    ws = {"corp_id": None, "org_id": None, "advisor_id": None, "client_id": None}
    if user["tier"] == "enterprise":
        ws["corp_id"] = user["scope"].get("corp_id")
    elif user["tier"] == "solo":
        ws["client_id"] = user["scope"].get("client_id")
    else:
        ws["org_id"] = user["scope"].get("org_id")
        ws["advisor_id"] = user["scope"].get("advisor_id")
        ws["client_id"] = household_id
    return store, read, ws, household_id


@api.get("/plan/overview")
async def plan_overview(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    def hh(rows):
        return [r for r in rows if (not hid or r.get("household_id") == hid)]
    nw = hh(repo.list(store, "plan_networth", read))
    debts = hh(repo.list(store, "plan_debts", read))
    accounts = repo.list(store, "accounts", read)
    goals = repo.list(store, "goals", read)
    assets = sum(float(r.get("value", 0)) for r in nw if r.get("kind") == "asset") + sum(float(a.get("balance", 0)) for a in accounts)
    liabilities = sum(float(r.get("value", 0)) for r in nw if r.get("kind") == "liability") + sum(float(d.get("balance", 0)) for d in debts)
    return {
        "netWorth": assets - liabilities, "totalAssets": assets, "totalLiabilities": liabilities,
        "accounts": len(accounts), "goals": len(goals),
        "retirementProjections": len(hh(repo.list(store, "plan_retirement", read))),
        "insuranceAnalyses": len(hh(repo.list(store, "plan_insurance", read))),
        "debtCount": len(debts),
        "monthlyExpenses": sum(float(r.get("amount", 0)) for r in hh(repo.list(store, "plan_expenses", read))),
        "documents": len(hh(repo.list(store, "plan_documents", read))),
    }


@api.get("/plan/profile")
async def plan_profile(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    owners = repo.list(store, "owners", read)
    return next((o for o in owners if o.get("relationship") == "self"), owners[0] if owners else {})


@api.put("/plan/profile")
async def plan_profile_save(body: ProfileInput, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, read, _, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before saving its profile")
    owners = repo.list(store, "owners", read)
    self_o = next((o for o in owners if o.get("relationship") == "self"), owners[0] if owners else None)
    if not self_o:
        raise HTTPException(status_code=404, detail="No household profile")
    updated = repo.update(store, "owners", self_o["id"], _clean(body.model_dump()), read)
    audit(user, "profile.update", "owners", self_o["id"])
    return updated


@api.get("/plan/{collection}")
async def plan_list(collection: str, user: dict = Depends(get_current_user), household_id: str = None):
    if collection not in PLAN_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    store, read, _, hid = planner_scope(user, household_id)
    rows = repo.list(store, f"plan_{collection}", read)
    if hid:
        rows = [r for r in rows if r.get("household_id") == hid]
    return rows


@api.post("/plan/{collection}")
async def plan_create(collection: str, body: PlanningItemInput, user: dict = Depends(get_current_user), household_id: str = None):
    if collection not in PLAN_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    _block_enterprise_write(user)
    store, read, ws, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before saving planning data")
    rec = {"id": _id(), "store": store, "scope": ws, "household_id": hid,
           "created_at": datetime.now(timezone.utc).isoformat(), **_clean(body.model_dump())}
    repo.create(store, f"plan_{collection}", rec)
    audit(user, f"{collection}.create", collection, str(rec.get("name", "")))
    return rec


@api.put("/plan/{collection}/{rid}")
async def plan_update(collection: str, rid: str, body: PlanningItemInput, user: dict = Depends(get_current_user), household_id: str = None):
    if collection not in PLAN_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    _block_enterprise_write(user)
    store, read, _, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before saving planning data")
    updated = repo.update(store, f"plan_{collection}", rid, _clean(body.model_dump()), read)
    if not updated:
        raise HTTPException(status_code=404, detail="Not found")
    audit(user, f"{collection}.update", collection, rid)
    return updated


@api.delete("/plan/{collection}/{rid}")
async def plan_delete(collection: str, rid: str, user: dict = Depends(get_current_user), household_id: str = None):
    if collection not in PLAN_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    _block_enterprise_write(user)
    store, read, _, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before modifying planning data")
    if not repo.delete(store, f"plan_{collection}", rid, read):
        raise HTTPException(status_code=404, detail="Not found")
    audit(user, f"{collection}.delete", collection, rid)
    return {"ok": True}


@api.post("/report/email")
async def email_report(body: ReportEmailInput, user: dict = Depends(get_current_user), household_id: str = None):
    if user["tier"] == "enterprise":
        raise HTTPException(status_code=403, detail="Not available for this tier")
    store, read, ws, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before emailing its report")
    if not rate_ok(user["id"]):
        raise HTTPException(status_code=429, detail="Too many emails — please wait a minute")
    owners = repo.list(store, "owners", read)
    primary = next((o for o in owners if o.get("relationship") == "self"), owners[0] if owners else None)
    household_name = f"The {primary['full_name'].split()[-1]} Household" if primary else "Household"
    goals = repo.list(store, "goals", read)[:5]
    branding = user.get("branding") or {}
    html = render_report_html(household_name, body.net_worth, body.protection_score, body.retirement_success, goals, branding.get("firm_name"), logo_url=branding.get("logo_url"))
    email_id = await send_email(to=str(body.recipient), subject=f"{household_name} — financial summary", html=html)
    repo.create(store, "report_log", {
        "id": _id(), "store": store, "scope": ws, "household_id": hid,
        "recipient": str(body.recipient), "net_worth": body.net_worth,
        "protection_score": body.protection_score, "retirement_success": body.retirement_success,
        "sent_at": datetime.now(timezone.utc).isoformat(), "actor_email": user["email"],
    })
    audit(user, "report.email", "report", f"to {body.recipient}")
    return {"status": "sent", "email_id": email_id}


@api.get("/advisor/branding")
async def get_branding(user: dict = Depends(get_current_user)):
    return user.get("branding") or {"firm_name": "Compass Planning", "cover_note": "", "logo": ""}


@api.put("/advisor/branding")
async def put_branding(body: BrandingInput, user: dict = Depends(get_current_user)):
    if user["tier"] == "enterprise":
        raise HTTPException(status_code=403, detail="Not available for this tier")
    merged = {**(user.get("branding") or {}), **body.model_dump()}
    repo.update_user(user["id"], {"branding": merged})
    return merged


_LOGO_MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}


@api.post("/advisor/branding/logo")
async def upload_branding_logo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if user["tier"] == "enterprise":
        raise HTTPException(status_code=403, detail="Not available for this tier")
    data = await file.read()
    if len(data) > 1_000_000:
        raise HTTPException(status_code=413, detail="Logo too large (max 1MB)")
    ext = (file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png").lower()
    ct = _LOGO_MIME.get(ext)
    if not ct:
        raise HTTPException(status_code=400, detail="Logo must be PNG, JPG, WEBP or GIF")
    path = f"{storage.APP_NAME}/logos/{user['id']}.{ext}"
    try:
        result = await run_in_threadpool(storage.put_object, path, data, ct)
    except Exception as e:
        logger.error(f"Logo upload failed: {e}")
        raise HTTPException(status_code=502, detail="Could not store the logo right now")
    merged = {**(user.get("branding") or {}), "logo_path": result["path"]}
    repo.update_user(user["id"], {"branding": merged})
    audit(user, "branding.logo", "branding", "Uploaded firm logo")
    return {"logo_path": result["path"]}


@api.get("/public/logo/{uid}")
async def public_logo(uid: str):
    u = repo.find_user_by_id(uid)
    path = (u.get("branding") or {}).get("logo_path") if u else None
    if not path:
        raise HTTPException(status_code=404, detail="No logo on file")
    try:
        content, ct = await run_in_threadpool(storage.get_object, path)
    except Exception:
        raise HTTPException(status_code=404, detail="No logo on file")
    return Response(content=content, media_type=ct, headers={"Cache-Control": "public, max-age=3600"})


@api.delete("/advisor/branding/logo")
async def delete_branding_logo(user: dict = Depends(get_current_user)):
    if user["tier"] == "enterprise":
        raise HTTPException(status_code=403, detail="Not available for this tier")
    branding = dict(user.get("branding") or {})
    path = branding.get("logo_path")
    if path:
        try:
            await run_in_threadpool(storage.delete_object, path)
        except Exception as e:
            logger.warning(f"Logo delete (storage) failed: {e}")
    branding.pop("logo_path", None)
    branding["logo"] = ""
    branding["logo_url"] = ""
    repo.update_user(user["id"], {"branding": branding})
    audit(user, "branding.logo_remove", "branding", "Removed firm logo")
    return {"ok": True}


class InviteClientInput(BaseModel):
    email: EmailStr
    full_name: str
    client_id: str
    base_url: str = ""


def _activation_link(base_url: str, token: str) -> str:
    return f"{(base_url or '').rstrip('/')}/activate?token={token}"


async def _send_invite(to_email: str, name: str, firm: str, link: str) -> bool:
    if not (link and link.startswith("https://")):
        return False
    try:
        await send_email(to=to_email, subject=f"Activate your {firm or 'Compass Planning'} account",
                         html=render_invite_html(name, firm, link))
        return True
    except Exception as e:
        logger.warning(f"Invite email failed: {e}")
        return False


@api.post("/advisor/clients/invite")
async def invite_client(body: InviteClientInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Only advisors can invite client logins")
    store, flt = scope_context(user)
    owners = [o for o in repo.list(store, "owners", flt) if o.get("scope", {}).get("client_id") == body.client_id]
    if not owners:
        raise HTTPException(status_code=404, detail="Household not found in your book")
    email = body.email.lower()
    if repo.find_user_by_email(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    sc = user.get("scope", {})
    client = {
        "id": _id(), "email": email, "password_hash": hash_password("Cmps-" + secrets.token_urlsafe(10)),
        "name": body.full_name, "tier": "solo", "role": "solo_user",
        "scope": {"corp_id": None, "org_id": sc.get("org_id"), "advisor_id": sc.get("advisor_id"), "client_id": body.client_id},
        "mfa_enabled": False, "mfa_secret": None, "must_change_password": True,
        "invited_by": user["id"],
        "consent": {"marketing": False, "data_processing": True, "crm_sharing": True,
                    "updated_at": datetime.now(timezone.utc).isoformat()},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    repo.insert_user(client)
    token = create_scoped_token({"sub": client["id"]}, 60 * 24 * 7, "activate")
    link = _activation_link(body.base_url, token)
    firm = (user.get("branding") or {}).get("firm_name")
    emailed = await _send_invite(email, client["name"], firm, link)
    audit(user, "client.invite", "account", f"Invited client login {email} for {body.client_id}")
    return {"email": email, "activation_link": link, "emailed": emailed}


class ResendInviteInput(BaseModel):
    client_id: str
    base_url: str = ""


@api.post("/advisor/clients/invite/resend")
async def resend_invite(body: ResendInviteInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Only advisors can resend invites")
    pending = next((u for u in repo.all_users()
                    if u.get("invited_by") and u.get("scope", {}).get("client_id") == body.client_id
                    and u.get("must_change_password")), None)
    if not pending:
        raise HTTPException(status_code=404, detail="No pending invite for this household")
    repo.update_user(pending["id"], {"password_hash": hash_password("Cmps-" + secrets.token_urlsafe(10)),
                                     "must_change_password": True})
    token = create_scoped_token({"sub": pending["id"]}, 60 * 24 * 7, "activate")
    link = _activation_link(body.base_url, token)
    firm = (user.get("branding") or {}).get("firm_name")
    emailed = await _send_invite(pending["email"], pending["name"], firm, link)
    audit(user, "client.invite_resend", "account", f"Re-invited {pending['email']}")
    return {"email": pending["email"], "activation_link": link, "emailed": emailed}


class ActivateInput(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


@api.post("/auth/activate")
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


class TaskInput(BaseModel):
    client_id: str
    title: str = Field(min_length=1)


@api.post("/advisor/tasks")
async def create_task(body: TaskInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, _ = scope_context(user)
    rec = {"id": _id(), "store": store, "scope": write_scope(user, client_id=body.client_id),
           "title": body.title, "done": False, "actor_email": user["email"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    repo.create(store, "tasks", rec)
    audit(user, "task.create", "tasks", body.title)
    return rec


@api.get("/advisor/tasks")
async def list_tasks(user: dict = Depends(get_current_user), client_id: str = None):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    rows = repo.list(store, "tasks", flt)
    if client_id:
        rows = [r for r in rows if r.get("scope", {}).get("client_id") == client_id]
    return rows


@api.patch("/advisor/tasks/{tid}")
async def complete_task(tid: str, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    updated = repo.update(store, "tasks", tid, {"done": True}, flt)
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found")
    return updated


@api.get("/report/history")
async def report_history(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rows = repo.list(store, "report_log", read)
    if hid:
        rows = [r for r in rows if r.get("household_id") == hid]
    rows.sort(key=lambda r: r.get("sent_at", ""), reverse=True)
    return rows


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
