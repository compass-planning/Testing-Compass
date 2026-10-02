"""US / cross-border planning: jurisdiction router, US federal + state income tax,
and a simplified US Social Security benefit estimate. 2024 figures. Illustrative only."""
from __future__ import annotations

# ── US federal income tax (2024) ──────────────────────────────────────────────
US_BRACKETS = {
    "single": [(11600, 0.10), (47150, 0.12), (100525, 0.22), (191950, 0.24),
               (243725, 0.32), (609350, 0.35), (float("inf"), 0.37)],
    "mfj": [(23200, 0.10), (94300, 0.12), (201050, 0.22), (383900, 0.24),
            (487450, 0.32), (731200, 0.35), (float("inf"), 0.37)],
}
US_STD_DEDUCTION = {"single": 14600, "mfj": 29200}
FEIE_2024 = 126500.0

# ── US state tax (simplified, 2024 single-filer) ─────────────────────────────
NO_TAX_STATES = {"AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"}
STATE_BRACKETS = {
    "CA": [(10412, 0.01), (24684, 0.02), (38959, 0.04), (54081, 0.06), (68350, 0.08),
           (349137, 0.093), (418961, 0.103), (698271, 0.113), (float("inf"), 0.123)],
    "NY": [(8500, 0.04), (11700, 0.045), (13900, 0.0525), (80650, 0.0550),
           (215400, 0.0597), (1077550, 0.0633), (float("inf"), 0.0685)],
    "NJ": [(20000, 0.014), (35000, 0.0175), (40000, 0.035), (75000, 0.05525),
           (500000, 0.0637), (1000000, 0.0897), (float("inf"), 0.1075)],
    "OH": [(26050, 0.0), (100000, 0.0275), (float("inf"), 0.035)],
    "VA": [(3000, 0.02), (5000, 0.03), (17000, 0.05), (float("inf"), 0.0575)],
    "MD": [(1000, 0.02), (2000, 0.03), (3000, 0.04), (100000, 0.0475), (125000, 0.05), (150000, 0.0525), (250000, 0.055), (float("inf"), 0.0575)],
    "OR": [(4300, 0.0475), (10750, 0.0675), (125000, 0.0875), (float("inf"), 0.099)],
    "SC": [(3460, 0.0), (17330, 0.03), (float("inf"), 0.064)],
    "MN": [(31690, 0.0535), (104090, 0.068), (193240, 0.0785), (float("inf"), 0.0985)],
    "WI": [(14320, 0.035), (28640, 0.044), (315310, 0.053), (float("inf"), 0.0765)],
    "CT": [(10000, 0.03), (50000, 0.05), (100000, 0.055), (200000, 0.06), (250000, 0.065), (500000, 0.069), (float("inf"), 0.0699)],
    "MO": [(1273, 0.0), (2546, 0.02), (3819, 0.025), (5092, 0.03), (6365, 0.035), (7638, 0.04), (8911, 0.045), (float("inf"), 0.048)],
    "LA": [(12500, 0.0185), (50000, 0.035), (float("inf"), 0.0425)],
    "AL": [(500, 0.02), (3000, 0.04), (float("inf"), 0.05)],
    "HI": [(2400, 0.014), (4800, 0.032), (9600, 0.055), (14400, 0.064), (19200, 0.068), (24000, 0.072), (36000, 0.076), (48000, 0.079), (150000, 0.0825), (175000, 0.09), (200000, 0.10), (float("inf"), 0.11)],
    "DC": [(10000, 0.04), (40000, 0.06), (60000, 0.065), (250000, 0.085), (500000, 0.0925), (1000000, 0.0975), (float("inf"), 0.1075)],
    "AR": [(4400, 0.02), (8800, 0.03), (float("inf"), 0.039)],
    "DE": [(5000, 0.022), (10000, 0.039), (20000, 0.048), (25000, 0.052), (60000, 0.0555), (float("inf"), 0.066)],
    "IA": [(6210, 0.044), (31050, 0.0482), (float("inf"), 0.057)],
    "KS": [(15000, 0.031), (30000, 0.0525), (float("inf"), 0.057)],
    "ME": [(26050, 0.058), (61600, 0.0675), (float("inf"), 0.0715)],
    "MT": [(20500, 0.047), (float("inf"), 0.059)],
    "NE": [(3700, 0.0246), (22170, 0.0351), (35730, 0.0501), (float("inf"), 0.0584)],
    "NM": [(5500, 0.017), (11000, 0.032), (16000, 0.047), (210000, 0.049), (float("inf"), 0.059)],
    "OK": [(1000, 0.0025), (2500, 0.0075), (3750, 0.0175), (4900, 0.0275), (7200, 0.0375), (float("inf"), 0.0475)],
    "RI": [(73450, 0.0375), (166950, 0.0475), (float("inf"), 0.0599)],
    "VT": [(45400, 0.0335), (110050, 0.066), (229550, 0.076), (float("inf"), 0.0875)],
    "WV": [(10000, 0.0236), (25000, 0.0315), (40000, 0.0354), (60000, 0.0472), (float("inf"), 0.0512)],
}
# Remaining states + DC — simplified at the 2024 top marginal rate (flat approximation)
STATE_FLAT = {
    "AL": 0.05, "AZ": 0.025, "AR": 0.039, "CO": 0.044, "CT": 0.0699, "DE": 0.066,
    "DC": 0.1075, "GA": 0.0539, "HI": 0.11, "ID": 0.058, "IL": 0.0495, "IN": 0.0305,
    "IA": 0.057, "KS": 0.057, "KY": 0.04, "LA": 0.0425, "ME": 0.0715, "MD": 0.0575,
    "MA": 0.05, "MI": 0.0425, "MN": 0.0985, "MS": 0.047, "MO": 0.048, "MT": 0.059,
    "NE": 0.0584, "NM": 0.059, "NC": 0.045, "ND": 0.025, "OK": 0.0475,
    "OR": 0.099, "PA": 0.0307, "RI": 0.0599, "SC": 0.064, "UT": 0.0465, "VT": 0.0875,
    "VA": 0.0575, "WV": 0.065, "WI": 0.0765,
}
DEFAULT_STATE_FLAT = 0.05

# ── Social Security (2024) ────────────────────────────────────────────────────
SS_WAGE_BASE = 168600.0
SS_BEND1 = 1174.0
SS_BEND2 = 7078.0
SS_FRA = 67


def _apply(income: float, brackets) -> float:
    tax, prev = 0.0, 0.0
    for ceiling, rate in brackets:
        if income <= prev:
            break
        tax += (min(income, ceiling) - prev) * rate
        prev = ceiling
    return tax


def us_state_tax(state: str, taxable_income: float) -> dict:
    s = (state or "Other").upper()
    if s in NO_TAX_STATES:
        return {"state": s, "tax": 0.0, "note": "No state income tax"}
    if s in STATE_BRACKETS:
        return {"state": s, "tax": round(_apply(taxable_income, STATE_BRACKETS[s])), "note": "Progressive state tax"}
    if s in STATE_FLAT:
        return {"state": s, "tax": round(taxable_income * STATE_FLAT[s]), "note": f"Simplified at top marginal {STATE_FLAT[s]*100:.2f}%"}
    return {"state": s, "tax": round(taxable_income * DEFAULT_STATE_FLAT), "note": "Estimated at 5% (state not modelled)"}


def us_federal_tax(gross_income: float, filing_status: str, feie_excluded: float = 0.0) -> dict:
    fs = filing_status if filing_status in US_BRACKETS else "single"
    std = US_STD_DEDUCTION[fs]
    taxable = max(0.0, gross_income - feie_excluded - std)
    fed = _apply(taxable, US_BRACKETS[fs])
    return {"filing_status": fs, "standard_deduction": std, "feie_excluded": round(feie_excluded),
            "taxable_income": round(taxable), "federal_tax": round(fed)}


def _ss_factor(claim_age: int) -> float:
    if claim_age == SS_FRA:
        return 1.0
    if claim_age < SS_FRA:
        months = (SS_FRA - claim_age) * 12
        red = min(36, months) * (5 / 9 / 100) + max(0, months - 36) * (5 / 12 / 100)
        return round(1 - red, 4)
    months = min((claim_age - SS_FRA) * 12, 36)  # delayed credits stop at 70
    return round(1 + months * (8 / 12 / 100), 4)


def social_security(avg_annual_earnings: float, claim_age: int = 67) -> dict:
    aime = min(max(0.0, avg_annual_earnings), SS_WAGE_BASE) / 12
    pia = (0.9 * min(aime, SS_BEND1)
           + 0.32 * max(0.0, min(aime, SS_BEND2) - SS_BEND1)
           + 0.15 * max(0.0, aime - SS_BEND2))
    schedule = []
    for age in (62, 67, 70):
        f = _ss_factor(age)
        schedule.append({"age": age, "factor": f, "monthly": round(pia * f), "annual": round(pia * f * 12)})
    claim_age = max(62, min(int(claim_age), 70))
    cf = _ss_factor(claim_age)
    return {"fra_monthly": round(pia), "claim_age": claim_age, "factor": cf,
            "monthly": round(pia * cf), "annual": round(pia * cf * 12), "schedule": schedule}


def classify_jurisdiction(ca_resident, us_citizen, us_green_card, us_substantial_presence, ca_citizen) -> dict:
    us_person = bool(us_citizen or us_green_card or us_substantial_presence)
    flags = []
    if ca_resident and us_person:
        cat, label = "dual", "Cross-border (US person resident in Canada)"
        summary = "You are taxed by Canada on worldwide income as a resident AND must file a US return as a US person — the Canada-US tax treaty coordinates the two."
    elif ca_resident:
        cat, label = "canadian_resident", "Canadian resident"
        summary = "Canada taxes your worldwide income. No US filing obligation unless you have US-source income or become a US person."
    elif us_person:
        cat, label = "us_person", "US person (non-resident of Canada)"
        summary = "You file in the US on worldwide income. Canadian-source income may face Canadian withholding."
    else:
        cat, label = "other", "Neither Canadian resident nor US person"
        summary = "Based on the inputs, neither Canadian residency nor US-person status applies."
    if us_person:
        flags.append("US income tax filing required (Form 1040)")
        flags.append("FBAR (FinCEN 114) if non-US financial accounts exceed US$10,000")
        flags.append("Form 8938 (FATCA) may apply above higher thresholds")
    if ca_resident and us_citizen:
        flags.append("FEIE (Form 2555) can exclude up to US$126,500 of foreign earned income")
        flags.append("Foreign Tax Credit (Form 1116) relieves most double taxation")
    if us_person:
        flags.append("TFSA/RESP may be treated as foreign trusts by the IRS (3520/3520-A exposure)")
    return {"category": cat, "label": label, "summary": summary, "us_person": us_person, "flags": flags}


def analyze(ca_resident=True, us_citizen=False, us_green_card=False, us_substantial_presence=False,
            ca_citizen=True, annual_income=100000.0, filing_status="single", state="Other",
            avg_annual_earnings=60000.0, claim_age=67):
    jur = classify_jurisdiction(ca_resident, us_citizen, us_green_card, us_substantial_presence, ca_citizen)
    treaty_notes = [
        "RRSP/RRIF growth is tax-deferred for US purposes under Treaty Art. XVIII(7) — no annual income inclusion.",
        "CPP/OAS received by a US resident is taxable only in the US (and vice-versa) under Art. XVIII.",
        "A 15% withholding generally applies to cross-border pension/periodic payments.",
    ]
    out = {"jurisdiction": jur, "treaty_notes": treaty_notes, "us_tax": None, "social_security": None}

    if jur["us_person"]:
        feie = min(float(annual_income or 0), FEIE_2024) if (us_citizen and ca_resident) else 0.0
        fed = us_federal_tax(float(annual_income or 0), filing_status, feie)
        st = us_state_tax(state, fed["taxable_income"]) if not ca_resident else {"state": (state or "Other").upper(), "tax": 0.0, "note": "No US state tax while non-resident of a US state"}
        total = fed["federal_tax"] + st["tax"]
        out["us_tax"] = {
            **fed, "gross_income": round(float(annual_income or 0)),
            "state": st["state"], "state_tax": st["tax"], "state_note": st["note"],
            "total_us_tax": round(total),
            "effective_rate": round(total / float(annual_income) * 100, 1) if annual_income else 0.0,
        }
        out["social_security"] = social_security(avg_annual_earnings, claim_age)
    return out
