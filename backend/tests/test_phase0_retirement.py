"""Phase 0 — retirement engine golden/invariant tests (pure functions)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.retirement_ca import run_canadian_projection
from engine.simulation import (run_monte_carlo, run_guardrail_check, apply_spending_flexibility,
                               cholesky_decomposition, CORRELATION_MATRIX)
from engine.optimizers import (optimize_withdrawals, cpp_timing_comparison, project_oas,
                               rrsp_vs_tfsa_decision, optimize_pension_split)
from engine.reference import (rrif_factor, cpp_factor, oas_factor, calc_tax, oas_clawback,
                              capital_gains_taxable, get_marginal_rate)


# ── reference ────────────────────────────────────────────────────────────────
def test_rrif_factor_boundaries():
    assert rrif_factor(71) == 0.05280
    assert rrif_factor(95) == 0.20
    assert rrif_factor(60) == 1 / 30  # pre-65 formula 1/(90-age)


def test_cpp_oas_actuarial_factors():
    assert cpp_factor(60) == 0.64
    assert abs(cpp_factor(65) - 1.0) < 1e-9
    assert abs(cpp_factor(70) - 1.42) < 1e-9
    assert oas_factor(65) == 1.0
    assert abs(oas_factor(70) - 1.36) < 1e-9


def test_oas_clawback():
    assert oas_clawback(50000, 8000) == 0
    # income 100,997 is 10,000 over the 90,997 threshold -> 15% = 1,500
    assert abs(oas_clawback(100997, 8000) - 1500) < 1e-6


def test_capital_gains_inclusion_tiers():
    assert capital_gains_taxable(100000) == 50000
    # above 250k uses 66.67% inclusion on the excess
    assert capital_gains_taxable(350000) == 250000 * 0.5 + 100000 * 0.6667


def test_tax_monotonic_and_marginal():
    assert calc_tax(50000, 40, "ON")["total"] < calc_tax(150000, 40, "ON")["total"]
    assert 0.2 < get_marginal_rate(90000, "ON") < 0.45


# ── deterministic projection ─────────────────────────────────────────────────
def _base_input(**over):
    base = dict(current_age=45, retirement_age=65, life_expectancy=95, province="ON",
                rrsp_balance=300000, tfsa_balance=80000, non_reg_balance=50000,
                non_reg_tax_type="mixed", non_reg_acb=40000,
                annual_rrsp_contrib=12000, annual_tfsa_contrib=7000,
                desired_retirement_income=60000, pension_annual=0, pension_start_age=65,
                pension_indexed=False, bridge_benefit_annual=0, bridge_benefit_end_age=65,
                cpp_monthly=1100, cpp_start_age=65, oas_monthly=700, oas_start_age=65,
                expected_return_pct=5.5, inflation_pct=2.1)
    base.update(over)
    return base


def test_projection_structure_and_rrif_conversion():
    res = run_canadian_projection(_base_input())
    yby = res["yearByYear"]
    assert len(yby) == 95 - 45 + 1
    # phases present and ordered
    assert yby[0]["phase"] == "accumulation"
    assert any(y["phase"] == "early_retirement" for y in yby)
    assert any(y["phase"] == "rrif" for y in yby)
    # RRIF conversion captured at 71
    assert res["summary"]["rrifStartBalance"] > 0
    assert res["summary"]["rrifMinYear1"] > 0
    # portfolio grows during accumulation
    assert yby[10]["totalPortfolio"] > yby[0]["totalPortfolio"]
    assert res["summary"]["portfolioAtRetirement"] > 400000


def test_projection_more_savings_more_portfolio():
    low = run_canadian_projection(_base_input(annual_rrsp_contrib=5000))
    high = run_canadian_projection(_base_input(annual_rrsp_contrib=25000))
    assert high["summary"]["portfolioAtRetirement"] > low["summary"]["portfolioAtRetirement"]


def test_projection_rrif_min_withdrawals_after_71():
    res = run_canadian_projection(_base_input())
    post71 = [y for y in res["yearByYear"] if y["age"] >= 72]
    assert all(y["rrifWithdrawal"] >= 0 for y in post71)
    assert any(y["rrifWithdrawal"] > 0 for y in post71)


# ── Monte Carlo ──────────────────────────────────────────────────────────────
def test_cholesky_reconstructs_correlation():
    L = cholesky_decomposition(CORRELATION_MATRIX)
    n = len(CORRELATION_MATRIX)
    for i in range(n):
        for j in range(n):
            recon = sum(L[i][k] * L[j][k] for k in range(n))
            assert abs(recon - CORRELATION_MATRIX[i][j]) < 1e-6


def test_montecarlo_percentiles_ordered_and_seed_reproducible():
    params = dict(initialBalance=500000, allocation="BALANCED", annualContribution=20000,
                  yearsToSimulate=25, numberOfPaths=800, seed=42)
    a = run_monte_carlo(params)
    b = run_monte_carlo(params)
    assert a["probabilityOfSuccess"] == b["probabilityOfSuccess"]  # deterministic w/ seed
    last = -1
    assert a["percentiles"]["p10"][last] <= a["percentiles"]["p50"][last] <= a["percentiles"]["p90"][last]
    assert 0.0 <= a["probabilityOfSuccess"] <= 1.0


def test_montecarlo_withdrawal_lowers_success():
    acc = run_monte_carlo(dict(initialBalance=400000, allocation="BALANCED", annualContribution=15000,
                               yearsToSimulate=20, numberOfPaths=600, seed=1))
    dec = run_monte_carlo(dict(initialBalance=400000, allocation="CONSERVATIVE", annualContribution=-45000,
                               yearsToSimulate=20, numberOfPaths=600, seed=1))
    assert dec["probabilityOfSuccess"] < acc["probabilityOfSuccess"]


# ── Guardrails ───────────────────────────────────────────────────────────────
def test_guardrail_check_shape():
    res = run_guardrail_check(dict(currentAge=50, retirementAge=65, lifeExpectancy=90,
                                   rrspBalance=400000, tfsaBalance=100000, nonRegBalance=60000,
                                   annualIncome=120000, rrspContribution=15000, tfsaContribution=7000,
                                   nonRegContribution=0, desiredRetirementIncome=70000,
                                   pensionIncome=0, cppAmount=14000, oasAmount=8500,
                                   numberOfPaths=500, seed=7))
    assert res["health"] in ("excellent", "good", "warning", "critical")
    assert 0.0 <= res["probabilityOfSuccess"] <= 1.0
    flex = apply_spending_flexibility(res.pop("_retPaths"), res.pop("_retMedian"),
                                      res["requiredWithdrawal"], 0,
                                      {"floorPct": 0.8, "ceilingPct": 1.2, "flexDown": 0.1, "flexUp": 0.1},
                                      65)
    assert flex["adjustedSuccessRate"] >= flex["baseSuccessRate"] - 1e-9
    assert len(flex["triggerTable"]) > 0
    assert isinstance(flex["recommendation"], str) and flex["recommendation"]


# ── Optimizers ───────────────────────────────────────────────────────────────
def test_optimize_withdrawals_mandatory_min_and_draw_order():
    plan = optimize_withdrawals(72, {"rrspRrifBalance": 300000, "tfsaBalance": 50000, "nonRegBalance": 40000},
                                desired_income=60000, cpp_annual=14000, oas_annual=8500,
                                pension_income=0, province="ON")
    assert plan["mandatoryRrifMin"] > 0
    assert plan["rrifWithdrawal"] >= plan["mandatoryRrifMin"]
    assert plan["totalWithdrawal"] > 0


def test_cpp_timing_more_later_and_breakeven():
    c = cpp_timing_comparison()
    assert c["at70"]["annualBenefit"] > c["at65"]["annualBenefit"] > c["at60"]["annualBenefit"]
    assert 70 < c["breakEven65vs70"] <= 100


def test_project_oas_clawback_applies_high_income():
    low = project_oas(65, 50000)
    high = project_oas(65, 150000)
    assert high["clawbackAmount"] > low["clawbackAmount"]
    assert project_oas(70, 50000)["annualBenefit"] > low["annualBenefit"]  # deferral boost


def test_rrsp_vs_tfsa_recommends_rrsp_when_rate_drops():
    r = rrsp_vs_tfsa_decision(140000, 40000, "ON")
    assert r["recommendation"] == "rrsp"


def test_pension_split_saves_tax_when_incomes_uneven():
    r = optimize_pension_split(120000, 40000, 20000, "ON")
    assert r["taxSavings"] >= 0
    assert r["bestSplitPct"] > 0
