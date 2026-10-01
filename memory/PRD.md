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

## Insurance / Tax / Household Queue / Person Toggle (added 2026-06)
- **Insurance Gap Analysis** (`pages/Insurance.jsx`): **Protection Score (0–100)** + Life / LTC / Disability tabs. Recommended coverage = Life (10× income + total debt + $100k/dependant), DI (65% income replacement, monthly), LTC ($100k/yr × 3 yrs). Each tab shows recommended vs current, gap, adequacy % bar, and the policies in that bucket; adding a policy lifts the score live. Score = 0.5·Life + 0.3·DI + 0.2·LTC adequacy.
- **Canadian Tax Engine** (`lib/tax.js` + `pages/Tax.jsx`, 2025 rules): **Tax Projection** (federal + ON/BC/AB/QC brackets → federal/provincial/total, average & marginal rate, after-tax), **RRSP room** (18% of earned income capped at $32,490 + carry-forward − contributions), **TFSA room** (cumulative 2009–2025 limit − contributions), **Capital gains** (50% inclusion at marginal rate), **Income splitting** (separate vs even-split savings). Province defaults from the client profile; others fall back to ON.
- **Advisor Household Queue** (`server.py` `_household_score()` + `pages/AdvisorClients.jsx`): roster of scored cards — **0–100 health score**, **status** (On Track / Needs Review / At Risk), **alerts** (no retirement plan, no insurance, high-rate debt >10%, goals off track, negative net worth) and a **next-best-action**, plus book stat cards (households, book assets, avg score, need-attention). Backend computes from each household's plan collections.
- **Spouse / Combined Toggle** (`components/PersonToggle.jsx`): Primary / Spouse / Combined switch on **Retirement, Debt, Cash Flow**. Debt & expense entries carry an owner tag (Primary/Spouse/Joint; default Joint) — Primary view = Primary+Joint, Spouse = Spouse+Joint, Combined = all — recomputing totals/analytics. Retirement prefills retire age / income goal / pension type from the selected owner's profile. Seeded spouse Mai Nguyen with profile fields for the demo.
- Server guard extended: advisor `PUT /plan/profile` now also requires an open household.
- Testing: iter6 — backend 12/12 pass; frontend 100% (Household Queue scoring, Insurance score + 3 tabs + add-policy, Tax 5 tabs reactive incl. RRSP cap, person toggles present/working). Report `/app/test_reports/iteration_6.json`.

## Estate / Goal Funding / Alerts Feed / Client PDF (added 2026-06)
- **Estate Planning** (`pages/Tax.jsx` Estate tab + `lib/tax.js`): beneficiary register (asset → beneficiary + allocation %) and will/POA register (type + status) stored in a new `estate` plan collection; **estate settlement estimate** = provincial probate fees (ON 1.5% over $50k, BC ~1.4%, AB flat, QC $0) + deemed-disposition tax on registered assets (RRSP/RRIF at marginal rate). Illustrative, Canada-only.
- **Goal Funding Link** (`pages/Goals.jsx` + `models.py` Goal.linked_asset_ids): goals can link Net Worth assets / accounts as funding sources; linked goals auto-compute current amount from live balances (manual entry disabled), shown with an 'Auto-funded' badge. Goals are now editable. Backend persists `linked_asset_ids` on create/update.
- **Advisor Alerts Feed** (`pages/Dashboard.jsx`): advisor dashboard 'Action feed' aggregates every household's Household-Queue alerts (reuses `/advisor/clients` scoring), worst-score first, each row opening that household.
- **Client PDF Report** (`pages/ClientReport.jsx`, jsPDF): branded one-page household summary (net worth, assets/liabilities, protection score, retirement success %, top goals) downloadable from Reports → Client Report. Route `/report`.
- Testing: iter7 — backend 4/4 pass; frontend 100% (Estate CRUD + estimate reactive to province, goal linking auto-funds, alerts feed navigates, PDF downloads). Fixed GoalModal uncontrolled-input warning. Report `/app/test_reports/iteration_7.json`.

## Report Branding / Estate Flags / Goal Projections / Email Report (added 2026-06)
- **Report Branding** (`pages/ClientReport.jsx`): Branding panel with firm name, cover note, and logo upload (stored per-advisor in localStorage) — all drawn into the jsPDF header/body and the live preview.
- **Estate Flags** (`server.py` `_household_score`): "No will on file" (−10) and "Beneficiary designations missing" (−5) now feed the household health score, Household Queue alerts and the dashboard Action Feed. Will check is case-insensitive on doc_type/status.
- **Goal Projections** (`models.py` Goal + `pages/Goals.jsx`): optional monthly contribution + expected growth % per goal; the card shows a projected funding date (green if on/before target year, amber if after). `monthly_contribution`/`growth_rate` persist.
- **Email Report** (`email_service.py` + `POST /api/report/email`, Emergent-managed Resend): advisor emails a branded HTML household summary (net worth, protection score, retirement success %, top goals) to a recipient. Server-rendered template (no caller markup) + `_assert_safe_email` gate + per-user rate limit. PDF stays an in-app download. `.env`: EMERGENT_EMAIL_KEY, EMAIL_FROM_NAME="Compass Planning".
- Cleaned up leftover "Promo Owner" test households from Mongo.
- Testing: iter8 — backend 6/6 pass; frontend 100% (branding persists + PDF, email send toast, goal projection on card, estate flags in feed/queue). Report `/app/test_reports/iteration_8.json`.

## Estate PDF / Branding Sync / Goal Nudges / Report History (added 2026-06)
- **Estate PDF Section** (`pages/ClientReport.jsx`): the Client Report preview and downloadable PDF now include an Estate section — probate fees, deemed-disposition tax, total settlement cost (province-aware) plus beneficiary/will register entries.
- **Firm Branding Sync** (`server.py` GET/PUT `/advisor/branding`): firm name, cover note and logo are stored on the advisor profile (Mongo) so branding follows the advisor across devices; localStorage is a cache/fallback. Enterprise tier blocked (403).
- **Goal Nudges** (`server.py` `_goal_behind` + `_household_score`): goals whose projected funding year exceeds target_year (or whose target year has passed while under-funded) surface as "N goal(s) behind projected schedule" in the Household Queue and dashboard Action Feed.
- **Report History** (`server.py` `report_log` + GET `/report/history`): every emailed summary is logged (recipient, date, metrics) scoped to the household and shown in a Sent-history card on the Client Report page.
- Hardened: email_service boots safely if keys unset (503 instead of crash); branding GET returns a stable default shape.
- Testing: iter9 — backend 8/8 pass; frontend 100% (estate in PDF, server branding sync across reload, nudge alerts, history logging). Report `/app/test_reports/iteration_9.json`.

## Branded Email / History Drill-in / Nudge Fix / Book Report (added 2026-06)
- **Branding in Email** (`email_service.py`): the emailed HTML summary header now shows the advisor's firm name + an initials badge (real image logos can't be inlined due to the managed-email safety gate; firm name/initials used instead). `render_report_html` takes `firm_name` from `user.branding`.
- **History Drill-in** (`pages/ClientReport.jsx`): Sent-history rows are clickable → modal showing recipient, sent datetime, net worth, protection score, retirement success for that send (figures stored in `report_log`).
- **Nudge Fix Shortcut** (`pages/Goals.jsx`): under-funded goals show a "Catch up: contribute $X/mo" suggestion (required monthly to hit target by target_year) with an Apply button; overdue goals show a review-timeline note.
- **Multi-Household Report** (`pages/AdvisorClients.jsx`): a "Book report" button on the Household Queue downloads a combined book-level PDF (every household with score, status, net worth, top alert) via jsPDF.
- Testing: iter10 — backend 2/2 pass; frontend 100% (branded email header, history modal, nudge apply flips goal on-track, book-review.pdf downloads). Report `/app/test_reports/iteration_10.json`.

## Next Tasks
1. TOTP MFA enrollment + verification (deferred from v1 auth choice).
2. MongoDB-backed `Repository` implementation swapped behind existing interface.
3. Password reset endpoints + email delivery.
