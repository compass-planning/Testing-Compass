"""Retirement suite — deterministic projection, Monte Carlo, guardrails,
CPP/OAS timing, RRSP-vs-TFSA, pension splitting, and saved scenarios.
All compute endpoints are read-only; scenarios respect tenant scope."""
from datetime import datetime, timezone
from typing import Optional, List, Union
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from repository import repo
from models import _id
from deps import get_current_user, planner_scope, _block_enterprise_write, audit

from engine.retirement_ca import run_canadian_projection
from engine.simulation import run_monte_carlo, apply_spending_flexibility, run_guardrail_check
from engine.optimizers import (optimize_withdrawals, cpp_timing_comparison, project_oas,
                               rrsp_vs_tfsa_decision, optimize_pension_split)

router = APIRouter()


# ── Request models ───────────────────────────────────────────────────────────
class ProjectionInput(BaseModel):
    current_age: int = 45
    retirement_age: int = 65
    life_expectancy: int = 95
    province: str = "ON"
    rrsp_balance: float = 0
    tfsa_balance: float = 0
    non_reg_balance: float = 0
    non_reg_tax_type: str = "mixed"
    non_reg_acb: float = 0
    annual_rrsp_contrib: float = 0
    annual_tfsa_contrib: float = 0
    desired_retirement_income: float = 0
    pension_annual: float = 0
    pension_start_age: int = 65
    pension_indexed: bool = False
    bridge_benefit_annual: float = 0
    bridge_benefit_end_age: int = 65
    cpp_monthly: float = 0
    cpp_start_age: int = 65
    oas_monthly: float = 0
    oas_start_age: int = 65
    expected_return_pct: float = 5.5
    inflation_pct: float = 2.1


class GoalEvent(BaseModel):
    yearOffset: int
    amount: float
    label: Optional[str] = None


class MonteCarloInput(BaseModel):
    initialBalance: float = 100000
    allocation: Union[str, dict] = "BALANCED"
    annualContribution: float = 0
    yearsToSimulate: int = 30
    numberOfPaths: int = Field(default=1000, ge=100, le=5000)
    inflationRate: Optional[float] = None
    goalEvents: Optional[List[GoalEvent]] = None
    seed: Optional[int] = None


class GuardrailInput(BaseModel):
    currentAge: int = 45
    retirementAge: int = 65
    lifeExpectancy: int = 95
    rrspBalance: float = 0
    tfsaBalance: float = 0
    nonRegBalance: float = 0
    annualIncome: float = 0
    rrspContribution: float = 0
    tfsaContribution: float = 0
    nonRegContribution: float = 0
    desiredRetirementIncome: float = 0
    pensionIncome: float = 0
    cppAmount: float = 0
    oasAmount: float = 0
    allocation: Optional[Union[str, dict]] = None
    floorPct: float = 0.80
    ceilingPct: float = 1.20
    flexDown: float = 0.10
    flexUp: float = 0.10
    numberOfPaths: int = Field(default=2000, ge=100, le=5000)
    seed: Optional[int] = None


class WithdrawalInput(BaseModel):
    age: int = 72
    rrspRrifBalance: float = 0
    tfsaBalance: float = 0
    nonRegBalance: float = 0
    desiredIncome: float = 0
    cppAnnual: float = 0
    oasAnnual: float = 0
    pensionIncome: float = 0
    province: str = "ON"
    rrifConversionAge: int = 71


class CppTimingInput(BaseModel):
    maxMonthly: Optional[float] = None
    totalIncome: float = 60000
    yearsInCanada: int = 40


class RrspTfsaInput(BaseModel):
    currentIncome: float = 90000
    expectedRetirementIncome: float = 50000
    province: str = "ON"


class PensionSplitInput(BaseModel):
    selfIncome: float = 90000
    eligiblePensionIncome: float = 30000
    spouseIncome: float = 40000
    province: str = "ON"


class ScenarioInput(BaseModel):
    name: str
    inputs: dict
    summary: Optional[dict] = None


# ── Compute endpoints (read-only; all tiers) ─────────────────────────────────
@router.post("/plan/retirement/projection")
async def projection(body: ProjectionInput, user: dict = Depends(get_current_user)):
    return run_canadian_projection(body.model_dump())


@router.post("/plan/retirement/montecarlo")
async def montecarlo(body: MonteCarloInput, user: dict = Depends(get_current_user)):
    params = body.model_dump()
    if params.get("goalEvents"):
        params["goalEvents"] = [g for g in params["goalEvents"]]
    res = run_monte_carlo(params)
    res.pop("paths", None)  # keep payload small
    return res


@router.post("/plan/retirement/guardrails")
async def guardrails(body: GuardrailInput, user: dict = Depends(get_current_user)):
    res = run_guardrail_check(body.model_dump())
    ret_paths = res.pop("_retPaths")
    ret_median = res.pop("_retMedian")
    flex = apply_spending_flexibility(
        ret_paths, ret_median, res["requiredWithdrawal"], 0,
        {"floorPct": body.floorPct, "ceilingPct": body.ceilingPct,
         "flexDown": body.flexDown, "flexUp": body.flexUp},
        body.retirementAge, inflation_rate=0.02,
    )
    res["flexibility"] = flex
    return res


@router.post("/plan/retirement/withdrawals")
async def withdrawals(body: WithdrawalInput, user: dict = Depends(get_current_user)):
    b = body.model_dump()
    return optimize_withdrawals(
        b["age"],
        {"rrspRrifBalance": b["rrspRrifBalance"], "tfsaBalance": b["tfsaBalance"], "nonRegBalance": b["nonRegBalance"]},
        b["desiredIncome"], b["cppAnnual"], b["oasAnnual"], b["pensionIncome"], b["province"], b["rrifConversionAge"],
    )


@router.post("/plan/retirement/cpp-timing")
async def cpp_timing(body: CppTimingInput, user: dict = Depends(get_current_user)):
    cpp = cpp_timing_comparison(body.maxMonthly)
    oas = {str(a): project_oas(a, body.totalIncome, body.yearsInCanada) for a in (65, 66, 67, 68, 69, 70)}
    return {"cpp": cpp, "oas": oas}


@router.post("/plan/retirement/rrsp-vs-tfsa")
async def rrsp_vs_tfsa(body: RrspTfsaInput, user: dict = Depends(get_current_user)):
    return rrsp_vs_tfsa_decision(body.currentIncome, body.expectedRetirementIncome, body.province)


@router.post("/plan/retirement/pension-split")
async def pension_split(body: PensionSplitInput, user: dict = Depends(get_current_user)):
    return optimize_pension_split(body.selfIncome, body.eligiblePensionIncome, body.spouseIncome, body.province)


# ── Saved scenarios (tenant-scoped) ──────────────────────────────────────────
@router.get("/plan/retirement/scenarios")
async def list_scenarios(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rows = repo.list(store, "plan_scenarios", read)
    if hid:
        rows = [r for r in rows if r.get("household_id") == hid]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return rows


@router.post("/plan/retirement/scenarios")
async def save_scenario(body: ScenarioInput, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, read, ws, hid = planner_scope(user, household_id)
    if user["tier"] == "advisor" and not hid:
        raise HTTPException(status_code=400, detail="Open a household before saving a scenario")
    rec = {"id": _id(), "store": store, "scope": ws, "household_id": hid,
           "name": body.name, "inputs": body.inputs, "summary": body.summary or {},
           "created_at": datetime.now(timezone.utc).isoformat()}
    repo.create(store, "plan_scenarios", rec)
    audit(user, "retirement.scenario.save", "plan_scenarios", body.name)
    return rec


@router.delete("/plan/retirement/scenarios/{sid}")
async def delete_scenario(sid: str, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, read, _, hid = planner_scope(user, household_id)
    if not repo.delete(store, "plan_scenarios", sid, read):
        raise HTTPException(status_code=404, detail="Scenario not found")
    audit(user, "retirement.scenario.delete", "plan_scenarios", sid)
    return {"ok": True}
