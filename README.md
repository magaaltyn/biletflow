# BiletFlow

Self-service event ticketing for Kazakhstan. Organizers create events and issue QR-code tickets (free or paid); attendees discover events, choose seats on a seat map and buy tickets; Event Admins check people in.

- Requirements: [docs/SRS-v0.3.pdf](docs/SRS-v0.3.pdf) · Plan: [docs/PLAN.md](docs/PLAN.md) · Decisions: [docs/decisions.md](docs/decisions.md) · Bank payments: [docs/payments.md](docs/payments.md)

## Stack

TypeScript everywhere · **Node.js + Express** REST API · **PostgreSQL** (plain SQL, no ORM) · **Next.js** + Tailwind CSS website · React Native scanner app (next phase) · **Docker**

```
api/      REST API (Express): routes/, services/, lib/, db/ (migrations runner + demo seed), migrations/*.sql
web/      Next.js website: attendee pages, organizer dashboard, check-in, platform admin
mobile/   React Native Event Admin scanner app (phase 2)
docs/     SRS, plan, decisions, payment research, designs
```

## Run with Docker

```bash
docker compose up --build
```

- Website: http://localhost:3000 (the API is reached through it at `/api`)
- Email inbox (Mailpit): http://localhost:8025

On start the API applies migrations and loads demo data once.

### Demo accounts (password `Demo12345`)

| Role | Email |
|---|---|
| Attendee | `attendee@biletflow.kz`, `attendee2@biletflow.kz` |
| Organizer ("Steppe Events") | `organizer@biletflow.kz` |
| Event Admin (check-in staff) | `staff@biletflow.kz` |
| Platform Admin | `admin@biletflow.kz` |

Promo codes: `ALMATY10` (10 %), `STUDENT1000` (1 000 ₸ off) for *The Spirit of Almaty*.

## Local development (hot reload)

Requires Node.js 24 and Docker (for PostgreSQL and Mailpit).

```bash
cp .env.example .env
docker compose up -d db mailpit
cd api && npm install && npm run migrate:dev && npm run seed:dev && npm run dev
```

Second terminal:

```bash
cd web && npm install && npm run dev
```

Website on http://localhost:3000, API on http://localhost:4000.

## Features (SRS v0.3)

- Accounts: email + password, email verification, password reset, **Google sign-in** (set `GOOGLE_CLIENT_ID/SECRET`)
- Events: create, edit, duplicate, publish/unpublish, cancel, preview; public / unlisted / private; registration window; capacity
- Venues with **map pictures** (stadium / hall plans), predefined **Almaty Arena seat map** (sections A–H, rows, numbered and accessible seats) and **"view from section" pictures**; organizers can add their own venue with a map image
- Ticket types: free/paid, price, quantity, sale window, per-order limit, hide; live available / reserved / sold counts
- **One free ticket per account per event** (enforced in the database)
- Checkout with timed reservations; seat holds that expire; double-selling prevented by database constraints
- Paid sales activation checklist (simulated KYC, demo payout account, activation fee, terms)
- Payments: DEMO simulation, or **Halyk ePay test environment** ([docs/payments.md](docs/payments.md))
- QR tickets (HMAC-signed), print-ready A4 PDF, `.ics` + Google/Outlook calendar links
- Promo codes + Campaign QR codes (rejected by the check-in scanner)
- Check-in API and web check-in page (camera scanning, manual search, undo)
- Refunds/cancellations, notifications (in-app + email), support cases with chat-like threads
- Organizer analytics, event history timeline (append-only audit log)
- Platform admin: search, suspend users/events, stop paid sales, reports, settings, CSV exports
- Russian, Kazakh and English for customer-facing pages

## Database changes

Add a new numbered file to `api/migrations` (e.g. `002_add_x.sql`). Never edit a migration that is already on `main`.
