"""US / cross-border planning — jurisdiction router + US tax + Social Security. Read-only, all tiers."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from deps import get_current_user
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
