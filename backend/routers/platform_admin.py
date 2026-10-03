"""Platform admin console — super-admin only (tier == 'admin').

Global (platform-wide) collections live in the shared store with an empty scope
so the admin sees everything. Billing uses the Chase MOCK gateway for now.
"""
from datetime import datetime, timezone, timedelta
import os
import io
import csv
import html as _html
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel

from repository import repo
from models import _id
from deps import get_current_user, get_admin_user, _public, audit
import metrics
import chase_mock
import email_service

router = APIRouter()

PLATFORM = "shared"  # global collections stored here with scope {}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _plist(coll):
    return repo.list(PLATFORM, coll, {})


def _pcreate(coll, doc):
    return repo.create(PLATFORM, coll, {"id": _id(), "store": PLATFORM, "scope": {}, "created_at": _now(), **doc})


def _pupdate(coll, rid, patch):
    return repo.update(PLATFORM, coll, rid, patch, {})


def _pdelete(coll, rid):
    return repo.delete(PLATFORM, coll, rid, {})


# ---------------- Notices (any authenticated user) ----------------
@router.get("/notices")
async def notices(user: dict = Depends(get_current_user)):
    tier = user.get("tier")
    anns = [a for a in _plist("announcements")
            if a.get("active") and a.get("audience") in ("all", tier)]
    outages = [s for s in _plist("status_posts")
               if s.get("severity") not in (None, "operational") and not s.get("resolved_at")]
    anns.sort(key=lambda a: a.get("created_at", ""), reverse=True)
    sub = _my_sub(user)
    billing_due = None
    if sub:
        inv = next((i for i in _plist("invoices") if i.get("subscription_id") == sub["id"] and i.get("status") == "open"), None)
        if inv:
            billing_due = {"invoice_id": inv["id"], "amount": inv.get("amount"), "currency": inv.get("currency", "CAD"), "past_due": sub.get("status") == "past_due"}
    return {"announcements": anns, "outages": outages, "billing_due": billing_due}


# ---------------- Overview ----------------
@router.get("/admin/overview")
async def overview(admin: dict = Depends(get_admin_user)):
    users = repo.all_users()
    by_tier = {}
    for u in users:
        by_tier[u.get("tier", "unknown")] = by_tier.get(u.get("tier", "unknown"), 0) + 1
    subs = _plist("subscriptions")
    active = [s for s in subs if s.get("status") == "active"]
    mrr = sum(s.get("amount", 0) for s in active if s.get("billing_period") == "monthly")
    tickets = _plist("tickets")
    open_tickets = [t for t in tickets if t.get("status") in ("open", "in_progress")]
    status_posts = sorted(_plist("status_posts"), key=lambda s: s.get("created_at", ""), reverse=True)
    current = status_posts[0] if status_posts else None
    suspended = len([u for u in users if u.get("status") == "suspended"])
    return {
        "users_total": len(users),
        "users_by_tier": by_tier,
        "suspended": suspended,
        "subscriptions_active": len(active),
        "mrr": mrr,
        "currency": "CAD",
        "tickets_open": len(open_tickets),
        "current_status": current,
        "uptime_seconds": metrics.uptime_seconds(),
        "errors": metrics.error_count(),
    }


# ---------------- Accounts ----------------
PLAN_COUNT_COLLS = ["plan_networth", "plan_debts", "plan_insurance", "plan_retirement", "goals", "owners"]


def _acct_view(u: dict) -> dict:
    p = _public(u)
    p["status"] = u.get("status", "active")
    return p


@router.get("/admin/accounts")
async def list_accounts(search: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    users = [_acct_view(u) for u in repo.all_users()]
    if search:
        s = search.lower()
        users = [u for u in users if s in (u.get("email", "").lower()) or s in (u.get("name", "").lower())]
    users.sort(key=lambda u: u.get("created_at", ""), reverse=True)
    return {"accounts": users}


@router.get("/admin/accounts/{uid}")
async def account_detail(uid: str, admin: dict = Depends(get_admin_user)):
    u = repo.find_user_by_id(uid)
    if not u:
        raise HTTPException(status_code=404, detail="Account not found")
    scope = u.get("scope", {})
    store = "enterprise" if u.get("tier") == "enterprise" else "shared"
    counts = {}
    for coll in PLAN_COUNT_COLLS:
        try:
            counts[coll] = len(repo.list(store, coll, scope))
        except Exception:
            counts[coll] = 0
    return {"account": _acct_view(u), "plan_counts": counts}


@router.post("/admin/accounts/{uid}/suspend")
async def suspend_account(uid: str, admin: dict = Depends(get_admin_user)):
    u = repo.find_user_by_id(uid)
    if not u:
        raise HTTPException(status_code=404, detail="Account not found")
    if u.get("tier") == "admin":
        raise HTTPException(status_code=400, detail="Cannot suspend a platform admin account")
    repo.update_user(uid, {"status": "suspended"})
    audit(admin, "admin.suspend", "account", f"Suspended {u['email']}")
    return {"ok": True, "status": "suspended"}


@router.post("/admin/accounts/{uid}/reactivate")
async def reactivate_account(uid: str, admin: dict = Depends(get_admin_user)):
    u = repo.find_user_by_id(uid)
    if not u:
        raise HTTPException(status_code=404, detail="Account not found")
    repo.update_user(uid, {"status": "active"})
    audit(admin, "admin.reactivate", "account", f"Reactivated {u['email']}")
    return {"ok": True, "status": "active"}


# ---------------- Announcements ----------------
class AnnouncementIn(BaseModel):
    title: str
    body: str = ""
    audience: str = "all"  # all | enterprise | advisor | solo
    active: bool = True


@router.get("/admin/announcements")
async def list_announcements(admin: dict = Depends(get_admin_user)):
    items = sorted(_plist("announcements"), key=lambda a: a.get("created_at", ""), reverse=True)
    return {"announcements": items}


@router.post("/admin/announcements")
async def create_announcement(body: AnnouncementIn, admin: dict = Depends(get_admin_user)):
    doc = _pcreate("announcements", {**body.model_dump(), "created_by": admin["email"]})
    audit(admin, "admin.announcement.create", "announcement", body.title)
    return doc


@router.put("/admin/announcements/{rid}")
async def update_announcement(rid: str, body: AnnouncementIn, admin: dict = Depends(get_admin_user)):
    r = _pupdate("announcements", rid, body.model_dump())
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r


@router.delete("/admin/announcements/{rid}")
async def delete_announcement(rid: str, admin: dict = Depends(get_admin_user)):
    if not _pdelete("announcements", rid):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------- Tickets (incidents + service requests) ----------------
class TicketIn(BaseModel):
    type: str = "service_request"  # service_request | incident
    subject: str
    description: str = ""
    priority: str = "normal"  # low | normal | high | urgent
    requester_email: str = ""


class TicketPatch(BaseModel):
    status: Optional[str] = None  # open | in_progress | resolved
    priority: Optional[str] = None
    note: Optional[str] = None


@router.get("/admin/tickets")
async def list_tickets(admin: dict = Depends(get_admin_user)):
    items = sorted(_plist("tickets"), key=lambda t: t.get("created_at", ""), reverse=True)
    return {"tickets": items}


@router.post("/admin/tickets")
async def create_ticket(body: TicketIn, admin: dict = Depends(get_admin_user)):
    doc = _pcreate("tickets", {**body.model_dump(), "status": "open", "notes": []})
    audit(admin, "admin.ticket.create", "ticket", body.subject)
    return doc


@router.patch("/admin/tickets/{rid}")
async def patch_ticket(rid: str, body: TicketPatch, background: BackgroundTasks, admin: dict = Depends(get_admin_user)):
    cur = repo.get(PLATFORM, "tickets", rid, {})
    if not cur:
        raise HTTPException(status_code=404, detail="Not found")
    patch = {"updated_at": _now()}
    if body.status:
        patch["status"] = body.status
    if body.priority:
        patch["priority"] = body.priority
    if body.note:
        notes = list(cur.get("notes", []))
        notes.append({"by": admin["email"], "at": _now(), "text": body.note})
        patch["notes"] = notes
    r = _pupdate("tickets", rid, patch)
    if body.status == "resolved" and cur.get("status") != "resolved" and cur.get("requester_email"):
        background.add_task(_safe_send, cur["requester_email"], "Your Compass support request is resolved",
                            f"<p>Hi,</p><p>Your request <strong>{_esc(cur.get('subject', ''))}</strong> has been marked resolved. If you still need help, reply in Compass under Support and we'll reopen it.</p>")
    return r


# ---------------- Status posts (downtime / incidents) ----------------
class StatusIn(BaseModel):
    title: str
    body: str = ""
    severity: str = "operational"  # operational | degraded | outage | maintenance


@router.get("/admin/status")
async def list_status(admin: dict = Depends(get_admin_user)):
    items = sorted(_plist("status_posts"), key=lambda s: s.get("created_at", ""), reverse=True)
    return {"status_posts": items}


@router.post("/admin/status")
async def create_status(body: StatusIn, admin: dict = Depends(get_admin_user)):
    doc = _pcreate("status_posts", {**body.model_dump(), "resolved_at": None})
    audit(admin, "admin.status.create", "status", f"{body.severity}: {body.title}")
    return doc


@router.patch("/admin/status/{rid}/resolve")
async def resolve_status(rid: str, admin: dict = Depends(get_admin_user)):
    r = _pupdate("status_posts", rid, {"resolved_at": _now(), "severity": "operational"})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r


# ---------------- Billing (Chase MOCK) ----------------
class SubscriptionIn(BaseModel):
    account_label: str
    tier: str = "advisor"
    plan: str = "Advisor Pro"
    seats: int = 1
    amount: float = 0
    currency: str = "CAD"
    billing_period: str = "monthly"
    status: str = "active"


class SubscriptionPatch(BaseModel):
    status: Optional[str] = None
    seats: Optional[int] = None
    amount: Optional[float] = None


@router.get("/admin/billing/subscriptions")
async def list_subs(admin: dict = Depends(get_admin_user)):
    items = sorted(_plist("subscriptions"), key=lambda s: s.get("created_at", ""), reverse=True)
    return {"subscriptions": items, "gateway": {"provider": "chase", "mode": chase_mock.MODE}}


@router.post("/admin/billing/subscriptions")
async def create_sub(body: SubscriptionIn, admin: dict = Depends(get_admin_user)):
    doc = _pcreate("subscriptions", {**body.model_dump(), "provider": "chase_mock"})
    audit(admin, "admin.sub.create", "subscription", body.account_label)
    return doc


@router.patch("/admin/billing/subscriptions/{rid}")
async def patch_sub(rid: str, body: SubscriptionPatch, admin: dict = Depends(get_admin_user)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    r = _pupdate("subscriptions", rid, patch)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r


@router.get("/admin/billing/invoices")
async def list_invoices(admin: dict = Depends(get_admin_user)):
    items = sorted(_plist("invoices"), key=lambda i: i.get("issued_at", ""), reverse=True)
    return {"invoices": items}


@router.post("/admin/billing/invoices/{rid}/pay")
async def pay_invoice(rid: str, admin: dict = Depends(get_admin_user)):
    inv = repo.get(PLATFORM, "invoices", rid, {})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("status") == "paid":
        return inv
    receipt = chase_mock.charge(inv.get("amount", 0), inv.get("currency", "CAD"), f"Invoice {inv.get('number')}")
    r = _pupdate("invoices", rid, {"status": "paid", "paid_at": _now(), "receipt": receipt})
    # flip the linked subscription back to active if it was past_due
    sub_id = inv.get("subscription_id")
    if sub_id:
        sub = repo.get(PLATFORM, "subscriptions", sub_id, {})
        if sub and sub.get("status") == "past_due":
            _pupdate("subscriptions", sub_id, {"status": "active"})
    audit(admin, "admin.invoice.pay", "invoice", inv.get("number", rid))
    return r


# ---------------- Refund (admin) ----------------
@router.post("/admin/billing/invoices/{rid}/refund")
async def refund_invoice(rid: str, admin: dict = Depends(get_admin_user)):
    inv = repo.get(PLATFORM, "invoices", rid, {})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("status") != "paid":
        raise HTTPException(status_code=400, detail="Only paid invoices can be refunded")
    r = _pupdate("invoices", rid, {"status": "refunded", "refunded_at": _now()})
    audit(admin, "admin.invoice.refund", "invoice", inv.get("number", rid))
    return r


# ---------------- Admin audit trail ----------------
ADMIN_ACTIONS = [
    "admin.suspend", "admin.reactivate", "admin.invoice.pay", "admin.invoice.refund",
    "admin.announcement.create", "admin.ticket.create", "admin.ticket.reply",
    "admin.status.create", "admin.sub.create", "admin.lead.update",
]


def _filter_audit(from_, to, action):
    entries = [a for a in repo.list("shared", "audit_log", {}) if str(a.get("action", "")).startswith("admin.")]
    if from_:
        entries = [a for a in entries if a.get("timestamp", "") >= from_]
    if to:
        entries = [a for a in entries if a.get("timestamp", "") <= to + "T23:59:59"]
    if action:
        entries = [a for a in entries if a.get("action") == action]
    entries.sort(key=lambda a: a.get("timestamp", ""), reverse=True)
    return entries


@router.get("/admin/audit")
async def admin_audit(from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
                      action: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    entries = _filter_audit(from_, to, action)
    return {"entries": entries[:500], "actions": ADMIN_ACTIONS}


@router.get("/admin/audit/export")
async def export_audit(format: str = "csv", from_: Optional[str] = Query(None, alias="from"),
                       to: Optional[str] = None, action: Optional[str] = None,
                       admin: dict = Depends(get_admin_user)):
    entries = _filter_audit(from_, to, action)
    rng = f"{from_ or 'all'} to {to or 'now'}"
    if format == "pdf":
        from reportlab.lib.pagesizes import landscape, letter
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(letter), title="Compass Audit Trail")
        styles = getSampleStyleSheet()
        elems = [Paragraph("Compass Planning — Admin Audit Trail", styles["Title"]),
                 Paragraph(f"Range: {rng} &middot; {len(entries)} entries", styles["Normal"]), Spacer(1, 12)]
        data = [["Timestamp", "Admin", "Action", "Detail"]]
        for e in entries:
            data.append([e.get("timestamp", "")[:19].replace("T", " "), e.get("actor_email", ""),
                         e.get("action", ""), (e.get("detail", "") or "")[:70]])
        t = Table(data, repeatRows=1, colWidths=[120, 150, 150, 280])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0052FF")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FAFC")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        elems.append(t)
        doc.build(elems)
        return Response(content=buf.getvalue(), media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=audit_trail.pdf"})
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Timestamp", "Admin", "Action", "Resource", "Detail"])
    for e in entries:
        w.writerow([e.get("timestamp", ""), e.get("actor_email", ""), e.get("action", ""),
                    e.get("resource", ""), e.get("detail", "")])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=audit_trail.csv"})


# ---------------- Client self-service billing ----------------
FEATURE_CATALOG = {
    "solo": [
        {"key": "monte_carlo", "label": "Monte Carlo projections"},
        {"key": "tax_optimizer", "label": "Tax optimizer"},
        {"key": "ai_reports", "label": "AI plan reports"},
        {"key": "document_vault", "label": "Document vault"},
    ],
    "advisor": [
        {"key": "client_portal", "label": "Client portal"},
        {"key": "voice_notes", "label": "Voice & meeting notes"},
        {"key": "ocr_import", "label": "OCR letters importer"},
        {"key": "white_label", "label": "White-label branding"},
        {"key": "ai_reports", "label": "AI plan reports"},
    ],
    "enterprise": [
        {"key": "sso", "label": "SSO / SAML"},
        {"key": "api_access", "label": "API access"},
        {"key": "custom_branding", "label": "Custom branding"},
        {"key": "priority_support", "label": "Priority support"},
        {"key": "advanced_analytics", "label": "Advanced analytics"},
    ],
}
SEAT_PRICE = {"solo": 19, "advisor": 60, "enterprise": 50}
SEATS_EDITABLE = {"solo": False, "advisor": True, "enterprise": True}


def _my_sub(user):
    for s in _plist("subscriptions"):
        if s.get("owner_email") == user.get("email"):
            return s
    return None


@router.get("/me/subscription")
async def my_subscription(user: dict = Depends(get_current_user)):
    sub = _my_sub(user)
    tier = (sub or {}).get("tier", user.get("tier"))
    opens = [i for i in _plist("invoices") if sub and i.get("subscription_id") == sub["id"] and i.get("status") == "open"] if sub else []
    return {
        "subscription": sub,
        "features_catalog": FEATURE_CATALOG.get(tier, []),
        "seat_price": SEAT_PRICE.get(tier, 0),
        "seats_editable": SEATS_EDITABLE.get(tier, False),
        "open_invoices": opens,
    }


class MySubPatch(BaseModel):
    seats: Optional[int] = None
    features: Optional[list] = None


@router.put("/me/subscription")
async def update_my_subscription(body: MySubPatch, user: dict = Depends(get_current_user)):
    sub = _my_sub(user)
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription on your account")
    tier = sub.get("tier")
    patch = {}
    if body.features is not None:
        allowed = {f["key"] for f in FEATURE_CATALOG.get(tier, [])}
        patch["features"] = [f for f in body.features if f in allowed]
    if body.seats is not None:
        if not SEATS_EDITABLE.get(tier):
            raise HTTPException(status_code=400, detail="Seats are fixed on your plan")
        if body.seats < 1:
            raise HTTPException(status_code=400, detail="At least one seat is required")
        patch["seats"] = body.seats
        patch["amount"] = body.seats * SEAT_PRICE.get(tier, 0)
    r = _pupdate("subscriptions", sub["id"], patch)
    audit(user, "billing.self_update", "subscription", str(patch))
    return r


class BillingInfoIn(BaseModel):
    card_name: str
    card_brand: str = "Visa"
    card_last4: str
    billing_email: str = ""


@router.put("/me/billing")
async def update_my_billing(body: BillingInfoIn, user: dict = Depends(get_current_user)):
    sub = _my_sub(user)
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription on your account")
    info = {
        "card_name": body.card_name, "card_brand": body.card_brand,
        "card_last4": body.card_last4[-4:], "billing_email": body.billing_email,
        "updated_at": _now(),
    }
    r = _pupdate("subscriptions", sub["id"], {"billing_info": info})
    audit(user, "billing.self_payment_method", "subscription", f"Card ending {info['card_last4']}")
    return r


# ---------------- Support inbox (advisors & clients) ----------------
class SupportTicketIn(BaseModel):
    subject: str
    description: str = ""
    priority: str = "normal"


@router.post("/support/tickets")
async def submit_support_ticket(body: SupportTicketIn, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    doc = _pcreate("tickets", {
        "type": "service_request", "subject": body.subject, "description": body.description,
        "priority": body.priority, "status": "open", "requester_email": user["email"],
        "source": "in_app", "notes": [],
    })
    audit(user, "support.create", "ticket", body.subject)
    background.add_task(_safe_send, user["email"], "We received your Compass support request",
                        f"<p>Hi {_esc(user.get('name', ''))},</p><p>Thanks for reaching out. We've logged your request <strong>{_esc(body.subject)}</strong> and our team will respond shortly. You can follow it anytime in Compass under Support.</p><p>&mdash; Compass Planning Support</p>")
    return doc


@router.get("/support/tickets")
async def my_support_tickets(user: dict = Depends(get_current_user)):
    mine = [t for t in _plist("tickets") if t.get("requester_email") == user.get("email")]
    mine.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return {"tickets": mine}


# ---------------- Plan upgrade / downgrade (owner, with proration) ----------------
PLANS = {
    "solo": {"label": "Solo", "price": 19, "seats": 1, "features": ["monte_carlo", "ai_reports"]},
    "advisor": {"label": "Advisor Pro", "price": 300, "seats": 5, "features": ["client_portal", "ai_reports", "ocr_import"]},
    "enterprise": {"label": "Enterprise", "price": 1250, "seats": 25, "features": ["sso", "api_access", "priority_support"]},
}
CYCLE_DAYS = 30


def _period_end(sub):
    pe = sub.get("current_period_end")
    if pe:
        try:
            dt = datetime.fromisoformat(pe)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    end = datetime.now(timezone.utc) + timedelta(days=CYCLE_DAYS)
    _pupdate("subscriptions", sub["id"], {"current_period_end": end.isoformat()})
    return end


def _proration(sub, new_tier):
    now = datetime.now(timezone.utc)
    days_remaining = max(0, min(CYCLE_DAYS, (_period_end(sub) - now).days))
    cur_amt = sub.get("amount", 0)
    new_amt = PLANS[new_tier]["price"]
    credit = round(cur_amt / CYCLE_DAYS * days_remaining, 2)
    charge = round(new_amt / CYCLE_DAYS * days_remaining, 2)
    return {"current_plan": sub.get("plan"), "current_amount": cur_amt,
            "new_tier": new_tier, "new_plan": PLANS[new_tier]["label"], "new_amount": new_amt,
            "days_remaining": days_remaining, "credit": credit, "charge": charge,
            "net_due": round(charge - credit, 2), "currency": sub.get("currency", "CAD")}


@router.get("/me/plans")
async def my_plans(user: dict = Depends(get_current_user)):
    sub = _my_sub(user)
    cur = (sub or {}).get("tier")
    plans = [{"tier": t, "label": p["label"], "price": p["price"], "seats": p["seats"],
              "features": [f["label"] for f in FEATURE_CATALOG.get(t, []) if f["key"] in p["features"]],
              "current": t == cur} for t, p in PLANS.items()]
    return {"plans": plans, "has_sub": bool(sub)}


class PlanChangeIn(BaseModel):
    tier: str


@router.post("/me/subscription/preview-change")
async def preview_change(body: PlanChangeIn, user: dict = Depends(get_current_user)):
    sub = _my_sub(user)
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription on your account")
    if body.tier not in PLANS:
        raise HTTPException(status_code=400, detail="Unknown plan")
    return _proration(sub, body.tier)


@router.post("/me/subscription/change")
async def change_plan(body: PlanChangeIn, user: dict = Depends(get_current_user)):
    sub = _my_sub(user)
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription on your account")
    if body.tier not in PLANS:
        raise HTTPException(status_code=400, detail="Unknown plan")
    if body.tier == sub.get("tier"):
        raise HTTPException(status_code=400, detail="You're already on this plan")
    pr = _proration(sub, body.tier)
    p = PLANS[body.tier]
    updated = _pupdate("subscriptions", sub["id"], {
        "tier": body.tier, "plan": p["label"], "seats": p["seats"],
        "amount": p["price"], "features": list(p["features"]), "status": "active",
    })
    if pr["net_due"] > 0:
        _pcreate("invoices", {"subscription_id": sub["id"], "account_label": sub.get("account_label"),
                              "amount": pr["net_due"], "currency": sub.get("currency", "CAD"),
                              "status": "open", "number": "INV-" + _id()[:6].upper(),
                              "issued_at": _now(), "note": f"Proration: {sub.get('plan')} to {p['label']}"})
    audit(user, "billing.plan_change", "subscription", f"{sub.get('tier')} -> {body.tier} (net ${pr['net_due']})")
    return {"subscription": updated, "proration": pr}


# ---------------- Ticket replies (shared thread) ----------------
class ReplyIn(BaseModel):
    text: str


@router.post("/admin/tickets/{rid}/reply")
async def admin_reply(rid: str, body: ReplyIn, background: BackgroundTasks, admin: dict = Depends(get_admin_user)):
    cur = repo.get(PLATFORM, "tickets", rid, {})
    if not cur:
        raise HTTPException(status_code=404, detail="Not found")
    replies = list(cur.get("replies", []))
    replies.append({"by": admin["email"], "role": "admin", "at": _now(), "text": body.text})
    new_status = cur.get("status") if cur.get("status") == "resolved" else "in_progress"
    r = _pupdate("tickets", rid, {"replies": replies, "status": new_status, "updated_at": _now()})
    audit(admin, "admin.ticket.reply", "ticket", cur.get("subject", rid))
    if cur.get("requester_email"):
        background.add_task(_safe_send, cur["requester_email"], "Compass Support replied to your request",
                            f"<p>Hi,</p><p>Our support team replied to your request <strong>{_esc(cur.get('subject', ''))}</strong>:</p><blockquote>{_esc(body.text)}</blockquote><p>Sign in to Compass under Support to continue the conversation.</p>")
    return r


@router.post("/support/tickets/{rid}/reply")
async def user_reply(rid: str, body: ReplyIn, user: dict = Depends(get_current_user)):
    cur = repo.get(PLATFORM, "tickets", rid, {})
    if not cur or cur.get("requester_email") != user.get("email"):
        raise HTTPException(status_code=404, detail="Not found")
    replies = list(cur.get("replies", []))
    replies.append({"by": user["email"], "role": "user", "at": _now(), "text": body.text})
    return _pupdate("tickets", rid, {"replies": replies, "updated_at": _now()})


# ---------------- Email + platform ops (overdue billing, audit archive) ----------------
def _esc(s):
    return _html.escape(str(s or ""))


async def _safe_send(to, subject, html):
    try:
        await email_service.send_email(to=to, subject=subject, html=html)
    except Exception:
        pass  # email is best-effort; never block the request/cron


def _billing_html(sub, inv):
    amt = f"{inv.get('amount')} {inv.get('currency', 'CAD')}"
    return (f"<p>Hi,</p><p>Your Compass subscription <strong>{_esc(sub.get('plan'))}</strong> "
            f"has an outstanding balance of <strong>{_esc(amt)}</strong>. Please sign in to Compass under "
            f"Plan &amp; Billing to settle it and keep your service active.</p><p>&mdash; Compass Planning</p>")


async def run_platform_ops():
    """Daily: flag past-due subs + remind owners; monthly (1st): archive the audit trail."""
    now = datetime.now(timezone.utc)
    for inv in _plist("invoices"):
        if inv.get("status") != "open" or not inv.get("subscription_id"):
            continue
        sub = repo.get(PLATFORM, "subscriptions", inv["subscription_id"], {})
        if not sub:
            continue
        if sub.get("status") != "past_due":
            _pupdate("subscriptions", sub["id"], {"status": "past_due"})
        last = inv.get("last_reminded")
        due = True
        if last:
            try:
                due = (now - datetime.fromisoformat(last)).total_seconds() > 72000
            except Exception:
                due = True
        if due:
            _pupdate("invoices", inv["id"], {"last_reminded": now.isoformat()})
            if sub.get("owner_email"):
                await _safe_send(sub["owner_email"], "Payment due on your Compass subscription", _billing_html(sub, inv))
    if now.day == 1:
        _create_audit_archive(now.strftime("%Y-%m"))


def _create_audit_archive(period):
    existing = [a for a in _plist("audit_archives") if a.get("period") == period]
    if existing:
        return existing[0]
    entries = _filter_audit(None, None, None)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Timestamp", "Admin", "Action", "Resource", "Detail"])
    for e in entries:
        w.writerow([e.get("timestamp", ""), e.get("actor_email", ""), e.get("action", ""), e.get("resource", ""), e.get("detail", "")])
    return _pcreate("audit_archives", {"period": period, "count": len(entries), "csv": buf.getvalue()})


@router.post("/admin/ops/run")
async def run_ops(background: BackgroundTasks, admin: dict = Depends(get_admin_user)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    background.add_task(run_platform_ops)
    return {"status": "accepted"}


@router.get("/admin/audit/archives")
async def list_archives(admin: dict = Depends(get_admin_user)):
    items = sorted(_plist("audit_archives"), key=lambda a: a.get("period", ""), reverse=True)
    return {"archives": [{k: v for k, v in a.items() if k != "csv"} for a in items]}


@router.post("/admin/audit/archives/run")
async def run_archive(admin: dict = Depends(get_admin_user)):
    return _create_audit_archive(datetime.now(timezone.utc).strftime("%Y-%m"))


@router.get("/admin/audit/archives/{rid}/download")
async def download_archive(rid: str, admin: dict = Depends(get_admin_user)):
    a = repo.get(PLATFORM, "audit_archives", rid, {})
    if not a:
        raise HTTPException(status_code=404, detail="Archive not found")
    return Response(content=a.get("csv", ""), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=audit_{a.get('period')}.csv"})


@router.post("/me/invoices/{rid}/pay")
async def pay_my_invoice(rid: str, user: dict = Depends(get_current_user)):
    sub = _my_sub(user)
    inv = repo.get(PLATFORM, "invoices", rid, {})
    if not inv or not sub or inv.get("subscription_id") != sub["id"]:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("status") == "paid":
        return inv
    receipt = chase_mock.charge(inv.get("amount", 0), inv.get("currency", "CAD"), f"Invoice {inv.get('number')}")
    r = _pupdate("invoices", rid, {"status": "paid", "paid_at": _now(), "receipt": receipt})
    _pupdate("subscriptions", sub["id"], {"status": "active"})
    audit(user, "billing.self_pay", "invoice", inv.get("number", rid))
    return r


# ---------------- Sales leads (public "Contact sales" + admin inbox) ----------------
SALES_EMAILS = [e.strip() for e in os.environ.get("SALES_LEAD_EMAIL", "privacy@westoak.dev").split(",") if e.strip()]
SALES_TEAM = os.environ.get("SALES_TEAM_NAME", "Compass Planning Enterprise Team")
SALES_RESPONSE_TIME = os.environ.get("SALES_RESPONSE_TIME", "within one business day")
SALES_RESPONSE_TIME_FR = os.environ.get("SALES_RESPONSE_TIME_FR", "en un jour ouvrable")
LEAD_STATUSES = ("new", "contacted", "closed")


class ContactSalesIn(BaseModel):
    name: str
    email: str
    company: str = ""
    seats: str = ""
    message: str = ""
    locale: str = "en"
    source: str = "landing"


def _lead_rows(doc):
    def row(label, value):
        return (f'<tr><td style="padding:4px 12px 4px 0;color:#60708f">{_esc(label)}</td>'
                f'<td style="padding:4px 0;color:#0B1437">{_esc(value) or "&mdash;"}</td></tr>')
    return (row("Name", doc.get("name")) + row("Email", doc.get("email"))
            + row("Company", doc.get("company")) + row("Seats", doc.get("seats")))


def _lead_notify_html(doc):
    msg = _esc(doc.get("message")) or "&mdash;"
    return (f"<p>A new Enterprise enquiry came in from the Compass Planning website.</p>"
            f'<table role="presentation" style="font-size:14px">{_lead_rows(doc)}</table>'
            f"<p style='margin-top:12px;color:#0B1437'><strong>Message</strong><br>{msg}</p>"
            f"<p style='font-size:12px;color:#9aa5b9;margin-top:16px'>Sign in to the Compass Admin console under Leads to follow up.</p>")


def _lead_ack_html(doc):
    fr = doc.get("locale") == "fr"
    team = _esc(SALES_TEAM)
    first = _esc((doc.get("name") or ("là" if fr else "there")).split()[0])
    if fr:
        rt = _esc(SALES_RESPONSE_TIME_FR)
        return (f"<p>Bonjour {first},</p>"
                f"<p>Merci de votre intérêt pour Compass Planning Entreprise. Nous avons bien reçu votre demande et un membre de {team} vous contactera personnellement {rt} pour comprendre vos besoins.</p>"
                f"<p>&mdash; {team}</p>"
                f"<p style='font-size:12px;color:#9aa5b9;margin-top:16px'>Nous ne demandons jamais votre mot de passe ni vos coordonnées bancaires par courriel.</p>")
    rt = _esc(SALES_RESPONSE_TIME)
    return (f"<p>Hi {first},</p>"
            f"<p>Thanks for your interest in Compass Planning Enterprise. We've received your enquiry and a member of {team} will personally reach out {rt} to understand your needs.</p>"
            f"<p>&mdash; {team}</p>"
            f"<p style='font-size:12px;color:#9aa5b9;margin-top:16px'>We never ask for your password or card details by email.</p>")


@router.post("/leads/contact-sales")
async def contact_sales(body: ContactSalesIn, background: BackgroundTasks):
    name = (body.name or "").strip()
    email = (body.email or "").strip()
    if not name or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="A name and valid email are required")
    if not email_service.rate_ok(f"lead:{email.lower()}", limit=3, window=300):
        raise HTTPException(status_code=429, detail="Too many requests — please try again in a few minutes")
    doc = _pcreate("leads", {
        "name": name, "email": email, "company": (body.company or "").strip()[:200],
        "seats": (body.seats or "").strip()[:60], "message": (body.message or "").strip()[:4000],
        "locale": body.locale if body.locale in ("en", "fr") else "en",
        "status": "new", "source": (body.source or "landing").strip()[:40],
    })
    for rcpt in SALES_EMAILS:
        background.add_task(_safe_send, rcpt, f"New Enterprise lead — {name}", _lead_notify_html(doc))
    ack_subject = "Merci d'avoir contacté Compass Planning" if doc.get("locale") == "fr" else "Thanks for contacting Compass Planning"
    background.add_task(_safe_send, email, ack_subject, _lead_ack_html(doc))
    return {"ok": True}


@router.get("/admin/leads")
async def list_leads(admin: dict = Depends(get_admin_user)):
    items = sorted(_plist("leads"), key=lambda l: l.get("created_at", ""), reverse=True)
    return {"leads": items, "counts": {s: len([l for l in items if l.get("status") == s]) for s in LEAD_STATUSES}}


class LeadPatch(BaseModel):
    status: str


@router.patch("/admin/leads/{rid}")
async def patch_lead(rid: str, body: LeadPatch, admin: dict = Depends(get_admin_user)):
    if body.status not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status")
    cur = repo.get(PLATFORM, "leads", rid, {})
    if not cur:
        raise HTTPException(status_code=404, detail="Not found")
    r = _pupdate("leads", rid, {"status": body.status, "updated_at": _now()})
    audit(admin, "admin.lead.update", "lead", f"{cur.get('company') or cur.get('name')} -> {body.status}")
    return r
