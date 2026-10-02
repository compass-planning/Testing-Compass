"""CRA reference data + core Canadian tax math (2024/2025), ported from the
original engine/reference and canadianRetirementEngine tax logic."""
from __future__ import annotations

# ── Benefit rates ────────────────────────────────────────────────────────────
BENEFIT_RATES = {
    "cpp_max_monthly": 1364.60,     # 2024 CPP maximum at 65
    "oas_max_monthly": 713.34,      # 2024 OAS maximum at 65 (<75)
    "oas_clawback_threshold": 90997,
    "oas_clawback_rate": 0.15,
    "bpa_federal": 15705,
}


def get_benefit_rate(key: str) -> float:
    return BENEFIT_RATES[key]


# ── CRA RRIF minimum withdrawal factors (2024) ───────────────────────────────
RRIF_FACTORS = {
    65: 0.04000, 66: 0.04167, 67: 0.04348, 68: 0.04545, 69: 0.04762,
    70: 0.05000, 71: 0.05280, 72: 0.05400, 73: 0.05530, 74: 0.05670,
    75: 0.05820, 76: 0.05980, 77: 0.06170, 78: 0.06360, 79: 0.06580,
    80: 0.06820, 81: 0.07080, 82: 0.07380, 83: 0.07710, 84: 0.08080,
    85: 0.08510, 86: 0.08990, 87: 0.09550, 88: 0.10210, 89: 0.10990,
    90: 0.11920, 91: 0.13060, 92: 0.14490, 93: 0.16340, 94: 0.18790,
}


def rrif_factor(age: int) -> float:
    if age < 65:
        return 1.0 / max(1, 90 - age)
    if age >= 95:
        return 0.2000
    return RRIF_FACTORS.get(age, 0.2000)


# ── CPP / OAS actuarial adjustment factors ───────────────────────────────────
def cpp_factor(start_age: float) -> float:
    if start_age <= 60:
        return 0.64
    if start_age < 65:
        return 1 - 0.006 * (65 - start_age) * 12
    if start_age >= 70:
        return 1.42
    return 1 + 0.007 * (start_age - 65) * 12


def oas_factor(start_age: float) -> float:
    if start_age <= 65:
        return 1.0
    if start_age >= 70:
        return 1.36
    return 1 + 0.006 * (start_age - 65) * 12


# ── Income tax (2024 brackets, federal + all 13 provinces/territories) ───────
FEDERAL_BRACKETS = [
    (55867, 0.1500), (111733, 0.2050), (154906, 0.2600),
    (220000, 0.2900), (float("inf"), 0.3300),
]

PROVINCIAL_BRACKETS = {
    "ON": [(51446, 0.0505), (102894, 0.0915), (150000, 0.1116), (220000, 0.1216), (float("inf"), 0.1316)],
    "QC": [(51780, 0.1400), (103545, 0.1900), (126000, 0.2400), (float("inf"), 0.2575)],
    "BC": [(45654, 0.0506), (91310, 0.0770), (104835, 0.1050), (127299, 0.1229), (172602, 0.1470), (240716, 0.1680), (float("inf"), 0.2050)],
    "AB": [(148269, 0.1000), (177922, 0.1200), (237230, 0.1300), (355845, 0.1400), (float("inf"), 0.1500)],
    "SK": [(49720, 0.1050), (142058, 0.1250), (float("inf"), 0.1450)],
    "MB": [(36842, 0.1080), (79625, 0.1275), (float("inf"), 0.1740)],
    "NB": [(47715, 0.0940), (95431, 0.1482), (176756, 0.1652), (float("inf"), 0.1984)],
    "NS": [(29590, 0.0879), (59180, 0.1495), (93000, 0.1667), (150000, 0.1750), (float("inf"), 0.2100)],
    "NL": [(43198, 0.0870), (86395, 0.1450), (154244, 0.1580), (215943, 0.1780), (275870, 0.1980), (float("inf"), 0.2080)],
    "PE": [(32656, 0.0965), (64313, 0.1363), (105000, 0.1665), (140000, 0.1800), (float("inf"), 0.1875)],
    "NT": [(50597, 0.0590), (101198, 0.0860), (164525, 0.1220), (float("inf"), 0.1405)],
    "NU": [(53268, 0.0400), (106537, 0.0700), (173205, 0.0900), (float("inf"), 0.1150)],
    "YT": [(55867, 0.0640), (111733, 0.0900), (500000, 0.1090), (float("inf"), 0.1280)],
}

PROV_BPA = {
    "ON": 11865, "QC": 17183, "BC": 11981, "AB": 21003, "SK": 17661, "MB": 15780,
    "NB": 12458, "NS": 8481, "NL": 10818, "PE": 12000, "NT": 16593, "NU": 17925, "YT": 15705,
}
PROV_RATE = {
    "ON": 0.0505, "QC": 0.14, "BC": 0.0506, "AB": 0.10, "SK": 0.105, "MB": 0.108,
    "NB": 0.094, "NS": 0.0879, "NL": 0.087, "PE": 0.0965, "NT": 0.059, "NU": 0.04, "YT": 0.064,
}


def _apply_brackets(income: float, brackets) -> float:
    tax, prev = 0.0, 0.0
    for ceiling, rate in brackets:
        if income <= prev:
            break
        taxable = min(income, ceiling) - prev
        tax += taxable * rate
        prev = ceiling
    return tax


def _federal_credit(age: int, income: float) -> float:
    credit = BENEFIT_RATES["bpa_federal"] * 0.15
    if age >= 65:
        age_amount = max(0, 8790 - max(0, (income - 42335) * 0.15))
        credit += age_amount * 0.15
    return credit


def _provincial_credit(province: str, age: int) -> float:
    b = PROV_BPA.get(province, 12000)
    r = PROV_RATE.get(province, 0.10)
    credit = b * r
    if age >= 65:
        credit += 800 * r
    return credit


def calc_tax(taxable_income: float, age: int, province: str) -> dict:
    """Federal + provincial income tax after basic/age credits (incl. ON surtax)."""
    if taxable_income <= 0:
        return {"federal": 0.0, "provincial": 0.0, "total": 0.0}
    province = province if province in PROVINCIAL_BRACKETS else "ON"

    fed_gross = _apply_brackets(taxable_income, FEDERAL_BRACKETS)
    federal = max(0.0, fed_gross - _federal_credit(age, taxable_income))

    prov_gross = _apply_brackets(taxable_income, PROVINCIAL_BRACKETS[province])
    prov_credit = _provincial_credit(province, age)

    prov_extra = 0.0
    if province == "ON":
        basic_tax = max(0.0, prov_gross - prov_credit)
        if basic_tax > 6802:
            prov_extra = (basic_tax - 6802) * 0.36 + (min(basic_tax, 6802) - 5315) * 0.20
        elif basic_tax > 5315:
            prov_extra = (basic_tax - 5315) * 0.20

    provincial = max(0.0, prov_gross - prov_credit) + prov_extra
    return {"federal": federal, "provincial": provincial, "total": federal + provincial}


def calc_combined_tax(income: float, province: str, age: int = 0) -> dict:
    t = calc_tax(income, age, province)
    eff = (t["total"] / income) if income > 0 else 0.0
    return {"federal_tax": t["federal"], "provincial_tax": t["provincial"],
            "total_tax": t["total"], "effective_rate": eff}


def get_marginal_rate(income: float, province: str) -> float:
    base = calc_tax(income, 0, province)["total"]
    bump = calc_tax(income + 1000, 0, province)["total"]
    return max(0.0, (bump - base) / 1000.0)


# ── OAS clawback + capital-gains inclusion ───────────────────────────────────
def oas_clawback(net_income: float, oas_annual: float) -> float:
    threshold = BENEFIT_RATES["oas_clawback_threshold"]
    rate = BENEFIT_RATES["oas_clawback_rate"]
    if net_income <= threshold:
        return 0.0
    return min(oas_annual, (net_income - threshold) * rate)


def capital_gains_taxable(capital_gain: float) -> float:
    if capital_gain <= 0:
        return 0.0
    if capital_gain <= 250000:
        return capital_gain * 0.5
    return 250000 * 0.5 + (capital_gain - 250000) * 0.6667
