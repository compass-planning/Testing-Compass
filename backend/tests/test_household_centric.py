"""Iteration 3: Household-centric advisor flow tests."""
import os
import pytest
import pyotp
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://compass-vault.preview.emergentagent.com"
API = f"{BASE_URL}/api"
PW = "Compass2026!"
DEMO_TOTP = "JBSWY3DPEHPK3PXP"


def login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("status") == "mfa_required", d
    r2 = requests.post(f"{API}/auth/mfa/verify", json={
        "challenge": d["challenge"], "code": pyotp.TOTP(DEMO_TOTP).now()})
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


def auth(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "advisor": login("advisor@compass.ca"),
        "enterprise": login("scott@sweston.ca"),
        "solo": login("solo@compass.ca"),
    }


# ---------- Advisor roster + openClient household scoping ----------
class TestAdvisorHouseholdCentric:
    def test_advisor_roster_has_nguyen(self, tokens):
        r = requests.get(f"{API}/advisor/clients", headers=auth(tokens["advisor"]))
        assert r.status_code == 200
        clients = r.json()
        assert any(c["client_id"] == "client_a1" for c in clients), clients
        nguyen = next(c for c in clients if c["client_id"] == "client_a1")
        assert "Nguyen" in nguyen.get("primary", ""), nguyen

    def test_owners_scoped_to_client_a1(self, tokens):
        """household_id=client_a1 returns exactly the 3 Nguyen members."""
        r = requests.get(f"{API}/owners", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a1"})
        assert r.status_code == 200
        owners = r.json()
        names = sorted(o["full_name"] for o in owners)
        assert names == ["Anh Nguyen", "Linh Nguyen", "Mai Nguyen"], names
        for o in owners:
            assert o["scope"]["client_id"] == "client_a1"

    def test_anh_profile_fields(self, tokens):
        r = requests.get(f"{API}/owners", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a1"})
        anh = next(o for o in r.json() if o["full_name"] == "Anh Nguyen")
        assert anh.get("email") == "anh@nguyen.ca"
        assert anh.get("annual_income") == 132000
        assert anh.get("pension_type") == "DCPP"
        assert anh.get("retirement_age") == 63
        assert anh.get("relationship") == "self"

    def test_plan_networth_scoped(self, tokens):
        r = requests.get(f"{API}/plan/networth", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a1"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 2, rows
        names = sorted(r_["name"] for r_ in rows)
        assert names == ["Family home", "Home mortgage"]
        for r_ in rows:
            assert r_["household_id"] == "client_a1"

    def test_plan_debts_scoped(self, tokens):
        r = requests.get(f"{API}/plan/debts", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a1"})
        rows = r.json()
        assert len(rows) == 1 and rows[0]["name"] == "Mortgage"
        assert rows[0]["balance"] == 390000

    def test_plan_expenses_scoped(self, tokens):
        r = requests.get(f"{API}/plan/expenses", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a1"})
        rows = r.json()
        assert len(rows) == 2
        assert sum(r_["amount"] for r_ in rows) == 3800  # 2700 + 1100

    def test_plan_insurance_scoped(self, tokens):
        r = requests.get(f"{API}/plan/insurance", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a1"})
        rows = r.json()
        assert len(rows) == 1 and rows[0]["carrier"] == "Sun Life"

    def test_plan_retirement_scoped(self, tokens):
        r = requests.get(f"{API}/plan/retirement", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a1"})
        rows = r.json()
        assert len(rows) == 1 and rows[0]["name"] == "Base case"

    def test_isolation_client_a2_empty(self, tokens):
        """client_a2 has no plan rows seeded."""
        r = requests.get(f"{API}/plan/networth", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a2"})
        assert r.status_code == 200
        assert r.json() == []

    def test_overview_scoped_to_a1(self, tokens):
        r = requests.get(f"{API}/plan/overview", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a1"})
        assert r.status_code == 200
        d = r.json()
        # Family home 820k asset + accounts (RRSP+TFSA) ~ seeded. Just check mortgage liability + debt rows
        assert d["debtCount"] == 1
        assert d["insuranceAnalyses"] == 1
        assert d["retirementProjections"] == 1
        assert abs(d["monthlyExpenses"] - 3800) < 1


# ---------- Enterprise read-only owners (no household open flow) ----------
class TestEnterpriseOwnersReadOnly:
    def test_enterprise_owners_read_ok(self, tokens):
        r = requests.get(f"{API}/owners", headers=auth(tokens["enterprise"]))
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_enterprise_cannot_write_plan(self, tokens):
        r = requests.post(f"{API}/plan/networth", headers=auth(tokens["enterprise"]),
                          json={"kind": "asset", "name": "X", "value": 1})
        assert r.status_code == 403

    def test_enterprise_cannot_write_owner(self, tokens):
        r = requests.post(f"{API}/owners", headers=auth(tokens["enterprise"]), json={
            "full_name": "No", "relationship": "self",
            "date_of_birth": "1980-01-01", "province": "ON",
        })
        assert r.status_code == 403


# ---------- Solo unchanged ----------
class TestSoloUnaffected:
    def test_solo_owners_no_household_needed(self, tokens):
        r = requests.get(f"{API}/owners", headers=auth(tokens["solo"]))
        assert r.status_code == 200
        owners = r.json()
        assert all(o["scope"]["client_id"] == "client_solo1" for o in owners)
        assert any(o["full_name"] == "Jordan Blake" for o in owners)

    def test_solo_plan_networth(self, tokens):
        r = requests.get(f"{API}/plan/networth", headers=auth(tokens["solo"]))
        assert r.status_code == 200
        assert len(r.json()) == 3


# ---------- Owner edit with household_id persists profile fields ----------
class TestOwnerEditPersistsProfile:
    def test_update_anh_phone(self, tokens):
        h = auth(tokens["advisor"])
        owners = requests.get(f"{API}/owners", headers=h, params={"household_id": "client_a1"}).json()
        anh = next(o for o in owners if o["full_name"] == "Anh Nguyen")
        body = {
            "full_name": "Anh Nguyen", "relationship": "self",
            "date_of_birth": anh.get("date_of_birth", "1975-06-14"),
            "province": "ON", "email": "anh@nguyen.ca", "phone": "416-555-9999",
            "occupation": "Software Engineer", "annual_income": 135000,
            "pension_type": "DCPP", "retirement_age": 63, "desired_income": 6000,
        }
        r = requests.put(f"{API}/owners/{anh['id']}", headers=h, json=body)
        assert r.status_code == 200, r.text
        # Verify via GET
        owners2 = requests.get(f"{API}/owners", headers=h, params={"household_id": "client_a1"}).json()
        anh2 = next(o for o in owners2 if o["id"] == anh["id"])
        assert anh2["phone"] == "416-555-9999"
        assert anh2["annual_income"] == 135000

    def test_add_dependant_and_delete(self, tokens):
        h = auth(tokens["advisor"])
        body = {"full_name": "TEST_Dep", "relationship": "dependent",
                "date_of_birth": "2015-01-01", "province": "ON"}
        r = requests.post(f"{API}/owners", headers=h, params={"household_id": "client_a1"}, json=body)
        assert r.status_code == 200, r.text
        new_id = r.json()["id"]
        assert r.json()["scope"]["client_id"] == "client_a1"
        # Appears in list
        owners = requests.get(f"{API}/owners", headers=h, params={"household_id": "client_a1"}).json()
        assert any(o["id"] == new_id for o in owners)
        # Cleanup
        requests.delete(f"{API}/owners/{new_id}", headers=h)
