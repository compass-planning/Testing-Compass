# Compass Planning — Full-Parity Porting Roadmap
_Goal: bring the current multi-tenant rebuild (React + FastAPI + MongoDB) to full feature parity with the original Compass Planning (Solo) TypeScript/Express app, porting every feature into the SHARED app so Solo, Advisor, and Enterprise all benefit. External services use Emergent-managed keys (LLM key, object storage)._

Decision log (user-confirmed):
- Target = FULL parity over time.
- First priority = Retirement engine depth.
- Port into the shared multi-tenant app (all tiers).
- OK to use Emergent-managed LLM key + object storage.
- Roadmap approved before coding.

Sizing legend: S ≈ 1 build iteration, M ≈ 2, L ≈ 3-4, XL ≈ 5+.

---

## PHASE 0 (P0) — Retirement Engine Depth  ← START HERE
Replaces the current single-asset JS Monte Carlo (`frontend/src/lib/finance.js`) with the original's real engines, server-side in Python under `/app/backend/engine/`.

### 0a. Deterministic Canadian projection engine — **L**
Port `canadianRetirementEngine.ts` → `backend/engine/retirement_ca.py`.
- RRSP→RRIF conversion at 71 + CRA RRIF minimum factors.
- CPP actuarial adjustment (−0.6%/mo <65, +0.7%/mo >65) & OAS (+0.6%/mo >65, defer to 70).
- OAS clawback (threshold + 15% recovery).
- Federal + all-13 provincial/territorial 2024/2025 brackets, ON surtax, BPA/age/pension credits.
- Non-registered tax treatment: capital_gains / interest / mutual_fund / insurance_annuity / mixed, with ACB tracking.
- Draw-order: TFSA → non-reg → RRSP/RRIF (+ voluntary pre-71 drawdown; excess-RRIF reshelter to TFSA).
- Year-by-year output + summary metrics (portfolio@ret, lifetime tax, funding %, estate value).
- Endpoint: `POST /api/plan/retirement/projection`.
- Test: golden-value unit tests vs known outputs (curl + pytest).

### 0b. Monte Carlo w/ Cholesky + correlated multi-asset returns — **L**
Port `simulation/{monteCarlo,matrix,random}.ts` → `backend/engine/simulation/`.
- 5 asset classes, correlation matrix, Cholesky decomposition, preset allocations (Aggressive/Balanced/Moderate/Conservative).
- Percentile bands p10/p25/p50/p75/p90, probability of success, goal-event cashflows.
- Endpoint: `POST /api/plan/retirement/montecarlo` (paths downsampled for payload).
- Test: success-prob monotonicity + percentile ordering assertions.

### 0c. Guardrails + optimizers — **L**
Port `simulation/guardrails.ts`, `retirement/{rrifOptimizer,taxCalculator,stepFunction}.ts`, `drawdown.ts`.
- Guyton-Klinger spending-flexibility guardrails (floor/ceiling, flex up/down, trigger table, plain-English rec).
- Plan-health check + significant-change detection.
- Withdrawal optimizer / reshelter-to-TFSA / CPP timing break-even / RRSP-vs-TFSA decision / pension splitting.
- Reference data: `reference/{cppOas,benefitRates,taxBrackets}` → `backend/engine/reference/`.
- Endpoints: `POST /api/plan/retirement/guardrails`, `/cpp-timing`, `/rrsp-vs-tfsa`, `/drawdown`.

### 0d. Retirement Hub UI — **XL**
Rebuild `frontend/src/pages/Retirement.jsx` into a hub with tabs (mirrors original RetirementStrategist/Hub):
- **Projection**: input form + year-by-year table + stacked balance/income chart.
- **Monte Carlo**: percentile fan chart (recharts) + success gauge.
- **Guardrails**: trigger table + base-vs-adjusted success + recommendation.
- **CPP/OAS timing**: 60/65/70 comparison + break-even.
- **Drawdown / RRIF**: sequencing view.
- **Scenarios**: save/compare named scenarios (SnapshotManager → `plan_scenarios` collection).
- Works for all tiers; respects `_block_enterprise_write` for save actions.
- Test: testing_agent (advisor opens household → runs projection/MC/guardrails; solo direct).

**P0 total ≈ 5-6 iterations.**

---

## PHASE 1 (P1) — Protection, Tax depth, Reports/AI
- **1a Insurance needs analysis — L**: DIME, Human Life Value, Capital Retention (port `engine/insurance/*`). Upgrade current premium-tracking Insurance page. + LTC engine + DI engine (`LTCTab`, `DITab`).
- **1b Tax engine server-side + estate depth — L**: move current client-side `lib/tax.js` to `backend/engine/tax/*` (capitalGains, roomTracker, projector), province-accurate; estate terminal tax + per-province probate calculator.
- **1c Real AI insights/reports — M**: replace rule-based mock `AIInsights.jsx` with Emergent LLM key (Claude/GPT) generating narrative insights from plan data. Integration via integration_expert.
- **1d PDF report export — M**: comprehensive PDF (server-side render) + object-storage hosting; current app only emails HTML.

## PHASE 2 (P2) — Data entry UX & documents
- **2a Documents Hub w/ real uploads — L**: object storage (Emergent), chunked upload, per-household vault (replaces list-only `PlanningPage` documents).
- **2b Voice input + Meeting recorder — L**: OpenAI Whisper (Emergent key) for voice-add + meeting transcription (`VoiceAddDialog`, `MeetingRecorder`).
- **2c Assumption editor + Action items panel — M**: editable global assumptions; action items surfaced across modules.

## PHASE 3 (P3) — Breadth features
- **3a Education / RESP engine — M**: CESG/CLB grant modelling (`engine/education/*`).
- **3b US / cross-border — L**: US tax projector, US cap gains, US Social Security, US retirement projection, jurisdiction router.
- **3c Letters + Policies importer — M**: client letter generation; xlsx policy import.
- **3d i18n / localization (EN/FR) — L**: port `client/src/i18n`, locale hooks; French for Canadian compliance.
- **3e Insight-led Hub navigation — M**: HubShell + Retirement/Protection/TaxEstate/FinancialPlan hubs UX.
- **3f Misc — S each**: inactivity timeout, hotkeys, change-password modal, subscriptions/paywall (if desired for Solo).

---

## Sequencing
P0 (retirement) → P1a/P1b (protection+tax engines) → P1c/P1d (AI+PDF) → P2 (docs/voice) → P3 (breadth).
Each sub-phase is independently shippable and testing_agent-verified before the next.

## Engine port conventions
- Python engines live in `/app/backend/engine/**`, pure functions, fully unit-tested (pytest) with golden values from the original TS.
- New endpoints under existing routers (`routers/planning.py`) or a new `routers/retirement.py` registered in `server.py`.
- New Mongo collections: `plan_scenarios`, `plan_guardrails`, (later) `plan_documents` (upload metadata).
- Frontend calls via `lib/planning.js` (`planApi`), charts via recharts (already used).
