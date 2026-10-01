"""Compliance routes: CRM connector (mocked), PIPEDA consent/export/erasure/audit/retention, promotion."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException

from repository import repo
from models import _id, ConsentToggleInput, ErasureInput, PromotionInput
from deps import get_current_user, scope_context, audit, _public

router = APIRouter()


# ---------------- Enterprise CRM (Salesforce, mocked) ----------------

@router.get("/crm/sync-state")
async def crm_state(user: dict = Depends(get_current_user)):
    if user["tier"] != "enterprise":
        raise HTTPException(status_code=403, detail="Enterprise tier only")
    store, flt = scope_context(user)
    rows = repo.list(store, "crm_sync_state", flt)
    if not rows:
        raise HTTPException(status_code=404, detail="No CRM connection")
    return rows[0]


@router.post("/crm/resync")
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


# ---------------- PIPEDA ----------------

@router.get("/consent")
async def get_consent(user: dict = Depends(get_current_user)):
    return user["consent"]


@router.put("/consent")
async def set_consent(body: ConsentToggleInput, user: dict = Depends(get_current_user)):
    consent = dict(user["consent"])
    for k in ("marketing", "data_processing", "crm_sharing"):
        v = getattr(body, k)
        if v is not None:
            consent[k] = v
    consent["updated_at"] = datetime.now(timezone.utc).isoformat()
    repo.update_user(user["id"], {"consent": consent})
    audit(user, "consent.update", "consent_log", str({k: v for k, v in body.model_dump().items() if v is not None}))
    store, _ = scope_context(user)
    repo.create(store, "consent_log", {
        "id": _id(), "store": store, "scope": dict(user["scope"]),
        "actor_email": user["email"], "consent": consent,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return consent


@router.get("/export")
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


@router.post("/erasure")
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
    audit(user, "pipeda.erasure", "account", "Erasure request logged; controller retention (no auto-purge)")
    return {"controller": "organization", "auto_purge": False,
            "message": "Request logged. Under PIPEDA controller retention your organization governs the lifecycle; no automatic purge applies."}


@router.get("/audit-log")
async def get_audit(user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    rows = repo.list(store, "audit_log", flt)
    rows.sort(key=lambda r: r["timestamp"], reverse=True)
    return rows[:200]


@router.get("/retention")
async def get_retention(user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    if user["tier"] == "solo":
        rows = repo.list("shared", "retention_schedule", flt)
        return rows[0] if rows else {"policy": "30_day_purge_on_optout", "status": "active", "controller": "self"}
    return {"policy": "controller_retention", "controller": "organization",
            "auto_purge": False, "tier": user["tier"]}


# ---------------- Promotion: Solo -> Advisor ----------------

@router.post("/promotion/request")
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
