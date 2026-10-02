"""Deterministic Canadian retirement projection engine.
Ported from the original canadianRetirementEngine.ts (runCanadianProjection)."""
from __future__ import annotations
import datetime
from .reference import rrif_factor, cpp_factor, oas_factor, calc_tax, oas_clawback

NON_REG_TYPES = {"capital_gains", "interest", "mutual_fund", "insurance_annuity", "mixed"}


def _non_reg_taxable(growth: float, withdrawal: float, balance: float, acb: float, tax_type: str):
    if tax_type == "capital_gains":
        if withdrawal <= 0 or balance <= 0:
            return 0.0, acb
        gain_ratio = max(0.0, balance - acb) / balance
        taxable = withdrawal * gain_ratio * 0.5
        new_acb = acb * (1 - withdrawal / balance)
        return round(taxable), round(max(0.0, new_acb))
    if tax_type in ("interest", "mutual_fund"):
        return round(max(0.0, growth)), acb
    if tax_type == "insurance_annuity":
        return round(max(0.0, growth) * 0.50), acb
    # mixed: 60% interest, 40% capital-gains treatment
    interest_taxable = growth * 0.60
    if withdrawal > 0 and balance > 0:
        gain_ratio = max(0.0, balance - acb) / balance
        cap_gain_tax = withdrawal * gain_ratio * 0.4 * 0.5
        new_acb = acb * (1 - withdrawal / balance)
        return round(interest_taxable + cap_gain_tax), round(max(0.0, new_acb))
    return round(interest_taxable), acb


def run_canadian_projection(inp: dict) -> dict:
    current_age = int(inp["current_age"])
    retirement_age = int(inp["retirement_age"])
    life_expectancy = int(inp["life_expectancy"])
    province = inp.get("province", "ON")

    rrsp = float(inp.get("rrsp_balance", 0))
    tfsa = float(inp.get("tfsa_balance", 0))
    non_reg = float(inp.get("non_reg_balance", 0))
    non_reg_tax_type = inp.get("non_reg_tax_type", "mixed")
    acb = float(inp.get("non_reg_acb", 0))

    annual_rrsp = float(inp.get("annual_rrsp_contrib", 0))
    annual_tfsa = float(inp.get("annual_tfsa_contrib", 0))

    desired = float(inp.get("desired_retirement_income", 0))
    pension_annual = float(inp.get("pension_annual", 0))
    pension_start = int(inp.get("pension_start_age", retirement_age))
    pension_indexed = bool(inp.get("pension_indexed", False))
    bridge_annual = float(inp.get("bridge_benefit_annual", 0))
    bridge_end_age = int(inp.get("bridge_benefit_end_age", 65))

    cpp_monthly = float(inp.get("cpp_monthly", 0))
    cpp_start = int(inp.get("cpp_start_age", 65))
    oas_monthly = float(inp.get("oas_monthly", 0))
    oas_start = int(inp.get("oas_start_age", 65))

    rate = float(inp.get("expected_return_pct", 5.5)) / 100
    infl = float(inp.get("inflation_pct", 2.1)) / 100

    current_year = datetime.date.today().year
    cpp_adj_annual = cpp_monthly * cpp_factor(cpp_start) * 12
    oas_adj_annual = oas_monthly * oas_factor(oas_start) * 12

    is_rrif = False
    year_by_year = []
    lifetime_tax = 0.0
    retire_portfolio = rrsp_at_ret = tfsa_at_ret = nonreg_at_ret = 0
    surplus_at_ret = funding_at_ret = 0
    tax_in_ret = retire_year_count = 0
    rrif_start_bal = rrif_min_y1 = 0
    cpp_at_ret = oas_at_ret = guaranteed_at_ret = 0

    for yr in range(0, life_expectancy - current_age + 1):
        age = current_age + yr
        year = current_year + yr
        nominal_mult = (1 + infl) ** yr
        is_retired = age >= retirement_age
        phase = "accumulation" if not is_retired else ("early_retirement" if age < 71 else "rrif")

        if age == 71 and not is_rrif:
            is_rrif = True
            rrif_start_bal = round(rrsp)
            rrif_min_y1 = round(rrsp * rrif_factor(71))

        cpp_nom = cpp_adj_annual * nominal_mult if age >= cpp_start else 0.0
        oas_nom_gross = oas_adj_annual * nominal_mult if age >= oas_start else 0.0
        pension_nom = (pension_annual * (nominal_mult if pension_indexed else 1)) if age >= pension_start else 0.0
        bridge_nom = (bridge_annual * nominal_mult) if (age < bridge_end_age and bridge_annual > 0) else 0.0

        rrif_min = rrif_extra = tfsa_draw = non_reg_draw = 0.0
        desired_nom = desired * nominal_mult if is_retired else 0.0

        if is_retired:
            if is_rrif:
                rrif_min = min(rrsp, rrsp * rrif_factor(age))
            guaranteed_nom = cpp_nom + oas_nom_gross + pension_nom + bridge_nom + rrif_min
            approx_eff = 0.28 if province == "QC" else 0.22
            desired_gross = desired_nom / (1 - approx_eff)
            portfolio_needed = max(0.0, desired_gross - guaranteed_nom)

            if portfolio_needed > 0:
                tfsa_draw = min(max(0.0, tfsa), portfolio_needed)
                remaining = portfolio_needed - tfsa_draw
                non_reg_draw = min(max(0.0, non_reg), remaining)
                remaining -= non_reg_draw
                if remaining > 0 and not is_rrif and rrsp > 0:
                    rrif_extra = min(rrsp, remaining)
                if remaining > 0 and is_rrif and rrsp > rrif_min:
                    rrif_extra = min(rrsp - rrif_min, remaining)
            elif rrif_min > desired_gross and tfsa >= 0:
                excess = min(7000, rrif_min - desired_gross)
                tfsa = tfsa + excess

        non_reg_growth = non_reg * rate
        non_reg_tax_inc, acb = _non_reg_taxable(non_reg_growth, non_reg_draw, non_reg, acb, non_reg_tax_type)

        rrif_total = rrif_min + rrif_extra
        taxable_inc = cpp_nom + oas_nom_gross + pension_nom + bridge_nom + rrif_total + non_reg_tax_inc
        clawback = oas_clawback(taxable_inc, oas_nom_gross) if is_retired else 0.0
        net_income_tax = max(0.0, taxable_inc - clawback)
        tax = calc_tax(net_income_tax, age, province)
        total_tax = tax["total"]
        net_income = max(0.0, cpp_nom + (oas_nom_gross - clawback) + pension_nom + bridge_nom
                         + rrif_total + tfsa_draw + non_reg_draw - total_tax)

        surplus = round(net_income - desired_nom) if is_retired else 0
        funding = min(200, round((net_income / desired_nom) * 100)) if (is_retired and desired_nom > 0) else 0

        rrsp_before, tfsa_before, non_reg_before = rrsp, tfsa, non_reg
        if not is_retired:
            rrsp = (rrsp + annual_rrsp) * (1 + rate)
            tfsa = (tfsa + annual_tfsa) * (1 + rate)
            non_reg = non_reg * (1 + rate)
        else:
            rrsp = max(0.0, rrsp - rrif_total) * (1 + rate)
            tfsa = max(0.0, tfsa - tfsa_draw) * (1 + rate)
            non_reg = max(0.0, non_reg - non_reg_draw) * (1 + rate)

        total_portfolio = round(rrsp + tfsa + non_reg)
        lifetime_tax += total_tax

        if age == retirement_age:
            rrsp_at_ret = round(rrsp_before)
            tfsa_at_ret = round(tfsa_before)
            nonreg_at_ret = round(non_reg_before)
            retire_portfolio = rrsp_at_ret + tfsa_at_ret + nonreg_at_ret
            surplus_at_ret = surplus
            funding_at_ret = funding
            cpp_at_ret = round(cpp_nom)
            oas_at_ret = round(oas_nom_gross - clawback)
            guaranteed_at_ret = round(cpp_nom + (oas_nom_gross - clawback) + pension_nom + bridge_nom)
        if is_retired and cpp_nom > 0 and oas_nom_gross > 0 and guaranteed_at_ret == 0:
            guaranteed_at_ret = round(cpp_nom + (oas_nom_gross - clawback) + pension_nom + bridge_nom)
        if is_retired:
            tax_in_ret += total_tax
            retire_year_count += 1

        year_by_year.append({
            "age": age, "year": year, "phase": phase,
            "rrspBalance": round(rrsp), "tfsaBalance": round(tfsa), "nonRegBalance": round(non_reg),
            "totalPortfolio": total_portfolio,
            "cppIncome": round(cpp_nom), "oasIncome": round(oas_nom_gross - clawback),
            "oasClawback": round(clawback), "pensionIncome": round(pension_nom + bridge_nom),
            "rrifWithdrawal": round(rrif_min), "rrifExtra": round(rrif_extra),
            "tfsaWithdrawal": round(tfsa_draw), "nonRegWithdrawal": round(non_reg_draw),
            "totalGrossIncome": round(cpp_nom + oas_nom_gross + pension_nom + bridge_nom + rrif_total + tfsa_draw + non_reg_draw),
            "taxableIncome": round(taxable_inc),
            "federalTax": round(tax["federal"]), "provincialTax": round(tax["provincial"]),
            "totalTax": round(total_tax), "netAfterTaxIncome": round(net_income),
            "desiredSpendingNominal": round(desired_nom), "surplus": surplus, "fundingPct": funding,
        })

    last = year_by_year[-1] if year_by_year else {}
    avg_tax = round(tax_in_ret / retire_year_count) if retire_year_count > 0 else 0
    return {
        "yearByYear": year_by_year,
        "summary": {
            "portfolioAtRetirement": retire_portfolio,
            "rrspAtRetirement": rrsp_at_ret, "tfsaAtRetirement": tfsa_at_ret,
            "nonRegAtRetirement": nonreg_at_ret,
            "estateValueAtDeath": last.get("totalPortfolio", 0),
            "lifetimeTaxPaid": round(lifetime_tax),
            "avgAnnualTaxInRetirement": avg_tax,
            "annualSurplusAtRetirement": surplus_at_ret,
            "fundingRateAtRetirement": funding_at_ret,
            "rrifStartBalance": rrif_start_bal, "rrifMinYear1": rrif_min_y1,
            "cppAnnualAtStart": cpp_at_ret, "oasAnnualAtStart": oas_at_ret,
            "guaranteedIncomeAtRet": guaranteed_at_ret,
        },
    }
