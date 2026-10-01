"""Seed realistic mock data for Compass Planning v1."""
import os
from datetime import datetime, timezone
from security import hash_password
from repository import repo
from models import _id

CORP_SWESTON = "corp_sweston"
ORG_MAPLE = "org_maple"
ADV_LENA = "adv_lena"
CLIENT_SOLO = "client_solo1"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _owner(store, scope, full_name, rel, dob, prov, source="compass", crm_id=None):
    return {
        "id": _id(), "store": store, "scope": scope, "full_name": full_name,
        "relationship": rel, "date_of_birth": dob, "province": prov,
        "source": source, "crm_record_id": crm_id, "created_at": _now(),
    }


def _account(store, scope, owner_id, atype, inst, bal, contrib):
    return {
        "id": _id(), "store": store, "scope": scope, "owner_id": owner_id,
        "account_type": atype, "institution": inst, "balance": bal,
        "annual_contribution": contrib, "created_at": _now(),
    }


def _goal(store, scope, owner_id, title, cat, target, current, year, status):
    return {
        "id": _id(), "store": store, "scope": scope, "owner_id": owner_id,
        "title": title, "category": cat, "target_amount": target,
        "current_amount": current, "target_year": year, "status": status,
        "created_at": _now(),
    }


def _audit(store, scope, actor, action, resource, detail):
    return {
        "id": _id(), "store": store, "scope": scope, "actor_email": actor,
        "action": action, "resource": resource, "detail": detail, "timestamp": _now(),
    }


def seed():
    if repo.find_user_by_email("scott@sweston.ca"):
        return  # already seeded

    pw = os.environ.get("DEMO_PASSWORD", "Compass2026!")
    ph = hash_password(pw)
    totp_secret = os.environ.get("DEMO_TOTP_SECRET", "JBSWY3DPEHPK3PXP")
    answer_hash = hash_password("toronto")

    # ---------------- Users ----------------
    users = [
        {"email": "scott@sweston.ca", "name": "Scott Weston", "tier": "enterprise",
         "role": "enterprise_admin", "scope": {"corp_id": CORP_SWESTON}, "mfa_enabled": True},
        {"email": "planner@sweston.ca", "name": "Priya Nair", "tier": "enterprise",
         "role": "enterprise_planner", "scope": {"corp_id": CORP_SWESTON}, "mfa_enabled": False},
        {"email": "firmadmin@compass.ca", "name": "Marcus Reid", "tier": "advisor",
         "role": "firm_admin", "scope": {"org_id": ORG_MAPLE}, "mfa_enabled": False},
        {"email": "advisor@compass.ca", "name": "Lena Tremblay", "tier": "advisor",
         "role": "advisor", "scope": {"org_id": ORG_MAPLE, "advisor_id": ADV_LENA}, "mfa_enabled": True},
        {"email": "solo@compass.ca", "name": "Jordan Blake", "tier": "solo",
         "role": "solo_user", "scope": {"client_id": CLIENT_SOLO}, "mfa_enabled": False},
    ]
    for u in users:
        repo.insert_user({
            "id": _id(), "email": u["email"].lower(), "password_hash": ph,
            "name": u["name"], "tier": u["tier"], "role": u["role"],
            "scope": {"corp_id": None, "org_id": None, "advisor_id": None, "client_id": None, **u["scope"]},
            "mfa_enabled": False, "mfa_secret": None,
            "security_question": "What city were you born in?", "security_answer_hash": answer_hash,
            "consent": {"marketing": False, "data_processing": True,
                        "crm_sharing": u["tier"] == "enterprise", "updated_at": _now()},
            "created_at": _now(),
        })

    # ---------------- Enterprise store (corp_sweston, CRM-authoritative) ----------------
    ent_scope = {"corp_id": CORP_SWESTON}
    ent_owners = [
        _owner("enterprise", ent_scope, "Eleanor Whitfield", "self", "1968-04-12", "ON", "crm", "SF-0012"),
        _owner("enterprise", ent_scope, "Raymond Whitfield", "spouse", "1966-09-02", "ON", "crm", "SF-0013"),
        _owner("enterprise", ent_scope, "Dev Patel", "self", "1972-01-25", "BC", "crm", "SF-0021"),
        _owner("enterprise", ent_scope, "Sophie Girard", "self", "1979-11-08", "QC", "crm", "SF-0033"),
    ]
    for o in ent_owners:
        repo.create("enterprise", "owners", o)
    repo.create("enterprise", "accounts", _account("enterprise", ent_scope, ent_owners[0]["id"], "DB Pension", "Sweston Pension Trust", 842000, 0))
    repo.create("enterprise", "accounts", _account("enterprise", ent_scope, ent_owners[0]["id"], "RRSP", "RBC", 310500, 12000))
    repo.create("enterprise", "accounts", _account("enterprise", ent_scope, ent_owners[1]["id"], "TFSA", "TD", 88000, 7000))
    repo.create("enterprise", "accounts", _account("enterprise", ent_scope, ent_owners[2]["id"], "DC Pension", "Sweston Group RRSP", 415000, 18000))
    repo.create("enterprise", "accounts", _account("enterprise", ent_scope, ent_owners[3]["id"], "RRSP", "Desjardins", 205000, 9000))
    repo.create("enterprise", "goals", _goal("enterprise", ent_scope, ent_owners[0]["id"], "Retire at 62", "retirement", 1500000, 1240500, 2030, "on_track"))
    repo.create("enterprise", "goals", _goal("enterprise", ent_scope, ent_owners[2]["id"], "Bridge to CPP", "income", 500000, 415000, 2034, "at_risk"))
    repo.create("enterprise", "goals", _goal("enterprise", ent_scope, ent_owners[3]["id"], "Legacy fund", "legacy", 300000, 205000, 2040, "behind"))

    repo.create("enterprise", "crm_sync_state", {
        "id": _id(), "store": "enterprise", "scope": ent_scope,
        "connector": "Salesforce", "status": "connected", "authoritative": True,
        "last_synced_at": _now(), "records_synced": 4, "pending_changes": 0,
        "delete_propagation": False,
    })
    for a in [
        _audit("enterprise", ent_scope, "system@compass.ca", "crm.sync", "owners", "Pulled 4 records from Salesforce"),
        _audit("enterprise", ent_scope, "scott@sweston.ca", "auth.login", "session", "Enterprise admin signed in"),
    ]:
        repo.create("enterprise", "audit_log", a)

    # ---------------- Shared store: Advisor tier (org_maple / adv_lena) ----------------
    clients = [
        ("client_a1", "The Nguyen Household", "Anh Nguyen", "self", "1975-06-14", "ON"),
        ("client_a2", "The Okafor Household", "Chidi Okafor", "self", "1981-03-22", "AB"),
        ("client_a3", "The Rossi Household", "Elena Rossi", "self", "1969-12-01", "ON"),
    ]
    for cid, hh, name, rel, dob, prov in clients:
        sc = {"org_id": ORG_MAPLE, "advisor_id": ADV_LENA, "client_id": cid}
        o = _owner("shared", sc, name, rel, dob, prov)
        repo.create("shared", "owners", o)
        repo.create("shared", "accounts", _account("shared", sc, o["id"], "RRSP", "Wealthsimple", 180000 + hash(cid) % 90000, 11000))
        repo.create("shared", "accounts", _account("shared", sc, o["id"], "TFSA", "EQ Bank", 62000 + hash(name) % 30000, 7000))
        repo.create("shared", "goals", _goal("shared", sc, o["id"], f"{hh.split()[1]} retirement", "retirement", 900000, 420000 + hash(cid) % 200000, 2036, "on_track"))
        repo.create("shared", "audit_log", _audit("shared", sc, "advisor@compass.ca", "client.create", "household", f"Onboarded {hh}"))

    # Enrich the first advisor household (client_a1) for the household-centric planner
    a1 = {"org_id": ORG_MAPLE, "advisor_id": ADV_LENA, "client_id": "client_a1"}
    a1_owners = repo.list("shared", "owners", {"client_id": "client_a1"})
    if a1_owners:
        self_o = a1_owners[0]
        repo.update("shared", "owners", self_o["id"], {
            "email": "anh@nguyen.ca", "phone": "416-555-0123", "occupation": "Software Engineer",
            "annual_income": 132000, "pension_type": "DCPP", "retirement_age": 63, "desired_income": 6000,
        }, {"client_id": "client_a1"})
        repo.create("shared", "owners", _owner("shared", a1, "Mai Nguyen", "spouse", "1977-05-10", "ON"))
        mai = repo.list("shared", "owners", {"client_id": "client_a1"})
        mai_o = next((o for o in mai if o.get("relationship") == "spouse"), None)
        if mai_o:
            repo.update("shared", "owners", mai_o["id"], {
                "occupation": "Teacher", "annual_income": 78000, "pension_type": "DBPP",
                "retirement_age": 61, "desired_income": 3500,
            }, {"client_id": "client_a1"})
        repo.create("shared", "owners", _owner("shared", a1, "Linh Nguyen", "dependent", "2010-09-01", "ON"))

        def PA(coll, data):
            repo.create("shared", f"plan_{coll}", {"id": _id(), "store": "shared", "scope": a1,
                                                    "household_id": "client_a1", "created_at": _now(), **data})
        PA("networth", {"kind": "asset", "category": "Property", "name": "Family home", "value": 820000})
        PA("networth", {"kind": "liability", "category": "Mortgage", "name": "Home mortgage", "value": 390000})
        PA("debts", {"name": "Mortgage", "balance": 390000, "rate": 4.6, "payment": 2400, "lender": "Scotiabank"})
        PA("expenses", {"category": "Housing", "name": "Mortgage + utilities", "amount": 2700})
        PA("expenses", {"category": "Food", "name": "Groceries", "amount": 1100})
        PA("insurance", {"policy_type": "Term Life", "carrier": "Sun Life", "coverage": 750000, "premium": 62, "insured": "Anh Nguyen"})
        PA("documents", {"name": "Will.pdf", "doc_type": "Estate", "status": "On file"})
        PA("retirement", {"name": "Base case", "retire_age": 63, "monthly_income_goal": 6000, "result": "On track", "note": "DCPP + CPP"})

    # ---------------- Shared store: Solo tier (client_solo1) ----------------
    solo_scope = {"client_id": CLIENT_SOLO}
    so = _owner("shared", solo_scope, "Jordan Blake", "self", "1985-08-30", "ON")
    repo.create("shared", "owners", so)
    repo.create("shared", "owners", _owner("shared", solo_scope, "Sam Blake", "spouse", "1987-02-17", "ON"))
    repo.create("shared", "accounts", _account("shared", solo_scope, so["id"], "TFSA", "Questrade", 41500, 6500))
    repo.create("shared", "accounts", _account("shared", solo_scope, so["id"], "RRSP", "Wealthsimple", 73200, 8000))
    repo.create("shared", "goals", _goal("shared", solo_scope, so["id"], "Retire at 65", "retirement", 850000, 114700, 2050, "on_track"))
    repo.create("shared", "goals", _goal("shared", solo_scope, so["id"], "Home down payment", "purchase", 120000, 41500, 2028, "at_risk"))
    repo.create("shared", "audit_log", _audit("shared", solo_scope, "solo@compass.ca", "auth.register", "account", "Solo self-signup completed"))

    repo.create("shared", "retention_schedule", {
        "id": _id(), "store": "shared", "scope": solo_scope,
        "controller": "self", "tier": "solo", "policy": "30_day_purge_on_optout",
        "opt_out_at": None, "purge_at": None, "status": "active",
    })

    # ---------------- Planning workspace seed (Solo household) ----------------
    def P(coll, data):
        repo.create("shared", f"plan_{coll}", {
            "id": _id(), "store": "shared", "scope": solo_scope,
            "household_id": CLIENT_SOLO, "created_at": _now(), **data,
        })

    P("networth", {"kind": "asset", "category": "Property", "name": "Primary residence", "value": 650000})
    P("networth", {"kind": "asset", "category": "Vehicle", "name": "Honda CR-V", "value": 28000})
    P("networth", {"kind": "liability", "category": "Other", "name": "Student loan", "value": 14000})
    P("debts", {"name": "Mortgage", "balance": 420000, "rate": 4.9, "payment": 2600, "lender": "TD"})
    P("debts", {"name": "Line of credit", "balance": 11000, "rate": 8.2, "payment": 300, "lender": "RBC"})
    P("expenses", {"category": "Housing", "name": "Mortgage + utilities", "amount": 2900})
    P("expenses", {"category": "Food", "name": "Groceries & dining", "amount": 950})
    P("expenses", {"category": "Transport", "name": "Fuel, insurance, transit", "amount": 520})
    P("insurance", {"policy_type": "Term Life", "carrier": "Canada Life", "coverage": 500000, "premium": 46, "insured": "Jordan Blake"})
    P("insurance", {"policy_type": "Critical Illness", "carrier": "Manulife", "coverage": 100000, "premium": 38, "insured": "Jordan Blake"})
    P("documents", {"name": "Will & POA.pdf", "doc_type": "Estate", "status": "On file"})
    P("documents", {"name": "Mortgage statement.pdf", "doc_type": "Debt", "status": "On file"})
    P("retirement", {"name": "Base case", "retire_age": 65, "monthly_income_goal": 4500, "result": "On track", "note": "CPP + OAS + RRSP drawdown"})
    P("tax_notes", {"name": "TFSA room", "note": "Maximize TFSA before RRSP given current bracket", "category": "Planning"})
