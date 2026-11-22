# Mobile app architecture

## Principles

1. **One backend.** The app calls the existing Express API (`api/`) — the same endpoints as the website. No mobile-only
   backend, no direct database access, no second payment system. Prices, discounts, inventory, seat holds, ticket
   validity and check-ins are decided by the server.
2. **One app, four workspaces.** Attendee, Organizer, Event Admin (staff assignment) and Platform Admin share one
   app. `workspacesFor(user)` decides which tab bars a user may open (`/auth/me` → `role`, `is_event_admin`);
   every request is still authorised by the server (`requireRole`, `getManagedEvent`, `getCheckInEvent`).
3. **Native, not a wrapper.** Every screen is React Native. Web-specific website parts were re-done natively:
   SVG seat map → `react-native-svg`; `<img src=/qr.png>` → QR rendered from the server-signed payload;
   PDF links → authenticated download + share sheet; browser camera page → `expo-camera`.

## Layers

```
src/app (routes)  →  src/features/* (screens + feature logic)  →  src/services/api.ts  →  apiClient.ts (fetch)
                                     ↘ src/components (UI kit)      ↘ src/lib (config, i18n, theme, format, types)
```

- **apiClient.ts** is platform independent (used by the app *and* the Node e2e tests): bearer token, JSON,
  20 s timeout, `ApiError {status, code, message, isNetwork}`, `onUnauthorized` hook, `beforeRequest` hook.
- **AuthProvider** keeps the JWT in `expo-secure-store` (Keychain/Keystore — not AsyncStorage). On start it exchanges
  the stored token for a fresh one (`POST /auth/refresh`, sliding 7-day session). A 401 on any request signs the
  user out and shows "session expired". Until the session is restored, all non-`/auth` requests wait
  (`beforeRequest`), so deep links never fire unauthenticated requests.
- **TanStack Query** caches server state, refetches on pull-to-refresh and polls where the website polls
  (notifications 30 s, support thread 10 s, attendance 15 s). Retries only on network/5xx errors.
- **Errors**: every list/detail screen has loading, empty, error-with-retry states; network errors say so explicitly.

## Scanner design

```
CameraView (barcodeTypes: qr) ─► scan gate (createScanGate) ─► POST /api/checkin/:eventId/scan {qr}
                                     │ one request at a time         │ server: HMAC check, ticket row lock (FOR UPDATE),
                                     │ same code ignored for 3 s     │ event match, status, atomic check-in + audit
                                     ▼                               ▼
                               result screen (green / amber / red, haptics) + updated counters
```

- The QR payload `BFT1.<code>.<hmac>` is created and verified only by the server; the app never decides validity.
  Campaign QR codes are `https://…/c/<token>` links and are rejected by the server as `campaign_qr`.
- Duplicate admission is impossible even with two phones: the server locks the ticket row inside a transaction.
- Network failure → "Network error — not verified" with *Retry this ticket*; nothing is cached as valid offline.
- Camera permission states: requesting, denied (with *Open settings*), unavailable (`onMountError`).
  The camera only runs while the scanner screen is focused. Torch toggle for dark entrances.
- Manual fallback: attendee search, manual check-in and (if allowed) undo on the Attendance screen.

## Localisation and theme

Customer-facing screens use the website's dictionary (copied to `src/lib/i18nWeb.ts`) in Russian, Kazakh and English;
organizer/staff/admin screens are English like the website. Colours are the website palette (`web/app/globals.css`)
including its night theme, following the phone's system setting.

## Local backend changes made for the app

See `docs/mobile-api-contract.md` → "Backend changes". All are additive and backward compatible; the website is unchanged.
