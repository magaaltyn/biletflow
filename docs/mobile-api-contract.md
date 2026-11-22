# Mobile API contract

Every endpoint below exists in `api/src/routes/*` (checked against the source and exercised by `mobile/tests/e2e`).
Base URL: `EXPO_PUBLIC_API_URL` (default `<EXPO_PUBLIC_SERVER_URL>/api`, i.e. through the website proxy).

**Authentication.** `Authorization: Bearer <JWT>` (7-day token from `/auth/login`, `/auth/register` or `/auth/refresh`).
The website uses the `bf_session` cookie with the same JWT; the API accepts either.
**Errors.** JSON `{ "error": "<readable message>", "code": "<machine code>" }` with HTTP 400 (validation, business
rule), 401 `unauthenticated` (no/expired token), 403 `forbidden`, 404 `not_found`, 409 (`sold_out`, `duplicate`,
`free_limit`, `seat_taken`, `email_taken`, `reservation_ended`), 500 `internal`. The app shows `error`; a network
failure (no response) is shown as a separate network error with *Try again*.

Legend: 🔓 public · 👤 signed in · 🎫 organizer of the event or platform admin · 🛂 assigned Event Admin, organizer or admin · 🛡 platform admin.

## Auth & profile
| Method & path | Auth | Request | Response / notes |
|---|---|---|---|
| POST `/auth/register` | 🔓 | `email, password(≥8), fullName, organizer?, organizerName?` | `{user, token}`; sends verification email |
| POST `/auth/login` | 🔓 | `email, password` | `{user, token}`; 401 `bad_credentials`, 403 `suspended` |
| POST `/auth/refresh` | 👤 | — | `{user, token}` — **added for mobile** (sliding session) |
| POST `/auth/logout` | 🔓 | — | clears the website cookie; the app deletes its SecureStore token |
| GET `/auth/me` · PATCH `/auth/me` | 👤 | PATCH: `fullName, phone?` | `{user}` (`role`, `is_event_admin`, `email_verified`, `organizer_name`, …) |
| POST `/auth/change-password` | 👤 | `currentPassword?, newPassword` | `{ok}` |
| POST `/auth/become-organizer` | 👤 | `displayName` | `{user}` |
| POST `/auth/verify-email` · `/auth/resend-verification` | 🔓 · 👤 | `token` · — | `{ok}` |
| POST `/auth/forgot-password` · `/auth/reset-password` | 🔓 | `email` · `token, password` | `{ok}` |

## Discovery & event page
| GET `/events?search&city&category&from&to&free&page&pageSize` | 🔓 | | `{items, total, page, pageSize}` — published, public, not suspended, not ended |
|---|---|---|---|
| GET `/events/filters` | 🔓 | | `{cities[], categories[]}` |
| GET `/events/by-slug/:slug?key=&c=` | 🔓 | `key` private invite, `c` campaign token | event + `venue`, `sections`, `ticketTypes` (available counts), `calendar` links, `campaign` |
| GET `/events/:id/seats` (`?summary=1`, `?section=`) | 🔓 | | seats with live status (`available/held/sold/unavailable`), `priceBySection` |
| GET `/events/:id/calendar.ics` | 🔓 | | `.ics` file (shared via the share sheet) |
| GET `/events/campaign/:token` | 🔓 | | `{slug, token}` for promo links |
| POST `/events/:id/report` | 👤 | `reason(≥5)` | `{ok}` |
| GET `/venues` | 🔓 | | venues list |

## Checkout, payments, tickets
| POST `/orders/quote` | 🔓 | `eventId, items[{ticketTypeId,quantity}], seatIds[], promoCode?, campaignToken?` | `{count, subtotal, discount, fee, total, promo, promoError}` — prices computed by the server |
|---|---|---|---|
| POST `/orders` | 👤 | quote body + `attendeeName, attendeeEmail` | order detail; `pending` (reserved 10 min) or `paid` for 0 ₸; 409 `sold_out`/`seat_taken`/`free_limit`; 400 `paid_sales_inactive`, `event_suspended` |
| GET `/orders` · GET `/orders/:id` | 👤 (owner, organizer, admin) | | order with `items`, `payments`, `tickets[].qrPayload` (only for valid/checked-in tickets), `calendar` |
| POST `/orders/:id/cancel` | 👤 owner | | releases a pending reservation |
| POST `/orders/:id/pay` | 👤 owner | `provider: "demo"` | `{paymentId}` |
| GET `/payments/:id` · POST `/payments/:id/demo` | 👤 owner | `success: boolean, method` | DEMO outcome; a repeated confirmation never issues more tickets |
| GET `/tickets` | 👤 | | **added for mobile**: all my tickets with event info and `qrPayload` |
| GET `/tickets/:id/pdf` · `/tickets/order/:id/pdf` | 👤 owner/organizer/admin | | A4 PDF (downloaded with the bearer token, then shared) |

## Check-in (Event Admin scanner)
| GET `/checkin/events` | 👤 | | events the user may scan (assigned / own / all for admin) with `registered`, `checked_in` |
|---|---|---|---|
| POST `/checkin/:eventId/scan` | 🛂 | `qr` | `{result, message, ticket?, stats}`; `result` ∈ `valid, already_used, cancelled, refunded, wrong_event, campaign_qr, invalid` |
| GET `/checkin/:eventId/stats` | 🛂 | | `{registered, checked_in}` |
| GET `/checkin/:eventId/search?q=` | 🛂 | | tickets by name / email / code |
| POST `/checkin/:eventId/tickets/:ticketId` | 🛂 | | manual check-in |
| POST `/checkin/:eventId/tickets/:ticketId/undo` | 🛂 with `can_undo` | | 403 if the Event Admin may not undo |
| GET `/checkin/:eventId/recent` | 🛂 | | **added for mobile**: last 30 check-in/undo actions |

## Organizer
| GET/PUT `/organizer/profile` · POST `/organizer/verify-identity` · PUT `/organizer/payout-account` | organizer | profile; simulated KYC (`fullLegalName, documentLast4`); demo payout (`bankName, holderName, iban`) | |
|---|---|---|---|
| GET/POST `/organizer/events` · GET/PATCH `/organizer/events/:id` | 🎫 | event fields (`title, description, category, venueId, startsAt, endsAt, visibility, seating, capacity, registrationOpensAt/ClosesAt, refundPolicy`) | detail includes `ticketTypes`, `staff`, `stats`, `activation`, `lifecycle` |
| POST `/organizer/events/:id/{publish,unpublish,duplicate,cancel,image}` | 🎫 | cancel: `reason`; image: multipart `image` | |
| POST `/organizer/venues` | organizer | `name, city, address, kind` | |
| POST `/organizer/events/:id/ticket-types` · PATCH/DELETE `/organizer/ticket-types/:tid` | 🎫 | `name, description, priceKzt, quantity, salesStart, salesEnd, maxPerOrder, hidden, sectionCodes` | |
| POST `/organizer/events/:id/activation/{pay,terms,check}` | 🎫 | | paid-sales checklist (DEMO fee) |
| POST/DELETE `/organizer/events/:id/staff[/:uid]` | 🎫 | `email, canUndo` | |
| GET `/organizer/events/:id/{attendees,orders,campaigns,history}` | 🎫 | attendees `?search=&format=csv`; history `?type=` | |
| POST `/organizer/orders/:oid/refund` | 🎫 | `reason` | refund (paid) / cancel (free); tickets invalid immediately |
| POST `/organizer/events/:id/campaigns` · PATCH `/organizer/campaigns/:cid` · GET `/organizer/campaigns/:cid/qr.png` | 🎫 | `name, code?, discountType, discountValue, validFrom, validUntil, maxRedemptions, ticketTypeIds` · `active` | |
| GET `/organizer/analytics?eventId&from&to&ticketTypeId` | 🎫 | | `capacity, money, overTime, byType, campaigns, attendance` |

## Support & notifications
| GET `/support?view=mine|inbox` · POST `/support` | 👤 | `category, subject, message, eventId?, orderId?, ticketId?` | |
|---|---|---|---|
| GET `/support/:id` · POST `/support/:id/messages` · PATCH `/support/:id` | requester, organizer staff of the event, admin | `body` · `status, assignToMe, escalate` | |
| GET `/notifications` · POST `/notifications/read-all` | 👤 | | `{items, unread}` |

## Platform admin (🛡)
`GET /admin/overview`, `GET /admin/search?q=` (users, events, orders, payments), `POST /admin/users/:id/suspend {suspended}`,
`POST /admin/events/:id/suspend {suspended, reason}`, `POST /admin/events/:id/paid-sales {suspended, reason}`,
`GET /admin/activations`, `GET /admin/reports`, `POST /admin/reports/:id/resolve`, `GET /admin/monitoring`,
`GET/PUT /admin/settings {activation_fee_kzt, processing_fee_percent}`, `GET /admin/export/{orders,events,payments}.csv`.

## Backend changes made locally for the app

All additive; no existing endpoint, response or migration changed; the website is unaffected. Verified by the
project's own smoke test (`api/tests/smoke.mjs`, all checks passed) and `npm run typecheck`.

| Change | File | Why |
|---|---|---|
| `POST /auth/refresh` | `api/src/routes/auth.ts` | mobile has no cookie; lets the app renew its 7-day token on start (sliding session) |
| `GET /tickets` | `api/src/routes/orders.ts` | "My tickets" without one request per order |
| `GET /checkin/:eventId/recent` | `api/src/routes/checkin.ts` | "recent scans" list for staff (reads the existing `check_ins` table) |
| Opt-in CORS (`CORS_ORIGINS`) | `api/src/index.ts`, `api/src/lib/config.ts` | only for the Expo **web** preview; off by default, native apps do not need it |
| `DB_PORT` variable, API port 4000 exposed | `docker-compose.yml`, `.env.example` | PostgreSQL port configurable (this PC already uses 5432); phones can reach the API in Docker mode |

No database migration was needed.
