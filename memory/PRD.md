# Compass Planning — PRD

## Original problem statement
Web-based pension/retirement planning app across three isolation tiers (Enterprise, Advisor-led, Solo), Canadian-resident, PIPEDA-compliant. JWT + TOTP MFA auth with strict tenant-scope enforcement. Financial engines (Monte Carlo, tax/estate, protection gaps, RESP, US/cross-border), advisor tools, Document Vault, Claude OCR/Vision, Whisper audio, automated email digests, full EN/FR localization, and a Platform Admin console (billing, tickets, status, audit).

User language: **English** (respond in English).

## Architecture
- Frontend: React (CRA), TailwindCSS, Context API, Shadcn UI, framer-motion, react-router-dom 7.
- Backend: FastAPI, PyMongo, Pydantic, reportlab.
- Integrations: Resend (email), Emergent Object Storage, Claude Sonnet 5.5, OpenAI Whisper, Mock Chase billing gateway.
- i18n: `/app/frontend/src/lib/i18n.jsx` — `useLang()` → {lang, setLang, t, tr}; persisted in localStorage `compass_lang`.

## Implemented (latest first)
### 2026-06 — Retirement teaser + Advisor digest preview + Legal polish (DONE, tested — iteration_47, frontend 100%)
- **Retirement Calculator Teaser (Landing)**: new interactive, client-side widget in `Landing.jsx` (`RetirementTeaser` + `DialInput`), section `id="calculator"` + nav item (`nav-calculator`). 6 sliders (current age, retirement age, current savings, monthly contribution, desired monthly income, **CPP/OAS government benefits** `teaser-pension`) feed the existing `monteCarlo()` from `lib/finance.js` live via `useMemo` (pension indexed to inflation). Right card shows a dynamic success gauge (color-banded On track/Needs attention/At risk via `teaser-band`), projected nest egg (`teaser-nest-egg`), median balance at 95 (`teaser-median`) and a CTA (`teaser-cta` → `/login?mode=register`). **Shareable result**: `teaser-copy-link` copies a URL encoding all inputs (`?ca&ra&sv&mo&in&pen#calculator`) to the clipboard (toast); on load the teaser prefills its sliders from those query params. Bilingual (`COPY.*.calc`). Defaults tuned to a realistic/encouraging ~80% result (savings $150k, $1,800/mo, income $4,000/mo, $22k CPP/OAS, 35→65). Verified iteration_47 + iteration_48 (frontend 100%).
- **Advisor Digest Preview (inline, read-only)**: `TaskBoard.jsx` DigestSettings now has an Eye **Preview** button per digest row (`digest-preview-daily-btn`/`-weekly-btn`/`-summary-btn`) that opens `DigestPreviewModal` (`digest-preview-modal`) rendering the exact email HTML in a sandboxed iframe (`digest-preview-iframe`). Closes via button (`digest-preview-close`), backdrop, or Escape. No email is sent (distinct from the existing "Send test" buttons). Backend GET endpoints return `{subject, html}`: `/api/advisor/digest-preview/daily` + `/summary` (tasks.py), `/api/advisor/digest-preview/weekly` (advisor.py).
- **Legal copy polish**: `Legal.jsx` adds a `Plain-language summary` badge (`legal-badge`), `Effective date: June 1, 2026` (`legal-effective`), kept `Last updated` (`legal-updated`), a plain-language disclaimer box (`legal-disclaimer`, bilingual), and expanded sections (Privacy +Cookies/Analytics +Changes; PIPEDA +Retention & disposal; Terms +Governing law = Ontario). Real counsel-reviewed text still to be swapped in later.

### 2026-06 — 4 feature requests + full BrokersEdge re-skin rollout (DONE, tested — iteration_46, 95%→fixed)
- **French Everywhere (Task1)**: top-bar greeting now localized via `t('welcome_back')` in `Shell.jsx` ("Welcome back, {name}" / "Bon retour, {name}"); inactivity toast localized (`signed_out_idle` keys). Verified EN+FR.
- **Equity View (Task2)**: `NetWorth.jsx` Assets tab has a new **Equity** column = Market value − mortgage/loan (green; "—" when unencumbered). Verified ($934,900 − $760,000 = $174,900).
- **Payoff Goal Link (Task3)**: `Debt.jsx` — green target-icon button per debt row (`make-goal-<id>`) creates a tracked goal via `POST /api/goals` (category `debt`, target = balance, deadline = computed single-debt payoff year, monthly_contribution = payment). User choices: per-individual-debt, target=balance. Verified end-to-end (toast + goal appears in Goals).
- **BrokersEdge re-skin (Task4)**: rolled the signature layout to all 11 suite pages — Dashboard, Goals, Insurance, CashFlow, Tax, Education, CrossBorder, AIInsights, FinancialPlan, Documents, ClientProfile. Every `PageHeader` now has an icon tile; dark `StatBand` KPI bands replace plain Stat rows (Dashboard/CashFlow/Education/CrossBorder/FinancialPlan/Goals/ClientProfile/AIInsights); composition **Donut** added to CashFlow (expense mix) & Goals (goal health); FinancialPlan is now two-column. Compass blue/green palette retained (navy band #1B2559→#2C3A78, green/amber/blue accents — NOT reference cyan). ~30 new EN→FR dictionary entries for the KPI labels.
- **Mobile fix**: `grid lg:grid-cols-N` with no mobile base collapses to an auto (max-content) column and overflows at 390px. Added `grid-cols-1` base to `TodayPanel` and the Dashboard chart grid → dashboard scrollWidth==clientWidth==390, no horizontal scroll. (Pattern note for future grids.)

### 2026-06 — Linked liabilities/debts + client list view (DONE, tested)
- **Advisor Household Queue** (`AdvisorClients.jsx`) converted from 2-column cards to a single compact **list** (one row per household: avatar, name, status, next action, Assets/Net worth/Goals/Protection, score, Open). Mobile-safe (no overflow). Shared `PageHeader.jsx` actions now wrap on mobile.
- **Mortgages & vehicle loans auto-flow** into both Net Worth → Liabilities tab and the Debt page as read-only **Linked** lines (derived from the asset, no duplicate data). `lib/finance.js`: `derivedDebtsFromNetworth()` + `derivedLiabilitiesFromAssets()`.
- **Net worth now correctly subtracts** embedded mortgages/loans. Backend `embedded_liabilities_total()` added to `/plan/overview`, `_action_items`, `report_pdf`, and advisor `_household_score` (consistent everywhere). Verified via API: $900k home w/ $540k mortgage + $45k HELOC → net worth $315k.
- **Liability form** gained optional **Monthly payment ($)** + **Interest rate (%)** fields (`field-liab-payment`, `field-liab-rate`); any liability with a payment appears on the Debt page with full payoff analytics (Avalanche/Snowball). New EN/FR strings added.

### 2026-06 — BrokersEdge re-skin: Net Worth / Debt / Retirement (DONE, tested EN+FR)
- Shared layout kit in `ui-kit.jsx` (StatBand dark KPI band, Donut, RailCard, Reveal) + upgraded `PageHeader.jsx` (icon tile, live meta sub-line, actions). Compass blue/green palette retained (NOT the reference cyan).
- `NetWorth.jsx`: 3-up Stat row + two-column layout (table/tabs left, Asset-allocation Donut + Summary rail right).
- `Debt.jsx`: dark `debt-statband` (4 KPIs + composition donut) + payoff-strategy Avalanche/Snowball cards.
- `Retirement.jsx`: PageHeader meta line + Planning-assumptions card + 6 tabs (Projection/MonteCarlo/Guardrails/Timing/Decisions/Scenarios), Recharts area/line charts.
- i18n: full FR pass — wrapped all remaining hardcoded strings in `tr()` and added ~110 EN→FR entries in `lib/i18n.jsx` (Retirement all tabs, Debt strategy band/cards, NetWorth rail/empties). Verified in FR: Retirement (incl. Monte-Carlo run) and Debt (incl. strategy "Économise … par rapport aux paiements minimums") render with no English leaks and no overflow at 1920/390. (testing_agent iteration_45 + screenshots)
- PENDING USER SIGN-OFF before rolling the same patterns to the remaining suite pages.

### 2026-06 — Admin Delete Account (PIPEDA erasure) (DONE, tested)
- `DELETE /api/admin/accounts/{uid}` (admin-only): erases the user + all planning data scoped to their `client_id`. Blocks deleting `tier=="admin"`. Audited as `admin.account.delete`.
- `repo.delete_user(uid)` + `repo.purge_client_data(client_id)` added to both InMemory and Mongo repositories.
- Admin → Accounts: red **Delete** button per non-admin row + confirm dialog (`data-testid="delete-confirm"`, `delete-confirm-btn`, `delete-cancel`). Verified: solo account deleted with 2 records purged, admin delete blocked.
- NOTE: `jamieburans0908@gmail.com` is NOT in preview DB — it lives in production. Use this feature on the live site after redeploy to erase it.

### 2026-06 — Landing follow-ups: Legal pages, Demo modal, Lead capture (DONE, tested)
- **Leads analytics**: `/admin/leads` now returns `by_source`; Admin → Leads shows a "By source" breakdown panel (`data-testid="leads-source-breakdown"`, chips `source-{name}`).
- **More lead entry points**: "Talk to sales" link in the hero (source `hero`) and footer (source `footer`), both opening the contact modal via `openContact(source)`. Verified by_source = {hero, footer, pricing, landing}.
- **Scrollspy nav**: active section highlighted in the sticky nav via IntersectionObserver (green underline, `data-testid="nav-active-{id}"`) as the visitor scrolls.
- **Lead source tracking**: `ContactSalesIn.source` (default "landing") stored on each lead and shown as a purple badge in Admin → Leads. Landing passes `source="pricing"` from the Enterprise CTA via `openContact(source)`.
- **Nav shortcut**: "How it works" link added to top nav (`data-testid="nav-how-it-works"`), scrolls to `#how-it-works`; bilingual.
- **Lead auto-reply tuning**: prospect confirmation email now bilingual (follows lead locale) and signed by the team with a promised response time, via env `SALES_TEAM_NAME` ("Compass Planning Enterprise Team"), `SALES_RESPONSE_TIME` ("within one business day"), `SALES_RESPONSE_TIME_FR` ("en un jour ouvrable"). Subject localized too.
- **Annual pricing toggle**: Monthly/Annual switch on landing pricing (`data-testid="pricing-billing-toggle"`, `billing-monthly`/`billing-annual`). Annual = 2 months free (monthly×10/12): Solo $29→$24, Advisor $149→$124, with "billed annually" note + "2 months free" badge. Bilingual, currency formatted per lang via `fmtPrice`.
- **Leads nav badge**: Admin → Leads nav shows a live green count of `counts.new` (polls every 60s) on desktop + mobile (`data-testid="leads-badge"`).
- **How It Works**: 3-step PURPLE-band strip (Add details → Run projection → Act with confidence), bilingual, between Features and Who-It's-For (`#how-it-works`, `data-testid="landing-how-it-works"`).
- **Lead routing**: `SALES_LEAD_EMAIL="sales@westoak.dev"` (comma-separated supported → `SALES_EMAILS` loop). No CC. Prospect also gets a confirmation email.
- **Legal pages** (`/app/frontend/src/pages/Legal.jsx`): real bilingual Privacy Policy, PIPEDA Compliance, Terms of Service for **Westoak Innovations** / **privacy@westoak.dev**. Public routes `/privacy-policy`, `/pipeda`, `/terms`; landing footer Legal links now open them.
- **Demo video**: hero "Watch demo" button → `VideoModal` with placeholder poster ("Product walkthrough — coming soon"). Swap real video later.
- **Lead capture**: Enterprise pricing CTA opens `ContactModal` → `POST /api/leads/contact-sales` (public, rate-limited 3/5min). Emails sales (`SALES_LEAD_EMAIL`=privacy@westoak.dev) + prospect confirmation via Resend; logs lead in new **Admin → Leads** console (`/admin/leads`, `AdminLeads.jsx`, nav added). Backend: `platform_admin.py` adds `/leads/contact-sales`, `/admin/leads`, `/admin/leads/{id}` + `admin.lead.update` audit action. New env `SALES_LEAD_EMAIL` in backend/.env.

### 2026-06 — Public Marketing / Sales Landing Page (DONE, tested EN+FR desktop)
- New `/app/frontend/src/pages/Landing.jsx` served at route `/` (public). Unauthenticated visitors see it before sign-in.
- Sections: sticky glass header + EN/FR toggle, hero (purple gradient + Monte Carlo preview card w/ success gauge + fan chart), trust/compliance band (PIPEDA, Canadian residency, TOTP MFA, bilingual), feature bento grid, "Who it's for" 3 tiers, imagery split (retirement couple), pricing (Solo $29 / Advisor $149 / Enterprise Custom, CAD), testimonials, FAQ accordion, CTA banner, footer.
- Fully bilingual via internal COPY{en,fr} + global `useLang` toggle (persists app-wide).
- CTAs route to `/login` and `/login?mode=register`. `Login.jsx` now reads `?mode=register` to pre-open the Register tab.
- `App.js`: added `/` → Landing; catch-all `*` still → `/dashboard`.
- Brand-matched: purple gradient `#2E1B6A→#4B1D93`, compass-green `#00DF89`, blue `#0052FF`, CompassMark logo.
- NOTE: mobile could not be screenshot-verified (tool forces 1920 viewport); uses standard responsive Tailwind patterns + `overflow-x-hidden`.

### Earlier
- Admin Console v1–v4 (super-admin, accounts, billing w/ Mock Chase, announcements, tickets+replies, status, audit trail w/ CSV/PDF export, Resend email notifications, overdue-billing flags, monthly audit-retention archive piggybacked on renewal-reminders cron).
- Security: 15-min inactivity timeout, 1-min warning modal, change-password modal w/ strength meter + rate limits.
- Login redesigned to match compassplanning.app branding.

## Backlog
- P2: Real Chase Payment Solutions integration (replace `chase_mock.py`) once merchant credentials provided.
- P2: Swap counsel-reviewed final legal text into `Legal.jsx` (current text is a polished plain-language placeholder for Westoak Innovations).
- P3: Landing teaser — shareable result link + pension/CPP-OAS slider (DONE 2026-06). Future: shortlink service for prettier share URLs.

## Credentials
See `/app/memory/test_credentials.md`. Enterprise admin `scott@sweston.ca`; platform super-admin `admin@compass.ca`; TOTP secret `JBSWY3DPEHPK3PXP`.

## Mocked
- Chase Payment Solutions billing (`chase_mock.py`).
