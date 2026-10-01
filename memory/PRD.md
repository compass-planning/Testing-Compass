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

## Book Branding / Debounced Save / Nudge Realism / History Pagination / Forced PW Change (added 2026-06, iter11)
- **Book Report Branding** (`pages/AdvisorClients.jsx`): the multi-household `book-review.pdf` header now pulls the advisor's firm name (and logo if set) from `GET /advisor/branding` instead of a hardcoded title.
- **Debounced Branding Save** (`pages/ClientReport.jsx`): `persist()` updates the preview + localStorage instantly but debounces the `PUT /advisor/branding` by ~600ms (saveTimer ref) so firm-name/cover-note no longer fire a write per keystroke.
- **Nudge Realism Check** (`pages/Goals.jsx`): when a goal's required catch-up contribution exceeds 20% of household monthly income (cap = 0.2·monthlyIncome, fallback $3,000/mo if income unknown), the catch-up box turns red with an `AlertTriangle` warning and offers **Extend to {year}** (`realisticYear()` finds the earliest year the contribution fits the cap, falling back to +50y) alongside **Apply**. `applyExtend()` pushes `target_year` out and recomputes `monthly_contribution`.
- **History Pagination** (`pages/ClientReport.jsx`): Sent-history shows 5 rows with a **Load more** button (+5 per click) as the log grows per household.
- **First-login forced password change (P0)** (`server.py` + `seed.py` + `pages/Login.jsx`): users with `must_change_password=True` get `{status:"password_change_required", change_token}` after MFA instead of a session; new `POST /auth/change-password` validates (min 8, must differ from current), clears the flag, then issues the session. Frontend `ChangeStep` handles the new step. `solo@compass.ca` seeded with the flag (+ MFA unenrolled) to demo it; other demo accounts unaffected.
- Testing: iter11 — backend 2/2 pytest pass; frontend 5/5 features pass. Report `/app/test_reports/iteration_11.json`.

## Book Cover Note / Opportunities Board / Password Strength / New Household (added 2026-06, iter12)
- **Book Cover Note** (`pages/AdvisorClients.jsx` `buildBookPdf`): the multi-household `book-review.pdf` now renders the advisor's branding cover note beneath the "Book Review" title (mirrors the single-household report), in addition to the firm name/logo.
- **Opportunities Board** (`pages/AdvisorClients.jsx`): a Queue ⇄ Opportunities view switch on the Household Queue. Opportunities flattens every household alert into a sortable list (`opportunities-list`) — household, status, alert, next action, score, Open — with a sort selector (`opps-sort`): Lowest score first (default), Highest score first, Household A–Z.
- **Password Strength Meter** (`pages/Login.jsx` `ChangeStep`): the first-login forced-change screen shows a live strength bar (`pw-strength`) + rules checklist (length, upper, lower, number, symbol). Submit is gated on a strong password (≥8 chars and ≥3 of 4 character classes) AND a matching confirm field (`pw-mismatch` shown otherwise).
- **New Household** (`pages/AdvisorClients.jsx` `NewHouseholdModal` + `createHousehold`): a "New household" button on the queue opens a modal (primary name + province). It clears the active household so `POST /owners` generates a fresh `client_id`, then sets it active and routes to Client Profile. New households appear in `GET /advisor/clients`.
- Testing: iter12 — backend 5/5 pytest pass; frontend 4/4 features pass. Report `/app/test_reports/iteration_12.json`.

## Household Onboarding / Opportunity Filters / Needs-Setup Badge / Logo-in-Email (added 2026-06, iter13)
- **Household Onboarding** (`pages/AdvisorClients.jsx` `NewHouseholdModal` + `createHousehold`): the New Household modal now also captures the primary's annual income and an optional spouse (name + income). Creating posts the primary `self` owner (fresh client_id) and, if provided, a second `spouse` owner scoped to that household, then opens Client Profile.
- **Opportunity Filters** (`pages/AdvisorClients.jsx` `OpportunitiesList`): the board now has `opps-filter-type` (Retirement/Insurance/Debt/Goals/Estate/Net worth/Setup/Other) and `opps-filter-status` dropdowns beside the sort, so advisors can batch similar fixes. Each row shows a type badge.
- **Needs-Setup Badge** (`backend/server.py` `_household_score`): a brand-new household with no accounts/goals/plan data returns `needs_setup=true`, `status='Needs Setup'`, `score=null`; the queue shows a neutral 'Needs Setup' chip and '—' instead of a misleading 0, and it is excluded from the Avg. health score.
- **Logo In Email** (`backend/storage.py` + `server.py` + `email_service.py` + `pages/ClientReport.jsx`): advisor logo is uploaded to Emergent object storage (`POST /advisor/branding/logo`), served publicly at `GET /api/public/logo/{uid}`, and the frontend stores `branding.logo_url` (external https). Emailed summaries embed the hosted logo via `<img src>` (falls back to initials). Requires `EMERGENT_LLM_KEY` in backend/.env (added) + `INTEGRATION_PROXY_URL`.
- Testing: iter13 — backend 5/5 pytest pass; frontend 4/4 flows pass. Report `/app/test_reports/iteration_13.json`.
- NOTE: Emergent email provider only delivers to `@example.com` or `delivered+<label>@resend.dev`; other recipients surface as a 502 from `/api/report/email`.

## Onboarding Goal / Saved Views / Logo Cleanup / Client Invites (added 2026-06, iter14)
- **Onboarding Goal** (`pages/AdvisorClients.jsx`): the New Household modal has a 'Add a starter retirement goal' toggle (`new-household-seed-goal`, default ON) that posts a $1M / +30yr goal to `/api/goals` for the new household, so the dashboard shows progress immediately (and the household is not flagged needs-setup).
- **Saved Views** (`pages/AdvisorClients.jsx` `OpportunitiesList`): advisors save the current Opportunities type+status+sort as a named chip (`saved-views`, localStorage key `compass_opps_views`); clicking a chip re-applies it, and it persists across reloads.
- **Logo Cleanup** (`backend/storage.py` `delete_object` + `DELETE /api/advisor/branding/logo` + `pages/ClientReport.jsx`): removing the firm logo now deletes the stored object and clears `logo`/`logo_url`/`logo_path`; the public logo URL then 404s (no orphaned objects).
- **Client Invites** (`backend/server.py` `POST /api/advisor/clients/invite`): advisors provision a client login scoped to a household with a generated temp password (`Cmps-<token>`), `must_change_password=true`, MFA unenrolled. First login forces TOTP setup → security question → password change. `write_scope` for solo now also stamps `org_id/advisor_id` so an invited client's edits stay visible to their advisor (bidirectional). Temp password returned once in the invite modal for the advisor to share; duplicate emails → 409.
- Testing: iter14 — backend 4/4 pytest pass; frontend 4/4 flows pass. Report `/app/test_reports/iteration_14.json`. Invited client users live in Mongo collection `shared__users`.

## Pending Badge / Views Sync (added 2026-06, iter15)
- **Pending Badge** (`backend/server.py` `advisor_clients` + `pages/AdvisorClients.jsx`): `GET /api/advisor/clients` now returns `invite_pending`/`has_login` per household (derived from invited users' `must_change_password`). The queue card shows an amber 'Invited · not activated' chip (`invite-pending-<client_id>`) until the client completes first-login activation.
- **Views Sync** (`backend/server.py` `GET/PUT /api/advisor/opps-views` + `pages/AdvisorClients.jsx` `OpportunitiesList`): saved Opportunities views now persist on the advisor's user row (`opps_views`) instead of localStorage, so they follow the advisor across devices. Load via useQuery, save via useMutation (with error toast).
- Testing: iter15 — frontend 2/2 flows pass (backend smoke-verified by main agent). Report `/app/test_reports/iteration_15.json`.

## Inline Actions / Invite Email / Client View / Resend Invite (added 2026-06, iter16)
- **Invite Email** (`backend/server.py` + `email_service.render_invite_html` + `pages/Activate.jsx`): advisor invites now email the client a secure one-time activation link (`/activate?token=…`, 7-day scoped token) instead of exposing a raw temp password. New `POST /api/auth/activate {token,new_password}` sets the password and clears must_change; the client then signs in and sets up MFA. If the email can't be delivered, the invite modal shows a copyable activation link fallback. Email delivery in preview only works for `delivered+<label>@resend.dev` recipients.
- **Resend Invite** (`POST /api/advisor/clients/invite/resend`): advisors regenerate the temp password + a fresh activation link for a pending household via a 'Resend invite' button on the queue card.
- **Client View** (`_public.is_client` + `components/Shell.jsx`): invited clients (tier solo with `invited_by`) get a trimmed, simplified nav (My Plan, Insights, My Goals, My Profile) instead of the full advisor planner surface.
- **Inline Actions** (`POST/GET/PATCH /api/advisor/tasks` + `OpportunitiesList`): advisors log a follow-up task straight from an Opportunities row (prefilled with the alert); rows show an open-task count. Tasks are scoped to the household.
- Testing: iter16 — backend verified by main agent (invite link + activate + resend + tasks CRUD + email send to a valid recipient = emailed:true). Frontend pending verification.

## Client Dashboard / Task Board / Invite Expiry / Nudge From Row (added 2026-06, iter17)
- **Client Dashboard** (`pages/MyPlan.jsx`, route `/my-plan`): invited clients land on a purpose-built read-only page (net worth, assets, debt, goal progress) instead of the solo dashboard. `Login.finish()` redirects `is_client` users to `/my-plan`; client nav 'My Plan' points there.
- **Task Board** (`pages/TaskBoard.jsx`, route `/tasks`, advisor-only): logged tasks get a home — Open/Completed lists with Complete (`PATCH /advisor/tasks/{id}`) and Clear (`DELETE /advisor/tasks/{id}`). Added 'Tasks' to advisor nav.
- **Invite Expiry UI** (`server.py` stores `invite_expires_at` on invite/resend; `pages/AdvisorClients.jsx`): pending cards show 'Link expires in Nd' (muted) or 'Link expired' (red).
- **Nudge From Row** (`POST /advisor/households/{client_id}/nudge-goals` + `OpportunitiesList`): Goals/Retirement opportunity rows get a 'Nudge' button that sets underfunded goals' monthly contribution to the required catch-up (or extends the timeline 10y if unrealistic).
- Testing: iter17 — backend 100% + frontend 4/4 flows pass. Report `/app/test_reports/iteration_17.json`.

## Nudge Preview / Task Due Dates / Client Welcome (added 2026-06, iter18)
- **Nudge Preview** (`server.py` GET `/advisor/households/{id}/nudge-preview` + `OpportunitiesList` NudgeModal): clicking Nudge now previews each goal's old→new monthly/target (catch-up or extend) before applying; Apply commits via the existing POST. Shared `_plan_nudge` helper keeps preview and apply in sync.
- **Task Due Dates** (`TaskInput.due_date`, `TaskPatch` on PATCH `/advisor/tasks/{id}` + `TaskBoard.jsx`): open tasks have an optional native date input; past-due incomplete tasks show an 'Overdue' badge and a red ring.
- **Client Welcome** (`MyPlan.jsx`): a one-time dismissible welcome banner on `/my-plan` (localStorage `compass_welcome_seen_<userId>`).
- **DEFERRED**: the `server.py` router split (~1300 lines) was intentionally not attempted this session — it's a large mechanical refactor best done in its own focused session to avoid regressions.
- Testing: iter18 — backend 7/7 pytest + frontend 3/3 flows pass. Report `/app/test_reports/iteration_18.json`.

## Nudge All / Task Reminder Digest / Welcome Tour (added 2026-06, iter19)
- **Nudge All** (`server.py` GET `/advisor/nudge-all-preview` + POST `/advisor/nudge-all`; `pages/AdvisorClients.jsx` NudgeAllModal + `nudge-all-button`): a "Nudge all underfunded" action on the Opportunities board. Preview groups every underfunded household's goals (reuses `_plan_nudge`) with totals; Apply batch-updates `target_year`/`monthly_contribution` across the whole book in one call. Returns `{households, goals}`.
- **Task Reminder Digest** (`.emergent/crons.yml` + `server.py` POST `/cron/task-digest` + `email_service.render_task_digest_html`): platform cron fires daily **8:00 AM America/Toronto**. The endpoint is bearer-auth'd with `WEBHOOK_CRON_SECRET` (constant-time compare, 401 otherwise), acks 2xx immediately and backgrounds the work. `_run_task_digest` emails each advisor a branded digest of open tasks **due today + overdue**; advisors with no due tasks are skipped. Verified by curl (401 no/wrong auth, 200 accepted with secret). NOTE: preview email delivery only works for `@resend.dev`/`@example.com`; real advisor inboxes deliver post-deploy with a verified domain.
- **Welcome Tour** (`pages/MyPlan.jsx` WelcomeTour): the one-time client welcome is now a dismissible **3-step guided tour** (net worth → goals → advisor-managed) with Next/Back/Skip/Get started, step dots, gated by localStorage `compass_welcome_seen_<userId>` (guarded against null user).
- **DEFERRED (still P0)**: `server.py` router split (~1410 lines now) — user chose features-first; refactor is the next dedicated session.
- Testing: iter19 — frontend 3/3 flows + regression pass (100%); backend endpoints curl-verified. Report `/app/test_reports/iteration_19.json`.

## Router Split (P0 done) + Digest Scope Control / Nudge Undo / Tour Replay (added 2026-06, iter20)
- **Router Split (P0, COMPLETE)**: `server.py` (~1410 lines) refactored into a thin composition root (~60 lines) + `deps.py` (shared scope/auth helpers: `get_current_user`, `scope_context`, `write_scope`, `audit`, `planner_scope`, `_public`, `_clean`, `_eff_hh`, `_block_enterprise_write`, `SECURITY_QUESTIONS`, `PLAN_COLLECTIONS`) + `routers/{auth,planning,advisor,tasks,compliance}.py`. All 49 `/api` paths and behavior preserved verbatim. **Verified: 82/82 backend pytest pass (serial)**; no route regressions (failures during verification were pre-existing shared-DB seed drift, which was restored).
- **Digest Scope Control** (`routers/tasks.py` GET/PUT `/advisor/digest-settings` + `TaskBoard.jsx` DigestSettings card): each advisor toggles their morning digest on/off and picks a send hour (0–23, ET). Cron changed to **hourly** (`.emergent/crons.yml` `0 * * * *` America/Toronto); `_run_task_digest` only emails advisors whose `digest_settings.enabled` and `hour == current ET hour`, still skipping those with no due/overdue tasks. Stored on the user as `digest_settings`.
- **Nudge Undo** (`routers/advisor.py`): `POST /advisor/nudge-all` now returns `applied:[{id,old_year,old_monthly}]`; new `POST /advisor/nudge-restore {restores:[...]}` reverts. Frontend shows an 8s sonner toast with an **Undo** action after a batch nudge.
- **Tour Replay** (`MyPlan.jsx`): a 'Replay tour' link in the `/my-plan` footer re-opens the 3-step WelcomeTour on demand.
- Testing: iter20 — frontend 3/3 new flows + regression pass (100%); backend endpoints curl-verified + 82/82 pytest. Report `/app/test_reports/iteration_20.json`.

## Weekly Book Digest / Per-Client Nudge Undo / Shadcn Date Picker / Digest Preview (added 2026-06, iter21)
- **Weekly Book Digest** (`routers/advisor.py` `_book_stats` + `_run_book_digest` + `POST /cron/book-digest`; `email_service.render_book_digest_html`; `.emergent/crons.yml` `book-digest` = `0 * * * 1` ET): Monday weekly email per advisor summarising book health — household count, avg score, status breakdown, and top-8 households needing attention. Reuses the roster scoring (`_build_roster` extracted from `/advisor/clients`). Gated by each advisor's `digest_settings` (enabled + chosen hour). Bearer-secured with `WEBHOOK_CRON_SECRET`; acks immediately + backgrounds work.
- **Per-Client Nudge Undo** (`routers/advisor.py`): `POST /advisor/households/{cid}/nudge-goals` now returns `applied:[{id,old_year,old_monthly}]`; the per-row Nudge toast shows an 8s **Undo** action reverting via `/advisor/nudge-restore` (same as batch Nudge All).
- **Shadcn Date Picker** (`TaskBoard.jsx` `DueDatePicker`): replaced the native `<input type=date>` on task rows with a shadcn Popover + Calendar (react-day-picker), `dd MMM yyyy` display, local-date ISO conversion (no tz off-by-one), plus an in-popover 'Clear date'.
- **Digest Preview** (`routers/tasks.py` `POST /advisor/digest-preview` + `routers/advisor.py` `POST /advisor/book-digest/preview`; `TaskBoard.jsx` 'Send test email' button): advisors send themselves a test digest. In preview env email bounces, so the endpoints return `{sent:false}` and the UI shows a graceful info toast (expected).
- Testing: iter21 — frontend 3/3 flows + regression pass (100%); backend endpoints curl-verified + book/task digest HTML validated against the safe-email gate. Report `/app/test_reports/iteration_21.json`.

## Weekly Digest Toggle / Inline Date Clear / Book Digest Preview / Attention Deep-Links (added 2026-06, iter22)
- **Weekly Digest Toggle** (`routers/tasks.py` digest-settings gains `weekly_enabled`; `TaskBoard.jsx` DigestSettings now has two rows): advisors toggle the daily task digest (`enabled`) and the weekly book-health email (`weekly_enabled`) independently; one shared `hour` applies to both. `_run_book_digest` now gates on `weekly_enabled`.
- **Inline Date Clear** (`TaskBoard.jsx` DueDatePicker): the task due-date chip now has an inline "x" button beside it that clears the date in one click (no need to reopen the popover).
- **Book Digest Preview** (`TaskBoard.jsx` + existing `POST /advisor/book-digest/preview`): a 'Send weekly summary test' button lets advisors preview the book-health email (graceful info toast in preview since email is sandboxed).
- **Attention Deep-Links** (`email_service.render_book_digest_html` `base_url`; `routers/advisor.py` `_app_base_url` + `_book_stats` now includes `client_id`; `AdvisorClients.jsx` `?open=<client_id>` handler): each household in the weekly email links to `{BASE}/clients?open=<client_id>`, which auto-opens that household (sets active + routes to `/profile`); unknown ids show an error toast. `_app_base_url` reads `APP_BASE_URL`/`REACT_APP_BACKEND_URL` (falls back to frontend/.env) — deployment-safe, no hardcoded URL.
- Testing: iter22 — frontend 4/4 flows + regression pass (100%); backend curl-verified + digest email HTML (with deep links) validated against the safe-email gate. Report `/app/test_reports/iteration_22.json`.

## Per-Digest Hours / Household Search / In-App Today Panel / Digest History (added 2026-06, iter23)
- **Per-Digest Hours** (`routers/tasks.py` digest-settings now `{enabled, weekly_enabled, daily_hour, weekly_hour}` with legacy `hour` fallback via `_resolved_settings`; `_run_task_digest` uses `daily_hour`, `_run_book_digest` uses `weekly_hour`; `TaskBoard.jsx` shows a separate HourSelect per row): advisors set independent send times for the daily task digest and weekly book-health email.
- **Household Search** (`AdvisorClients.jsx`): a live search box on the Household Queue filters cards by primary/member name, with an empty state.
- **In-App Today Panel** (`routers/advisor.py` `GET /advisor/today` → `{overdue, due_today, attention}`; `Dashboard.jsx` advisor-today-panel): advisor dashboard shows two cards mirroring the digests — today's/overdue tasks and households needing attention, each click-through opening the household.
- **Digest History** (`deps.log_digest` writes to `shared__digest_log` scoped to the advisor; logged on scheduled sends + previews; `GET /advisor/digest-history` returns last 10; `TaskBoard.jsx` 'Recent sends' list): advisors see when their last daily/weekly digests were sent and whether they delivered.
- Testing: iter23 — frontend 4/4 flows + regression pass (100%); backend endpoints curl-verified. Report `/app/test_reports/iteration_23.json`.

## Mark Reviewed / Task Quick-Add / Search Everywhere / Digest Retry (added 2026-06, iter24)
- **Mark Reviewed** (`routers/advisor.py` `POST /advisor/households/{client_id}/review` + `_reviewed_set`): marking a household reviewed records a 7-day review in `shared__reviews` (scoped to the advisor) and excludes it from both the `/advisor/today` attention panel and the weekly book-health email (`_book_stats`) until it expires. `Dashboard.jsx` attention rows restructured (open area + 'Reviewed' button).
- **Task Quick-Add** (`Dashboard.jsx`): the Today panel's 'Today's tasks' card has an inline household-select + title + Add (POST `/advisor/tasks`) so advisors log a task without opening the household.
- **Search Everywhere** (`AdvisorClients.jsx`): the household search box was lifted above both tabs; `OpportunitiesList` now receives `search` and filters opportunity rows by household/member name (was Queue-only).
- **Digest Retry** (`TaskBoard.jsx`): `digest-history` rows with `sent:false` show a 'Resend' button that re-triggers the matching preview endpoint and refreshes history (frontend-only; reuses existing preview endpoints).
- Testing: iter24 — frontend 4/4 flows + regression pass (100%); backend endpoints curl-verified (review excludes household from /advisor/today; quick-add creates task). Report `/app/test_reports/iteration_24.json`.
