"""Estate engine — per-province probate fees + terminal (deemed-disposition) tax.
Ported from the original engine/estate/{probateCalculator,terminalTax,provinceNormalizer}.ts."""
from __future__ import annotations
from .reference import calc_combined_tax, get_marginal_rate

PROBATE_SCHEDULES = {
    "ON": lambda v: v * 0.005 if v <= 50000 else 50000 * 0.005 + (v - 50000) * 0.015,
    "BC": lambda v: 0 if v <= 25000 else (v - 25000) * 0.006 if v <= 50000 else 25000 * 0.006 + (v - 50000) * 0.014,
    "AB": lambda v: min(525, 35 + 7 * max(0, -(-(v - 10000) // 1000))),
    "QC": lambda v: 0,
    "SK": lambda v: v * 0.007,
    "MB": lambda v: v * 0.007,
    "NB": lambda v: v * 0.005,
    "NS": lambda v: (85.60 if v <= 10000 else 215.20 if v <= 25000 else 358.15 if v <= 50000
                     else 1002.65 if v <= 100000 else 1002.65 + (v - 100000) * 0.0167),
    "PE": lambda v: v * 0.004,
    "NL": lambda v: 60 if v <= 1000 else 60 + (v - 1000) * 0.006,
    "NT": lambda v: 25 if v <= 10000 else 100 if v <= 25000 else 200 if v <= 100000 else 300 if v <= 250000 else 400,
    "NU": lambda v: 25 if v <= 10000 else 100 if v <= 25000 else 200 if v <= 100000 else 300 if v <= 250000 else 400,
    "YT": lambda v: 0 if v <= 25000 else (v - 25000) * 0.0069,
}


def normalize_province(prov: str) -> str:
    p = (prov or "ON").strip().upper()
    return p if p in PROBATE_SCHEDULES else "ON"


def calculate_probate_fees(profile: dict) -> dict:
    exempt = {
        "registeredAccounts": profile.get("registeredAccountsWithBeneficiary", 0),
        "lifeInsurance": profile.get("lifeInsuranceWithBeneficiary", 0),
        "jointTenancy": profile.get("jointTenancyRealEstate", 0),
        "trustAssets": profile.get("trustAssets", 0),
    }
    exempt["total"] = sum(exempt.values())
    probateable = max(0, profile.get("grossEstateValue", 0) - exempt["total"])
    province = normalize_province(profile.get("province"))
    fee = PROBATE_SCHEDULES[province](probateable)
    return {"province": province, "probateableEstate": round(probateable),
            "probateFee": round(fee, 2), "exemptAssets": exempt}


def calculate_terminal_tax(profile: dict) -> dict:
    province = normalize_province(profile.get("province"))
    rrsp_incl = profile.get("rrspRrifBalance", 0)
    cap_gain = max(0, profile.get("nonRegInvestments", 0) - profile.get("nonRegCostBase", 0))
    cap_gain_incl = cap_gain * 0.5
    taxable = rrsp_incl + cap_gain_incl + profile.get("otherIncome", 0)
    tax = calc_combined_tax(taxable, province)
    return {"rrspRrifInclusion": round(rrsp_incl), "capitalGainsInclusion": round(cap_gain_incl),
            "totalTaxableIncome": round(taxable), "estimatedTax": round(tax["total_tax"], 2),
            "marginalRate": round(get_marginal_rate(taxable, province), 4)}


def calculate_estate(profile: dict) -> dict:
    probate = calculate_probate_fees(profile)
    terminal = calculate_terminal_tax(profile)
    gross = profile.get("grossEstateValue", 0)
    total_settlement = probate["probateFee"] + terminal["estimatedTax"]
    return {"probate": probate, "terminalTax": terminal,
            "grossEstateValue": round(gross),
            "totalSettlementCost": round(total_settlement),
            "netToHeirs": round(max(0, gross - total_settlement)),
            "settlementPct": round(total_settlement / gross * 100, 1) if gross > 0 else 0}
