"""Education planning — RESP projection with CESG + CLB grants. Read-only, all tiers."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from deps import get_current_user
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
