"""Emergent-managed email (Resend) — household summary sends for advisors.

Bodies are built from a fixed server-side template; callers pass numbers/IDs,
never markup or recipient lists are machine-generated. See _assert_safe_email.
"""
import os
import re
import ipaddress
import time
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from fastapi import HTTPException

logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Compass Planning")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    if not EMAIL_KEY:
        raise HTTPException(status_code=503, detail="Email is not configured")
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


# --- simple per-user rate limit (10 / 60s) ---
_SENDS: dict[str, list[float]] = {}


def rate_ok(user_id: str, limit: int = 10, window: int = 60) -> bool:
    now = time.time()
    hist = [t for t in _SENDS.get(user_id, []) if now - t < window]
    if len(hist) >= limit:
        _SENDS[user_id] = hist
        return False
    hist.append(now)
    _SENDS[user_id] = hist
    return True


def _money(v) -> str:
    try:
        return f"${float(v):,.0f}"
    except (TypeError, ValueError):
        return "$0"


def render_report_html(household_name: str, net_worth, protection_score, retirement_success, goals, firm_name=None, logo_url=None) -> str:
    name = escape(str(household_name))
    firm = escape(str(firm_name or EMAIL_FROM_NAME))
    initials = "".join([w[0] for w in str(firm_name or EMAIL_FROM_NAME).split()[:2]]).upper() or "C"
    if logo_url and str(logo_url).startswith("https://"):
        logo_cell = (f'<td style="width:44px;height:44px;background:#ffffff;border-radius:8px;text-align:center;vertical-align:middle">'
                     f'<img src="{escape(str(logo_url))}" alt="{firm}" width="40" height="40" '
                     f'style="max-width:40px;max-height:40px;border-radius:6px;display:block;margin:0 auto"/></td>')
    else:
        logo_cell = (f'<td style="width:40px;height:40px;background:#ffffff;border-radius:8px;text-align:center;vertical-align:middle;'
                     f'color:#0052FF;font-weight:700;font-size:16px">{initials}</td>')
    rs = f"{int(retirement_success)}%" if retirement_success is not None else "Not run"
    rows = ""
    for g in (goals or [])[:5]:
        try:
            pct = round((float(g.get("current_amount", 0)) / float(g.get("target_amount", 1))) * 100)
        except (TypeError, ValueError, ZeroDivisionError):
            pct = 0
        rows += (f'<tr><td style="padding:6px 0;color:#0B1437">{escape(str(g.get("title", "Goal")))}</td>'
                 f'<td style="padding:6px 0;text-align:right;color:#60708f">{pct}%</td></tr>')
    if not rows:
        rows = '<tr><td style="padding:6px 0;color:#60708f" colspan="2">No goals on file.</td></tr>'

    def kpi(label, value):
        return (f'<td style="padding:10px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center">'
                f'<div style="font-size:11px;color:#60708f;text-transform:uppercase;letter-spacing:.5px">{label}</div>'
                f'<div style="font-size:18px;font-weight:700;color:#0B1437;margin-top:4px">{value}</div></td>')

    return (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">'
        f'<tr><td style="background:#0052FF;padding:20px 24px;border-radius:10px 10px 0 0">'
        f'<table role="presentation"><tr>'
        f'{logo_cell}'
        f'<td style="padding-left:12px">'
        f'<div style="color:#fff;font-size:20px;font-weight:700">{firm}</div>'
        f'<div style="color:#dbe6ff;font-size:12px">Canadian Retirement Intelligence</div>'
        f'</td></tr></table></td></tr>'
        f'<tr><td style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">'
        f'<h2 style="color:#0B1437;margin:0 0 4px">{name}</h2>'
        f'<p style="color:#60708f;margin:0 0 18px;font-size:13px">Here is your latest financial summary.</p>'
        f'<table role="presentation" width="100%" cellspacing="8"><tr>'
        f'{kpi("Net Worth", _money(net_worth))}{kpi("Protection", str(int(protection_score)) + "/100")}{kpi("Retirement", rs)}'
        f'</tr></table>'
        f'<h3 style="color:#0B1437;margin:22px 0 6px;font-size:14px">Top goals</h3>'
        f'<table role="presentation" width="100%" style="font-size:13px">{rows}</table>'
        f'<p style="font-size:11px;color:#9aa5b9;margin-top:22px">Prepared with {firm}. '
        f'Illustrative summary — not financial, tax or legal advice. We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )



def render_invite_html(name, firm, link) -> str:
    firm = escape(str(firm or EMAIL_FROM_NAME))
    name = escape(str(name or "there"))
    link = escape(str(link))
    return (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">'
        f'<tr><td style="background:#0052FF;padding:20px 24px;border-radius:10px 10px 0 0">'
        f'<div style="color:#fff;font-size:20px;font-weight:700">{firm}</div>'
        f'<div style="color:#dbe6ff;font-size:12px">Canadian Retirement Intelligence</div></td></tr>'
        f'<tr><td style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">'
        f'<h2 style="color:#0B1437;margin:0 0 8px">Welcome, {name}</h2>'
        f'<p style="color:#60708f;font-size:14px;margin:0 0 18px">Your advisor at {firm} has set up secure access to your retirement plan. '
        f'Click below to choose your password. You will set up two-factor authentication on your first sign-in.</p>'
        f'<p style="margin:0 0 22px"><a href="{link}" style="display:inline-block;background:#0052FF;color:#fff;'
        f'text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">Activate my account</a></p>'
        f'<p style="font-size:12px;color:#9aa5b9">This link expires in 7 days. If you did not expect this email, you can ignore it. '
        f'We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )



def render_task_digest_html(advisor_name, firm, today_tasks, overdue_tasks) -> str:
    firm = escape(str(firm or EMAIL_FROM_NAME))
    name = escape(str(advisor_name or "there").split()[0])
    today_tasks = today_tasks or []
    overdue_tasks = overdue_tasks or []

    def row(title, meta, color):
        return (f'<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f6;color:#0B1437;font-size:14px">{escape(str(title))}</td>'
                f'<td style="padding:8px 0;border-bottom:1px solid #eef1f6;text-align:right;color:{color};font-size:12px;font-weight:600;white-space:nowrap">{escape(str(meta))}</td></tr>')

    sections = ""
    if overdue_tasks:
        rows = "".join(row(t.get("title", "Task"), f'Overdue . due {t.get("due_date", "")}', "#EE5D50") for t in overdue_tasks)
        sections += (f'<h3 style="color:#EE5D50;margin:20px 0 4px;font-size:14px">Overdue ({len(overdue_tasks)})</h3>'
                     f'<table role="presentation" width="100%">{rows}</table>')
    if today_tasks:
        rows = "".join(row(t.get("title", "Task"), "Due today", "#0052FF") for t in today_tasks)
        sections += (f'<h3 style="color:#0B1437;margin:20px 0 4px;font-size:14px">Due today ({len(today_tasks)})</h3>'
                     f'<table role="presentation" width="100%">{rows}</table>')
    total = len(overdue_tasks) + len(today_tasks)
    return (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">'
        f'<tr><td style="background:#0052FF;padding:20px 24px;border-radius:10px 10px 0 0">'
        f'<div style="color:#fff;font-size:20px;font-weight:700">{firm}</div>'
        f'<div style="color:#dbe6ff;font-size:12px">Your morning task digest</div></td></tr>'
        f'<tr><td style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">'
        f'<h2 style="color:#0B1437;margin:0 0 4px">Good morning, {name}</h2>'
        f'<p style="color:#60708f;margin:0 0 6px;font-size:13px">You have <strong>{total}</strong> task{"" if total == 1 else "s"} needing attention today.</p>'
        f'{sections}'
        f'<p style="font-size:11px;color:#9aa5b9;margin-top:22px">Sign in to {firm} to complete or reschedule these tasks. '
        f'We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )


def render_book_digest_html(advisor_name, firm, stats) -> str:
    firm = escape(str(firm or EMAIL_FROM_NAME))
    name = escape(str(advisor_name or "there").split()[0])
    counts = stats.get("counts", {})
    avg = stats.get("avg_score")
    attention = stats.get("attention", [])

    def stat_cell(label, value, color):
        return (f'<td style="padding:12px;background:#f6f8fc;border-radius:8px;text-align:center" width="25%">'
                f'<div style="font-size:22px;font-weight:800;color:{color}">{escape(str(value))}</div>'
                f'<div style="font-size:11px;color:#60708f;margin-top:2px">{escape(str(label))}</div></td>')

    cells = (
        stat_cell("Households", stats.get("households", 0), "#0B1437")
        + '<td width="8"></td>'
        + stat_cell("Avg score", avg if avg is not None else "—", "#0052FF")
        + '<td width="8"></td>'
        + stat_cell("On track", counts.get("On Track", 0), "#00A36C")
        + '<td width="8"></td>'
        + stat_cell("Need attention", counts.get("At Risk", 0) + counts.get("Needs Review", 0), "#EE5D50")
    )

    def att_color(status):
        return {"At Risk": "#EE5D50", "Needs Review": "#FFB800", "Needs Setup": "#60708f"}.get(status, "#60708f")

    if attention:
        rows = "".join(
            f'<tr><td style="padding:9px 0;border-bottom:1px solid #eef1f6">'
            f'<div style="color:#0B1437;font-size:14px;font-weight:600">{escape(str(a.get("primary")))}</div>'
            f'<div style="color:#60708f;font-size:12px">{escape(str(a.get("next_action") or ""))}</div></td>'
            f'<td style="padding:9px 0;border-bottom:1px solid #eef1f6;text-align:right;white-space:nowrap">'
            f'<span style="color:{att_color(a.get("status"))};font-size:12px;font-weight:700">{escape(str(a.get("status")))}</span>'
            f'<span style="color:#9aa5b9;font-size:12px"> · {escape(str(a.get("score") if a.get("score") is not None else "—"))}</span></td></tr>'
            for a in attention)
        attention_block = (f'<h3 style="color:#0B1437;margin:22px 0 4px;font-size:14px">Households needing attention</h3>'
                           f'<table role="presentation" width="100%">{rows}</table>')
    else:
        attention_block = '<p style="color:#00A36C;font-size:13px;margin-top:20px">Every household is on track this week. 🎯</p>'

    return (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">'
        f'<tr><td style="background:#0B1437;padding:20px 24px;border-radius:10px 10px 0 0">'
        f'<div style="color:#fff;font-size:20px;font-weight:700">{firm}</div>'
        f'<div style="color:#9db2e6;font-size:12px">Your weekly book-health summary</div></td></tr>'
        f'<tr><td style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">'
        f'<h2 style="color:#0B1437;margin:0 0 14px">Good morning, {name}</h2>'
        f'<table role="presentation" width="100%"><tr>{cells}</tr></table>'
        f'{attention_block}'
        f'<p style="font-size:11px;color:#9aa5b9;margin-top:22px">Sign in to {firm} to action these households. '
        f'We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )

