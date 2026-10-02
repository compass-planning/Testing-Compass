"""RESP (Registered Education Savings Plan) projection with CESG + CLB grant modelling.

Standard rules (2024):
- CESG: 20% match on contributions, up to $500/year (on the first $2,500 contributed),
  lifetime maximum $7,200 per beneficiary. Paid until the end of the year the child turns 17.
- CLB (Canada Learning Bond): income-tested, requires NO contribution. $500 in the first
  eligible year + $100/year up to and including age 15, lifetime maximum $2,000.
Illustrative only — not financial advice.
"""
from __future__ import annotations

CESG_RATE = 0.20
CESG_ANNUAL_MAX = 500.0
CESG_CONTRIB_FOR_MAX = 2500.0
CESG_LIFETIME_MAX = 7200.0
CLB_FIRST_YEAR = 500.0
CLB_PER_YEAR = 100.0
CLB_LIFETIME_MAX = 2000.0
CLB_INCOME_THRESHOLD = 55867.0  # 1-3 children (2024 adjusted-income cutoff, approx)
MATURITY_AGE = 17
DEFAULT_TUITION = 80000.0  # 4-year CDN undergrad incl. living, rough


def _clb_eligible(family_income: float) -> bool:
    return float(family_income or 0) <= CLB_INCOME_THRESHOLD


def project_resp(child_age=0, current_savings=0.0, monthly_contribution=0.0,
                 growth_pct=5.0, family_income=90000.0, tuition_goal=DEFAULT_TUITION,
                 prior_cesg=0.0, prior_clb=0.0):
    child_age = max(0, min(int(child_age), MATURITY_AGE))
    annual_contribution = max(0.0, float(monthly_contribution or 0)) * 12
    g = max(0.0, float(growth_pct or 0)) / 100
    balance = max(0.0, float(current_savings or 0))
    cesg_cum = max(0.0, float(prior_cesg or 0))
    clb_cum = max(0.0, float(prior_clb or 0))
    clb_ok = _clb_eligible(family_income)

    total_contrib = 0.0
    total_cesg = 0.0
    total_clb = 0.0
    year_by_year = []

    for age in range(child_age, MATURITY_AGE + 1):
        # CESG on this year's contribution (basic grant, no carry-forward modelled)
        cesg = CESG_RATE * min(annual_contribution, CESG_CONTRIB_FOR_MAX)
        cesg = min(cesg, CESG_ANNUAL_MAX, max(0.0, CESG_LIFETIME_MAX - cesg_cum))

        # CLB (no contribution required), paid through age 15
        clb = 0.0
        if clb_ok and age <= 15 and clb_cum < CLB_LIFETIME_MAX:
            clb = CLB_FIRST_YEAR if (age == child_age and clb_cum == 0 and prior_clb == 0) else CLB_PER_YEAR
            clb = min(clb, max(0.0, CLB_LIFETIME_MAX - clb_cum))

        inflow = annual_contribution + cesg + clb
        balance = (balance + inflow) * (1 + g)
        cesg_cum += cesg
        clb_cum += clb
        total_contrib += annual_contribution
        total_cesg += cesg
        total_clb += clb
        year_by_year.append({
            "age": age,
            "contribution": round(annual_contribution),
            "cesg": round(cesg),
            "clb": round(clb),
            "balance": round(balance),
        })

    projected = round(balance)
    total_grants = round(total_cesg + total_clb)
    coverage = round(min(100, projected / tuition_goal * 100)) if tuition_goal else 0
    return {
        "summary": {
            "projectedValue": projected,
            "totalContributions": round(total_contrib),
            "totalCESG": round(total_cesg),
            "totalCLB": round(total_clb),
            "totalGrants": total_grants,
            "clbEligible": clb_ok,
            "tuitionGoal": round(float(tuition_goal or 0)),
            "coveragePct": coverage,
            "shortfall": round(max(0.0, float(tuition_goal or 0) - projected)),
            "yearsToMaturity": MATURITY_AGE - child_age,
        },
        "yearByYear": year_by_year,
    }
