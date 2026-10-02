"""Estate & tax server-side compute — per-province probate + terminal tax, and a
general income-tax calculator. Read-only; available to all tiers."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from deps import get_current_user
from engine.estate import calculate_estate, calculate_probate_fees, calculate_terminal_tax
from engine.reference import calc_combined_tax, get_marginal_rate

router = APIRouter()


class EstateInput(BaseModel):
    province: str = "ON"
    grossEstateValue: float = 0
    rrspRrifBalance: float = 0
    nonRegInvestments: float = 0
    nonRegCostBase: float = 0
    otherIncome: float = 0
    registeredAccountsWithBeneficiary: float = 0
    lifeInsuranceWithBeneficiary: float = 0
    jointTenancyRealEstate: float = 0
    trustAssets: float = 0


class TaxCalcInput(BaseModel):
    income: float = 0
    province: str = "ON"
    age: int = 0


@router.post("/plan/estate/analysis")
async def estate_analysis(body: EstateInput, user: dict = Depends(get_current_user)):
    return calculate_estate(body.model_dump())


@router.post("/plan/tax/calc")
async def tax_calc(body: TaxCalcInput, user: dict = Depends(get_current_user)):
    t = calc_combined_tax(body.income, body.province, body.age)
    t["marginalRate"] = round(get_marginal_rate(body.income, body.province), 4)
    t["afterTaxIncome"] = round(body.income - t["total_tax"])
    return t
