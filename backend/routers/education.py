"""Education planning — RESP projection + CESG/CLB grants, saved education plans."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import get_current_user, planner_scope, _block_enterprise_write, audit
from repository import repo
from models import _id
from engine.education import project_resp

router = APIRouter()


class RespInput(BaseModel):
    child_age: int = Field(default=0, ge=0, le=17)
    current_savings: float = 0.0
    monthly_contribution: float = 0.0
    growth_pct: float = 5.0
    family_income: float = 90000.0
    tuition_goal: float = 80000.0
    prior_cesg: float = 0.0
    prior_clb: float = 0.0


@router.post("/plan/education/resp")
async def resp_projection(body: RespInput, user: dict = Depends(get_current_user)):
    return project_resp(**body.model_dump())


class ChildInput(BaseModel):
    name: str = "Child"
    child_age: int = Field(default=0, ge=0, le=17)
    current_savings: float = 0.0
    monthly_contribution: float = 0.0
    growth_pct: float = 5.0
    tuition_goal: float = 80000.0


class EducationSaveInput(BaseModel):
    family_income: float = 90000.0
    children: list[ChildInput] = []


def _education_summary(family_income, children):
    rows = []
    for c in children:
        r = project_resp(child_age=c.child_age, current_savings=c.current_savings,
                         monthly_contribution=c.monthly_contribution, growth_pct=c.growth_pct,
                         family_income=family_income, tuition_goal=c.tuition_goal)
        s = r["summary"]
        rows.append({"name": c.name, "projectedValue": s["projectedValue"], "totalGrants": s["totalGrants"],
                     "totalContributions": s["totalContributions"], "tuitionGoal": s["tuitionGoal"],
                     "coveragePct": s["coveragePct"], "clbEligible": s["clbEligible"]})
    combined = {
        "projectedValue": sum(r["projectedValue"] for r in rows),
        "totalGrants": sum(r["totalGrants"] for r in rows),
        "totalContributions": sum(r["totalContributions"] for r in rows),
        "tuitionGoal": sum(r["tuitionGoal"] for r in rows),
    }
    combined["coveragePct"] = round(min(100, combined["projectedValue"] / combined["tuitionGoal"] * 100)) if combined["tuitionGoal"] else 0
    return rows, combined


@router.post("/plan/education/save")
async def save_education(body: EducationSaveInput, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, read, ws, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before saving its education plan")
    rows, combined = _education_summary(body.family_income, body.children)
    payload = {"family_income": body.family_income, "children": [c.model_dump() for c in body.children],
               "per_child": rows, "combined": combined, "saved_at": datetime.now(timezone.utc).isoformat()}
    existing = [r for r in repo.list(store, "plan_education", read) if (not hid or r.get("household_id") == hid)]
    if existing:
        repo.update(store, "plan_education", existing[0]["id"], payload, read)
    else:
        repo.create(store, "plan_education", {"id": _id(), "store": store, "scope": ws, "household_id": hid, **payload})
    audit(user, "education.save", "plan_education", hid or "self")
    return {"ok": True, "per_child": rows, "combined": combined}


@router.get("/plan/education/saved")
async def saved_education(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rows = [r for r in repo.list(store, "plan_education", read) if (not hid or r.get("household_id") == hid)]
    return rows[0] if rows else None
