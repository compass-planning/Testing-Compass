"""Iteration 6 — Advisor Household Queue scoring/status/alerts/next_action,
plan collections insurance/debts/expenses accept arbitrary extra fields (owner tag,
in_holding_company), and advisor plan writes require household_id.
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
    if d["status"] == "mfa_setup":
        secret = d["secret"]
    elif d["status"] == "mfa_required":
        secret = DEMO_TOTP
    else:
        raise AssertionError(f"unexpected login status: {d}")
    r2 = requests.post(
        f"{API}/auth/mfa/verify",
        json={"challenge": d["challenge"], "code": pyotp.TOTP(secret).now()},
    )
    assert r2.status_code == 200, r2.text
    out = r2.json()
    if out.get("status") == "security_required":
        r3 = requests.post(f"{API}/auth/security-question", json={
            "setup_token": out["setup_token"],
            "question": out["questions"][0] if out.get("questions") else "What city were you born in?",
            "answer": "toronto",
        })
        assert r3.status_code == 200, r3.text
        out = r3.json()
    assert out.get("status") == "authenticated", out
    return out["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "advisor": _login("advisor@compass.ca"),
        "enterprise": _login("scott@sweston.ca"),
        "solo": _login("solo@compass.ca"),
    }


# ---------- Advisor Household Queue ----------
class TestAdvisorHouseholdQueue:
    def test_advisor_clients_returns_scoring_fields(self, tokens):
        r = requests.get(f"{API}/advisor/clients", headers=H(tokens["advisor"]))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 3
        # pick known households (ignore promo owners which may be in list)
        by_id = {c["client_id"]: c for c in rows}
        for cid in ("client_a1", "client_a2", "client_a3"):
            assert cid in by_id, f"missing {cid} in advisor roster"
            c = by_id[cid]
            # new scoring fields
            for key in ("score", "status", "alerts", "next_action", "net_worth", "debt"):
                assert key in c, f"{cid} missing field {key}: {c.keys()}"
            assert isinstance(c["score"], int)
            assert 0 <= c["score"] <= 100
            assert c["status"] in ("On Track", "Needs Review", "At Risk")
            assert isinstance(c["alerts"], list)
            assert isinstance(c["next_action"], str) and c["next_action"]

    def test_nguyen_scores_higher_than_okafor_rossi(self, tokens):
        r = requests.get(f"{API}/advisor/clients", headers=H(tokens["advisor"]))
        rows = {c["client_id"]: c for c in r.json()}
        nguyen = rows["client_a1"]
        okafor = rows["client_a2"]
        rossi = rows["client_a3"]
        # Nguyen has retirement+plan data per prev iter -> higher
        assert nguyen["score"] >= okafor["score"], (nguyen["score"], okafor["score"])
        assert nguyen["score"] >= rossi["score"], (nguyen["score"], rossi["score"])

    def test_okafor_or_rossi_has_relevant_alert(self, tokens):
        r = requests.get(f"{API}/advisor/clients", headers=H(tokens["advisor"]))
        rows = {c["client_id"]: c for c in r.json()}
        for cid in ("client_a2", "client_a3"):
            alerts = " | ".join(rows[cid]["alerts"]).lower()
            # at least one of the expected alerts should fire
            assert ("retirement" in alerts or "insurance" in alerts
                    or "debt" in alerts or "goal" in alerts
                    or "negative" in alerts), f"{cid} alerts = {rows[cid]['alerts']}"

    def test_non_advisor_cannot_access_roster(self, tokens):
        for tier in ("enterprise", "solo"):
            r = requests.get(f"{API}/advisor/clients", headers=H(tokens[tier]))
            assert r.status_code == 403, f"{tier}: {r.status_code}"


# ---------- Advisor plan writes require household_id ----------
class TestAdvisorPlanRequiresHousehold:
    def test_post_debts_without_household_returns_400(self, tokens):
        r = requests.post(f"{API}/plan/debts", headers=H(tokens["advisor"]),
                          json={"name": "ITER6_bad_debt", "balance": 1000, "rate": 5})
        assert r.status_code == 400, r.text

    def test_post_debts_with_household_returns_200(self, tokens):
        r = requests.post(
            f"{API}/plan/debts?household_id={HH}", headers=H(tokens["advisor"]),
            json={"name": "ITER6_ok_debt", "balance": 1234, "rate": 5, "owner": "Primary"},
        )
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        # cleanup
        requests.delete(f"{API}/plan/debts/{rid}?household_id={HH}", headers=H(tokens["advisor"]))

    def test_enterprise_plan_write_403(self, tokens):
        r = requests.post(f"{API}/plan/debts", headers=H(tokens["enterprise"]),
                          json={"name": "ENT_debt", "balance": 1, "rate": 1})
        assert r.status_code == 403, r.text


# ---------- Arbitrary extra fields persist and are household-scoped ----------
class TestPlanArbitraryFields:
    def test_debt_owner_tag_persists(self, tokens):
        for owner in ("Primary", "Spouse", "Joint"):
            r = requests.post(
                f"{API}/plan/debts?household_id={HH}", headers=H(tokens["advisor"]),
                json={"name": f"ITER6_debt_{owner}", "balance": 500, "rate": 4, "owner": owner},
            )
            assert r.status_code == 200, r.text
            rid = r.json()["id"]
            assert r.json()["owner"] == owner
            # GET and verify persisted
            g = requests.get(f"{API}/plan/debts?household_id={HH}", headers=H(tokens["advisor"]))
            found = [d for d in g.json() if d["id"] == rid]
            assert found and found[0]["owner"] == owner
            requests.delete(f"{API}/plan/debts/{rid}?household_id={HH}", headers=H(tokens["advisor"]))

    def test_expense_owner_tag_persists(self, tokens):
        r = requests.post(
            f"{API}/plan/expenses?household_id={HH}", headers=H(tokens["advisor"]),
            json={"name": "ITER6_exp", "amount": 100, "frequency": "monthly", "owner": "Spouse"},
        )
        assert r.status_code == 200
        assert r.json()["owner"] == "Spouse"
        rid = r.json()["id"]
        requests.delete(f"{API}/plan/expenses/{rid}?household_id={HH}", headers=H(tokens["advisor"]))

    def test_networth_in_holding_company_persists(self, tokens):
        r = requests.post(
            f"{API}/plan/networth?household_id={HH}", headers=H(tokens["advisor"]),
            json={"name": "ITER6_rental", "category": "real_estate_other", "kind": "asset",
                  "value": 500000, "is_rental": True, "rental_income": 2000,
                  "in_holding_company": True},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["in_holding_company"] is True
        assert d["is_rental"] is True
        assert d["rental_income"] == 2000
        requests.delete(f"{API}/plan/networth/{d['id']}?household_id={HH}", headers=H(tokens["advisor"]))

    def test_insurance_extra_fields_persist(self, tokens):
        r = requests.post(
            f"{API}/plan/insurance?household_id={HH}", headers=H(tokens["advisor"]),
            json={"name": "ITER6_life", "insurance_type": "life", "coverage": 500000,
                  "premium": 60, "owner": "Primary"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["insurance_type"] == "life"
        assert d["coverage"] == 500000
        rid = d["id"]
        # GET filtered
        g = requests.get(f"{API}/plan/insurance?household_id={HH}", headers=H(tokens["advisor"]))
        assert any(x["id"] == rid for x in g.json())
        requests.delete(f"{API}/plan/insurance/{rid}?household_id={HH}", headers=H(tokens["advisor"]))

    def test_insurance_scoped_to_household_only(self, tokens):
        # create for client_a1
        r = requests.post(
            f"{API}/plan/insurance?household_id={HH}", headers=H(tokens["advisor"]),
            json={"name": "ITER6_scope", "insurance_type": "ltc", "coverage": 100000},
        )
        rid = r.json()["id"]
        # list other household — must NOT include
        g = requests.get(f"{API}/plan/insurance?household_id=client_a2", headers=H(tokens["advisor"]))
        assert all(x["id"] != rid for x in g.json())
        requests.delete(f"{API}/plan/insurance/{rid}?household_id={HH}", headers=H(tokens["advisor"]))
