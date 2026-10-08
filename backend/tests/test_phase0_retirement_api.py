"""Phase 0 retirement HTTP endpoint tests (hits public preview URL)."""
import os, pyotp, pytest, requests, uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compass-vault.preview.emergentagent.com").rstrip("/")
TOTP_SECRET = os.environ.get("TEST_TOTP_SECRET", "JBSWY3DPEHPK3PXP")
PASS = os.environ.get("TEST_PASSWORD", "Compass2026!")
API = f"{BASE_URL}/api"


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASS}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "mfa_required", body
    code = pyotp.TOTP(TOTP_SECRET).now()
    r = requests.post(f"{API}/auth/mfa/verify", json={"challenge": body["challenge"], "code": code}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") == "authenticated", body
    return body["token"]


@pytest.fixture(scope="module")
def advisor_token():
    return _login("advisor@compass.ca")


@pytest.fixture(scope="module")
def enterprise_token():
    return _login("scott@sweston.ca")


def _h(tok, hh=None):
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    return h


def _url(path, hh=None):
    return f"{API}{path}" + (f"?household_id={hh}" if hh else "")


# ── projection ──────────────────────────────────────────────────────────────
def test_projection_shape_and_invariants(advisor_token):
    base = dict(current_age=45, retirement_age=65, life_expectancy=95, province="ON",
                rrsp_balance=300000, tfsa_balance=80000, non_reg_balance=50000,
                non_reg_tax_type="mixed", non_reg_acb=40000,
                annual_rrsp_contrib=12000, annual_tfsa_contrib=7000,
                desired_retirement_income=60000, cpp_monthly=1100, oas_monthly=713,
                expected_return_pct=5.5, inflation_pct=2.1)
    r = requests.post(_url("/plan/retirement/projection", "client_a1"),
                      headers=_h(advisor_token), json=base, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    yby = d["yearByYear"]
    assert len(yby) == 95 - 45 + 1
    s = d["summary"]
    assert s["portfolioAtRetirement"] > 400000
    assert s["rrifMinYear1"] > 0
    assert s["guaranteedIncomeAtRet"] > 0
    assert s["lifetimeTaxPaid"] > 0
    assert "estateValueAtDeath" in s

    high = dict(base); high["annual_rrsp_contrib"] = 25000
    r2 = requests.post(_url("/plan/retirement/projection", "client_a1"),
                       headers=_h(advisor_token), json=high, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["summary"]["portfolioAtRetirement"] > s["portfolioAtRetirement"]


# ── monte carlo ─────────────────────────────────────────────────────────────
def test_montecarlo_percentiles_seed_and_no_paths(advisor_token):
    body = dict(initialBalance=500000, allocation="BALANCED", annualContribution=15000,
                yearsToSimulate=25, numberOfPaths=500, seed=42)
    r1 = requests.post(_url("/plan/retirement/montecarlo", "client_a1"),
                       headers=_h(advisor_token), json=body, timeout=60)
    r2 = requests.post(_url("/plan/retirement/montecarlo", "client_a1"),
                       headers=_h(advisor_token), json=body, timeout=60)
    assert r1.status_code == 200 and r2.status_code == 200
    a, b = r1.json(), r2.json()
    assert "paths" not in a
    p = a["percentiles"]
    assert p["p10"][-1] <= p["p50"][-1] <= p["p90"][-1]
    assert 0.0 <= a["probabilityOfSuccess"] <= 1.0
    assert a["probabilityOfSuccess"] == b["probabilityOfSuccess"]


# ── guardrails ──────────────────────────────────────────────────────────────
def test_guardrails_shape(advisor_token):
    body = dict(currentAge=50, retirementAge=65, lifeExpectancy=90,
                rrspBalance=400000, tfsaBalance=100000, nonRegBalance=60000,
                annualIncome=120000, rrspContribution=15000, tfsaContribution=7000,
                desiredRetirementIncome=70000, cppAmount=14000, oasAmount=8500,
                numberOfPaths=400, seed=7)
    r = requests.post(_url("/plan/retirement/guardrails", "client_a1"),
                      headers=_h(advisor_token), json=body, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["health"] in ("excellent", "good", "warning", "critical")
    assert 0.0 <= d["probabilityOfSuccess"] <= 1.0
    f = d["flexibility"]
    assert f["adjustedSuccessRate"] + 1e-9 >= f["baseSuccessRate"]
    assert len(f["triggerTable"]) > 0
    assert isinstance(f["recommendation"], str) and f["recommendation"]


# ── CPP/OAS timing ──────────────────────────────────────────────────────────
def test_cpp_oas_timing(advisor_token):
    r = requests.post(_url("/plan/retirement/cpp-timing", "client_a1"),
                      headers=_h(advisor_token),
                      json={"totalIncome": 60000, "yearsInCanada": 40}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    c = d["cpp"]
    assert c["at70"]["annualBenefit"] > c["at65"]["annualBenefit"] > c["at60"]["annualBenefit"]
    assert 70 < c["breakEven65vs70"] <= 100
    for age in ("65", "66", "67", "68", "69", "70"):
        assert age in d["oas"]


# ── decisions ───────────────────────────────────────────────────────────────
def test_rrsp_vs_tfsa_recommends_rrsp(advisor_token):
    r = requests.post(_url("/plan/retirement/rrsp-vs-tfsa", "client_a1"),
                      headers=_h(advisor_token),
                      json={"currentIncome": 140000, "expectedRetirementIncome": 40000, "province": "ON"},
                      timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["recommendation"] == "rrsp"


def test_pension_split_saves_tax(advisor_token):
    r = requests.post(_url("/plan/retirement/pension-split", "client_a1"),
                      headers=_h(advisor_token),
                      json={"selfIncome": 120000, "eligiblePensionIncome": 40000,
                            "spouseIncome": 20000, "province": "ON"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["taxSavings"] >= 0
    assert d["bestSplitPct"] > 0


# ── scenarios CRUD + tenant rules ───────────────────────────────────────────
def test_advisor_save_requires_household(advisor_token):
    r = requests.post(_url("/plan/retirement/scenarios"), headers=_h(advisor_token),
                      json={"name": "TEST_no_hh", "inputs": {}}, timeout=30)
    assert r.status_code == 400, r.text


def test_scenarios_crud_advisor(advisor_token):
    name = f"TEST_scn_{uuid.uuid4().hex[:6]}"
    r = requests.post(_url("/plan/retirement/scenarios", "client_a1"), headers=_h(advisor_token),
                      json={"name": name, "inputs": {"retirement_age": 65, "province": "ON", "expected_return_pct": 5.5},
                            "summary": {"portfolioAtRetirement": 1234567}}, timeout=30)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    try:
        lr = requests.get(_url("/plan/retirement/scenarios", "client_a1"), headers=_h(advisor_token), timeout=30)
        assert lr.status_code == 200
        assert any(s["id"] == sid and s["name"] == name for s in lr.json())
    finally:
        d = requests.delete(_url(f"/plan/retirement/scenarios/{sid}", "client_a1"),
                            headers=_h(advisor_token), timeout=30)
        assert d.status_code == 200
    lr2 = requests.get(_url("/plan/retirement/scenarios", "client_a1"), headers=_h(advisor_token), timeout=30)
    assert all(s["id"] != sid for s in lr2.json())


def test_enterprise_cannot_save_scenario(enterprise_token):
    r = requests.post(_url("/plan/retirement/scenarios"), headers=_h(enterprise_token),
                      json={"name": "TEST_ent_block", "inputs": {}}, timeout=30)
    assert r.status_code == 403, r.text
