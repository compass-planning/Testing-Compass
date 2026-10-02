"""Protection engines — life-insurance needs (DIME / Human Life Value / Capital
Retention), DI gap, CI gap, plus LTC and DI planning. Ported from the original
engine/insurance/*, ltcEngine.ts, diEngine.ts."""
from __future__ import annotations

# ── Life insurance needs ─────────────────────────────────────────────────────
def protection_score(rows: list) -> dict:
    """Protection readiness 0-100 from saved life/DI/LTC analyses (None if none saved).
    Single source of truth used by both the advisor roster and the plan PDF."""
    if not rows:
        return {"protection_score": None, "protection_analyses": 0}
    present = {r.get("kind") for r in rows}
    score = 100
    for kind in ("life", "di", "ltc"):
        gapv = next((r.get("life_gap") if kind == "life" else r.get("di_monthly_gap") if kind == "di"
                     else r.get("ltc_gap") for r in rows if r.get("kind") == kind), None)
        score -= 15 if kind not in present else (20 if (gapv or 0) > 0 else 0)
    return {"protection_score": max(0, min(100, score)), "protection_analyses": len(rows)}


def calculate_dime(p: dict) -> dict:
    debt = p["totalDebts"]
    income = p["annualIncome"] * p["workingYearsRemaining"]
    mortgage = p["mortgageBalance"]
    education = p["educationFundTarget"]
    final_exp = p["finalExpenses"]
    total = debt + income + mortgage + education + final_exp
    existing = p["existingLifeCoverage"] + p["existingAssets"]
    return {"method": "dime", "totalNeed": round(total), "existingCoverage": round(existing),
            "gap": round(max(0, total - existing)),
            "breakdown": {"debt": debt, "incomeReplacement": income, "mortgage": mortgage,
                          "education": education, "finalExpenses": final_exp}}


def calculate_human_life_value(p: dict) -> dict:
    annual = p["annualIncome"] * (1 - p["personalConsumptionRate"])
    rate, years = p["discountRate"], p["workingYearsRemaining"]
    pv = sum(annual / ((1 + rate) ** y) for y in range(1, years + 1))
    existing = p["existingLifeCoverage"] + p["existingAssets"]
    return {"method": "humanLifeValue", "totalNeed": round(pv), "existingCoverage": round(existing),
            "gap": round(max(0, pv - existing)),
            "breakdown": {"annualEconomicValue": round(annual), "discountRate": rate,
                          "workingYears": years, "presentValue": round(pv)}}


def calculate_capital_retention(p: dict) -> dict:
    annual = p["annualIncome"] * (1 - p["personalConsumptionRate"])
    total = annual / p["withdrawalRate"] if p["withdrawalRate"] else 0
    existing = p["existingLifeCoverage"] + p["existingAssets"]
    return {"method": "capitalRetention", "totalNeed": round(total), "existingCoverage": round(existing),
            "gap": round(max(0, total - existing)),
            "breakdown": {"annualShortfall": round(annual), "withdrawalRate": p["withdrawalRate"],
                          "capitalRequired": round(total)}}


def calculate_di_gap(p: dict) -> dict:
    monthly = p["annualIncome"] / 12
    target = monthly * p["diReplacementRate"]
    gap = max(0, target - p["existingDisabilityCoverage"] - p["cppDisabilityBenefit"])
    return {"monthlyGrossIncome": round(monthly), "targetReplacement": round(target),
            "existingDiBenefit": p["existingDisabilityCoverage"], "cppDisabilityOffset": p["cppDisabilityBenefit"],
            "monthlyGap": round(gap), "annualGap": round(gap * 12)}


def calculate_ci_gap(p: dict) -> dict:
    income_rep = p["annualIncome"] * 1.5
    total = p["mortgageBalance"] + income_rep + p["uncoveredTreatmentCosts"]
    gap = max(0, total - p["existingCriticalIllnessCoverage"])
    return {"mortgageBalance": p["mortgageBalance"], "incomeReplacement": round(income_rep),
            "uncoveredTreatment": p["uncoveredTreatmentCosts"], "totalNeed": round(total),
            "existingCoverage": p["existingCriticalIllnessCoverage"], "gap": round(gap)}


def run_full_insurance_analysis(p: dict, preferred: str = "dime") -> dict:
    dime = calculate_dime(p)
    hlv = calculate_human_life_value(p)
    cr = calculate_capital_retention(p)
    selected = hlv if preferred == "humanLifeValue" else cr if preferred == "capitalRetention" else dime
    return {"dime": dime, "humanLifeValue": hlv, "capitalRetention": cr,
            "diGap": calculate_di_gap(p), "ciGap": calculate_ci_gap(p),
            "selectedMethod": preferred, "recommendedLifeCoverage": selected["totalNeed"],
            "lifeCoverageGap": selected["gap"]}


# ── Long-term care ───────────────────────────────────────────────────────────
PROVINCIAL_DAILY_COSTS = {
    "ON": {"basic": 185, "semi_private": 240, "private": 325}, "QC": {"basic": 95, "semi_private": 165, "private": 250},
    "BC": {"basic": 195, "semi_private": 260, "private": 360}, "AB": {"basic": 175, "semi_private": 230, "private": 310},
    "SK": {"basic": 155, "semi_private": 205, "private": 285}, "MB": {"basic": 160, "semi_private": 215, "private": 295},
    "NB": {"basic": 140, "semi_private": 190, "private": 265}, "NS": {"basic": 145, "semi_private": 195, "private": 270},
    "NL": {"basic": 135, "semi_private": 185, "private": 255}, "PE": {"basic": 130, "semi_private": 175, "private": 245},
    "NT": {"basic": 200, "semi_private": 265, "private": 375}, "NU": {"basic": 200, "semi_private": 265, "private": 375},
    "YT": {"basic": 190, "semi_private": 255, "private": 355},
}


def _prov_cost(prov, level):
    return PROVINCIAL_DAILY_COSTS.get(prov.upper(), PROVINCIAL_DAILY_COSTS["ON"])[level]


def _npv(annual, start_year, duration, rate=0.04):
    return round(sum(annual / ((1 + rate) ** (start_year + i)) for i in range(duration)))


def run_ltc_engine(inp: dict) -> dict:
    age = inp["currentAge"]
    prov = inp["province"]
    daily = inp["dailyBenefit"]
    pool_years = inp["poolYears"]
    elim = inp["eliminationDays"]
    protection = inp.get("inflationProtection", "none")
    care_infl = inp.get("careCostInflation", 0.04)
    claim_age = inp["estClaimAge"]
    level = inp.get("careLevel", "semi_private")

    yrs_to_claim = max(0, claim_age - age)
    rider_mult = {"3pct": 1.03, "5pct": 1.05, "cpi": 1.02, "none": 1.0}.get(protection, 1.0) ** yrs_to_claim
    pool_dollars = round(daily * pool_years * 365)
    daily_at_claim = round(daily * rider_mult)
    pool_dur = {
        "atFullRate": round(pool_dollars / (daily_at_claim * 365), 1),
        "at80pctRate": round(pool_dollars / (daily_at_claim * 0.80 * 365), 1),
        "at60pctRate": round(pool_dollars / (daily_at_claim * 0.60 * 365), 1),
    }
    daily_cost_at_claim = round(_prov_cost(prov, level) * ((1 + care_infl) ** yrs_to_claim))
    elim_cost = round(daily_cost_at_claim * elim)
    rider_value = round((daily_at_claim - daily) * pool_years * 365)

    annual_cost_at_claim = daily_cost_at_claim * 365
    npv_pool = _npv(annual_cost_at_claim, yrs_to_claim, pool_years)
    annual_prem = inp.get("estAnnualPremium") or _estimate_ltc_premium(inp)
    recommended = _prov_cost(prov, level)
    break_even_age = min(95, round(age + npv_pool / annual_prem)) if annual_prem > 0 and npv_pool > 0 else 999
    return {
        "totalPoolDollars": pool_dollars, "dailyBenefitAtClaim": daily_at_claim, "poolDuration": pool_dur,
        "eliminationCost": elim_cost, "riderValueAdd": rider_value,
        "selfInsure": {"selectedLevelCost": daily_cost_at_claim, "totalCareCostAtClaim": annual_cost_at_claim,
                       "npvTodayAtPool": npv_pool},
        "totalPremiumsToClaimAge": round(annual_prem * yrs_to_claim),
        "totalPremiumsToLife": round(annual_prem * max(0, 90 - age)),
        "estAnnualPremium": round(annual_prem),
        "breakEvenAge": break_even_age, "breakEvenYears": max(0, break_even_age - age) if break_even_age < 999 else 999,
        "provincialDailyCost": recommended, "adequacyGap": max(0, recommended - daily),
    }


def _estimate_ltc_premium(inp: dict) -> float:
    age = inp["currentAge"]
    base = 3.50 if age < 50 else 4.80 if age < 55 else 7.20 if age < 60 else 11.50 if age < 65 else 18.00 if age < 70 else 28.00
    prem = inp["dailyBenefit"] * base
    py = inp["poolYears"]
    if py == 3:
        prem *= 0.75
    elif py == 10:
        prem *= 1.45
    elim = inp["eliminationDays"]
    if elim >= 180:
        prem *= 0.82
    elif elim >= 90:
        prem *= 0.92
    elif elim <= 30:
        prem *= 1.12
    ip = inp.get("inflationProtection", "none")
    prem *= {"5pct": 1.35, "3pct": 1.18, "cpi": 1.10}.get(ip, 1.0)
    return round(prem)


# ── Disability income ────────────────────────────────────────────────────────
OCC_DATA = {
    "4A": {"ownOccProb": 0.32, "anyOccProb": 0.12, "typical": "Physicians, dentists, lawyers, accountants"},
    "3A": {"ownOccProb": 0.35, "anyOccProb": 0.15, "typical": "Financial advisors, engineers, managers"},
    "2A": {"ownOccProb": 0.38, "anyOccProb": 0.18, "typical": "Teachers, nurses, office supervisors"},
    "A": {"ownOccProb": 0.44, "anyOccProb": 0.24, "typical": "Skilled trades, technicians, mechanics"},
    "B": {"ownOccProb": 0.52, "anyOccProb": 0.32, "typical": "Heavy labour, construction, manual workers"},
}
DI_MTR = {"AB": 0.30, "BC": 0.33, "MB": 0.37, "NB": 0.35, "NL": 0.35, "NS": 0.37, "NT": 0.29,
          "NU": 0.29, "ON": 0.33, "PE": 0.35, "QC": 0.40, "SK": 0.33, "YT": 0.30}


def _bp_years(period, age):
    return {"2yr": 2, "5yr": 5, "10yr": 10}.get(period) or (max(1, 65 - age) if period == "age65" else max(1, 70 - age) if period == "age70" else 5)


def run_di_engine(inp: dict) -> dict:
    gross = inp["grossMonthlyIncome"]
    prov = inp["province"]
    mtr = DI_MTR.get(prov.upper(), 0.33)
    target = round(gross * 0.70)
    target_high = round(gross * 0.85)
    group_after = round(inp["groupDiMonthly"] * (1 - mtr)) if inp.get("groupDiEmployerPaid") else inp["groupDiMonthly"]
    cppd_after = round(inp.get("cppDisabilityMonthly", 0) * (1 - mtr))
    total_after = group_after + inp.get("individualDiMonthly", 0) + cppd_after
    gap = max(0, target - total_after)
    ratio = round(total_after / gross * 100) if gross > 0 else 0
    occ = OCC_DATA.get(inp.get("occupationClass", "3A"), OCC_DATA["3A"])
    defn = inp.get("definition", "own_occ")
    own_vs_any = 0 if defn == "own_occ" else round(gross * (occ["ownOccProb"] - occ["anyOccProb"]) * 12)
    bp = _bp_years(inp.get("benefitPeriod", "age65"), inp["currentAge"])
    cola = inp.get("colaPct", 0.02)
    partial_pct = inp.get("partialDisabilityPct", 0.50)
    trigger = round(gross * partial_pct)
    group_m = inp["groupDiMonthly"]
    if group_m > 0 and inp.get("groupDiEmployerPaid") and inp.get("individualDiMonthly", 0) == 0:
        rec = (f"Group DI of ${group_m:,.0f}/mo is fully taxable on claim (employer-paid). After {round(mtr*100)}% tax "
               f"the net is ${group_after:,.0f}/mo. Individual DI is recommended to fill this gap tax-free.")
    elif inp.get("individualDiMonthly", 0) > 0 and group_m == 0:
        rec = "Individual DI is tax-free on claim (personally-paid premiums) — full value with no tax erosion."
    elif group_m > 0 and not inp.get("groupDiEmployerPaid"):
        rec = "Group DI premiums are employee-paid, so the benefit is tax-free on claim — the most favourable arrangement."
    else:
        rec = f"Confirm whether group DI premiums are employer- or employee-paid; this determines taxability (up to {round(mtr*100)}% erosion in {prov})."
    return {
        "grossMonthlyIncome": gross, "targetMonthlyBenefit": target, "targetMonthlyBenefitHigh": target_high,
        "existing": {"groupGross": group_m, "groupAfterTax": group_after, "individual": inp.get("individualDiMonthly", 0),
                     "cppDisability": cppd_after, "totalAfterTax": total_after},
        "coverageGap": gap, "coverageGapHigh": max(0, target_high - total_after),
        "replacementRatio": ratio, "replacementRatioTarget": 70, "isAdequate": ratio >= 70,
        "waitingPeriodCost": round(gross * (inp.get("waitingPeriodDays", 90) / 30)),
        "emergencyFundMonths": -(-inp.get("waitingPeriodDays", 90) // 30) + 1,
        "claimProbability": {"ownOcc": occ["ownOccProb"], "anyOcc": occ["anyOccProb"], "ownVsAnyGap": own_vs_any,
                             "typical": occ["typical"]},
        "maxBenefit": {"totalAtTarget": round(gap * 12 * bp), "yearsOfCoverage": bp},
        "cola": {"benefitAtYear5": round(gap * ((1 + cola) ** 5)), "benefitAtYear10": round(gap * ((1 + cola) ** 10))},
        "partialDisability": {"triggerIncomeThreshold": trigger,
                              "partialBenefit": round(((gross - trigger) / gross) * gap) if gross else 0},
        "taxTreatment": {"groupTaxable": group_m > 0 and bool(inp.get("groupDiEmployerPaid")),
                         "groupEffectiveRate": mtr, "individualTaxFree": True, "recommendation": rec},
    }
