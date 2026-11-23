# Architecture decisions

SRS §9 asks the team to record the backend language and database choice with a short rationale.

## D1 — Backend: Node.js + Express, TypeScript

- **Team familiarity:** the web (Next.js) and mobile (React Native) apps are TypeScript, so one language covers the whole project.
- **Development speed:** Express is small and well known; no framework-specific concepts to learn.
- **Shared types:** `shared/types.ts` keeps API, web and mobile in agreement on data shapes.

## D2 — Database: PostgreSQL, plain SQL

- **Data model:** orders, tickets, seats and payments are relational and need transactions and constraints (no double-sold seats, promo-code limits, inventory never below zero — SRS 4.3.1, 4.14, 7).
- **Access:** the `pg` driver with hand-written SQL; migrations are numbered `.sql` files in `api/migrations`, applied by `api/src/db/migrate.ts`. No ORM.

## D3 — Deployment: Docker Compose

`docker compose up --build` starts PostgreSQL, Mailpit (dev email inbox), the API and the website.

## D4 — Payments: internal simulation

Per SRS 3.2 and 4.6, payments and payouts are a clearly labelled DEMO simulation. No real money moves.

## D5 — Website: Next.js (client pages) + Tailwind

The website forwards `/api/*` to the Express API (Next.js rewrites), so the session cookie works without CORS. The mobile app uses the same API with a Bearer token.

## D6 — Sign-in with Google

OAuth 2.0 authorization-code flow implemented directly in `api/src/routes/auth.ts` (no auth library). Google-verified emails link to an existing account with the same email.

## D7 — Free-ticket rule

Each account can hold one free ticket per event. Enforced by the `free_ticket_claims` primary key `(event_id, user_id)`, so concurrent requests cannot bypass it.

## D8 — Bank payments

DEMO payment by default; Halyk ePay test environment as an optional real-bank integration. Kaspi Pay has no public merchant API. See [payments.md](payments.md).

## Open decisions (SRS §12)

See [PLAN.md §3](PLAN.md#3-decisions-to-fix-before-coding-srs-12) for proposed defaults.
