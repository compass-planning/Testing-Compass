"""Iter38 backend tests: Report Section Toggles, Education→Goal Sync, State Tax (VA/MD/OR/MN/SC), Invite Reminders cron auth."""
import os
import pyotp
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
PWD = os.environ.get("TEST_PASSWORD", "Compass2026!")
TOTP = "JBSWY3DPEHPK3PXP"
HID = "client_a1"


def _login(email):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": PWD})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["status"] == "mfa_required", j
    code = pyotp.TOTP(TOTP).now()
    r = s.post(f"{BASE}/api/auth/mfa/verify", json={"challenge": j["challenge"], "code": code})
    assert r.status_code == 200, r.text
    j2 = r.json()
    assert j2["status"] == "authenticated", j2
    s.headers.update({"Authorization": f"Bearer {j2['token']}"})
    return s


@pytest.fixture(scope="module")
def advisor():
    return _login("advisor@compass.ca")


# ---------- (1) Report section toggles -> /api/report/pdf?sections=... ----------
class TestReportSections:
    def test_full_plan_all_sections(self, advisor):
        r = advisor.get(f"{BASE}/api/report/pdf?household_id={HID}")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        self.full_size = len(r.content)
        assert len(r.content) > 2000

    def test_full_plan_filtered_smaller(self, advisor):
        r_all = advisor.get(f"{BASE}/api/report/pdf?household_id={HID}")
        r_sub = advisor.get(f"{BASE}/api/report/pdf?household_id={HID}&sections=retirement,protection")
        assert r_all.status_code == 200 and r_sub.status_code == 200
        assert len(r_sub.content) < len(r_all.content), (len(r_sub.content), len(r_all.content))

    def test_email_accepts_sections(self, advisor):
        r = advisor.post(f"{BASE}/api/report/email?household_id={HID}", json={
            "recipient": "TEST_sections@example.com",
            "net_worth": 100000, "protection_score": 70, "retirement_success": 80,
            "sections": ["retirement", "protection"],
        })
        assert r.status_code == 200, r.text


# ---------- (2) Education goal sync ----------
class TestEducationGoalSync:
    def _save(self, s, children):
        return s.post(f"{BASE}/api/plan/education/save?household_id={HID}", json={
            "family_income": 90000, "children": children,
        })

    def _resp_goals(self, s):
        r = s.get(f"{BASE}/api/goals?household_id={HID}")
        assert r.status_code == 200
        return [g for g in r.json() if g.get("source") == "resp"]

    def test_save_creates_goal_per_child(self, advisor):
        children = [
            {"name": "TESTAva", "child_age": 5, "current_savings": 2000, "monthly_contribution": 150, "tuition_goal": 80000},
            {"name": "TESTLeo", "child_age": 8, "current_savings": 500, "monthly_contribution": 100, "tuition_goal": 60000},
        ]
        r = self._save(advisor, children)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        goals = self._resp_goals(advisor)
        names = {g.get("resp_child") for g in goals}
        assert "TESTAva" in names and "TESTLeo" in names
        ava = next(g for g in goals if g.get("resp_child") == "TESTAva")
        assert ava["title"] == "Education fund — TESTAva"
        assert ava["category"] == "education"
        assert ava["target_amount"] == 80000

    def test_resave_updates_not_duplicates(self, advisor):
        children = [
            {"name": "TESTAva", "child_age": 6, "current_savings": 3000, "monthly_contribution": 200, "tuition_goal": 95000},
            {"name": "TESTLeo", "child_age": 9, "current_savings": 800, "monthly_contribution": 120, "tuition_goal": 65000},
        ]
        r = self._save(advisor, children)
        assert r.status_code == 200
        goals = self._resp_goals(advisor)
        test_goals = [g for g in goals if g.get("resp_child", "").startswith("TEST")]
        # one per child, not duplicated
        assert len(test_goals) == 2, [g.get("resp_child") for g in test_goals]
        ava = next(g for g in test_goals if g["resp_child"] == "TESTAva")
        assert ava["target_amount"] == 95000  # updated


# ---------- (3) State tax everywhere ----------
@pytest.mark.parametrize("state,min_tax", [
    ("VA", 1000),
    ("MD", 1000),
    ("OR", 1000),
    ("MN", 1000),
    ("SC", 1000),
])
def test_progressive_state_tax(advisor, state, min_tax):
    r = advisor.post(f"{BASE}/api/plan/crossborder", json={
        "ca_resident": False, "us_green_card": True, "us_citizen": False,
        "state": state, "us_filing_status": "single",
        "annual_income": 120000,
    })
    assert r.status_code == 200, r.text
    j = r.json()
    us = j.get("us_tax") or {}
    assert us.get("state") == state
    assert us.get("state_tax", 0) > min_tax, us
    assert "Progressive" in us.get("state_note", ""), us


def test_va_specific_value(advisor):
    r = advisor.post(f"{BASE}/api/plan/crossborder", json={
        "ca_resident": False, "us_green_card": True, "state": "VA",
        "us_filing_status": "single", "annual_income": 120000,
    })
    assert r.status_code == 200
    us = r.json()["us_tax"]
    # Spec: ~$5,803 for single filer, income 120000 (progressive on taxable=105,400 after $14,600 std deduction)
    assert 5500 < us["state_tax"] < 6100, us


def test_flat_state_pa_note(advisor):
    r = advisor.post(f"{BASE}/api/plan/crossborder", json={
        "ca_resident": False, "us_green_card": True, "state": "PA",
        "us_filing_status": "single", "annual_income": 120000,
    })
    us = r.json()["us_tax"]
    assert us["state_tax"] > 0
    assert "Simplified" in us.get("state_note", "") or "flat" in us.get("state_note", "").lower() or "marginal" in us.get("state_note", "").lower()


def test_tx_zero(advisor):
    r = advisor.post(f"{BASE}/api/plan/crossborder", json={
        "ca_resident": False, "us_green_card": True, "state": "TX",
        "us_filing_status": "single", "annual_income": 120000,
    })
    us = r.json()["us_tax"]
    assert us["state_tax"] == 0


# ---------- (4) Invite reminders cron auth ----------
class TestInviteReminderCron:
    def test_no_auth(self):
        r = requests.post(f"{BASE}/api/cron/invite-reminders")
        assert r.status_code == 401

    def test_bad_auth(self):
        r = requests.post(f"{BASE}/api/cron/invite-reminders",
                          headers={"Authorization": "Bearer wrong_secret_xyz"})
        assert r.status_code == 401
