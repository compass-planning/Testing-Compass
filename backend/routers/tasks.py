"""Task routes: advisor task CRUD + the scheduled morning task-reminder digest cron."""
import os
import logging
import secrets as _secrets
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel, Field

from repository import repo
from models import _id
from deps import get_current_user, scope_context, write_scope, audit
from email_service import send_email, render_task_digest_html

logger = logging.getLogger("compass")
router = APIRouter()


class TaskInput(BaseModel):
    client_id: str
    title: str = Field(min_length=1)
    due_date: str | None = None


@router.post("/advisor/tasks")
async def create_task(body: TaskInput, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, _ = scope_context(user)
    rec = {"id": _id(), "store": store, "scope": write_scope(user, client_id=body.client_id),
           "title": body.title, "done": False, "due_date": body.due_date, "actor_email": user["email"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    repo.create(store, "tasks", rec)
    audit(user, "task.create", "tasks", body.title)
    return rec


@router.get("/advisor/tasks")
async def list_tasks(user: dict = Depends(get_current_user), client_id: str = None):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    store, flt = scope_context(user)
    rows = repo.list(store, "tasks", flt)
    if client_id:
        rows = [r for r in rows if r.get("scope", {}).get("client_id") == client_id]
    return rows


class TaskPatch(BaseModel):
    done: bool | None = None
    due_date: str | None = None


@router.patch("/advisor/tasks/{tid}")
async def update_task(tid: str, body: TaskPatch, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        patch = {"done": True}
    updated = repo.update(store, "tasks", tid, patch, flt)
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found")
    return updated


@router.delete("/advisor/tasks/{tid}")
async def delete_task(tid: str, user: dict = Depends(get_current_user)):
    store, flt = scope_context(user)
    ok = repo.delete(store, "tasks", tid, flt)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}


# ---------------- Scheduled task-reminder digest ----------------

DEFAULT_DIGEST_HOUR = 8


class DigestSettings(BaseModel):
    enabled: bool = True
    weekly_enabled: bool = True
    hour: int = Field(default=DEFAULT_DIGEST_HOUR, ge=0, le=23)


@router.get("/advisor/digest-settings")
async def get_digest_settings(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    s = user.get("digest_settings") or {}
    return {"enabled": s.get("enabled", True), "weekly_enabled": s.get("weekly_enabled", True),
            "hour": s.get("hour", DEFAULT_DIGEST_HOUR)}


@router.put("/advisor/digest-settings")
async def put_digest_settings(body: DigestSettings, user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    settings = {"enabled": body.enabled, "weekly_enabled": body.weekly_enabled, "hour": body.hour}
    repo.update_user(user["id"], {"digest_settings": settings})
    return settings


async def _run_task_digest():
    now = datetime.now(ZoneInfo("America/Toronto"))
    today = now.date().isoformat()
    sent = 0
    for u in repo.all_users():
        if u.get("tier") != "advisor":
            continue
        s = u.get("digest_settings") or {}
        if not s.get("enabled", True):
            continue
        if int(s.get("hour", DEFAULT_DIGEST_HOUR)) != now.hour:
            continue
        store, flt = scope_context(u)
        due = [t for t in repo.list(store, "tasks", flt)
               if not t.get("done") and t.get("due_date") and t["due_date"] <= today]
        if not due:
            continue
        overdue = sorted([t for t in due if t["due_date"] < today], key=lambda t: t["due_date"])
        today_tasks = [t for t in due if t["due_date"] == today]
        firm = (u.get("branding") or {}).get("firm_name")
        html = render_task_digest_html(u.get("name"), firm, today_tasks, overdue)
        try:
            await send_email(to=u["email"], subject=f"{len(due)} task(s) need your attention today", html=html)
            sent += 1
        except Exception as e:
            logger.warning(f"Task digest email failed for {u['email']}: {e}")
    logger.info(f"Task digest run (hour={now.hour} ET): emailed {sent} advisor(s)")


@router.post("/cron/task-digest")
async def cron_task_digest(background: BackgroundTasks, authorization: str = Header(default="")):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    if not secret or not token or not _secrets.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    background.add_task(_run_task_digest)
    return {"status": "accepted"}


@router.post("/advisor/digest-preview")
async def digest_preview(user: dict = Depends(get_current_user)):
    if user["tier"] != "advisor":
        raise HTTPException(status_code=403, detail="Advisor tier only")
    today = datetime.now(ZoneInfo("America/Toronto")).date().isoformat()
    store, flt = scope_context(user)
    due = [t for t in repo.list(store, "tasks", flt)
           if not t.get("done") and t.get("due_date") and t["due_date"] <= today]
    overdue = sorted([t for t in due if t["due_date"] < today], key=lambda t: t["due_date"])
    today_tasks = [t for t in due if t["due_date"] == today]
    if not due:
        today_tasks = [{"title": "Sample: review a household's retirement plan", "due_date": today}]
    firm = (user.get("branding") or {}).get("firm_name")
    html = render_task_digest_html(user.get("name"), firm, today_tasks, overdue)
    try:
        await send_email(to=user["email"], subject="[Preview] Your morning task digest", html=html)
        return {"sent": True, "to": user["email"]}
    except Exception as e:
        logger.warning(f"Task digest preview failed for {user['email']}: {e}")
        return {"sent": False, "to": user["email"], "detail": "Email delivery is unavailable in this environment"}
