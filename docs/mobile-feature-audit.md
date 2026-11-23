# Mobile feature audit (website → mobile)

Source of truth: the code in `frontend/` and `api/` at commit `d81e503` (read-only clone of `github.com/magaaltyn/biletflow`),
not the progress reports. Before this work `mobile/` contained **only a README** — no scanner or app existed.

Status legend:
- **✅ Verified** — implemented in the app and exercised against the real local API (e2e tests and/or the web preview of the app).
- **🟡 Implemented, not device-tested** — implemented; needs a physical phone to confirm (camera, share sheet, photo picker, keychain).
- **🔶 Partial / different workflow** — available in a mobile-appropriate form that differs from the website.
- **⛔ Not in mobile** — deliberately not implemented (reason given).

| # | Feature (website) | Website implementation | Backend endpoint(s) | Mobile implementation | Status |
|---|---|---|---|---|---|
| 1 | Register / log in / log out | `frontend/components/AuthForms.tsx` | `/auth/register`, `/auth/login`, `/auth/logout` | Login, Register (incl. "I organize events"), logout in Profile | ✅ |
| 2 | Session handling | httpOnly cookie | JWT (Bearer accepted) | SecureStore token, refresh on start (`/auth/refresh`, new), 401 → sign-out + "session expired" | ✅ (logic) · 🟡 keychain on device |
| 3 | Email verification | `app/verify-email` | `/auth/verify-email`, `/auth/resend-verification` | banner in Profile, resend, paste link/token screen | ✅ |
| 4 | Password reset | `app/forgot-password`, `app/reset-password` | `/auth/forgot-password`, `/auth/reset-password` | same two screens (paste the emailed link) | ✅ |
| 5 | Google sign-in | `/auth/google` redirect flow | needs `GOOGLE_CLIENT_ID/SECRET` | — | ⛔ needs a native OAuth client and secrets; not configured on this server either |
| 6 | Profile, change password, become organizer | `app/account` | `/auth/me`, `/auth/change-password`, `/auth/become-organizer` | Profile screen | ✅ |
| 7 | Event discovery: search, city, category, date, free | `EventSearch.tsx`, `app/events` | `/events`, `/events/filters` | Home (featured, free, categories), Search with chips, infinite scroll, pull-to-refresh | ✅ |
| 8 | Event page: details, organizer, venue, time zone, description, refund policy | `app/events/[slug]` | `/events/by-slug/:slug` | Event screen | ✅ |
| 9 | Public / unlisted / private visibility | `?key=` invite | `/events/by-slug/:slug?key=` | private key passed through; private events never in search | ✅ |
| 10 | Venue map + "view from section" pictures | `VenueGallery` | same | images (SVG) with section chips | ✅ |
| 11 | Seat map (Almaty Arena, 780 seats) | `SeatMap.tsx` | `/events/:id/seats` | SVG overview + per-section seat grid, live statuses, accessible seats | ✅ |
| 12 | Stadium picker 2D/3D (Astana Arena, 10 432 seats) | `StadiumPicker.tsx` | `/events/:id/seats?summary=1`, `?section=` | sector list grouped by stand → seat grid; no 3D view | 🔶 |
| 13 | Ticket selection, per-order limits, one free ticket per account | event page | `/orders/quote`, `/orders` | steppers limited by `max_per_order`/availability; server enforces limits | ✅ |
| 14 | Promo code + price preview | event page | `/orders/quote` | Apply → server quote (subtotal, discount, fee, total) | ✅ |
| 15 | Campaign QR / promo link (`/c/<token>`) | `app/c/[token]` | `/events/campaign/:token`, `by-slug?c=` | `biletflow://c/<token>` deep link + "Open a promo link" (paste) | 🔶 https links scanned with the phone camera open the website (universal links need a public domain) |
| 16 | Reservation countdown, cancel pending order | `app/orders/[id]` | `/orders/:id`, `/orders/:id/cancel` | Order screen countdown, Cancel order | ✅ |
| 17 | DEMO payment (success / failure) | `app/pay/[id]` | `/orders/:id/pay`, `/payments/:id/demo` | DEMO payment screen with clear DEMO banner | ✅ |
| 18 | Halyk ePay test payments | `lib/pay.ts` (bank JS payform) | `/payments/:id/halyk-verify` | — | ⛔ the bank form is a browser script; disabled by default (`HALYK_ENABLED=false`); app uses DEMO |
| 19 | Orders history | `app/orders` | `/orders` | Orders screen with status filters | ✅ |
| 20 | Tickets with QR | order page (`/tickets/:id/qr.png`) | `/orders/:id` (`qrPayload`), `GET /tickets` (new) | My tickets (Upcoming/Past/Cancelled/Refunded), full-screen QR from the **same** signed payload | ✅ |
| 21 | Ticket PDF (single / whole order) | links to `/tickets/:id/pdf` | same | download with token → share sheet (save, print, send) | ✅ download · 🟡 share sheet on device |
| 22 | Calendar: Google / Outlook / .ics | links | `calendar` links, `/events/:id/calendar.ics` | buttons; .ics via share sheet | ✅ links · 🟡 .ics share on device |
| 23 | Cancel / refund a paid order (attendee) | not on website (organizer refunds; attendee contacts support) | — | same: order screen → Support | ✅ (same rule) |
| 24 | Support: new case (with event/order/ticket), thread, statuses, staff inbox, assign, escalate | `app/support/*` | `/support…` | My support, New case, conversation (10 s polling), organizer/admin inbox with status, assign, escalate | ✅ |
| 25 | Report an event | `app/support/report` | `/events/:id/report` | "Report this event" on the event screen | ✅ |
| 26 | Notifications (in-app + email) | header bell | `/notifications`, `/notifications/read-all` | Notifications tab with unread badge (30 s polling); links open the matching screen | ✅ · ⛔ push (backend has no push service) |
| 27 | Language RU / KK / EN | `lib/i18n.tsx` | — | same dictionary; customer screens translated, organizer/admin English (as website) | ✅ |
| 28 | Night theme | `ThemeToggle.tsx` | — | follows the phone's light/dark setting (no manual toggle) | 🔶 |
| 29 | Organizer profile, simulated identity check, demo payout account | `app/organizer/profile` | `/organizer/profile`, `/verify-identity`, `/payout-account` | Organizer profile screen | ✅ |
| 30 | Custom venue + map picture upload | event form | `/organizer/venues`, `/organizer/venues/:id/map-image` | create venue in the event form; map picture upload not in the app | 🔶 |
| 31 | Create / edit event (all fields, native date-time) | `EventForm.tsx` | `/organizer/events` POST/PATCH | Event form with native date/time pickers and validation | ✅ |
| 32 | Cover image upload | event form | `/organizer/events/:id/image` (multipart `image`) | photo picker → multipart upload | 🟡 |
| 33 | Publish / unpublish / preview / duplicate / cancel | `Tabs.tsx` | `/publish`, `/unpublish`, `/duplicate`, `/cancel` | Overview section | ✅ |
| 34 | Ticket types: free, paid, VIP, early bird, quantity, sale window, per-order max, hidden, seat sections | Tickets tab | `/ticket-types` | Tickets section with live sold/reserved/available | ✅ |
| 35 | Paid sales activation checklist (DEMO fee, terms) | Paid sales tab | `/activation/{pay,terms,check}` | Paid sales section → DEMO payment | ✅ |
| 36 | Campaigns / promo codes, Campaign QR | Campaigns tab | `/campaigns`, `/campaigns/:cid/qr.png` | Campaigns section, QR image, share PNG, enable/disable | ✅ · 🟡 PNG share on device |
| 37 | Attendees + CSV export | Attendees tab | `/attendees`, `?format=csv` | search; CSV via share sheet | ✅ · 🟡 share on device |
| 38 | Orders + refunds / cancellations | Orders tab | `/orders`, `/organizer/orders/:oid/refund` | Orders section with reason prompt | ✅ |
| 39 | Event Admins (staff, can-undo) | Staff tab | `/staff` | Staff section | ✅ |
| 40 | Event history (append-only audit) | History tab | `/history?type=` | History section with type filter | ✅ |
| 41 | Analytics (capacity, sold, gross, discounts, refunds, net, over time, by type, campaigns, attendance) | Analytics tab | `/organizer/analytics` | Dashboard + per-event analytics, date filter, SVG bar chart | ✅ |
| 42 | Event lifecycle lists (draft/upcoming/active/completed/cancelled) | `app/organizer` | `/organizer/events` | My events filters | ✅ |
| 43 | Check-in: assigned events | `app/checkin` | `/checkin/events` | Assigned events with progress | ✅ |
| 44 | **Camera QR scanning** | browser camera page | `/checkin/:id/scan` | native `expo-camera` scanner, scan gate, result screens, haptics, torch, permission handling | ✅ server workflow · 🟡 **camera on a real phone not yet tested** |
| 45 | Manual search, manual check-in, undo, stats | `app/checkin/[eventId]` | `/search`, `/tickets/:tid`, `/undo`, `/stats` | Attendance screen | ✅ |
| 46 | Recent scans | — | `GET /checkin/:id/recent` (new) | Attendance screen | ✅ |
| 47 | Admin overview & monitoring | `app/admin` | `/admin/overview`, `/admin/monitoring` | Overview tab | ✅ |
| 48 | Admin search: users, events, orders, payments | `app/admin` | `/admin/search` | Search tab | ✅ |
| 49 | Suspend users / events, stop paid sales | `app/admin` | `/admin/users/:id/suspend`, `/admin/events/:id/{suspend,paid-sales}` | buttons with reason prompt | ✅ |
| 50 | Activation records, event reports | `app/admin` | `/admin/activations`, `/admin/reports` | Review tab | ✅ |
| 51 | Platform settings, CSV exports | `app/admin` | `/admin/settings`, `/admin/export/*.csv` | Settings tab | ✅ · 🟡 CSV share on device |
| 52 | Static pages (How it works, Pricing, Terms, Privacy, Organizers) | `app/*` | — | opened on the website from Profile | 🔶 |
