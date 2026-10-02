"""Monte Carlo (Cholesky + correlated multi-asset returns) and Guyton-Klinger
spending-flexibility guardrails. Ported from engine/simulation/*.ts."""
from __future__ import annotations
import math
import random

ASSET_CLASSES = {
    "CAN_EQUITY": {"name": "Canadian Equity", "mean": 0.075, "vol": 0.18},
    "US_EQUITY": {"name": "US Equity", "mean": 0.095, "vol": 0.20},
    "INTL_EQUITY": {"name": "International Equity", "mean": 0.080, "vol": 0.19},
    "FIXED_INCOME": {"name": "Fixed Income", "mean": 0.040, "vol": 0.06},
    "CASH": {"name": "Cash", "mean": 0.025, "vol": 0.01},
}
ASSET_ORDER = ["CAN_EQUITY", "US_EQUITY", "INTL_EQUITY", "FIXED_INCOME", "CASH"]

CORRELATION_MATRIX = [
    [1.00, 0.75, 0.70, 0.15, 0.05],
    [0.75, 1.00, 0.80, 0.20, 0.05],
    [0.70, 0.80, 1.00, 0.25, 0.05],
    [0.15, 0.20, 0.25, 1.00, 0.30],
    [0.05, 0.05, 0.05, 0.30, 1.00],
]

PRESET_ALLOCATIONS = {
    "AGGRESSIVE": {"canEquity": 0.30, "usEquity": 0.35, "intlEquity": 0.25, "fixedIncome": 0.10, "cash": 0.00},
    "MODERATE": {"canEquity": 0.20, "usEquity": 0.25, "intlEquity": 0.15, "fixedIncome": 0.35, "cash": 0.05},
    "CONSERVATIVE": {"canEquity": 0.10, "usEquity": 0.10, "intlEquity": 0.05, "fixedIncome": 0.55, "cash": 0.20},
    "BALANCED": {"canEquity": 0.20, "usEquity": 0.20, "intlEquity": 0.20, "fixedIncome": 0.30, "cash": 0.10},
}
_ALLOC_KEYS = ["canEquity", "usEquity", "intlEquity", "fixedIncome", "cash"]


def cholesky_decomposition(matrix):
    n = len(matrix)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = sum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                val = matrix[i][i] - s
                if val < -1e-10:
                    raise ValueError("Matrix not positive definite")
                L[i][j] = math.sqrt(max(0.0, val))
            else:
                L[i][j] = 0.0 if abs(L[j][j]) < 1e-10 else (matrix[i][j] - s) / L[j][j]
    return L


_CHOLESKY = cholesky_decomposition(CORRELATION_MATRIX)


def _resolve_allocation(allocation):
    if isinstance(allocation, str):
        return PRESET_ALLOCATIONS.get(allocation.upper(), PRESET_ALLOCATIONS["BALANCED"])
    return allocation


def _portfolio_return(alloc, correlated_z):
    total = 0.0
    for i, key in enumerate(ASSET_ORDER):
        ac = ASSET_CLASSES[key]
        asset_return = ac["mean"] + ac["vol"] * correlated_z[i]
        total += alloc[_ALLOC_KEYS[i]] * asset_return
    return total


def _simulate_path(params, rng):
    balance = params["initialBalance"]
    balances = [balance]
    alloc = params["_alloc"]
    contribution = params["annualContribution"]
    infl = params.get("inflationRate")
    goals = params.get("_goals", {})
    for year in range(1, params["yearsToSimulate"] + 1):
        z = [rng.gauss(0, 1) for _ in ASSET_ORDER]
        correlated = [sum(_CHOLESKY[i][k] * z[k] for k in range(len(z))) for i in range(len(z))]
        balance = balance * (1 + _portfolio_return(alloc, correlated))
        balance += contribution
        if year in goals:
            balance += goals[year]
        if infl:
            balance /= (1 + infl)
        balance = max(0.0, balance)
        balances.append(balance)
    return balances


def run_monte_carlo(params: dict) -> dict:
    alloc = _resolve_allocation(params.get("allocation", "BALANCED"))
    if abs(sum(alloc[k] for k in _ALLOC_KEYS) - 1.0) > 0.01:
        raise ValueError("Portfolio allocation must sum to 1.0")
    goals = {}
    for evt in (params.get("goalEvents") or []):
        goals[int(evt["yearOffset"])] = goals.get(int(evt["yearOffset"]), 0) + float(evt["amount"])
    p = {**params, "_alloc": alloc, "_goals": goals}
    n_paths = int(params.get("numberOfPaths", 1000))
    years = int(params["yearsToSimulate"])
    rng = random.Random(params.get("seed"))

    paths = [_simulate_path(p, rng) for _ in range(n_paths)]

    pct = {"p10": [], "p25": [], "p50": [], "p75": [], "p90": []}
    for year in range(years + 1):
        col = sorted(path[year] for path in paths)
        pct["p10"].append(col[int(n_paths * 0.10)])
        pct["p25"].append(col[int(n_paths * 0.25)])
        pct["p50"].append(col[int(n_paths * 0.50)])
        pct["p75"].append(col[int(n_paths * 0.75)])
        pct["p90"].append(col[min(n_paths - 1, int(n_paths * 0.90))])

    expected = [sum(path[y] for path in paths) / n_paths for y in range(years + 1)]
    success = sum(1 for path in paths if path[-1] > 0) / n_paths
    return {"paths": paths, "percentiles": pct, "probabilityOfSuccess": success,
            "expectedValue": expected, "metadata": {"paths": n_paths, "years": years}}


# ── Allocation helpers (age-based) ───────────────────────────────────────────
def determine_allocation(current_age: int, retirement_age: int) -> dict:
    yrs = retirement_age - current_age
    if yrs > 20:
        return PRESET_ALLOCATIONS["AGGRESSIVE"]
    if yrs > 10:
        return PRESET_ALLOCATIONS["BALANCED"]
    if yrs > 5:
        return PRESET_ALLOCATIONS["MODERATE"]
    return PRESET_ALLOCATIONS["CONSERVATIVE"]


def shift_to_conservative(alloc: dict) -> dict:
    reduction = 0.20
    total_eq = alloc["canEquity"] + alloc["usEquity"] + alloc["intlEquity"]
    scale = max(0.0, total_eq - reduction) / total_eq if total_eq > 0 else 0.0
    return {"canEquity": alloc["canEquity"] * scale, "usEquity": alloc["usEquity"] * scale,
            "intlEquity": alloc["intlEquity"] * scale, "fixedIncome": alloc["fixedIncome"] + reduction,
            "cash": alloc["cash"]}


# ── Guyton-Klinger spending-flexibility guardrails ───────────────────────────
def apply_spending_flexibility(base_paths, median_path, base_withdrawal, retirement_year,
                               params, retirement_age, inflation_rate=0.02) -> dict:
    n = len(base_paths)
    years = len(base_paths[0]) - 1
    base_success = adj_success = 0
    for path in base_paths:
        if path[-1] > 0:
            base_success += 1
        idx = retirement_year if retirement_year < len(path) else len(path) - 1
        balance = path[idx]
        spending = base_withdrawal
        survived = True
        for yr in range(retirement_year, len(path) - 1):
            prev_bal, next_bal = path[yr], path[yr + 1]
            implied = ((next_bal + base_withdrawal - prev_bal) / prev_bal) if prev_bal > 0 else 0.0
            balance = balance * (1 + implied)
            target = median_path[yr] if yr < len(median_path) else median_path[-1]
            if target > 0:
                if balance < target * params["floorPct"]:
                    spending = base_withdrawal * (1 - params["flexDown"])
                elif balance > target * params["ceilingPct"]:
                    spending = base_withdrawal * (1 + params["flexUp"])
                else:
                    spending = base_withdrawal
            balance -= spending
            if balance <= 0:
                survived = False
                break
        if survived and balance > 0:
            adj_success += 1

    base_rate = base_success / n
    adj_rate = adj_success / n
    gain = adj_rate - base_rate

    triggers = []
    for i in range(min(years - retirement_year, 30)):
        idx = retirement_year + i
        target = median_path[idx] if idx < len(median_path) else 0
        base_spend = base_withdrawal * ((1 + inflation_rate) ** i)
        triggers.append({
            "year": __import__("datetime").date.today().year + i, "age": retirement_age + i,
            "targetPathBalance": round(target),
            "floorBalance": round(target * params["floorPct"]),
            "ceilingBalance": round(target * params["ceilingPct"]),
            "baseSpending": round(base_spend),
            "reducedSpending": round(base_spend * (1 - params["flexDown"])),
            "increasedSpending": round(base_spend * (1 + params["flexUp"])),
        })

    flex_pct = round(params["flexDown"] * 100)
    reduced_amt = round(base_withdrawal * (1 - params["flexDown"]))
    if gain > 0.05:
        rec = (f"Applying a {flex_pct}% spending-flexibility guardrail increases your plan success rate from "
               f"{round(base_rate*100)}% to {round(adj_rate*100)}% — a {round(gain*100)}-point improvement. "
               f"In years your portfolio falls below the floor, reduce withdrawals from "
               f"${round(base_withdrawal):,} to ${reduced_amt:,}. This is the highest-impact adjustment available.")
    elif gain > 0.01:
        rec = (f"Spending flexibility adds {round(gain*100)} points to your success rate "
               f"({round(base_rate*100)}% → {round(adj_rate*100)}%). The plan is already reasonably strong; "
               f"guardrails provide a useful safety margin but are not urgently required.")
    else:
        rec = (f"Your plan has a {round(base_rate*100)}% base success rate. Spending flexibility adds minimal uplift — "
               f"consider also increasing contributions or delaying retirement.")

    return {"baseSuccessRate": base_rate, "adjustedSuccessRate": adj_rate, "successRateGain": gain,
            "params": params, "triggerTable": triggers, "recommendation": rec}


def run_guardrail_check(inp: dict) -> dict:
    """Plan-health check via accumulation + decumulation Monte Carlo (ported runGuardrailCheck)."""
    current_age = int(inp["currentAge"])
    retirement_age = int(inp["retirementAge"])
    life_expectancy = int(inp["lifeExpectancy"])
    alloc = inp.get("allocation") or determine_allocation(current_age, retirement_age)
    alloc = _resolve_allocation(alloc)

    yrs_to_ret = max(0, retirement_age - current_age)
    yrs_in_ret = max(1, life_expectancy - retirement_age)
    total_assets = float(inp["rrspBalance"]) + float(inp["tfsaBalance"]) + float(inp["nonRegBalance"])
    total_contrib = float(inp["rrspContribution"]) + float(inp["tfsaContribution"]) + float(inp.get("nonRegContribution", 0))

    accum = run_monte_carlo({"initialBalance": total_assets, "allocation": alloc,
                             "annualContribution": total_contrib, "yearsToSimulate": max(1, yrs_to_ret),
                             "numberOfPaths": int(inp.get("numberOfPaths", 2000)), "seed": inp.get("seed")})
    guaranteed = float(inp["pensionIncome"]) + float(inp["cppAmount"]) + float(inp["oasAmount"])
    required = max(0.0, float(inp["desiredRetirementIncome"]) - guaranteed)
    ret_start = accum["percentiles"]["p50"][yrs_to_ret] if yrs_to_ret < len(accum["percentiles"]["p50"]) else accum["percentiles"]["p50"][-1]

    ret = run_monte_carlo({"initialBalance": ret_start, "allocation": shift_to_conservative(alloc),
                           "annualContribution": -required, "yearsToSimulate": yrs_in_ret,
                           "numberOfPaths": int(inp.get("numberOfPaths", 2000)), "seed": inp.get("seed")})
    prob = ret["probabilityOfSuccess"]

    issues, recs = [], []
    if prob < 0.50:
        issues.append(f"Critical: only {round(prob*100)}% chance of funding retirement")
        recs += ["Increase savings rate immediately or reduce retirement income target",
                 "Consider working 2-3 years longer to improve odds"]
    elif prob < 0.70:
        issues.append(f"Warning: {round(prob*100)}% chance of meeting retirement goals")
        recs += ["Increase monthly contributions by 10-20%", "Review portfolio allocation for age-appropriate risk"]
    elif prob < 0.85:
        issues.append(f"Moderate risk: {round(prob*100)}% success probability")
        recs.append("Consider small increases to savings to improve margin of safety")

    savings_rate = total_contrib / float(inp["annualIncome"]) if float(inp.get("annualIncome", 0)) > 0 else 0
    recommended = 0.15 if yrs_to_ret > 20 else 0.20
    if savings_rate and savings_rate < recommended:
        issues.append(f"Savings rate of {round(savings_rate*100)}% is below recommended {round(recommended*100)}%")
        recs.append(f"Increase annual savings by ${round((recommended - savings_rate) * float(inp['annualIncome'])):,}")

    health = ("excellent" if prob >= 0.95 else "good" if prob >= 0.85
              else "warning" if prob >= 0.70 else "critical")
    return {"health": health, "probabilityOfSuccess": prob, "issues": issues, "recommendations": recs,
            "accumulation": {"percentiles": accum["percentiles"], "expectedValue": accum["expectedValue"]},
            "retirement": {"percentiles": ret["percentiles"]},
            "requiredWithdrawal": round(required), "retirementStartBalance": round(ret_start),
            "_retPaths": ret["paths"], "_retMedian": ret["percentiles"]["p50"]}
