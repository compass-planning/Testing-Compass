"""AI insights — narrative, plan-aware advice generated with the Emergent LLM key
(Claude). Falls back to a deterministic rule-based summary if the LLM is unavailable."""
import os
import json
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from repository import repo
from models import _id
from deps import get_current_user, planner_scope

logger = logging.getLogger(__name__)
router = APIRouter()

SYSTEM_PROMPT = (
    "You are a Canadian financial-planning assistant for a licensed advisor platform. "
    "Given a household's planning data, produce 4-6 concise, specific, plain-language insights. "
    "Be encouraging but honest; reference Canadian concepts (RRSP/RRIF, TFSA, CPP/OAS, probate) where relevant. "
    "Never ask for passwords or payment details. Do NOT give definitive tax/legal advice — frame as considerations. "
    "Return ONLY a JSON array; each item: {\"severity\":\"good|info|warn|danger\",\"title\":\"short title\","
    "\"body\":\"one-to-two sentence insight\"}. No prose outside the JSON array."
)


def _money(v):
    try:
        return f"${float(v):,.0f}"
    except (TypeError, ValueError):
        return "$0"


def _rule_based(ctx: dict) -> list:
    out = []
    nw = ctx["netWorth"]
    if nw < 0:
        out.append({"severity": "danger", "title": "Negative net worth", "body": "Liabilities exceed assets — prioritise paying down high-interest debt before investing."})
    else:
        out.append({"severity": "good", "title": "Positive net worth", "body": f"Household net worth is {_money(nw)}. Keep contributions consistent to compound it."})
    if ctx["retirementProjections"] == 0:
        out.append({"severity": "warn", "title": "No retirement projection", "body": "Run a projection to confirm your savings path funds your target retirement income."})
    if ctx["protectionAnalyses"] == 0 and ctx["insuranceAnalyses"] == 0:
        out.append({"severity": "danger", "title": "Protection gap", "body": "No insurance analysis on file — model life, disability and LTC needs to size any coverage gap."})
    if ctx["monthlyExpenses"] > 0:
        out.append({"severity": "info", "title": "Emergency fund", "body": f"You track {_money(ctx['monthlyExpenses'])}/mo in expenses — aim to hold 3-6 months ({_money(ctx['monthlyExpenses']*4)}) in cash."})
    for g in ctx["atRiskGoals"][:2]:
        out.append({"severity": "warn", "title": f"Goal at risk: {g['title']}", "body": f"{_money(g['current'])} of {_money(g['target'])} — consider increasing contributions."})
    return out


async def _gather_context(user, household_id):
    store, read, _, hid = planner_scope(user, household_id)

    def hh(rows):
        return [r for r in rows if (not hid or r.get("household_id") == hid)]
    nw_rows = hh(repo.list(store, "plan_networth", read))
    debts = hh(repo.list(store, "plan_debts", read))
    accounts = repo.list(store, "accounts", read)
    goals = repo.list(store, "goals", read)
    assets = sum(float(r.get("value", 0)) for r in nw_rows if r.get("kind") == "asset") + sum(float(a.get("balance", 0)) for a in accounts)
    liabilities = sum(float(r.get("value", 0)) for r in nw_rows if r.get("kind") == "liability") + sum(float(d.get("balance", 0)) for d in debts)
    return {
        "netWorth": round(assets - liabilities), "totalAssets": round(assets), "totalLiabilities": round(liabilities),
        "monthlyExpenses": round(sum(float(r.get("amount", 0)) for r in hh(repo.list(store, "plan_expenses", read)))),
        "retirementProjections": len(hh(repo.list(store, "plan_retirement", read))),
        "insuranceAnalyses": len(hh(repo.list(store, "plan_insurance", read))),
        "protectionAnalyses": len(hh(repo.list(store, "plan_protection", read))),
        "debtCount": len(debts),
        "goals": [{"title": g.get("title"), "current": g.get("current_amount"), "target": g.get("target_amount"), "status": g.get("status")} for g in goals],
        "atRiskGoals": [{"title": g.get("title"), "current": g.get("current_amount"), "target": g.get("target_amount")} for g in goals if g.get("status") in ("at_risk", "behind")],
    }, store, hid


@router.get("/plan/insights")
async def get_insights(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rows = repo.list(store, "plan_ai_insights", read)
    if hid:
        rows = [r for r in rows if r.get("household_id") == hid]
    rows.sort(key=lambda r: r.get("generated_at", ""), reverse=True)
    return rows[0] if rows else None


@router.post("/plan/insights/generate")
async def generate_insights(user: dict = Depends(get_current_user), household_id: str = None):
    ctx, store, hid = await _gather_context(user, household_id)
    insights, generated_by = None, "ai"
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(api_key=key, session_id=str(uuid.uuid4()), system_message=SYSTEM_PROMPT).with_model("anthropic", "claude-sonnet-5-5")
            resp = await chat.send_message(UserMessage(text="Household planning data (JSON):\n" + json.dumps(ctx)))
            text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
            raw = text.strip()
            start, end = raw.find("["), raw.rfind("]")
            if start != -1 and end != -1 and end > start:
                raw = raw[start:end + 1]
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                insights = [{"severity": i.get("severity", "info"), "title": str(i.get("title", ""))[:120], "body": str(i.get("body", ""))[:400]} for i in parsed[:6]]
        except Exception as e:
            logger.warning(f"AI insights generation failed, falling back: {e}")
    if not insights:
        insights, generated_by = _rule_based(ctx), "fallback"

    # persist latest per household (replace previous)
    for r in repo.list(store, "plan_ai_insights", {}):
        if r.get("household_id") == hid and r.get("actor_email") == user["email"]:
            repo.delete(store, "plan_ai_insights", r["id"], {})
    rec = {"id": _id(), "store": store, "scope": user.get("scope", {}), "household_id": hid,
           "insights": insights, "generated_by": generated_by, "actor_email": user["email"],
           "generated_at": datetime.now(timezone.utc).isoformat()}
    repo.create(store, "plan_ai_insights", rec)
    return rec
