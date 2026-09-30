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

## Next Tasks
1. TOTP MFA enrollment + verification (deferred from v1 auth choice).
2. MongoDB-backed `Repository` implementation swapped behind existing interface.
3. Password reset endpoints + email delivery.
