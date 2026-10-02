"""Phase 1a — protection engine golden/invariant tests."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.insurance import (run_full_insurance_analysis, run_ltc_engine, run_di_engine,
                              calculate_dime, calculate_human_life_value, calculate_capital_retention)

PROFILE = dict(annualIncome=100000, personalConsumptionRate=0.30, workingYearsRemaining=20,
               mortgageBalance=300000, totalDebts=40000, educationFundTarget=100000, finalExpenses=25000,
               existingLifeCoverage=250000, existingAssets=150000, monthlyExpenses=5000,
               existingDisabilityCoverage=0, cppDisabilityBenefit=0, diReplacementRate=0.70,
               criticalIllnessLumpSum=0, existingCriticalIllnessCoverage=0, uncoveredTreatmentCosts=50000,
               discountRate=0.04, withdrawalRate=0.04, incomeVolatility=0, isVariableIncome=False)


def test_dime_sums_components():
    r = calculate_dime(PROFILE)
    # debt(40k)+income(100k*20=2M)+mortgage(300k)+edu(100k)+final(25k) = 2,465,000
    assert r["totalNeed"] == 2465000
    assert r["gap"] == 2465000 - (250000 + 150000)


def test_hlv_present_value_positive_and_less_than_undiscounted():
    r = calculate_human_life_value(PROFILE)
    undisc = PROFILE["annualIncome"] * (1 - 0.30) * 20
    assert 0 < r["totalNeed"] < undisc  # discounting reduces value


def test_capital_retention_uses_withdrawal_rate():
    r = calculate_capital_retention(PROFILE)
    assert r["totalNeed"] == round(100000 * 0.70 / 0.04)


def test_full_analysis_selects_preferred_method():
    out = run_full_insurance_analysis(PROFILE, "humanLifeValue")
    assert out["selectedMethod"] == "humanLifeValue"
    assert out["recommendedLifeCoverage"] == out["humanLifeValue"]["totalNeed"]
    assert "diGap" in out and "ciGap" in out


def test_ltc_pool_and_breakeven():
    r = run_ltc_engine(dict(currentAge=55, province="ON", dailyBenefit=200, poolYears=5, eliminationDays=90,
                            inflationProtection="3pct", estAnnualPremium=0, careCostInflation=0.04,
                            estClaimAge=82, careLevel="semi_private"))
    assert r["totalPoolDollars"] == round(200 * 5 * 365)
    assert r["dailyBenefitAtClaim"] > 200  # inflation rider grows it
    assert r["poolDuration"]["at60pctRate"] > r["poolDuration"]["atFullRate"]  # lower util lasts longer
    assert r["estAnnualPremium"] > 0
    assert r["provincialDailyCost"] == 240  # ON semi-private


def test_di_gap_and_group_tax_erosion():
    taxed = run_di_engine(dict(currentAge=40, province="ON", grossMonthlyIncome=8000, occupationClass="3A",
                               definition="own_occ", waitingPeriodDays=90, benefitPeriod="age65",
                               groupDiMonthly=4000, groupDiEmployerPaid=True, individualDiMonthly=0,
                               cppDisabilityMonthly=0, partialDisabilityPct=0.5, colaPct=0.02))
    assert taxed["targetMonthlyBenefit"] == round(8000 * 0.70)
    assert taxed["existing"]["groupAfterTax"] < 4000  # employer-paid group DI is taxable
    assert taxed["taxTreatment"]["groupTaxable"] is True
    assert taxed["coverageGap"] >= 0
    # own-occ has higher claim probability than any-occ
    assert taxed["claimProbability"]["ownOcc"] > taxed["claimProbability"]["anyOcc"]
