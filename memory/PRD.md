# Compass Planning — PRD

## Original Problem Statement
Three-tier Canadian retirement planning platform (v1, mock data). Tiers isolate data:
- **Enterprise** (`corp_id` scope, isolated store, CRM = source of truth, mocked Salesforce)
- **Advisor-led** (shared store, `org_id -> advisor_id -> client_id`)
- **Solo** (shared store, `client_id` only, never advisor-linked in v1)
PIPEDA-compliant. v1 runs on a seeded in-memory repository behind a swappable interface (MongoDB later, no interface churn).

## User Choices (v1)
- All three tiers end-to-end (thinner each).
- Auth: JWT email/password now; TOTP MFA deferred to next iteration.
- Data layer: in-memory seeded mock repository (resets + re-seeds on backend restart).
- Brand logo: user will upload (currently an SVG compass/clock placeholder in `Logo.jsx`).
- Salesforce CRM + all integrations fully mocked.

## Architecture
- **Backend** FastAPI: `server.py` (routes + `scope_context`/`write_scope` tenant enforcement), `repository.py` (`Repository` interface + `InMemoryRepository`, `_scope_matches` isolation primitive, two stores: `enterprise` + `shared`), `models.py` (Pydantic), `security.py` (bcrypt + PyJWT), `seed.py` (seeded users/owners/accounts/goals/crm/retention).
- **Auth**: Bearer JWT in `Authorization` header; frontend stores token in localStorage (`compass_token`).
- **Frontend** React (CRA/craco) + Tailwind: `context/AuthContext`, tier-aware `Shell`, pages (Login, Register, Dashboard, Owners, Goals, AdvisorClients, CrmSync, Privacy, AuditLog, Promotion). Locked brand tokens in `tailwind.config.js` + `index.css`.

## User Personas
- Enterprise admin/planner (corp-scoped, CRM-authoritative).
- Firm admin / Advisor (firm book, client households).
- Solo self-serve user (own household + goals; can promote to advisor).

## Implemented (2026-06)
- JWT auth + RBAC; 5 seeded accounts (pwd `Compass2026!`).
- Server-side tenant isolation on every route (cross-tenant reads impossible; verified).
- Tier-aware dashboards with charts (recharts).
- Pension owners/households + accounts CRUD (Enterprise read-only: CRM source of truth, 403 on write).
- Financial goals CRUD + progress with auto status.
- Advisor roster + household drill-down.
- Mocked Salesforce CRM sync-state + manual re-sync (no delete propagation).
- PIPEDA layer: consent toggles + consent_log, right-to-access export (JSON), right-to-erasure (Solo=30-day purge schedule; Advisor/Enterprise=controller retention no auto-purge), append-only audit log, retention view.
- Solo→Advisor promotion: consent re-capture + audited cross-store data migration.
- 33/33 backend pytest pass (`/app/backend/tests/test_compass_backend.py`); all critical frontend flows verified.

## Backlog
- **P0 (Phase B)**: Real MongoDB persistence (two deployments) + Canadian-region hosting; field-level encryption at rest.
- **P1**: TOTP MFA (pyotp) rebuild; secure password reset flow; retirement projections/calculators.
- **P2**: PDF reports + client letters; contributions tracking over time; additional CRM connectors; real Salesforce connector; breach-notification workflow.

## Planning Workspace (added 2026-06, matches original Compass menu)
Solo tier now has the full original sidebar: **Home** (My Dashboard, Insights, My Profile), **My Plan** (Net Worth, Goals, Debt, Retirement, Insurance, Cash Flow, Tax & Estate), **Reports** (AI Insights, Documents, Financial Plan).
- Backend generic planning layer: `/api/plan/{collection}` CRUD for networth/debts/expenses/insurance/documents/tax_notes/retirement + `/api/plan/overview` + `/api/plan/profile` (GET/PUT). Scoped via `planner_scope()`, enterprise write-blocked, tenant-isolated. Seeded for client_solo1.
- Frontend: generic `PlanningPage` (PLAN_CONFIGS) + Retirement calculator, AI Insights (rule-based mock), Financial Plan summary, Insight Dashboard, Profile editor.
- 51/51 backend pytest pass.
- STILL SOLO-ONLY: advisor/enterprise planner integration (drill into a client household and use the same tabs) is the next step; backend scoping already supports `household_id`.

## Household-Centric Planner (added 2026-06) — matches live BrokersEdge app
Reference: live app `westoak.brokersedge.app` (KoC Financial Planning Suite). It is **household-centric** — an advisor opens a client household and every tab edits that household.
- Advisor flow: Clients roster → **Open** sets active household (persisted) → routes to Client Profile; sidebar switches to planner groups (Overview: Dashboard, Client Profile · Financial Planning Suite: Net Worth, Goals, Debt, Retirement, Insurance, Cash Flow, Tax · Reports · Governance). "Active client" banner + **Change client**.
- Backend: `/api/owners|accounts|goals` + `/api/plan/*` accept `household_id`; `_eff_hh()` resolves it (solo = own client_id). Axios interceptor auto-appends `household_id` for advisor/enterprise when active. Server-side `_clean()` strips reserved keys (scope/store/household_id) to block injection. 68/68 pytest pass.
- New faithful **Client Profile**: Primary + Spouse/Partner cards (email, phone, DOB, province, occupation, income, pension, retirement age, desired income) + Children & Dependants; add/edit members. Seeded Nguyen household (client_a1) with spouse Mai + dependant Linh + plan rows.
- Fixed cross-tenant React Query cache leak: `queryClient.clear()` on login/logout; login always routes to /dashboard.
- Enterprise planner integration still pending (planner routes redirect enterprise to /owners until an open-household flow is added). Solo unchanged (own household, no picker).

## Gap vs live app (catalogued, remaining to build later, per user priorities 2a faithful / 3a Canada-only / 4 defer recorder+voice+i18n)
- Clients: scored Household Queue (0–100 score/status, alerts, next action), Book Summary, Opportunities, Score Distribution, New Household.
- Net Worth: Assets/Liabilities/Education tabs, typed accounts (RRSP/TFSA/Non-Reg/Business/Stock Options…), ownership (Joint), allocation donut.
- Debt: weighted avg rate, lifetime interest, payoff timeline, avalanche/snowball.
- Retirement: Pension plans (DBPP/DCPP/Group RRSP/DPSP/Life Annuity), AI Strategist, Monte Carlo projection to age 95.
- Insurance: Coverage/Gap Analysis/LTC/DI tabs, Protection Score, Coverage Adequacy %, Advisor Intelligence, Excel import.
- Cash Flow: income vs expenses. Tax: full CA engine + Estate tab (US deferred).
- Per-person toggle (Primary/Spouse/Combined) across Goals/Retirement/Insurance/Tax.
- Deferred by user: Meeting Recorder, Voice input, EN/FR i18n, ⌘K palette.

## TOTP MFA Security (added 2026-06) — all login/password flows
- Every account requires TOTP. First login forces enrollment (QR + secret) then a recovery security question; subsequent logins require a 6-digit code. Password reset = security question + TOTP code.
- Backend (security.py pyotp/qrcode): `/api/auth/login` returns `mfa_required` or `mfa_setup`; `/api/auth/mfa/verify`; `/api/auth/security-question`; `/api/auth/forgot-password`; `/api/auth/reset-password`; `/api/auth/security-questions`. `_public()` strips mfa_secret + security_answer_hash. Challenge/setup tokens are short-lived scoped JWTs.
- Seeded demo: shared TOTP secret `JBSWY3DPEHPK3PXP`, security answer `toronto`. 82/82 pytest pass; frontend multi-step login verified.
- Frontend: multi-step Login.jsx (password → TOTP verify/setup w/ QR → security question → forgot/reset). AuthContext.applySession().
- Hardening noted (not yet done): challenge one-shot nonce, session invalidation on reset, server-side validation that security question ∈ list.

## Net Worth (faithful rebuild, added 2026-06)
- `/app/frontend/src/pages/NetWorth.jsx`: Assets / Liabilities / Education tabs; summary cards (Net Worth, Total Assets, Total Liabilities); typed Canadian quick-add (Principal Residence, Real Estate other, RRSP, TFSA, Non-Registered, Cash/Bank, Business, Employer Stock Options, Other; liabilities Mortgage/Loan/Credit Card/LOC/Student; education RESP); per-entry Owner, Category, Market Value, Mortgage + Cash Flow (real estate). Backed by generic `/api/plan/networth` (extra fields persisted). Household-scoped for advisor; solo on own household.

## Gaps still remaining (next modules, per priorities 2a faithful / 3a CA-only / 4 defer)
- First-login FORCED password change (live app forces it even for existing users) — we force MFA+security Q but not a mandatory password change.
- Clients scored Household Queue, Book Summary, Opportunities, New Household.
- Debt analytics (weighted rate, lifetime interest, payoff timeline, avalanche/snowball).
- Retirement: pension plans (DBPP/DCPP/Group RRSP/DPSP/Life Annuity), AI Strategist, Monte Carlo to age 95, RRSP Meltdown.
- Insurance: Coverage/Gap/LTC/DI sub-tabs, Protection Score, Coverage Adequacy %, Advisor Intelligence, Excel import.
- Cash Flow income side; Tax CA engine (RRSP/TFSA Room, Tax Projection, Capital Gains, Income Splitting) + Estate; per-person Primary/Spouse/Combined toggle.

## Persistent MongoDB + Debt/Retirement/Cash Flow (added 2026-06)
- **Data layer swapped to persistent MongoDB** (`MongoRepository` in `repository.py`, now the default `repo`). Same `Repository` interface — no route changes. Scope isolation enforced via nested `scope.*` Mongo queries; `_id` projected out on every read. **Users, TOTP enrolments and all planning data now survive backend restarts** (fixes the in-memory MFA-reset issue). Seed is idempotent (skipped once `scott@sweston.ca` exists). `repo.all_users()` added to the interface (dashboard planner lookup).
- Demo accounts seeded **unenrolled** → first login shows QR setup, which then persists in Mongo. Shared TOTP secret `JBSWY3DPEHPK3PXP` + reset snippet documented in `test_credentials.md` for automated testing.
- **Debt Analytics** (`pages/Debt.jsx` + `lib/finance.js`): weighted-average rate, per-debt payoff months + lifetime interest, and **Avalanche vs Snowball** comparison (payoff order, months-to-debt-free, total interest, interest saved vs minimums) with an optional extra-monthly-payment input (rolled forward as debts clear). Full debt CRUD.
- **Retirement Engine** (`pages/Retirement.jsx` + `lib/finance.js`): pension plan type **DBPP** (annual pension + indexing) / **DCPP** / **Group RRSP** (capital-accumulation note); client-side **Monte Carlo** (1,000 trials, mean 5.5% / vol 10% / inflation 2.1%, randomised returns) projecting to **age 95**, reporting success probability + 10th/50th/90th ending-balance percentiles alongside the deterministic nest egg. Saves projections with success %.
- **Rental Cash Flow** (`pages/CashFlow.jsx`): income (owner `annual_income` + Net Worth rental income) vs expenses = monthly surplus/shortfall. Rental income from a property **Held in a holding company is excluded** from household cash flow (struck-through + badge + note). New `in_holding_company` toggle on rental real estate.
- **Net Worth category-adaptive fields** (`pages/NetWorth.jsx`): Real Estate (value, mortgage, payment+frequency, property taxes, rate, rental toggle → income + holdco); Investments RRSP/TFSA/Non-Reg (balance, contribution+frequency, holding type GIC/SegFund/MutualFund/Stock…); new **Vehicle** category (purchase price, loan amount, rate, payment+frequency, purchase date, loan length). Persisted via `extra="allow"` planning items.
- Server-side guard: advisor tier plan writes (POST/PUT/DELETE `/api/plan/*`) now require `household_id` (400 otherwise) — prevents unscoped writes.
- Testing: iter5 — backend 14/14 new pytest pass; frontend 100% (Net Worth adaptive fields, Debt savings, Retirement MC + DBPP/DCPP branching, Cash Flow holdco exclusion). Report `/app/test_reports/iteration_5.json`.

## Next Tasks
1. TOTP MFA enrollment + verification (deferred from v1 auth choice).
2. MongoDB-backed `Repository` implementation swapped behind existing interface.
3. Password reset endpoints + email delivery.
