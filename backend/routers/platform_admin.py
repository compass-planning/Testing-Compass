"""Platform admin console — super-admin only (tier == 'admin').

Global (platform-wide) collections live in the shared store with an empty scope
so the admin sees everything. Billing uses the Chase MOCK gateway for now.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from repository import repo
from models import _id
from deps import get_current_user, get_admin_user, _public, audit
import metrics
import chase_mock

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
    return {"announcements": anns, "outages": outages}


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
async def patch_ticket(rid: str, body: TicketPatch, admin: dict = Depends(get_admin_user)):
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
    return _pupdate("tickets", rid, patch)


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
@router.get("/admin/audit")
async def admin_audit(admin: dict = Depends(get_admin_user)):
    entries = [a for a in repo.list("shared", "audit_log", {}) if str(a.get("action", "")).startswith("admin.")]
    entries.sort(key=lambda a: a.get("timestamp", ""), reverse=True)
    return {"entries": entries[:300]}


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
    return {
        "subscription": sub,
        "features_catalog": FEATURE_CATALOG.get(tier, []),
        "seat_price": SEAT_PRICE.get(tier, 0),
        "seats_editable": SEATS_EDITABLE.get(tier, False),
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
async def submit_support_ticket(body: SupportTicketIn, user: dict = Depends(get_current_user)):
    doc = _pcreate("tickets", {
        "type": "service_request", "subject": body.subject, "description": body.description,
        "priority": body.priority, "status": "open", "requester_email": user["email"],
        "source": "in_app", "notes": [],
    })
    audit(user, "support.create", "ticket", body.subject)
    return doc


@router.get("/support/tickets")
async def my_support_tickets(user: dict = Depends(get_current_user)):
    mine = [t for t in _plist("tickets") if t.get("requester_email") == user.get("email")]
    mine.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return {"tickets": mine}
