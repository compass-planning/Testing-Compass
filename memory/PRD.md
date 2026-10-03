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
- P2: Landing page — real legal pages (Privacy/PIPEDA/Terms) instead of footer links → /login.
- P2: Landing — optional interactive quick retirement calculator preview (design-spec'd, not built).

## Credentials
See `/app/memory/test_credentials.md`. Enterprise admin `scott@sweston.ca`; platform super-admin `admin@compass.ca`; TOTP secret `JBSWY3DPEHPK3PXP`.

## Mocked
- Chase Payment Solutions billing (`chase_mock.py`).
