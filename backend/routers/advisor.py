"""Advisor routes: client roster + scoring, opportunities views, branding/logo, invites, goal nudges."""
import os
import logging
import secrets
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response, BackgroundTasks, Header
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr

import storage
from security import hash_password, create_scoped_token
from repository import repo
from models import _id
from deps import get_current_user, scope_context, write_scope, audit, log_digest
from email_service import send_email, render_invite_html, render_book_digest_html

logger = logging.getLogger("compass")
router = APIRouter()


# ---------------- Household scoring ----------------

def _goal_behind(g):
    cur = float(g.get("current_amount", 0) or 0); tgt = float(g.get("target_amount", 0) or 0)
    if tgt <= 0 or cur >= tgt:
        return False
    monthly = float(g.get("monthly_contribution", 0) or 0); r = float(g.get("growth_rate", 0) or 0) / 100 / 12
    ty = int(g.get("target_year", 0) or 0)
    if ty and ty < datetime.now(timezone.utc).year:
        return True
    if monthly <= 0 and r <= 0:
        return False
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


def _build_roster(user: dict) -> list[dict]:
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
            clients[cid]["invite_expires_at"] = u.get("invite_expires_at")
        else:
            clients[cid]["has_login"] = True
    return list(clients.values())


@router.get("/advisor/clients")
async def advisor_clients(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    return _build_roster(user)


class OppsView(BaseModel):
    name: str
    type: str = "all"
    status: str = "all"
    sort: str = "score-asc"


class ViewsInput(BaseModel):
    views: list[OppsView]


@router.get("/advisor/opps-views")
async def get_opps_views(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    return user.get("opps_views") or []


@router.put("/advisor/opps-views")
async def put_opps_views(body: ViewsInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    views = [v.model_dump() for v in body.views]
    repo.update_user(user["id"], {"opps_views": views})
    return views


@router.get("/advisor/clients/{client_id}")
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


# ---------------- Branding + logo ----------------

class BrandingInput(BaseModel):
    firm_name: str = "Compass Planning"
    cover_note: str = ""
    logo: str = ""
    logo_url: str = ""


@router.get("/advisor/branding")
async def get_branding(user: dict = Depends(get_current_user)):
    return user.get("branding") or {"firm_name": "Compass Planning", "cover_note": "", "logo": ""}


@router.put("/advisor/branding")
async def put_branding(body: BrandingInput, user: dict = Depends(get_current_user)):
    if user["tier"] == "enterprise":
        raise HTTPException(status_code=403, detail="Not available for this tier")
    merged = {**(user.get("branding") or {}), **body.model_dump()}
    repo.update_user(user["id"], {"branding": merged})
    return merged


_LOGO_MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}


@router.post("/advisor/branding/logo")
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


@router.get("/public/logo/{uid}")
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


@router.delete("/advisor/branding/logo")
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


# ---------------- Client invites ----------------

class InviteClientInput(BaseModel):
    email: EmailStr
    full_name: str
    client_id: str
    base_url: str = ""


class ResendInviteInput(BaseModel):
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


@router.post("/advisor/clients/invite")
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
        "invite_expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
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


@router.post("/advisor/clients/invite/resend")
async def resend_invite(body: ResendInviteInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Only advisors can resend invites")
    pending = next((u for u in repo.all_users()
                    if u.get("invited_by") and u.get("scope", {}).get("client_id") == body.client_id
                    and u.get("must_change_password")), None)
    if not pending:
        raise HTTPException(status_code=404, detail="No pending invite for this household")
    repo.update_user(pending["id"], {"password_hash": hash_password("Cmps-" + secrets.token_urlsafe(10)),
                                     "must_change_password": True,
                                     "invite_expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()})
    token = create_scoped_token({"sub": pending["id"]}, 60 * 24 * 7, "activate")
    link = _activation_link(body.base_url, token)
    firm = (user.get("branding") or {}).get("firm_name")
    emailed = await _send_invite(pending["email"], pending["name"], firm, link)
    audit(user, "client.invite_resend", "account", f"Re-invited {pending['email']}")
    return {"email": pending["email"], "activation_link": link, "emailed": emailed}


# ---------------- Goal nudges ----------------

def _required_monthly(current, target, annual_growth, target_year):
    months = max(1, (int(target_year) - datetime.now(timezone.utc).year) * 12)
    r = (annual_growth or 0) / 100 / 12
    remaining = target - current * ((1 + r) ** months)
    if remaining <= 0:
        return 0.0
    if r > 0:
        return remaining * r / (((1 + r) ** months) - 1)
    return remaining / months


def _plan_nudge(g):
    cur, tgt = float(g.get("current_amount", 0)), float(g.get("target_amount", 0))
    if tgt <= 0 or cur >= tgt:
        return None
    yr = int(g.get("target_year") or datetime.now(timezone.utc).year)
    growth = float(g.get("growth_rate", 0))
    old_monthly = round(float(g.get("monthly_contribution", 0)))
    req = _required_monthly(cur, tgt, growth, yr)
    if req > 50000:
        new_yr = yr + 10
        return {"id": g["id"], "title": g.get("title", "Goal"), "action": "extend",
                "old_monthly": old_monthly, "new_monthly": round(_required_monthly(cur, tgt, growth, new_yr)),
                "old_year": yr, "new_year": new_yr}
    return {"id": g["id"], "title": g.get("title", "Goal"), "action": "catch-up",
            "old_monthly": old_monthly, "new_monthly": round(req), "old_year": yr, "new_year": yr}


def _household_goal_nudges(user, client_id):
    store, flt = scope_context(user)
    goals = [g for g in repo.list(store, "goals", flt) if g.get("scope", {}).get("client_id") == client_id]
    return store, flt, [p for p in (_plan_nudge(g) for g in goals) if p]


@router.get("/advisor/households/{client_id}/nudge-preview")
async def nudge_preview(client_id: str, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    _, _, changes = _household_goal_nudges(user, client_id)
    return {"changes": changes}


@router.get("/advisor/nudge-all-preview")
async def nudge_all_preview(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    owners = repo.list(store, "owners", flt)
    primary = {o["scope"].get("client_id"): o["full_name"]
               for o in owners if o.get("relationship") == "self" and o["scope"].get("client_id")}
    by_client: dict[str, list] = {}
    for g in repo.list(store, "goals", flt):
        cid = g.get("scope", {}).get("client_id")
        if cid:
            by_client.setdefault(cid, []).append(g)
    households, total = [], 0
    for cid, gs in by_client.items():
        changes = [p for p in (_plan_nudge(g) for g in gs) if p]
        if changes:
            total += len(changes)
            households.append({"client_id": cid, "primary": primary.get(cid, cid), "changes": changes})
    households.sort(key=lambda h: h["primary"])
    return {"households": households, "total_goals": total}


@router.post("/advisor/nudge-all")
async def nudge_all(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    by_client: dict[str, list] = {}
    for g in repo.list(store, "goals", flt):
        cid = g.get("scope", {}).get("client_id")
        if cid:
            by_client.setdefault(cid, []).append(g)
    goals_nudged, households_nudged, applied = 0, 0, []
    for cid, gs in by_client.items():
        changes = [p for p in (_plan_nudge(g) for g in gs) if p]
        if not changes:
            continue
        households_nudged += 1
        for ch in changes:
            repo.update(store, "goals", ch["id"], {"target_year": ch["new_year"], "monthly_contribution": ch["new_monthly"]}, flt)
            applied.append({"id": ch["id"], "old_year": ch["old_year"], "old_monthly": ch["old_monthly"]})
            goals_nudged += 1
    if goals_nudged:
        audit(user, "goal.nudge_all", "goals", f"Batch-nudged {goals_nudged} goal(s) across {households_nudged} household(s)")
    return {"households": households_nudged, "goals": goals_nudged, "applied": applied}


class NudgeRestore(BaseModel):
    id: str
    target_year: int
    monthly_contribution: float


class NudgeRestoreInput(BaseModel):
    restores: list[NudgeRestore]


@router.post("/advisor/nudge-restore")
async def nudge_restore(body: NudgeRestoreInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    restored = 0
    for r in body.restores:
        if repo.update(store, "goals", r.id, {"target_year": r.target_year, "monthly_contribution": r.monthly_contribution}, flt):
            restored += 1
    if restored:
        audit(user, "goal.nudge_undo", "goals", f"Reverted {restored} nudged goal(s)")
    return {"restored": restored}


@router.post("/advisor/households/{client_id}/nudge-goals")
async def nudge_goals(client_id: str, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt, changes = _household_goal_nudges(user, client_id)
    applied = []
    for ch in changes:
        repo.update(store, "goals", ch["id"], {"target_year": ch["new_year"], "monthly_contribution": ch["new_monthly"]}, flt)
        applied.append({"id": ch["id"], "old_year": ch["old_year"], "old_monthly": ch["old_monthly"]})
    if changes:
        audit(user, "goal.nudge", "goals", f"Nudged {len(changes)} goal(s) for {client_id}")
    return {"nudged": len(changes), "applied": applied}


# ---------------- Weekly book-health digest ----------------

from pathlib import Path


def _app_base_url() -> str:
    url = os.environ.get("APP_BASE_URL") or os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            for line in (Path(__file__).resolve().parents[2] / "frontend" / ".env").read_text().splitlines():
                if line.startswith("REACT_APP_BACKEND_URL"):
                    url = line.split("=", 1)[1].strip().strip('"')
                    break
        except Exception:
            url = ""
    return (url or "").rstrip("/")


_REVIEW_DURATIONS = {"week": 7, "month": 30, "quarter": 90}


def log_review_event(user: dict, client_id: str, kind: str):
    """Append-only log of follow-through actions (reviewed|snoozed|unsnoozed) for analytics."""
    store, _ = scope_context(user)
    sc = user.get("scope", {})
    repo.create(store, "review_events", {
        "id": _id(), "store": store,
        "scope": {"org_id": sc.get("org_id"), "advisor_id": sc.get("advisor_id"), "client_id": client_id},
        "kind": kind, "client_id": client_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def _reviewed_set(user: dict) -> set:
    store, flt = scope_context(user)
    now = datetime.now(timezone.utc).isoformat()
    return {r["client_id"] for r in repo.list(store, "reviews", flt)
            if r.get("client_id") and r.get("expires_at", "") > now}


class ReviewInput(BaseModel):
    duration: str | None = None
    note: str | None = None


@router.post("/advisor/households/{client_id}/review")
async def mark_reviewed(client_id: str, body: ReviewInput | None = None, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    body = body or ReviewInput()
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    existing = next((r for r in repo.list(store, "reviews", flt) if r.get("client_id") == client_id), None)
    logged = False
    if existing:
        patch = {"reviewed_at": now}
        if body.note is not None:
            patch["note"] = body.note
        if body.duration:
            patch["duration"] = body.duration
            patch["expires_at"] = (now_dt + timedelta(days=_REVIEW_DURATIONS.get(body.duration, 7))).isoformat()
            logged = True
        repo.update(store, "reviews", existing["id"], patch, flt)
        res_expires = patch.get("expires_at", existing.get("expires_at"))
        res_dur = patch.get("duration", existing.get("duration"))
    else:
        duration = body.duration or "week"
        res_expires = (now_dt + timedelta(days=_REVIEW_DURATIONS.get(duration, 7))).isoformat()
        res_dur = duration
        logged = True
        sc = user.get("scope", {})
        repo.create(store, "reviews", {"id": _id(), "store": store, "client_id": client_id,
                                       "scope": {"org_id": sc.get("org_id"), "advisor_id": sc.get("advisor_id"), "client_id": client_id},
                                       "reviewed_at": now, "expires_at": res_expires, "duration": duration, "note": body.note or ""})
    if logged:
        log_review_event(user, client_id, "reviewed")
    audit(user, "household.review", "reviews", f"{client_id} ({res_dur})")
    return {"client_id": client_id, "expires_at": res_expires, "duration": res_dur, "note": body.note}


class BulkSnoozeInput(BaseModel):
    duration: str = "week"
    statuses: list[str] = ["Needs Review", "Needs Setup"]


@router.post("/advisor/snooze-bulk")
async def snooze_bulk(body: BulkSnoozeInput | None = None, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    body = body or BulkSnoozeInput()
    store, flt = scope_context(user)
    reviewed = _reviewed_set(user)
    targets = [c for c in _build_roster(user) if c.get("status") in body.statuses and c["client_id"] not in reviewed]
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    expires = (now_dt + timedelta(days=_REVIEW_DURATIONS.get(body.duration, 7))).isoformat()
    sc = user.get("scope", {})
    existing_map = {r.get("client_id"): r for r in repo.list(store, "reviews", flt)}
    applied = []
    for c in targets:
        cid = c["client_id"]
        if cid in existing_map:
            repo.update(store, "reviews", existing_map[cid]["id"], {"reviewed_at": now, "expires_at": expires, "duration": body.duration}, flt)
        else:
            repo.create(store, "reviews", {"id": _id(), "store": store, "client_id": cid,
                                           "scope": {"org_id": sc.get("org_id"), "advisor_id": sc.get("advisor_id"), "client_id": cid},
                                           "reviewed_at": now, "expires_at": expires, "duration": body.duration, "note": ""})
        applied.append(cid)
        log_review_event(user, cid, "snoozed")
    if applied:
        audit(user, "household.snooze_bulk", "reviews", f"Snoozed {len(applied)} household(s) ({', '.join(body.statuses)})")
    return {"count": len(applied), "applied": applied}


@router.delete("/advisor/households/{client_id}/review")
async def unmark_reviewed(client_id: str, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    removed = 0
    for r in repo.list(store, "reviews", flt):
        if r.get("client_id") == client_id:
            removed += repo.delete(store, "reviews", r["id"], flt)
    if removed:
        log_review_event(user, client_id, "unsnoozed")
        audit(user, "household.unreview", "reviews", client_id)
    return {"ok": True, "client_id": client_id}


@router.post("/advisor/households/{client_id}/ack-return")
async def ack_return(client_id: str, user: dict = Depends(get_current_user)):
    """Dismiss the 'snooze ended' cue by clearing the expired review record (no event logged)."""
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    now_iso = datetime.now(timezone.utc).isoformat()
    removed = 0
    for r in repo.list(store, "reviews", flt):
        if r.get("client_id") == client_id and r.get("expires_at", "") <= now_iso:
            removed += repo.delete(store, "reviews", r["id"], flt)
    return {"ok": True, "client_id": client_id, "removed": removed}


@router.get("/advisor/review-analytics")
async def review_analytics(days: int = 7, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    days = 30 if days == 30 else 7
    store, flt = scope_context(user)
    tz = ZoneInfo("America/Toronto")
    today = datetime.now(tz).date()
    start = today - timedelta(days=days - 1)
    buckets = {(start + timedelta(days=i)).isoformat(): {"date": (start + timedelta(days=i)).isoformat(),
               "reviewed": 0, "snoozed": 0, "unsnoozed": 0} for i in range(days)}
    totals = {"reviewed": 0, "snoozed": 0, "unsnoozed": 0}
    for e in repo.list(store, "review_events", flt):
        kind = e.get("kind")
        ts = e.get("timestamp")
        if kind not in totals or not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts)
        except ValueError:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        d = dt.astimezone(tz).date()
        if d < start or d > today:
            continue
        buckets[d.isoformat()][kind] += 1
        totals[kind] += 1
    series = [buckets[k] for k in sorted(buckets)]
    acted = totals["reviewed"] + totals["snoozed"]
    follow_through = round(totals["reviewed"] / acted * 100) if acted else None
    return {"days": days, "totals": totals, "series": series, "follow_through": follow_through}


def _book_stats(user: dict) -> dict:
    roster = _build_roster(user)
    reviewed = _reviewed_set(user)
    scored = [c for c in roster if c.get("score") is not None]
    counts = {"On Track": 0, "Needs Review": 0, "At Risk": 0, "Needs Setup": 0}
    for c in roster:
        counts[c.get("status", "Needs Review")] = counts.get(c.get("status", "Needs Review"), 0) + 1
    attention = [c for c in roster if (c.get("needs_setup") or c.get("status") in ("At Risk", "Needs Review")) and c["client_id"] not in reviewed]
    attention.sort(key=lambda c: (not c.get("needs_setup"), c.get("score") if c.get("score") is not None else 999))
    return {
        "households": len(roster),
        "avg_score": round(sum(c["score"] for c in scored) / len(scored)) if scored else None,
        "counts": counts,
        "attention": [{"client_id": c["client_id"], "primary": c.get("primary") or c["client_id"],
                       "status": c["status"], "score": c.get("score"), "next_action": c.get("next_action")}
                      for c in attention[:8]],
    }


async def _run_book_digest():
    now = datetime.now(ZoneInfo("America/Toronto"))
    base = _app_base_url()
    sent = 0
    for u in repo.all_users():
        if u.get("tier") != "advisor":
            continue
        s = u.get("digest_settings") or {}
        weekly_hour = int(s.get("weekly_hour", s.get("hour", 8)))
        if not s.get("weekly_enabled", True) or weekly_hour != now.hour:
            continue
        stats = _book_stats(u)
        if not stats["households"]:
            continue
        firm = (u.get("branding") or {}).get("firm_name")
        html = render_book_digest_html(u.get("name"), firm, stats, base_url=base)
        try:
            await send_email(to=u["email"], subject="Your weekly book-health summary", html=html)
            sent += 1
            log_digest(u, "weekly", "scheduled", True)
        except Exception as e:
            logger.warning(f"Book digest email failed for {u['email']}: {e}")
    logger.info(f"Book digest run (hour={now.hour} ET): emailed {sent} advisor(s)")


@router.post("/cron/book-digest")
async def cron_book_digest(background: BackgroundTasks, authorization: str = Header(default="")):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    if not secret or not token or not secrets.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    background.add_task(_run_book_digest)
    return {"status": "accepted"}


@router.post("/advisor/book-digest/preview")
async def book_digest_preview(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    stats = _book_stats(user)
    firm = (user.get("branding") or {}).get("firm_name")
    html = render_book_digest_html(user.get("name"), firm, stats, base_url=_app_base_url())
    try:
        await send_email(to=user["email"], subject="[Preview] Your weekly book-health summary", html=html)
        log_digest(user, "weekly", "preview", True)
        return {"sent": True, "to": user["email"]}
    except Exception as e:
        logger.warning(f"Book digest preview failed for {user['email']}: {e}")
        log_digest(user, "weekly", "preview", False)
        return {"sent": False, "to": user["email"], "detail": "Email delivery is unavailable in this environment"}


@router.get("/advisor/today")
async def advisor_today(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    today = datetime.now(ZoneInfo("America/Toronto")).date().isoformat()
    store, flt = scope_context(user)
    roster = _build_roster(user)
    primary = {c["client_id"]: (c.get("primary") or c["client_id"]) for c in roster}

    def task_row(t):
        return {"id": t["id"], "title": t.get("title"), "due_date": t.get("due_date"),
                "client_id": t.get("scope", {}).get("client_id"),
                "primary": primary.get(t.get("scope", {}).get("client_id"), t.get("scope", {}).get("client_id"))}

    due = [t for t in repo.list(store, "tasks", flt) if not t.get("done") and t.get("due_date")]
    overdue = sorted([task_row(t) for t in due if t["due_date"] < today], key=lambda r: r["due_date"])
    due_today = [task_row(t) for t in due if t["due_date"] == today]
    reviewed = _reviewed_set(user)
    attention = [c for c in roster if (c.get("needs_setup") or c.get("status") in ("At Risk", "Needs Review")) and c["client_id"] not in reviewed]
    attention.sort(key=lambda c: (not c.get("needs_setup"), c.get("score") if c.get("score") is not None else 999))
    now_iso = datetime.now(timezone.utc).isoformat()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    all_reviews = repo.list(store, "reviews", flt)
    snoozed = [{"client_id": r["client_id"], "primary": primary.get(r["client_id"], r["client_id"]),
                "expires_at": r.get("expires_at"), "note": r.get("note", "")}
               for r in all_reviews if r.get("client_id") and r.get("expires_at", "") > now_iso]
    snoozed.sort(key=lambda x: x["primary"])
    expired_returns = {r["client_id"]: r.get("expires_at") for r in all_reviews
                       if r.get("client_id") and r.get("expires_at") and r.get("expires_at", "") <= now_iso}
    reviewed_this_week = sum(1 for e in repo.list(store, "review_events", flt)
                             if e.get("kind") == "reviewed" and e.get("timestamp", "") >= week_ago)
    return {
        "overdue": overdue,
        "due_today": due_today,
        "snoozed": snoozed,
        "reviewed_this_week": reviewed_this_week,
        "attention": [{"client_id": c["client_id"], "primary": c.get("primary") or c["client_id"],
                       "status": c["status"], "score": c.get("score"), "next_action": c.get("next_action"),
                       "returned_from_snooze": c["client_id"] in expired_returns,
                       "snoozed_until": expired_returns.get(c["client_id"])}
                      for c in attention[:6]],
    }
