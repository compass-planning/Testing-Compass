"""Phase 1a — protection endpoints integration tests (requires auth)."""
import os
import pyotp
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compass-vault.preview.emergentagent.com").rstrip("/")
EMAIL = "advisor@compass.ca"
PASSWORD = os.environ.get("TEST_PASSWORD", "Compass2026!")
TOTP_SECRET = os.environ.get("TEST_TOTP_SECRET", "JBSWY3DPEHPK3PXP")


@pytest.fixture(scope="module")
def token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    challenge = data.get("challenge")
    assert challenge, f"No challenge in login: {data}"
    code = pyotp.TOTP(TOTP_SECRET).now()
    r2 = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"challenge": challenge, "code": code}, timeout=15)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("status") == "authenticated", d2
    return d2["token"]


@pytest.fixture
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# POST /api/plan/protection/life — DIME default sums to 2,465,000
def test_life_default_dime(client):
    body = {"annualIncome": 100000, "personalConsumptionRate": 0.30, "workingYearsRemaining": 20,
            "mortgageBalance": 300000, "totalDebts": 40000, "educationFundTarget": 100000,
            "finalExpenses": 25000, "existingLifeCoverage": 250000, "existingAssets": 150000,
            "preferredMethod": "dime"}
    r = client.post(f"{BASE_URL}/api/plan/protection/life", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["dime"]["totalNeed"] == 2465000
    assert d["selectedMethod"] == "dime"
    assert d["recommendedLifeCoverage"] == d["dime"]["totalNeed"]
    assert "humanLifeValue" in d and "capitalRetention" in d
    assert "diGap" in d and "ciGap" in d
    assert d["humanLifeValue"]["totalNeed"] > 0
    assert d["capitalRetention"]["totalNeed"] > 0


# switching method changes recommendedLifeCoverage
def test_life_method_switch(client):
    body = {"preferredMethod": "humanLifeValue"}
    r = client.post(f"{BASE_URL}/api/plan/protection/life", json=body, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["selectedMethod"] == "humanLifeValue"
    assert d["recommendedLifeCoverage"] == d["humanLifeValue"]["totalNeed"]


# POST /api/plan/protection/di — employer-paid group DI is taxable
def test_di_group_tax_erosion(client):
    body = {"currentAge": 40, "province": "ON", "grossMonthlyIncome": 8000, "occupationClass": "3A",
            "definition": "own_occ", "waitingPeriodDays": 90, "benefitPeriod": "age65",
            "groupDiMonthly": 4000, "groupDiEmployerPaid": True, "individualDiMonthly": 0,
            "cppDisabilityMonthly": 0, "partialDisabilityPct": 0.5, "colaPct": 0.02}
    r = client.post(f"{BASE_URL}/api/plan/protection/di", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["targetMonthlyBenefit"] == 5600
    assert d["existing"]["groupGross"] == 4000
    assert d["existing"]["groupAfterTax"] < 4000  # ~2680 at ON 33%
    assert d["coverageGap"] >= 0
    assert d["taxTreatment"]["groupTaxable"] is True
    assert d["claimProbability"]["ownOcc"] > d["claimProbability"]["anyOcc"]
    assert "recommendation" in d["taxTreatment"]
    assert isinstance(d["replacementRatio"], int)


# POST /api/plan/protection/ltc
def test_ltc_pool_and_premium(client):
    body = {"currentAge": 55, "province": "ON", "dailyBenefit": 200, "poolYears": 5,
            "eliminationDays": 90, "inflationProtection": "3pct", "estAnnualPremium": 0,
            "careCostInflation": 0.04, "estClaimAge": 82, "careLevel": "semi_private"}
    r = client.post(f"{BASE_URL}/api/plan/protection/ltc", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["totalPoolDollars"] == 200 * 5 * 365
    assert d["dailyBenefitAtClaim"] > 200
    assert d["poolDuration"]["at60pctRate"] > d["poolDuration"]["atFullRate"]
    assert d["eliminationCost"] > 0
    assert d["estAnnualPremium"] > 0
    assert d["provincialDailyCost"] == 240
    assert d["breakEvenAge"] > 0
    assert "adequacyGap" in d
