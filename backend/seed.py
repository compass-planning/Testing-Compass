"""Seed realistic mock data for Compass Planning v1."""
import os
from datetime import datetime, timezone
from security import hash_password
from repository import repo
from models import _id

CORP_SWESTON = "corp_sweston"
ORG_MAPLE = "org_maple"
ADV_LENA = "adv_lena"
CLIENT_SOLO = "client_solo1"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _owner(store, scope, full_name, rel, dob, prov, source="compass", crm_id=None):
    return {
        "id": _id(), "store": store, "scope": scope, "full_name": full_name,
        "relationship": rel, "date_of_birth": dob, "province": prov,
        "source": source, "crm_record_id": crm_id, "created_at": _now(),
    }


def _account(store, scope, owner_id, atype, inst, bal, contrib):
    return {
        "id": _id(), "store": store, "scope": scope, "owner_id": owner_id,
        "account_type": atype, "institution": inst, "balance": bal,
        "annual_contribution": contrib, "created_at": _now(),
    }


def _goal(store, scope, owner_id, title, cat, target, current, year, status):
    return {
        "id": _id(), "store": store, "scope": scope, "owner_id": owner_id,
        "title": title, "category": cat, "target_amount": target,
        "current_amount": current, "target_year": year, "status": status,
        "created_at": _now(),
    }


_RESET_PLAN_COLLS = ["networth", "debts", "expenses", "insurance", "documents",
                     "tax_notes", "retirement", "estate", "protection", "assumptions",
                     "education", "crossborder", "meetings"]


def _seed_corp_book(corp_id):
    """(Re)create the Sweston sample corp book in the enterprise store."""
    sc = {"corp_id": corp_id}
    owners = [
        _owner("enterprise", sc, "Eleanor Whitfield", "self", "1968-04-12", "ON", "crm", "SF-0012"),
        _owner("enterprise", sc, "Raymond Whitfield", "spouse", "1966-09-02", "ON", "crm", "SF-0013"),
        _owner("enterprise", sc, "Dev Patel", "self", "1972-01-25", "BC", "crm", "SF-0021"),
        _owner("enterprise", sc, "Sophie Girard", "self", "1979-11-08", "QC", "crm", "SF-0033"),
    ]
    for o in owners:
        repo.create("enterprise", "owners", o)
    repo.create("enterprise", "accounts", _account("enterprise", sc, owners[0]["id"], "DB Pension", "Sweston Pension Trust", 842000, 0))
    repo.create("enterprise", "accounts", _account("enterprise", sc, owners[0]["id"], "RRSP", "RBC", 310500, 12000))
    repo.create("enterprise", "accounts", _account("enterprise", sc, owners[1]["id"], "TFSA", "TD", 88000, 7000))
    repo.create("enterprise", "accounts", _account("enterprise", sc, owners[2]["id"], "DC Pension", "Sweston Group RRSP", 415000, 18000))
    repo.create("enterprise", "accounts", _account("enterprise", sc, owners[3]["id"], "RRSP", "Desjardins", 205000, 9000))
    repo.create("enterprise", "goals", _goal("enterprise", sc, owners[0]["id"], "Retire at 62", "retirement", 1500000, 1240500, 2030, "on_track"))
    repo.create("enterprise", "goals", _goal("enterprise", sc, owners[2]["id"], "Bridge to CPP", "income", 500000, 415000, 2034, "at_risk"))
    repo.create("enterprise", "goals", _goal("enterprise", sc, owners[3]["id"], "Legacy fund", "legacy", 300000, 205000, 2040, "behind"))
    repo.create("enterprise", "crm_sync_state", {
        "id": _id(), "store": "enterprise", "scope": sc, "connector": "Salesforce",
        "status": "connected", "authoritative": True, "last_synced_at": _now(),
        "records_synced": 4, "pending_changes": 0, "delete_propagation": False,
    })


def reset_corp_demo(corp_id, scope="all"):
    """Wipe the corp's enterprise-store data and reseed the original sample book.
    scope="all" wipes everything and reseeds; scope="additions" removes only
    records that are NOT from the original CRM seed (source != 'crm')."""
    flt = {"corp_id": corp_id}
    removed = 0
    if scope == "additions":
        owners = repo.list("enterprise", "owners", flt)
        del_ids = {o["id"] for o in owners if o.get("source") != "crm"}
        for coll in ["accounts", "goals"]:
            for r in repo.list("enterprise", coll, flt):
                if r.get("owner_id") in del_ids and repo.delete("enterprise", coll, r["id"], flt):
                    removed += 1
        for coll in [f"plan_{c}" for c in _RESET_PLAN_COLLS]:
            for r in repo.list("enterprise", coll, flt):
                if r.get("household_id") in del_ids and repo.delete("enterprise", coll, r["id"], flt):
                    removed += 1
        for oid in del_ids:
            if repo.delete("enterprise", "owners", oid, flt):
                removed += 1
        return removed
    colls = ["owners", "accounts", "goals", "crm_sync_state"] + [f"plan_{c}" for c in _RESET_PLAN_COLLS]
    for coll in colls:
        for r in repo.list("enterprise", coll, flt):
            if repo.delete("enterprise", coll, r["id"], flt):
                removed += 1
    _seed_corp_book(corp_id)
    return removed


def _audit(store, scope, actor, action, resource, detail):
    return {
        "id": _id(), "store": store, "scope": scope, "actor_email": actor,
        "action": action, "resource": resource, "detail": detail, "timestamp": _now(),
    }


DEMO_EMAILS = [
    "planner@sweston.ca", "firmadmin@compass.ca", "advisor@compass.ca",
    "solo@compass.ca", "admin@compass.ca",
]
DEMO_SCOPE_VALUES = {
    "corp_id": ["corp_sweston"],
    "org_id": ["org_maple"],
    "client_id": ["client_solo1", "client_a1", "client_a2", "client_a3"],
}


def cleanup_demo():
    """One-time removal of any pre-existing demo accounts and their tenant data (idempotent)."""
    db = getattr(repo, "db", None)
    if db is None:
        return
    if db["shared__system_flags"].find_one({"id": "demo_purged"}):
        return
    for em in DEMO_EMAILS:
        db["shared__users"].delete_many({"email": em})
    or_q = [{f"scope.{k}": {"$in": v}} for k, v in DEMO_SCOPE_VALUES.items()]
    for name in db.list_collection_names():
        if "__" not in name or name in ("shared__users", "shared__system_flags"):
            continue
        db[name].delete_many({"$or": or_q})
    for coll in ("announcements", "status_posts", "tickets", "subscriptions", "invoices"):
        db[f"shared__{coll}"].delete_many({})
    db["shared__system_flags"].insert_one({"id": "demo_purged", "at": _now()})


def _ensure_admin():
    """Idempotently ensure a single platform-admin owner exists (from env; create-or-promote, never resets an existing password)."""
    email = os.environ.get("ADMIN_EMAIL", "scott@sweston.ca").lower()
    password = os.environ.get("ADMIN_PASSWORD", "Compass2026!")
    admin_scope = {"corp_id": None, "org_id": None, "advisor_id": None, "client_id": None}
    existing = repo.find_user_by_email(email)
    if existing:
        patch = {}
        if existing.get("tier") != "admin":
            patch["tier"] = "admin"
        if existing.get("role") != "platform_admin":
            patch["role"] = "platform_admin"
        if existing.get("scope") != admin_scope:
            patch["scope"] = admin_scope
        if existing.get("status") != "active":
            patch["status"] = "active"
        if patch:
            repo.update_user(existing["id"], patch)
        return
    repo.insert_user({
        "id": _id(), "email": email, "password_hash": hash_password(password),
        "name": "Platform Admin", "tier": "admin", "role": "platform_admin",
        "scope": admin_scope,
        "mfa_enabled": False, "mfa_secret": None, "must_change_password": False,
        "status": "active",
        "security_question": None, "security_answer_hash": None,
        "consent": {"marketing": False, "data_processing": True, "crm_sharing": False,
                    "updated_at": _now()},
        "created_at": _now(),
    })


def seed():
    """Production seed: purge any legacy demo data once, then ensure the platform-admin owner."""
    cleanup_demo()
    _ensure_admin()
