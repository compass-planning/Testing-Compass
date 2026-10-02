"""Planning routes: dashboard, owners, accounts, goals, plan/* workspace, report email/history."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional

from repository import repo
from models import (
    _id, PensionOwner, OwnerInput, PensionAccount, AccountInput,
    Goal, GoalInput, GoalProgressInput, PlanningItemInput, ProfileInput,
)
from deps import (
    get_current_user, scope_context, write_scope, audit, _block_enterprise_write,
    _eff_hh, _clean, planner_scope, PLAN_COLLECTIONS,
)
from email_service import send_email, render_report_html, rate_ok
from engine.report_pdf import build_plan_pdf
from engine.estate import calculate_estate
from fastapi.responses import StreamingResponse

router = APIRouter()


# ---------------- Dashboard ----------------

def _by_type(accounts):
    agg = {}
    for a in accounts:
        agg[a["account_type"]] = agg.get(a["account_type"], 0) + a["balance"]
    return [{"type": k, "value": v} for k, v in agg.items()]


@router.get("/dashboard")
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


# ---------------- Owners ----------------

@router.get("/owners")
async def list_owners(user: dict = Depends(get_current_user), household_id: str = None):
    store, flt = scope_context(user)
    hid = _eff_hh(user, household_id)
    rows = repo.list(store, "owners", flt)
    if hid:
        rows = [r for r in rows if r.get("scope", {}).get("client_id") == hid]
    return rows


@router.post("/owners")
async def create_owner(body: OwnerInput, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, _ = scope_context(user)
    hid = _eff_hh(user, household_id)
    owner = PensionOwner(store=store, scope=write_scope(user, client_id=hid), **_clean(body.model_dump())).model_dump()
    repo.create(store, "owners", owner)
    audit(user, "owner.create", "owners", f"Added {body.full_name}")
    return owner


@router.put("/owners/{oid}")
async def update_owner(oid: str, body: OwnerInput, user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, flt = scope_context(user)
    updated = repo.update(store, "owners", oid, _clean(body.model_dump()), flt)
    if not updated:
        raise HTTPException(status_code=404, detail="Owner not found")
    audit(user, "owner.update", "owners", oid)
    return updated


@router.delete("/owners/{oid}")
async def delete_owner(oid: str, user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, flt = scope_context(user)
    if not repo.delete(store, "owners", oid, flt):
        raise HTTPException(status_code=404, detail="Owner not found")
    audit(user, "owner.delete", "owners", oid)
    return {"ok": True}


# ---------------- Accounts ----------------

@router.get("/accounts")
async def list_accounts(user: dict = Depends(get_current_user), owner_id: str = None, household_id: str = None):
    store, flt = scope_context(user)
    hid = _eff_hh(user, household_id)
    rows = repo.list(store, "accounts", flt)
    if hid:
        rows = [r for r in rows if r.get("scope", {}).get("client_id") == hid]
    if owner_id:
        rows = [r for r in rows if r["owner_id"] == owner_id]
    return rows


@router.post("/accounts")
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


@router.put("/accounts/{aid}")
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


@router.delete("/accounts/{aid}")
async def delete_account(aid: str, user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, flt = scope_context(user)
    if not repo.delete(store, "accounts", aid, flt):
        raise HTTPException(status_code=404, detail="Account not found")
    audit(user, "account.delete", "accounts", aid)
    return {"ok": True}


# ---------------- Goals ----------------

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


@router.get("/goals")
async def list_goals(user: dict = Depends(get_current_user), household_id: str = None):
    store, flt = scope_context(user)
    hid = _eff_hh(user, household_id)
    rows = repo.list(store, "goals", flt)
    if hid:
        rows = [r for r in rows if r.get("scope", {}).get("client_id") == hid]
    return rows


@router.post("/goals")
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


@router.put("/goals/{gid}")
async def update_goal(gid: str, body: GoalInput, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    patch = body.model_dump()
    patch["status"] = _goal_status(body.current_amount, body.target_amount)
    updated = repo.update(store, "goals", gid, patch, flt)
    if not updated:
        raise HTTPException(status_code=404, detail="Goal not found")
    audit(user, "goal.update", "goals", gid)
    return updated


@router.patch("/goals/{gid}/progress")
async def update_progress(gid: str, body: GoalProgressInput, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    existing = repo.get(store, "goals", gid, flt)
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    status = _goal_status(body.current_amount, existing["target_amount"])
    updated = repo.update(store, "goals", gid, {"current_amount": body.current_amount, "status": status}, flt)
    audit(user, "goal.progress", "goals", f"{gid} -> {body.current_amount}")
    return updated


@router.delete("/goals/{gid}")
async def delete_goal(gid: str, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    if not repo.delete(store, "goals", gid, flt):
        raise HTTPException(status_code=404, detail="Goal not found")
    audit(user, "goal.delete", "goals", gid)
    return {"ok": True}


# ---------------- Planning workspace ----------------

@router.get("/plan/overview")
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
        "protectionAnalyses": len(hh(repo.list(store, "plan_protection", read))),
        "debtCount": len(debts),
        "monthlyExpenses": sum(float(r.get("amount", 0)) for r in hh(repo.list(store, "plan_expenses", read))),
        "documents": len(hh(repo.list(store, "plan_documents", read))),
    }


@router.get("/plan/profile")
async def plan_profile(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    owners = repo.list(store, "owners", read)
    return next((o for o in owners if o.get("relationship") == "self"), owners[0] if owners else {})


@router.put("/plan/profile")
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


@router.get("/plan/{collection}")
async def plan_list(collection: str, user: dict = Depends(get_current_user), household_id: str = None):
    if collection not in PLAN_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown collection")
    store, read, _, hid = planner_scope(user, household_id)
    rows = repo.list(store, f"plan_{collection}", read)
    if hid:
        rows = [r for r in rows if r.get("household_id") == hid]
    return rows


@router.post("/plan/{collection}")
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


@router.put("/plan/{collection}/{rid}")
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


@router.delete("/plan/{collection}/{rid}")
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


# ---------------- Report email + history ----------------

class ReportEmailInput(BaseModel):
    recipient: EmailStr
    net_worth: float = 0
    protection_score: int = 0
    retirement_success: Optional[int] = None
    life_gap: Optional[float] = None
    di_monthly_gap: Optional[float] = None
    ltc_gap: Optional[float] = None


@router.post("/report/email")
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
    protection = None
    if body.life_gap is not None or body.di_monthly_gap is not None or body.ltc_gap is not None:
        protection = {"life_gap": body.life_gap, "di_monthly_gap": body.di_monthly_gap, "ltc_gap": body.ltc_gap}
    html = render_report_html(household_name, body.net_worth, body.protection_score, body.retirement_success, goals, branding.get("firm_name"), logo_url=branding.get("logo_url"), protection=protection)
    email_id = await send_email(to=str(body.recipient), subject=f"{household_name} — financial summary", html=html)
    repo.create(store, "report_log", {
        "id": _id(), "store": store, "scope": ws, "household_id": hid,
        "recipient": str(body.recipient), "net_worth": body.net_worth,
        "protection_score": body.protection_score, "retirement_success": body.retirement_success,
        "sent_at": datetime.now(timezone.utc).isoformat(), "actor_email": user["email"],
    })
    audit(user, "report.email", "report", f"to {body.recipient}")
    return {"status": "sent", "email_id": email_id}


@router.get("/report/history")
async def report_history(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rows = repo.list(store, "report_log", read)
    if hid:
        rows = [r for r in rows if r.get("household_id") == hid]
    rows.sort(key=lambda r: r.get("sent_at", ""), reverse=True)
    return rows


@router.get("/report/pdf")
async def report_pdf(user: dict = Depends(get_current_user), household_id: str = None):
    if user["tier"] == "enterprise":
        raise HTTPException(status_code=403, detail="Not available for this tier")
    store, read, _, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before exporting its plan")

    def hh(rows):
        return [r for r in rows if (not hid or r.get("household_id") == hid)]
    owners = repo.list(store, "owners", read)
    primary = next((o for o in owners if o.get("relationship") == "self"), owners[0] if owners else None)
    household_name = f"The {primary['full_name'].split()[-1]} Household" if primary else "Household"
    nw_rows = hh(repo.list(store, "plan_networth", read))
    debts = hh(repo.list(store, "plan_debts", read))
    accounts = repo.list(store, "accounts", read)
    goals = repo.list(store, "goals", read)
    assets = sum(float(r.get("value", 0)) for r in nw_rows if r.get("kind") == "asset") + sum(float(a.get("balance", 0)) for a in accounts)
    liabilities = sum(float(r.get("value", 0)) for r in nw_rows if r.get("kind") == "liability") + sum(float(d.get("balance", 0)) for d in debts)
    protection = hh(repo.list(store, "plan_protection", read))
    ps = None
    if protection:
        present = {p.get("kind") for p in protection}
        ps = 100
        for k in ("life", "di", "ltc"):
            gapv = next((p.get("life_gap") if k == "life" else p.get("di_monthly_gap") if k == "di" else p.get("ltc_gap") for p in protection if p.get("kind") == k), None)
            ps -= 15 if k not in present else (20 if (gapv or 0) > 0 else 0)
        ps = max(0, min(100, ps))
    retirement_rows = hh(repo.list(store, "plan_retirement", read))
    retirement = retirement_rows[-1] if retirement_rows else None
    reg_balance = sum(float(a.get("balance", 0)) for a in accounts if a.get("account_type") in ("RRSP", "RRIF"))
    estate = calculate_estate({"province": (primary or {}).get("province", "ON"), "grossEstateValue": assets - liabilities, "rrspRrifBalance": reg_balance})

    data = {
        "household_name": household_name, "firm_name": (user.get("branding") or {}).get("firm_name"),
        "net_worth": assets - liabilities, "total_assets": assets, "total_liabilities": liabilities,
        "protection_score": ps, "protection": protection, "retirement": retirement,
        "retirement_success": None, "estate": estate, "goals": goals,
    }
    pdf = build_plan_pdf(data)
    audit(user, "report.pdf", "report", household_name)
    fname = "".join(c for c in household_name if c.isalnum() or c in " -_").strip().replace(" ", "_") + "_Plan.pdf"
    return StreamingResponse(iter([pdf]), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})
