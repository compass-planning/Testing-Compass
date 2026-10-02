"""RRIF/withdrawal optimizer, CPP/OAS timing, RRSP-vs-TFSA, pension splitting.
Ported from engine/retirement/{rrifOptimizer,taxCalculator}.ts and engine/reference/cppOas.ts."""
from __future__ import annotations
from .reference import (rrif_factor, oas_clawback, capital_gains_taxable,
                        calc_combined_tax, get_marginal_rate, get_benefit_rate)


def optimize_withdrawals(age, balances, desired_income, cpp_annual, oas_annual,
                         pension_income, province, rrif_conversion_age=71) -> dict:
    is_rrif_age = age >= rrif_conversion_age
    factor = rrif_factor(age) if is_rrif_age else 0.0
    mandatory_min = balances["rrspRrifBalance"] * factor

    guaranteed = cpp_annual + oas_annual + pension_income
    needed = max(0.0, desired_income - guaranteed)

    rrif_w = mandatory_min
    tfsa_w = non_reg_w = 0.0
    remaining = max(0.0, needed - rrif_w)

    clawback_mandatory = oas_clawback(guaranteed + mandatory_min, oas_annual)
    if remaining > 0:
        tfsa_w = min(remaining, balances["tfsaBalance"])
        remaining -= tfsa_w
    if remaining > 0:
        non_reg_w = min(remaining, balances["nonRegBalance"])
        remaining -= non_reg_w
    if remaining > 0:
        extra = min(remaining, max(0.0, balances["rrspRrifBalance"] - rrif_w))
        rrif_w += extra
        remaining -= extra

    rrif_w = min(rrif_w, balances["rrspRrifBalance"])
    tfsa_w = min(tfsa_w, balances["tfsaBalance"])
    non_reg_w = min(non_reg_w, balances["nonRegBalance"])

    total = rrif_w + tfsa_w + non_reg_w
    cap_gain_incl = capital_gains_taxable(non_reg_w)
    taxable = guaranteed + rrif_w + cap_gain_incl
    return {
        "rrifWithdrawal": round(rrif_w), "tfsaWithdrawal": round(tfsa_w),
        "nonRegWithdrawal": round(non_reg_w), "totalWithdrawal": round(total),
        "taxableIncome": round(taxable), "oasClawback": round(oas_clawback(taxable, oas_annual)),
        "mandatoryRrifMin": round(mandatory_min), "capitalGainInclusion": round(cap_gain_incl),
        "clawbackTriggered": clawback_mandatory > 0,
    }


def project_cpp(start_age, max_monthly=None) -> dict:
    cpp_max = max_monthly if max_monthly is not None else get_benefit_rate("cpp_max_monthly")
    clamped = max(60, min(70, start_age))
    if clamped < 65:
        months = (65 - clamped) * 12
        factor = 1 - months * 0.006
        label = f"{months * 0.6:.1f}% reduction"
    elif clamped > 65:
        months = (clamped - 65) * 12
        factor = 1 + months * 0.007
        label = f"{months * 0.7:.1f}% increase"
    else:
        factor, label = 1.0, "standard (no adjustment)"
    monthly = cpp_max * factor
    return {"startAge": clamped, "monthlyBenefit": round(monthly, 2), "annualBenefit": round(monthly * 12),
            "adjustmentFactor": round(factor, 4), "adjustmentLabel": label}


def _break_even(early_age, early_annual, late_age, late_annual) -> int:
    early_cum = late_cum = 0.0
    for age in range(early_age, 101):
        early_cum += early_annual
        if age >= late_age:
            late_cum += late_annual
            if late_cum > early_cum:
                return age
    return 100


def cpp_timing_comparison(max_monthly=None) -> dict:
    at60, at65, at70 = project_cpp(60, max_monthly), project_cpp(65, max_monthly), project_cpp(70, max_monthly)
    return {"at60": at60, "at65": at65, "at70": at70,
            "breakEven60vs65": _break_even(60, at60["annualBenefit"], 65, at65["annualBenefit"]),
            "breakEven65vs70": _break_even(65, at65["annualBenefit"], 70, at70["annualBenefit"])}


def project_oas(start_age, total_income, years_in_canada=40, max_monthly=None) -> dict:
    oas_max = max_monthly if max_monthly is not None else get_benefit_rate("oas_max_monthly")
    clamped = max(65, min(70, start_age))
    residency = min(years_in_canada / 40, 1)
    base = oas_max * residency
    deferral = ((clamped - 65) * 12 * 0.006) if clamped > 65 else 0.0
    monthly = base * (1 + deferral)
    annual = monthly * 12
    clawback = oas_clawback(total_income, annual)
    return {"startAge": clamped, "monthlyBenefit": round(monthly, 2), "annualBenefit": round(annual),
            "deferralIncrease": round(deferral, 4), "clawbackAmount": round(clawback),
            "netAnnualBenefit": round(annual - clawback)}


def rrsp_vs_tfsa_decision(current_income, expected_retirement_income, province) -> dict:
    current_rate = get_marginal_rate(current_income, province)
    retirement_rate = get_marginal_rate(expected_retirement_income, province)
    diff = current_rate - retirement_rate
    if diff > 0.05:
        rec = "rrsp"
        rationale = (f"Current marginal rate ({current_rate*100:.1f}%) is higher than projected retirement rate "
                     f"({retirement_rate*100:.1f}%). RRSP contributions provide greater tax benefit now.")
    elif diff < -0.05:
        rec = "tfsa"
        rationale = (f"Projected retirement rate ({retirement_rate*100:.1f}%) is higher than current rate "
                     f"({current_rate*100:.1f}%). TFSA avoids tax on withdrawals in retirement.")
    else:
        rec = "balanced"
        rationale = (f"Marginal rates are similar (current {current_rate*100:.1f}% vs retirement "
                     f"{retirement_rate*100:.1f}%). Split between RRSP and TFSA for flexibility.")
    return {"recommendation": rec, "currentMarginalRate": round(current_rate, 4),
            "projectedRetirementRate": round(retirement_rate, 4), "rationale": rationale}


def optimize_pension_split(self_income, eligible_pension_income, spouse_income, province, max_split=0.5) -> dict:
    no_split = calc_combined_tax(self_income, province)["total_tax"] + calc_combined_tax(spouse_income, province)["total_tax"]
    best_split, best_combined = 0.0, no_split
    pct = 0.05
    while pct <= max_split + 1e-9:
        transferred = eligible_pension_income * pct
        s = calc_combined_tax(self_income - transferred, province)["total_tax"]
        sp = calc_combined_tax(spouse_income + transferred, province)["total_tax"]
        if s + sp < best_combined:
            best_combined, best_split = s + sp, pct
        pct += 0.05
    transferred = eligible_pension_income * best_split
    self_tax = calc_combined_tax(self_income - transferred, province)["total_tax"]
    spouse_tax = calc_combined_tax(spouse_income + transferred, province)["total_tax"]
    return {"bestSplitPct": round(best_split, 2), "selfTaxableIncome": round(self_income - transferred),
            "spouseTaxableIncome": round(spouse_income + transferred), "selfTax": round(self_tax),
            "spouseTax": round(spouse_tax), "combinedTax": round(self_tax + spouse_tax),
            "taxSavings": round(no_split - (self_tax + spouse_tax))}
