"""Iteration 5 — MongoDB persistence, category-adaptive Net Worth fields,
Debt + Retirement CRUD under advisor household scope, Enterprise write-block,
and tenant isolation on new plan collections.
"""
import os
import uuid
import pytest
import pyotp
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compass-vault.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PW = os.environ.get("TEST_PASSWORD", "Compass2026!")
DEMO_TOTP = "JBSWY3DPEHPK3PXP"
HH = "client_a1"  # Nguyen household


def _login(email, pw=PW):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "mfa_required", d
    r2 = requests.post(f"{API}/auth/mfa/verify",
                       json={"challenge": d["challenge"], "code": pyotp.TOTP(DEMO_TOTP).now()})
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "advisor": _login("advisor@compass.ca"),
        "enterprise": _login("scott@sweston.ca"),
        "solo": _login("solo@compass.ca"),
    }


# ---------- MFA enrollment persistence ----------
class TestMFAPersistence:
    def test_me_shows_mfa_enabled(self, tokens):
        r = requests.get(f"{API}/auth/me", headers=H(tokens["advisor"]))
        assert r.status_code == 200
        u = r.json()
        assert u["mfa_enabled"] is True
        assert "mfa_secret" not in u


# ---------- Fresh-enroll flow returns secret ----------
class TestFreshEnrollFlow:
    def test_register_and_enroll_returns_secret(self):
        email = f"iter5_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Testpass123!", "name": "Iter5",
            "consent_data_processing": True,
        })
        assert r.status_code == 200
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Testpass123!"})
        assert r2.status_code == 200
        d = r2.json()
        assert d["status"] == "mfa_setup"
        assert d.get("secret")
        # verify TOTP from returned secret works
        r3 = requests.post(f"{API}/auth/mfa/verify", json={
            "challenge": d["challenge"], "code": pyotp.TOTP(d["secret"]).now(),
        })
        assert r3.status_code == 200
        assert r3.json()["status"] in ("security_required", "authenticated")


# ---------- Net Worth: arbitrary category-specific fields persist ----------
class TestNetWorthFieldPersistence:
    def _create_and_fetch(self, tok, payload):
        r = requests.post(f"{API}/plan/networth", headers=H(tok),
                          params={"household_id": HH}, json=payload)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        assert r.json()["household_id"] == HH
        got = requests.get(f"{API}/plan/networth", headers=H(tok),
                           params={"household_id": HH}).json()
        row = next((x for x in got if x["id"] == rid), None)
        assert row is not None, "created row not returned"
        requests.delete(f"{API}/plan/networth/{rid}", headers=H(tok),
                        params={"household_id": HH})
        return row

    def test_vehicle_fields_persist(self, tokens):
        p = {"kind": "asset", "category": "Vehicle", "name": "TEST_car", "value": 25000,
             "purchase_price": 32000, "loan_amount": 18000, "interest_rate": 6.9,
             "payment": 450, "payment_frequency": "Monthly",
             "purchase_date": "2023-04-15", "loan_length_years": 5}
        row = self._create_and_fetch(tokens["advisor"], p)
        for k in ["purchase_price", "loan_amount", "interest_rate", "payment",
                  "payment_frequency", "purchase_date", "loan_length_years"]:
            assert row.get(k) == p[k], f"{k} missing/mismatched"

    def test_real_estate_rental_holdco_fields_persist(self, tokens):
        p = {"kind": "asset", "category": "Real Estate (other)", "name": "TEST_rental",
             "value": 650000, "mortgage": 300000, "mortgage_payment": 1800,
             "property_taxes": 4000, "interest_rate": 5.2,
             "is_rental": True, "rental_income": 2800, "in_holding_company": True}
        row = self._create_and_fetch(tokens["advisor"], p)
        for k in ["mortgage", "mortgage_payment", "property_taxes", "interest_rate",
                  "is_rental", "rental_income", "in_holding_company"]:
            assert row.get(k) == p[k], f"{k} missing/mismatched (got {row.get(k)})"

    def test_rrsp_investment_fields_persist(self, tokens):
        p = {"kind": "asset", "category": "RRSP", "name": "TEST_rrsp", "value": 85000,
             "contribution": 500, "contribution_frequency": "Monthly",
             "holding_type": "ETF"}
        row = self._create_and_fetch(tokens["advisor"], p)
        for k in ["contribution", "contribution_frequency", "holding_type"]:
            assert row.get(k) == p[k]


# ---------- Advisor can read/write client_a1 plan collections ----------
class TestAdvisorHouseholdPlanCRUD:
    @pytest.mark.parametrize("coll,payload", [
        ("debts", {"name": "TEST_car_loan", "lender": "RBC", "balance": 18000,
                   "rate": 6.9, "payment": 450}),
        ("expenses", {"category": "Food", "name": "TEST_groceries", "amount": 800}),
        ("retirement", {"name": "TEST_proj", "retire_age": 65,
                        "monthly_income_goal": 4500, "pension_type": "DBPP",
                        "result": "On track", "success_prob": 82,
                        "nest_egg": 1250000, "note": "MC 1000"}),
    ])
    def test_crud_scoped_to_household(self, tokens, coll, payload):
        h = H(tokens["advisor"])
        params = {"household_id": HH}

        # CREATE
        r = requests.post(f"{API}/plan/{coll}", headers=h, params=params, json=payload)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        assert r.json()["household_id"] == HH
        assert r.json()["scope"]["client_id"] == HH

        # LIST contains it + household-scoped
        rows = requests.get(f"{API}/plan/{coll}", headers=h, params=params).json()
        assert any(x["id"] == rid for x in rows)
        for x in rows:
            assert x.get("household_id") == HH

        # UPDATE
        upd = {**payload, "name": f"{payload.get('name','x')}_u"}
        r = requests.put(f"{API}/plan/{coll}/{rid}", headers=h, params=params, json=upd)
        assert r.status_code == 200, r.text

        # DELETE
        r = requests.delete(f"{API}/plan/{coll}/{rid}", headers=h, params=params)
        assert r.status_code == 200
        rows = requests.get(f"{API}/plan/{coll}", headers=h, params=params).json()
        assert not any(x["id"] == rid for x in rows)


# ---------- Enterprise write-block on plan collections ----------
class TestEnterpriseWriteBlockOnPlan:
    @pytest.mark.parametrize("coll", ["networth", "debts", "expenses", "retirement"])
    def test_enterprise_cannot_write(self, tokens, coll):
        r = requests.post(f"{API}/plan/{coll}", headers=H(tokens["enterprise"]),
                          json={"name": "TEST_blocked", "value": 1, "balance": 1,
                                "amount": 1, "rate": 1, "payment": 1})
        assert r.status_code == 403, r.text


# ---------- Tenant isolation on plan collections ----------
class TestPlanTenantIsolation:
    def test_advisor_household_filter(self, tokens):
        # Writing to client_a1 and then listing a different household must not return it
        r = requests.post(f"{API}/plan/debts", headers=H(tokens["advisor"]),
                          params={"household_id": HH},
                          json={"name": "TEST_iso", "balance": 1000, "rate": 5, "payment": 50})
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            # Check as advisor with other household
            other = requests.get(f"{API}/plan/debts", headers=H(tokens["advisor"]),
                                 params={"household_id": "client_a2"}).json()
            assert not any(x["id"] == rid for x in other)
            # Solo must not see it either
            solo = requests.get(f"{API}/plan/debts", headers=H(tokens["solo"])).json()
            assert not any(x["id"] == rid for x in solo)
            # Enterprise must not see it either
            ent = requests.get(f"{API}/plan/debts", headers=H(tokens["enterprise"])).json()
            assert not any(x["id"] == rid for x in ent)
        finally:
            requests.delete(f"{API}/plan/debts/{rid}", headers=H(tokens["advisor"]),
                            params={"household_id": HH})

    def test_mongo_strips_objectid(self, tokens):
        rows = requests.get(f"{API}/plan/networth", headers=H(tokens["advisor"]),
                            params={"household_id": HH}).json()
        for r in rows:
            assert "_id" not in r
