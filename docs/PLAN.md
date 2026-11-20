# BiletFlow — Website Development Plan

Source: *BiletFlow SRS v0.3 (Initial Draft)* + web/mobile mockups.
Order: **website first** (backend API + Next.js web app + admin portal). The React Native
Event Admin scanner app starts only after the website is done, and reuses the same REST API.

---

## 1. Stack (kept deliberately small)

| Layer | Choice | Why / notes |
|---|---|---|
| Language | **TypeScript** everywhere (api, web, mobile) | Shared types for events/orders/tickets in `shared/types.ts`, so API, web and mobile agree on data shapes. `strict` mode on. |
| Backend | **Node.js + Express** | Plain REST API. Express is the minimal standard web framework for Node. Run in dev with `tsx`, built with `tsc`. |
| Database | **PostgreSQL** | Accessed with the plain `pg` driver and hand-written SQL. Migrations are numbered `.sql` files run by a ~30-line script. No ORM. |
| Web | **Next.js (App Router) + React** | Public pages (event list/page) can be server-rendered for SEO; dashboards are normal client pages calling the API. |
| Mobile (later) | **React Native (Expo)** | Only the Event Admin scanner app (SRS 4.8). |
| API style | **REST + JSON** | One API used by web and mobile. |
| Run / deploy | **Docker + docker-compose** | `postgres`, `api`, `web`, `mailpit` (fake inbox for dev emails). |

Small libraries we need anyway (no new concepts to learn):
`bcrypt` (password hashing), `jsonwebtoken` (login tokens), `zod` (input validation),
`qrcode` (QR images), `pdfkit` (printable PDF tickets), `nodemailer` (email),
`multer` (image upload), Tailwind CSS (styling — used in the mockups/SRS; can be swapped for plain CSS modules).

**Explicitly NOT used:** microservices, GraphQL, Redis, WebSockets, message queues, Kubernetes,
an ORM, S3 (images go to a Docker volume for the MVP), a real payment provider (payments are a
clearly labelled simulation, per SRS 3.2 / 4.6).

---

## 2. Repository layout (one monorepo)

```
biletflow/
├── api/                 # Node.js + Express REST API
│   ├── src/
│   │   ├── routes/      # one file per resource (events.ts, orders.ts, ...)
│   │   ├── services/    # business logic (checkout, seat holds, promo, tickets)
│   │   ├── db/          # pg pool + query helpers
│   │   ├── middleware/  # auth, roles, error handler, validation
│   │   └── jobs/        # setInterval jobs: expire seat/ticket holds
│   ├── migrations/      # 001_users.sql, 002_events.sql, ...
│   ├── seeds/           # demo data: venue layout, users, events
│   └── Dockerfile
├── web/                 # Next.js app (attendee, organizer, platform admin)
│   └── Dockerfile
├── mobile/              # React Native scanner app (phase 2, empty for now)
├── shared/              # TypeScript types shared by api, web and mobile
├── docs/                # SRS, API contract (openapi.yaml), DB diagram, decisions
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 3. Decisions to fix before coding (SRS §12)

Proposed defaults — confirm or change:

1. **Backend/DB:** Node.js + PostgreSQL (rationale goes in `docs/decisions.md`, as SRS §9 asks).
2. **Attendee accounts:** required to buy (simplest: orders and tickets belong to a user; matches "My Orders" in the mockups).
3. **Payments:** internal simulation. "Kaspi Pay" / "Visa" buttons in the mockup open a fake payment page marked **DEMO — no real money**, with *Succeed* / *Fail* buttons.
4. **Fees:** SRS excludes the per-ticket service fee from MVP, but the checkout mockup shows "Service fee 1 200 KZT". Pick one: a "processing charge" (e.g. 6%) paid by the attendee, or remove that line.
5. **Activation fee:** fixed demo amount, e.g. 10 000 KZT per event, configurable by Platform Admin.
6. **Seat hold / checkout hold time:** 10 minutes.
7. **Seat layout:** one predefined arena layout (sections A–H, rows, seats) as in the mockup — seeded from a JSON file.
8. **Languages:** Russian + Kazakh + English via simple JSON dictionaries (no i18n framework needed beyond Next.js routing).
9. **Support attachments:** not in MVP.

---

## 4. Step-by-step plan (website)

Each step ends with something you can run and demo. Steps 1–9 are the required MVP;
step 10 is bonus; step 11 is hardening.

### Step 0 — Repository & tooling (Week 1)
- Create GitHub repo, `main` branch protected, PRs required.
- Monorepo skeleton above, `.gitignore`, `.editorconfig`, `.env.example`, README with "how to run".
- `docker-compose.yml`: `postgres:16`, `api`, `web`, `mailpit`. `docker compose up` must start everything.
- GitHub Actions: on every PR build + typecheck `api` and `web` (tests added from Step 2 on).
- **Done when:** a fresh clone + `docker compose up` shows a Next.js page that calls `GET /api/health`.

### Step 1 — Data model & API contract (Week 1–2)
- Write the database schema for SRS §6 entities as SQL migrations:
  users, organizer_profiles, venues, venue_sections, rows, seats, events, ticket_types,
  seat_holds, orders, order_items, tickets, payments, refunds, payout_accounts,
  check_ins, staff_assignments, notifications, support_cases, support_messages,
  campaigns, promo_codes, promo_redemptions, audit_log.
- Money stored as **integer KZT** (no floats). All timestamps `timestamptz`; events store a time zone (`Asia/Almaty`).
- Key constraints in the DB itself: unique `(event_id, seat_id)` on sold tickets, unique ticket code, `CHECK` on statuses.
- Write `docs/openapi.yaml` (or a simple markdown endpoint list) — agreed before parallel work starts (SRS 13.2).
- Seed script: demo venue layout, 3 users (attendee / organizer / platform admin), sample events from the mockups.

### Step 2 — Authentication & roles (Week 3)
- `POST /auth/register`, `/auth/verify-email`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`.
- Passwords hashed with bcrypt; JWT in an httpOnly cookie for web, Bearer token for mobile (same endpoint).
- Roles: `attendee`, `organizer`, `platform_admin`; event-level role `event_admin` via staff_assignments.
- Middleware: `requireAuth`, `requireRole`, `requireEventAccess(eventId)`.
- Web: sign-up, log-in, forgot-password pages; profile page (mockup "Profile").
- Emails visible in Mailpit at `localhost:8025`.

### Step 3 — Organizer profile & event management (Week 3–4)
- Organizer profile (contact info; payout info is part of step 6).
- Events CRUD: create, edit, duplicate, publish, unpublish, cancel, preview.
- Fields: title, description, category, images (upload to Docker volume), venue, date/time, time zone,
  visibility (public/unlisted/private), registration open/close, capacity, GA vs assigned seating.
- Every important change writes an `audit_log` row (needed later for the timeline, SRS 4.16).
- Web: organizer dashboard shell (left sidebar as in mockup) → Events list → event editor.

### Step 4 — Public site: discovery & event page (Week 4)
- Home page: hero, search, filters (city, category, date, price, free events), "Popular Events".
- Event page: details, ticket types with prices, "Tickets are selling fast / N remaining", share, favourite (optional).
- Server-rendered with Next.js for SEO; responsive to match the mobile mockups.

### Step 5 — Ticket types, free registration, orders, QR tickets (Week 5)
- Ticket types: name, description, price (0 = free), quantity, sale start/end, per-order limit, hidden flag.
- Inventory counters: available / reserved / sold / refunded / checked-in.
- **Free checkout:** creates a 0-KZT order → tickets issued immediately.
- **Inventory reservation:** inside one SQL transaction with `SELECT ... FOR UPDATE` on the ticket type, so stock can never go negative.
- Ticket = unique random code (e.g. `BF-84215-0015`) + **signed** QR payload (HMAC), so a QR cannot be forged.
- Email confirmation with ticket link. "My Orders" (Upcoming / Past / Cancelled) and "My Ticket" pages.
- **Milestone A:** organizer publishes a free event → attendee registers → gets QR ticket (SRS success criterion #1).

### Step 6 — Paid sales activation + simulated checkout (Week 6)
- Activation checklist per event: paid ticket type exists → simulated identity check → payout account (demo) → pay activation fee (simulated) → accept terms.
- Paid ticket types cannot be bought until the event is activated (enforced in the API, not only the UI).
- Checkout: reserve tickets (10-min hold) → order `pending` → fake payment page → webhook-style callback `POST /payments/simulate/:id` → on success issue tickets, on fail/timeout release inventory.
- A background `setInterval` job in the API expires stale holds every minute.
- Every payment screen and record marked **DEMO**.
- **Milestone B:** UC2 + UC3 work end to end.

### Step 7 — Printable PDF tickets, promo codes, Campaign QR (Week 7)
- `GET /tickets/:id/pdf` — A4 PDF from pdfkit: event, date/time, venue, type, attendee, seat, ticket ID, large QR (works in grayscale).
- Campaigns: % or fixed KZT discount, validity dates, max redemptions, applicable ticket types.
- Campaign QR = link `https://.../e/<event>?c=<opaque token>`; the server looks up the discount — never trusts the client.
- Redemption limit enforced atomically in the order transaction.
- Campaign QR visually different (e.g. orange frame + "PROMO — not a ticket"), and the check-in endpoint rejects it.
- Promo code page + discount line in checkout (as in mockup).

### Step 8 — Check-in API + organizer attendee management (Week 8)
Built now so the mobile app later only needs a UI:
- `POST /checkin/verify` (scan QR → valid / invalid / cancelled / refunded / already used), `POST /checkin/:ticketId`, `DELETE /checkin/:ticketId` (undo), attendee search, counts.
- Organizer assigns Event Admins by email (staff_assignments).
- Web: attendee list, manual check-in button, export CSV.
- Orders, cancellation of free registrations, full refunds (simulated) → tickets become invalid → email sent → audit log.

### Step 9 — Support cases, admin portal, analytics, history (Week 8–9)
- **Support:** open case from event/order/ticket page (context attached automatically), category, chat-like thread, statuses Open / In Progress / Waiting for Customer / Resolved, email on new reply. Web polls every ~15 s (no WebSockets).
- **Platform admin portal:** search users/events/orders/payments, suspend user/event (stops sales), review activations, set activation fee, escalated cases, CSV export.
- **Organizer analytics:** cards + charts from SQL aggregation — sold/capacity, gross, discounts, refunds, net (DEMO KZT), sales over time, by ticket type, by campaign, check-in %. Filters: event, date range, ticket type. (Charts with one small library, e.g. Recharts.)
- **Event history:** Upcoming / Active / Completed / Cancelled tabs, activity timeline from `audit_log` with filters, duplicate-event.
- **Milestone C:** every SRS §11 success criterion except the mobile-app one passes on the website.

### Step 10 — Bonus (only if Milestone C is stable)
1. Assigned seating: SVG seat map of the seeded layout, seat holds with DB unique constraint to prevent double-selling, colours **and** text labels.
2. Calendar export: `.ics` download with stable UID + Google/Outlook links; cancellation `.ics`.
3. GA4 events (no personal data).

### Step 11 — Hardening & demo prep (Week 10+)
- Automated tests: API tests for auth, checkout, inventory race, promo limits, QR verify, refunds (Jest/Vitest + Supertest against a test Postgres in Docker).
- Kazakh / Russian / English text pass; WCAG basics (labels, contrast, keyboard).
- Database backup script (`pg_dump`) + restore instructions.
- Seeded demo script for the presentation. Freeze features.

### Then — Phase 2: Mobile scanner app (React Native / Expo)
Login → list assigned events → camera QR scan → result screen → undo → manual search → counters.
Uses only endpoints already built in Step 8.

---

## 5. Definition of done for each feature
Integrated, reviewed via PR by one other person, has API tests for its business rules, documented in README/openapi (SRS 13.4).
