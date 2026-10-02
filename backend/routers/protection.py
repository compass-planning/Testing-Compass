"""Protection suite — life-insurance needs (DIME/HLV/Capital Retention), DI and LTC.
Read-only compute endpoints; available to all tiers."""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from deps import get_current_user
from engine.insurance import run_full_insurance_analysis, run_ltc_engine, run_di_engine

router = APIRouter()


class InsuranceInput(BaseModel):
    annualIncome: float = 90000
    personalConsumptionRate: float = 0.30
    workingYearsRemaining: int = 20
    mortgageBalance: float = 300000
    totalDebts: float = 40000
    educationFundTarget: float = 100000
    finalExpenses: float = 25000
    existingLifeCoverage: float = 250000
    existingAssets: float = 150000
    monthlyExpenses: float = 5000
    existingDisabilityCoverage: float = 0
    cppDisabilityBenefit: float = 0
    diReplacementRate: float = 0.70
    criticalIllnessLumpSum: float = 0
    existingCriticalIllnessCoverage: float = 0
    uncoveredTreatmentCosts: float = 50000
    discountRate: float = 0.04
    withdrawalRate: float = 0.04
    incomeVolatility: float = 0
    isVariableIncome: bool = False
    preferredMethod: str = "dime"


class LTCInput(BaseModel):
    currentAge: int = 55
    province: str = "ON"
    dailyBenefit: float = 200
    poolYears: int = 5
    eliminationDays: int = 90
    inflationProtection: str = "3pct"
    estAnnualPremium: float = 0
    careCostInflation: float = 0.04
    estClaimAge: int = 82
    careLevel: str = "semi_private"
    hybridLifeBenefit: Optional[float] = None
    hybridLtcPct: Optional[float] = None


class DIInput(BaseModel):
    currentAge: int = 40
    province: str = "ON"
    grossMonthlyIncome: float = 8000
    occupationClass: str = "3A"
    definition: str = "own_occ"
    waitingPeriodDays: int = 90
    benefitPeriod: str = "age65"
    groupDiMonthly: float = 0
    groupDiEmployerPaid: bool = True
    individualDiMonthly: float = 0
    cppDisabilityMonthly: float = 0
    partialDisabilityPct: float = 0.50
    colaPct: float = 0.02


@router.post("/plan/protection/life")
async def life_needs(body: InsuranceInput, user: dict = Depends(get_current_user)):
    d = body.model_dump()
    return run_full_insurance_analysis(d, d.get("preferredMethod", "dime"))


@router.post("/plan/protection/ltc")
async def ltc(body: LTCInput, user: dict = Depends(get_current_user)):
    return run_ltc_engine(body.model_dump())


@router.post("/plan/protection/di")
async def di(body: DIInput, user: dict = Depends(get_current_user)):
    return run_di_engine(body.model_dump())
