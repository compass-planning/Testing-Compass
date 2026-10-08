"""Compass Planning backend API tests (v1, in-memory data layer)."""
import os
import pytest
import pyotp
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://compass-vault.preview.emergentagent.com"
API = f"{BASE_URL}/api"
PW = os.environ.get("TEST_PASSWORD", "Compass2026!")
DEMO_TOTP = "JBSWY3DPEHPK3PXP"

ACCOUNTS = {
    "enterprise": "scott@sweston.ca",
    "planner": "planner@sweston.ca",
    "advisor": "advisor@compass.ca",
    "firm_admin": "firmadmin@compass.ca",
    "solo": "solo@compass.ca",
}


# ---------- helpers ----------
def totp(secret=DEMO_TOTP):
    return pyotp.TOTP(secret).now()


def login(email, password=PW):
    """Full MFA login for seeded users (mfa_required path)."""
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    d = r.json()
    assert d.get("status") == "mfa_required", f"expected mfa_required, got {d}"
    challenge = d["challenge"]
    r2 = requests.post(f"{API}/auth/mfa/verify", json={"challenge": challenge, "code": totp()})
    assert r2.status_code == 200, f"mfa verify {email}: {r2.status_code} {r2.text}"
    d2 = r2.json()
    assert d2.get("status") == "authenticated"
    return d2["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def tokens():
    return {k: login(v) for k, v in ACCOUNTS.items()}


# ---------- Auth ----------
class TestAuth:
    def test_login_all_seeded(self, tokens):
        assert all(tokens.values())

    def test_login_bad_creds(self):
        r = requests.post(f"{API}/auth/login", json={"email": "solo@compass.ca", "password": "wrong"})
        assert r.status_code == 401

    def test_me_returns_user(self, tokens):
        r = requests.get(f"{API}/auth/me", headers=auth(tokens["solo"]))
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == "solo@compass.ca"
        assert u["tier"] == "solo"
        assert "password_hash" not in u

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_solo(self):
        import uuid
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Testpass123!",
            "name": "Test User", "consent_data_processing": True,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        # Register no longer returns a session — MFA setup is required on first login
        assert d.get("status") == "registered"
        # duplicate should conflict
        r2 = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Testpass123!",
            "name": "Test User", "consent_data_processing": True,
        })
        assert r2.status_code == 409


# ---------- Tenant isolation ----------
class TestTenantIsolation:
    def test_enterprise_sees_only_crm_owners(self, tokens):
        r = requests.get(f"{API}/owners", headers=auth(tokens["enterprise"]))
        assert r.status_code == 200
        owners = r.json()
        assert len(owners) >= 3
        assert all(o.get("crm_record_id", "").startswith("SF-") for o in owners)
        assert all(o["scope"].get("corp_id") == "corp_sweston" for o in owners)

    def test_advisor_sees_only_their_org(self, tokens):
        r = requests.get(f"{API}/owners", headers=auth(tokens["advisor"]))
        assert r.status_code == 200
        owners = r.json()
        assert len(owners) >= 3
        for o in owners:
            assert o["scope"].get("org_id") == "org_maple"
            assert o["scope"].get("advisor_id") == "adv_lena"
            assert not (o.get("crm_record_id") or "").startswith("SF-")

    def test_solo_sees_only_own(self, tokens):
        r = requests.get(f"{API}/owners", headers=auth(tokens["solo"]))
        assert r.status_code == 200
        owners = r.json()
        assert len(owners) >= 1
        for o in owners:
            assert o["scope"].get("client_id") == "client_solo1"

    def test_accounts_isolation(self, tokens):
        e = requests.get(f"{API}/accounts", headers=auth(tokens["enterprise"])).json()
        a = requests.get(f"{API}/accounts", headers=auth(tokens["advisor"])).json()
        s = requests.get(f"{API}/accounts", headers=auth(tokens["solo"])).json()
        assert all(x["scope"].get("corp_id") == "corp_sweston" for x in e)
        assert all(x["scope"].get("org_id") == "org_maple" for x in a)
        assert all(x["scope"].get("client_id") == "client_solo1" for x in s)
        # no id overlap
        ids_e = {x["id"] for x in e}
        ids_a = {x["id"] for x in a}
        ids_s = {x["id"] for x in s}
        assert ids_e.isdisjoint(ids_a) and ids_a.isdisjoint(ids_s) and ids_e.isdisjoint(ids_s)

    def test_goals_isolation(self, tokens):
        for k, corp, org, cid in [
            ("enterprise", "corp_sweston", None, None),
            ("advisor", None, "org_maple", None),
            ("solo", None, None, "client_solo1"),
        ]:
            g = requests.get(f"{API}/goals", headers=auth(tokens[k])).json()
            for row in g:
                if corp: assert row["scope"].get("corp_id") == corp
                if org: assert row["scope"].get("org_id") == org
                if cid: assert row["scope"].get("client_id") == cid


# ---------- Dashboard ----------
class TestDashboard:
    def test_enterprise_dashboard_has_crm(self, tokens):
        r = requests.get(f"{API}/dashboard", headers=auth(tokens["enterprise"]))
        assert r.status_code == 200
        d = r.json()
        assert d["tier"] == "enterprise"
        assert d["total_assets"] > 0
        assert d["owners_count"] >= 3
        assert "crm" in d and d["crm"]["connector"] == "Salesforce"
        assert isinstance(d["assets_by_type"], list) and len(d["assets_by_type"]) > 0

    def test_solo_dashboard_has_retention(self, tokens):
        r = requests.get(f"{API}/dashboard", headers=auth(tokens["solo"]))
        assert r.status_code == 200
        d = r.json()
        assert d["tier"] == "solo"
        assert "retention" in d and d["retention"]["policy"] == "30_day_purge_on_optout"

    def test_advisor_dashboard(self, tokens):
        r = requests.get(f"{API}/dashboard", headers=auth(tokens["advisor"]))
        assert r.status_code == 200
        d = r.json()
        assert d["tier"] == "advisor"
        assert d["clients_count"] >= 3


# ---------- Enterprise write-block ----------
class TestEnterpriseWriteBlock:
    def test_enterprise_cannot_create_owner(self, tokens):
        r = requests.post(f"{API}/owners", headers=auth(tokens["enterprise"]), json={
            "full_name": "Nope", "relationship": "self",
            "date_of_birth": "1970-01-01", "province": "ON",
        })
        assert r.status_code == 403

    def test_enterprise_cannot_create_account(self, tokens):
        owners = requests.get(f"{API}/owners", headers=auth(tokens["enterprise"])).json()
        r = requests.post(f"{API}/accounts", headers=auth(tokens["enterprise"]), json={
            "owner_id": owners[0]["id"], "account_type": "RRSP",
            "institution": "X", "balance": 1000, "annual_contribution": 0,
        })
        assert r.status_code == 403

    def test_enterprise_can_create_goal(self, tokens):
        owners = requests.get(f"{API}/owners", headers=auth(tokens["enterprise"])).json()
        r = requests.post(f"{API}/goals", headers=auth(tokens["enterprise"]), json={
            "owner_id": owners[0]["id"], "title": "TEST_goal_ent",
            "category": "retirement", "target_amount": 1000, "current_amount": 500,
            "target_year": 2040,
        })
        assert r.status_code == 200, r.text
        gid = r.json()["id"]
        # cleanup
        requests.delete(f"{API}/goals/{gid}", headers=auth(tokens["enterprise"]))


# ---------- Advisor CRUD flow ----------
class TestAdvisorCRUD:
    def test_full_owner_account_goal_flow(self, tokens):
        h = auth(tokens["advisor"])
        # Create owner
        r = requests.post(f"{API}/owners", headers=h, json={
            "full_name": "TEST_Owner", "relationship": "self",
            "date_of_birth": "1980-01-01", "province": "ON",
        })
        assert r.status_code == 200, r.text
        owner = r.json()
        oid = owner["id"]
        assert owner["scope"]["advisor_id"] == "adv_lena"

        # GET verify
        got = requests.get(f"{API}/owners", headers=h).json()
        assert any(o["id"] == oid for o in got)

        # Create account
        r = requests.post(f"{API}/accounts", headers=h, json={
            "owner_id": oid, "account_type": "RRSP",
            "institution": "TEST_bank", "balance": 5000, "annual_contribution": 100,
        })
        assert r.status_code == 200, r.text
        aid = r.json()["id"]

        # Create goal
        r = requests.post(f"{API}/goals", headers=h, json={
            "owner_id": oid, "title": "TEST_g", "category": "retirement",
            "target_amount": 1000, "current_amount": 100, "target_year": 2050,
        })
        assert r.status_code == 200
        gid = r.json()["id"]
        assert r.json()["status"] == "behind"  # 10%

        # Progress update to on_track
        r = requests.patch(f"{API}/goals/{gid}/progress", headers=h, json={"current_amount": 800})
        assert r.status_code == 200
        assert r.json()["status"] == "on_track"

        # Delete all
        assert requests.delete(f"{API}/goals/{gid}", headers=h).status_code == 200
        assert requests.delete(f"{API}/accounts/{aid}", headers=h).status_code == 200
        assert requests.delete(f"{API}/owners/{oid}", headers=h).status_code == 200

        # verify erasure
        assert not any(o["id"] == oid for o in requests.get(f"{API}/owners", headers=h).json())

    def test_advisor_cannot_create_account_for_out_of_scope_owner(self, tokens):
        # take enterprise owner
        e_owners = requests.get(f"{API}/owners", headers=auth(tokens["enterprise"])).json()
        r = requests.post(f"{API}/accounts", headers=auth(tokens["advisor"]), json={
            "owner_id": e_owners[0]["id"], "account_type": "RRSP",
            "institution": "x", "balance": 100, "annual_contribution": 0,
        })
        assert r.status_code == 404


# ---------- Advisor roster ----------
class TestAdvisorRoster:
    def test_clients_list(self, tokens):
        r = requests.get(f"{API}/advisor/clients", headers=auth(tokens["advisor"]))
        assert r.status_code == 200
        clients = r.json()
        assert len(clients) >= 3
        for c in clients:
            assert "client_id" in c and "assets" in c and "goals" in c

    def test_forbidden_for_solo(self, tokens):
        r = requests.get(f"{API}/advisor/clients", headers=auth(tokens["solo"]))
        assert r.status_code == 403

    def test_client_detail(self, tokens):
        clients = requests.get(f"{API}/advisor/clients", headers=auth(tokens["advisor"])).json()
        cid = clients[0]["client_id"]
        r = requests.get(f"{API}/advisor/clients/{cid}", headers=auth(tokens["advisor"]))
        assert r.status_code == 200
        d = r.json()
        assert d["client_id"] == cid
        assert all(o["scope"]["client_id"] == cid for o in d["owners"])


# ---------- CRM ----------
class TestCRM:
    def test_sync_state(self, tokens):
        r = requests.get(f"{API}/crm/sync-state", headers=auth(tokens["enterprise"]))
        assert r.status_code == 200
        d = r.json()
        assert d["connector"] == "Salesforce"
        assert d["delete_propagation"] is False

    def test_resync_updates(self, tokens):
        before = requests.get(f"{API}/crm/sync-state", headers=auth(tokens["enterprise"])).json()
        r = requests.post(f"{API}/crm/resync", headers=auth(tokens["enterprise"]))
        assert r.status_code == 200
        after = r.json()
        assert after["last_synced_at"] >= before["last_synced_at"]

    def test_advisor_forbidden(self, tokens):
        assert requests.get(f"{API}/crm/sync-state", headers=auth(tokens["advisor"])).status_code == 403
        assert requests.post(f"{API}/crm/resync", headers=auth(tokens["advisor"])).status_code == 403


# ---------- PIPEDA ----------
class TestPIPEDA:
    def test_consent_toggle(self, tokens):
        h = auth(tokens["solo"])
        r = requests.put(f"{API}/consent", headers=h, json={"marketing": True})
        assert r.status_code == 200
        assert r.json()["marketing"] is True
        # verify persisted
        r2 = requests.get(f"{API}/consent", headers=h).json()
        assert r2["marketing"] is True
        # revert
        requests.put(f"{API}/consent", headers=h, json={"marketing": False})

    def test_export_bundle(self, tokens):
        r = requests.get(f"{API}/export", headers=auth(tokens["solo"]))
        assert r.status_code == 200
        d = r.json()
        for k in ("account", "owners", "accounts", "goals", "consent", "audit_log", "generated_at"):
            assert k in d

    def test_erasure_solo_auto_purge(self, tokens):
        r = requests.post(f"{API}/erasure", headers=auth(tokens["solo"]), json={"confirm": True})
        assert r.status_code == 200
        d = r.json()
        assert d["auto_purge"] is True
        assert d["controller"] == "self"
        assert "purge_at" in d

    def test_erasure_advisor_no_auto_purge(self, tokens):
        r = requests.post(f"{API}/erasure", headers=auth(tokens["advisor"]), json={"confirm": True})
        assert r.status_code == 200
        assert r.json()["auto_purge"] is False

    def test_audit_log_newest_first(self, tokens):
        r = requests.get(f"{API}/audit-log", headers=auth(tokens["advisor"]))
        assert r.status_code == 200
        rows = r.json()
        if len(rows) >= 2:
            assert rows[0]["timestamp"] >= rows[1]["timestamp"]

    def test_retention_solo(self, tokens):
        r = requests.get(f"{API}/retention", headers=auth(tokens["solo"])).json()
        assert r["policy"] == "30_day_purge_on_optout"

    def test_retention_advisor(self, tokens):
        r = requests.get(f"{API}/retention", headers=auth(tokens["advisor"])).json()
        assert r["policy"] == "controller_retention"
        assert r["auto_purge"] is False


# ---------- Promotion ----------
class TestPromotion:
    def test_requires_consent(self, tokens):
        # register a fresh solo user to avoid affecting seeded solo
        import uuid
        email = f"promo_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Testpass123!",
            "name": "Promo Test", "consent_data_processing": True,
        })
        assert reg.status_code == 200
        # First login forces MFA setup
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Testpass123!"})
        assert r.status_code == 200 and r.json()["status"] == "mfa_setup"
        setup = r.json()
        secret = setup["secret"]
        r = requests.post(f"{API}/auth/mfa/verify", json={
            "challenge": setup["challenge"], "code": pyotp.TOTP(secret).now()})
        assert r.status_code == 200 and r.json()["status"] == "security_required"
        sr = r.json()
        r = requests.post(f"{API}/auth/security-question", json={
            "setup_token": sr["setup_token"], "question": sr["questions"][0], "answer": "blue"})
        assert r.status_code == 200 and r.json()["status"] == "authenticated"
        tok = r.json()["token"]
        h = auth(tok)
        # add an owner
        requests.post(f"{API}/owners", headers=h, json={
            "full_name": "Promo Owner", "relationship": "self",
            "date_of_birth": "1990-01-01", "province": "ON",
        })
        # request without full consent
        r = requests.post(f"{API}/promotion/request", headers=h, json={
            "advisor_email": "advisor@compass.ca",
            "consent_data_sharing": True, "consent_reconfirmed": False,
        })
        assert r.status_code == 400

        # non-existent advisor
        r = requests.post(f"{API}/promotion/request", headers=h, json={
            "advisor_email": "nope@compass.ca",
            "consent_data_sharing": True, "consent_reconfirmed": True,
        })
        assert r.status_code == 404

        # success
        r = requests.post(f"{API}/promotion/request", headers=h, json={
            "advisor_email": "advisor@compass.ca",
            "consent_data_sharing": True, "consent_reconfirmed": True,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "migrated"
        assert d["migrated"]["owners"] >= 1

    def test_forbidden_for_non_solo(self, tokens):
        r = requests.post(f"{API}/promotion/request", headers=auth(tokens["advisor"]), json={
            "advisor_email": "advisor@compass.ca",
            "consent_data_sharing": True, "consent_reconfirmed": True,
        })
        assert r.status_code == 403



# ---------- Planning workspace (NEW in iteration 2) ----------
PLAN_COLLS = ["networth", "debts", "expenses", "insurance", "documents", "tax_notes", "retirement"]


class TestPlanningOverview:
    def test_solo_overview_seeded_totals(self, tokens):
        r = requests.get(f"{API}/plan/overview", headers=auth(tokens["solo"]))
        assert r.status_code == 200, r.text
        d = r.json()
        # Allow a tiny tolerance in case erasure/consent tests mutated nothing material
        assert abs(d["totalAssets"] - 792700) < 1, d
        assert abs(d["totalLiabilities"] - 445000) < 1, d
        assert abs(d["netWorth"] - 347700) < 1, d
        # counts
        for k in ("retirementProjections", "insuranceAnalyses", "debtCount",
                  "documents", "goals", "accounts", "monthlyExpenses"):
            assert k in d
        assert d["debtCount"] == 2
        assert d["insuranceAnalyses"] == 2
        assert d["documents"] == 2
        assert d["retirementProjections"] == 1
        # 2900 + 950 + 520 = 4370
        assert abs(d["monthlyExpenses"] - 4370) < 1


class TestPlanningProfile:
    def test_get_profile_returns_self_owner(self, tokens):
        r = requests.get(f"{API}/plan/profile", headers=auth(tokens["solo"]))
        assert r.status_code == 200
        p = r.json()
        assert p["full_name"] == "Jordan Blake"
        assert p["relationship"] == "self"

    def test_put_profile_persists_extra_fields(self, tokens):
        h = auth(tokens["solo"])
        payload = {
            "full_name": "Jordan Blake",
            "relationship": "self",
            "date_of_birth": "1985-08-30",
            "province": "BC",
            "annual_income": 125000,
            "retirement_age": 62,
            "desired_income": 72000,
            "spouse_name": "Sam Blake",
        }
        r = requests.put(f"{API}/plan/profile", headers=h, json=payload)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["province"] == "BC"
        assert updated["annual_income"] == 125000
        # GET verify
        g = requests.get(f"{API}/plan/profile", headers=h).json()
        assert g["province"] == "BC"
        assert g["annual_income"] == 125000
        assert g["retirement_age"] == 62
        # revert to ON for isolation of other tests
        requests.put(f"{API}/plan/profile", headers=h, json={**payload, "province": "ON"})


class TestPlanningCRUD:
    @pytest.mark.parametrize("coll", PLAN_COLLS)
    def test_crud_roundtrip(self, tokens, coll):
        h = auth(tokens["solo"])
        # LIST baseline
        before = requests.get(f"{API}/plan/{coll}", headers=h)
        assert before.status_code == 200, before.text
        base_rows = before.json()
        assert isinstance(base_rows, list)

        # CREATE
        payload = {"name": f"TEST_{coll}_row", "category": "TEST",
                   "value": 1234, "amount": 123, "balance": 100,
                   "rate": 1.1, "payment": 10, "coverage": 1000, "premium": 5,
                   "note": "pytest"}
        r = requests.post(f"{API}/plan/{coll}", headers=h, json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        rid = created["id"]
        assert created.get("name") == f"TEST_{coll}_row"
        assert created["household_id"] == "client_solo1"

        # LIST contains new
        rows = requests.get(f"{API}/plan/{coll}", headers=h).json()
        assert any(x["id"] == rid for x in rows)
        assert len(rows) == len(base_rows) + 1

        # UPDATE
        patch = {**payload, "name": f"TEST_{coll}_row_updated"}
        r = requests.put(f"{API}/plan/{coll}/{rid}", headers=h, json=patch)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == f"TEST_{coll}_row_updated"
        # GET verify persistence
        rows2 = requests.get(f"{API}/plan/{coll}", headers=h).json()
        found = [x for x in rows2 if x["id"] == rid][0]
        assert found["name"] == f"TEST_{coll}_row_updated"

        # DELETE
        r = requests.delete(f"{API}/plan/{coll}/{rid}", headers=h)
        assert r.status_code == 200
        rows3 = requests.get(f"{API}/plan/{coll}", headers=h).json()
        assert not any(x["id"] == rid for x in rows3)

    def test_unknown_collection_404(self, tokens):
        r = requests.get(f"{API}/plan/foobar", headers=auth(tokens["solo"]))
        assert r.status_code == 404
        r = requests.post(f"{API}/plan/foobar", headers=auth(tokens["solo"]), json={"name": "x"})
        assert r.status_code == 404


class TestPlanningTenantIsolation:
    def test_advisor_cannot_see_solo_networth(self, tokens):
        r = requests.get(f"{API}/plan/networth", headers=auth(tokens["advisor"]))
        assert r.status_code == 200
        rows = r.json()
        # Must not contain any solo household rows
        assert all(r.get("household_id") != "client_solo1" for r in rows)
        assert all(r.get("scope", {}).get("client_id") != "client_solo1" for r in rows)

    def test_enterprise_cannot_see_solo_networth(self, tokens):
        r = requests.get(f"{API}/plan/networth", headers=auth(tokens["enterprise"]))
        assert r.status_code == 200
        rows = r.json()
        assert all(r.get("household_id") != "client_solo1" for r in rows)

    def test_advisor_overview_isolated(self, tokens):
        # With a non-seeded household_id, counts must be zero (true tenant isolation)
        r = requests.get(f"{API}/plan/overview", headers=auth(tokens["advisor"]),
                         params={"household_id": "client_a2"})
        assert r.status_code == 200
        d = r.json()
        assert d["debtCount"] == 0
        assert d["insuranceAnalyses"] == 0
        assert d["retirementProjections"] == 0


class TestPlanningEnterpriseWriteBlock:
    def test_enterprise_cannot_create_plan_row(self, tokens):
        r = requests.post(f"{API}/plan/networth", headers=auth(tokens["enterprise"]),
                          json={"kind": "asset", "name": "X", "value": 1})
        assert r.status_code == 403

    def test_enterprise_cannot_update_profile(self, tokens):
        r = requests.put(f"{API}/plan/profile", headers=auth(tokens["enterprise"]),
                         json={"full_name": "X"})
        assert r.status_code == 403

    def test_enterprise_cannot_delete_plan_row(self, tokens):
        # Try deleting a bogus id — still should 403 before 404
        r = requests.delete(f"{API}/plan/networth/nope", headers=auth(tokens["enterprise"]))
        assert r.status_code == 403


class TestPlanningAuth:
    def test_requires_auth(self):
        for coll in PLAN_COLLS:
            r = requests.get(f"{API}/plan/{coll}")
            assert r.status_code == 401
        assert requests.get(f"{API}/plan/overview").status_code == 401
        assert requests.get(f"{API}/plan/profile").status_code == 401
