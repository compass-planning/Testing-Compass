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
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
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


def render_report_html(household_name: str, net_worth, protection_score, retirement_success, goals) -> str:
    name = escape(str(household_name))
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
        f'<tr><td style="background:#0052FF;padding:22px 24px;border-radius:10px 10px 0 0">'
        f'<div style="color:#fff;font-size:20px;font-weight:700">{escape(EMAIL_FROM_NAME)}</div>'
        f'<div style="color:#dbe6ff;font-size:12px">Canadian Retirement Intelligence</div></td></tr>'
        f'<tr><td style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">'
        f'<h2 style="color:#0B1437;margin:0 0 4px">{name}</h2>'
        f'<p style="color:#60708f;margin:0 0 18px;font-size:13px">Here is your latest financial summary.</p>'
        f'<table role="presentation" width="100%" cellspacing="8"><tr>'
        f'{kpi("Net Worth", _money(net_worth))}{kpi("Protection", str(int(protection_score)) + "/100")}{kpi("Retirement", rs)}'
        f'</tr></table>'
        f'<h3 style="color:#0B1437;margin:22px 0 6px;font-size:14px">Top goals</h3>'
        f'<table role="presentation" width="100%" style="font-size:13px">{rows}</table>'
        f'<p style="font-size:11px;color:#9aa5b9;margin-top:22px">Prepared with {escape(EMAIL_FROM_NAME)}. '
        f'Illustrative summary — not financial, tax or legal advice. We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )
