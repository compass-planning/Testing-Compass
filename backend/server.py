"""Compass Planning — FastAPI backend (v1, in-memory mock repository).

Tenant isolation is enforced server-side on every route via `scope_context`,
never in the UI. Cross-tenant reads are impossible by construction.
"""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from starlette.middleware.cors import CORSMiddleware

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
api = APIRouter(prefix="/api")

seed.seed()


# ---------------- Auth helpers ----------------

def _public(user: dict) -> dict:
    u = dict(user)
    for k in ("password_hash", "mfa_secret", "security_answer_hash"):
        u.pop(k, None)
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
                                     "members": [], "primary": None, "assets": 0.0, "goals": 0})
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
    return list(clients.values())


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

PLAN_COLLECTIONS = {"networth", "debts", "expenses", "insurance", "documents", "tax_notes", "retirement"}


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


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
