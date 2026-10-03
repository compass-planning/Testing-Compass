"""Shared dependencies, tenant-scope enforcement and cross-domain helpers.

Tenant isolation is enforced server-side on every route via `scope_context`,
never in the UI. Cross-tenant reads are impossible by construction.
"""
import logging
import os
from datetime import datetime, timezone
from fastapi import HTTPException, Request

import jwt
from security import decode_token
from repository import repo
from models import _id

logger = logging.getLogger("compass")

# Testing escape hatch: when true, the Enterprise tier (normally CRM-read-only)
# is allowed to create/edit/delete records so the tier can be exercised without a CRM.
ALLOW_ENTERPRISE_WRITE = os.environ.get("ALLOW_ENTERPRISE_WRITE", "false").lower() == "true"

SECURITY_QUESTIONS = [
    "What was the name of your first pet?",
    "What was the name of your elementary school?",
    "What is your mother's maiden name?",
    "What city were you born in?",
    "What was the make of your first car?",
    "What is the name of your childhood best friend?",
]

PLAN_COLLECTIONS = {"networth", "debts", "expenses", "insurance", "documents", "tax_notes", "retirement", "estate", "protection"}

_RESERVED = {"id", "scope", "store", "household_id", "created_at", "crm_record_id", "source"}


def _public(user: dict) -> dict:
    u = dict(user)
    for k in ("password_hash", "mfa_secret", "security_answer_hash"):
        u.pop(k, None)
    u["is_client"] = bool(user.get("invited_by"))
    u["enterprise_write"] = ALLOW_ENTERPRISE_WRITE
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


async def get_admin_user(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("tier") != "admin":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    return user


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


def _block_enterprise_write(user):
    if user["tier"] == "enterprise" and not ALLOW_ENTERPRISE_WRITE:
        raise HTTPException(status_code=403,
                            detail="CRM (Salesforce) is the source of truth for Enterprise records. Edit in CRM; Compass syncs from it.")


def _eff_hh(user: dict, household_id: str = None):
    """Effective household (client_id) a request operates on."""
    if user["tier"] == "solo":
        return user["scope"].get("client_id")
    return household_id


def _clean(body_dict: dict) -> dict:
    """Strip server-controlled keys so clients can't override scope/identity."""
    return {k: v for k, v in body_dict.items() if k not in _RESERVED}


def planner_scope(user: dict, household_id: str = None):
    store, flt = scope_context(user)
    read = dict(flt)
    if user["tier"] == "solo":
        household_id = user["scope"].get("client_id")
    elif user["tier"] == "advisor" and household_id:
        read["client_id"] = household_id
    elif user["tier"] == "enterprise" and household_id and ALLOW_ENTERPRISE_WRITE:
        read["client_id"] = household_id
    ws = {"corp_id": None, "org_id": None, "advisor_id": None, "client_id": None}
    if user["tier"] == "enterprise":
        ws["corp_id"] = user["scope"].get("corp_id")
        if ALLOW_ENTERPRISE_WRITE:
            ws["client_id"] = household_id
    elif user["tier"] == "solo":
        ws["client_id"] = user["scope"].get("client_id")
    else:
        ws["org_id"] = user["scope"].get("org_id")
        ws["advisor_id"] = user["scope"].get("advisor_id")
        ws["client_id"] = household_id
    return store, read, ws, household_id


def log_digest(user: dict, kind: str, channel: str, sent: bool):
    """Record a digest send (kind=daily|weekly, channel=scheduled|preview) for the advisor's history."""
    sc = user.get("scope", {})
    repo.create("shared", "digest_log", {
        "id": _id(), "store": "shared",
        "scope": {"org_id": sc.get("org_id"), "advisor_id": sc.get("advisor_id")},
        "kind": kind, "channel": channel, "sent": bool(sent),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
