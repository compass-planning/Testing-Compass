"""US / cross-border planning — jurisdiction router + US tax + Social Security."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import get_current_user, planner_scope, _block_enterprise_write, audit
from repository import repo
from models import _id
from engine.crossborder import analyze

router = APIRouter()


class CrossBorderInput(BaseModel):
    ca_resident: bool = True
    us_citizen: bool = False
    us_green_card: bool = False
    us_substantial_presence: bool = False
    ca_citizen: bool = True
    annual_income: float = 100000.0
    filing_status: str = "single"
    state: str = "Other"
    avg_annual_earnings: float = 60000.0
    claim_age: int = Field(default=67, ge=62, le=70)


@router.post("/plan/crossborder")
async def crossborder(body: CrossBorderInput, user: dict = Depends(get_current_user)):
    return analyze(**body.model_dump())


@router.post("/plan/crossborder/save")
async def save_crossborder(body: CrossBorderInput, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, read, ws, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before saving its cross-border analysis")
    result = analyze(**body.model_dump())
    payload = {"inputs": body.model_dump(), "result": result, "saved_at": datetime.now(timezone.utc).isoformat()}
    rows = [r for r in repo.list(store, "plan_crossborder", read) if (not hid or r.get("household_id") == hid)]
    if rows:
        repo.update(store, "plan_crossborder", rows[0]["id"], payload, read)
    else:
        repo.create(store, "plan_crossborder", {"id": _id(), "store": store, "scope": ws, "household_id": hid, **payload})
    audit(user, "crossborder.save", "plan_crossborder", hid or "self")
    return {"ok": True, "result": result}


@router.get("/plan/crossborder/saved")
async def saved_crossborder(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rows = [r for r in repo.list(store, "plan_crossborder", read) if (not hid or r.get("household_id") == hid)]
    return rows[0] if rows else None
