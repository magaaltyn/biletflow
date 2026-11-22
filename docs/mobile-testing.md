# Mobile app — testing report

Environment: Windows 11, Node 26.13, Docker Desktop (PostgreSQL 17 on port 5434, Mailpit), API (`npm run dev`, :4000),
website (`next dev`, :3000), Expo SDK 58. Date of the run: 22 Nov 2026.

## Automated tests (all actually executed)

| Suite | Command | Result |
|---|---|---|
| Mobile unit tests (Jest, `jest-expo`) | `cd mobile; npm test` | **32 / 32 passed** |
| Mobile end-to-end tests against the real API + website | `cd mobile; npm run test:e2e` | **24 / 24 passed** (8 suites) |
| Existing API smoke test, on a freshly seeded scratch database | `BASE=http://localhost:4100/api node api/tests/smoke.mjs` | **all 45 checks passed** (confirms the backend changes did not break anything) |
| TypeScript — mobile / API / website | `npx tsc --noEmit` / `npm run typecheck` / `npx tsc --noEmit` | no errors |
| ESLint (eslint-config-expo) | `cd mobile; npx eslint src tests` | no findings |
| Expo doctor | `npx expo-doctor` | 20 / 20 checks passed |

### What the end-to-end tests cover (`mobile/tests/e2e/mobile-flows.test.ts`)
They use the app's own `apiClient`, so they send exactly the requests the app sends.

- **Authentication:** wrong password (401 `bad_credentials`); registration; duplicate email (409 `email_taken`);
  token refresh; no token / garbage token → 401 and the client's sign-out hook fires; role checks (attendee and
  Event Admin get 403 on admin and organizer APIs); unreachable server → network error (`status 0`).
- **Scenario 1 – event creation:** organizer creates a draft, free + paid ticket types (server forces 1 free ticket
  per order), completes paid-sales activation (simulated identity, demo payout, DEMO fee payment, terms), publishes;
  the event is found **through the website** (`:3000/api/events`) and its website page returns 200. Invalid dates
  rejected; another user cannot edit the event.
- **Scenario 2 – purchase with promo:** server quote with a 20 % campaign code; invalid code reported; a **failed**
  DEMO payment leaves the order `failed` with no tickets; successful payment issues one ticket with a signed QR;
  a duplicate confirmation issues no extra tickets; `GET /tickets` returns the same QR payload; the order is
  readable through the website proxy; PDF download works for the owner (`%PDF-`) and is refused for others (403);
  other users cannot read the order; overselling refused (409 `sold_out`); second free ticket refused (409 `free_limit`).
- **Scenario 3 – check-in & QR security:** assigned Event Admin sees the event; unassigned user gets 403; valid scan →
  `valid` and the counter increases by 1; second scan → `already_used`; **two devices scanning the same ticket at the
  same moment → exactly one `valid`, one `already_used`**; client scan gate sends one request for 20 identical frames;
  random text → `invalid`; edited ticket code (forged signature) → `invalid`; ticket of another event → `wrong_event`;
  Campaign QR link → `campaign_qr`; manual search; undo refused for staff without `can_undo` (403) and allowed for
  staff with it; manual check-in; recent-scans list.
- **Scenario 4 – refund invalidation:** organizer refunds a paid order → scan returns `refunded` and the app no longer
  receives its QR; cancelled free registration → `cancelled`.
- **Scenario 5 – analytics:** gross 10 000 ₸, discounts 1 000 ₸, refunds 5 000 ₸, net 4 000 ₸, 2 sold, 2/2 checked in
  (100 %), campaign tickets, and history entries for creation, ticket types, activation, publication, campaign,
  payment, check-in, undo and refund — all matching the records the test created.
- **Scenario 6 – administration:** organizer cannot suspend (403); admin finds and suspends the event; a new purchase
  is refused both directly and **through the website** (400 `event_suspended`); the event disappears from discovery;
  unsuspend; refund appears in monitoring.
- **Scenario 7 – support:** attendee opens a case on the event; organizer sees it in the inbox and replies; another
  attendee is refused (403); status becomes "waiting for customer"; the attendee gets a `support_reply`
  notification and resolves the case.

### Unit tests (`mobile/tests/unit`)
Scan gate (single request per code, busy lock, 3 s cooldown, reset/retry, 30 fps burst → 1 request); wording for
every scan result (only `valid` admits; unknown results never admit); notification link → screen mapping; campaign
token parsing; KZT formatting; Kazakh date formatting (works around missing `kk-KZ` data in Intl) and Almaty time zone;
countdown; ticket tab grouping; role → workspace mapping; API client (bearer header, error mapping, 401 sign-out,
network errors, query strings).

## Manual checks in the Expo web preview (executed)

The app was run with `npx expo start --web` at phone size (375×812) against the local API, in Russian/English/Kazakh,
light and dark. Executed and observed:

- Welcome, login (attendee, organizer, Event Admin, admin), home with real events and images, search.
- **Paid purchase on the native seat map**: Spirit of Almaty → section F → seat F‑3‑5 → promo `ALMATY10` →
  server total 3 245 ₸ (3 500 − 350 + 95 fee) → order with 10-minute countdown → DEMO payment → paid order with a
  valid QR ticket. The same order is visible on the website.
- Hamlet (general admission): quantity steppers and server quote (8 000 + 240 fee = 8 240 ₸), in Kazakh.
- Organizer dashboard analytics, My events, event management (all nine sections render with live data), create-event
  form, organizer profile (prefilled), support inbox.
- Event Admin: assigned events; **scanner screen** (manual QR-text field on the web) → *Valid ticket — checked in*,
  counter 0/3 → 1/3; same ticket again → *Ticket already checked in*, counter unchanged; Attendance screen with search,
  manual check-in, undo button and the recent-scans list.
- Admin: overview & monitoring, search (events/users/orders/payments), review, settings & exports.
- Attendee: My tickets (tabs), ticket screen with large QR (Kazakh), notifications, orders, support list.

Bugs found and fixed during these checks: screens opened directly (deep link/reload) sent requests before the
session was restored ("Please sign in") — fixed by holding non-auth requests until the session is restored;
broken Kazakh dates from `Intl` ("2026 M12 2"); raw route names as titles in error states; nested heading in the logo.

## Not executed / unverified (honest list)

| Item | Why not | How to verify |
|---|---|---|
| Running on a **physical Android phone** (Expo Go) | no phone connected to this PC during development | `docs/mobile-setup.md` §5, then the walkthrough below |
| **Camera scanning on real hardware** (`expo-camera`) | camera APIs need a device; the web preview uses manual entry | scanner walkthrough below |
| Camera permission denied / camera unavailable screens | need a device | deny the permission in Expo Go |
| Android emulator | Android Studio / SDK not installed on this PC | install Android Studio, create an AVD, press `a` in Expo |
| **iOS** (simulator or iPhone) | simulator impossible on Windows; no iPhone used | iPhone + Expo Go (setup §5) |
| SecureStore keychain, share sheet (PDF/CSV/ICS/PNG), photo picker upload, haptics on device | native only | open a ticket → Download PDF; organizer → Change cover image |
| Push notifications | not implemented: the backend has no push delivery | — (in-app notifications are tested) |
| Halyk ePay, Google sign-in in the app | website-only features | — |

## Scanner test procedure with a real phone

1. Start DB, API and website (setup §2), open the firewall (§4), start Expo (§5).
2. On a **second** device (laptop browser is fine) open the website, log in as `attendee@biletflow.kz`, open
   *My orders* → an order → the ticket QR (or open the ticket PDF on screen / print it).
3. On the phone: log in as `staff@biletflow.kz` → *Assigned events* → *Open scanner* → allow the camera.
4. Point at the QR → green *Valid ticket — checked in*, counter +1. Tap *Scan next ticket*, scan the same QR → amber
   *Ticket already checked in*.
5. Scan a promo QR (organizer → event → Campaigns → Campaign QR) → red *promotional QR code, not an admission ticket*.
6. Scan any other QR (e.g. a website link) → red *Invalid ticket*.
7. Refund the attendee's order on the website or in the organizer app → scan → red *Ticket refunded*.
8. Turn Wi‑Fi off on the phone and scan → *Network error — not verified* with *Retry this ticket*.
9. Two phones logged in as staff/organizer scanning the same new ticket at once → one green, one amber.
10. Attendance → search the attendee → *Undo check-in* (as `staff@`, who may undo) → scan again → green.
