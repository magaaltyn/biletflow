# BiletFlow mobile (React Native + Expo)

One native app for all four BiletFlow roles — attendee, organizer, Event Admin (check-in staff) and Platform Admin —
with a **native camera QR scanner**. It uses the existing Express REST API and PostgreSQL database, so everything
done in the app appears on the website and vice versa. It is not a WebView wrapper: every screen is a React Native screen.

- Setup on Windows, phone networking, firewall: [../docs/mobile-setup.md](../docs/mobile-setup.md)
- Feature parity with the website: [../docs/mobile-feature-audit.md](../docs/mobile-feature-audit.md)
- API endpoints used: [../docs/mobile-api-contract.md](../docs/mobile-api-contract.md)
- Tests and results: [../docs/mobile-testing.md](../docs/mobile-testing.md)
- Architecture: [../docs/mobile-architecture.md](../docs/mobile-architecture.md)

## Stack

| Area | Library (version) |
|---|---|
| Runtime | Expo SDK 58 (`expo` 58.0.26), React Native 0.88.1, React 19.3, TypeScript 6.0 |
| Navigation | Expo Router 58 (file-based, `src/app/`) |
| Server state | TanStack Query 5 |
| Camera / QR scanning | `expo-camera` 58 (`CameraView`, `barcodeTypes: ["qr"]`) |
| Ticket QR rendering | `react-native-qrcode-svg` 6 + `react-native-svg` 15 |
| Secure token storage | `expo-secure-store` (Keychain / Keystore) |
| Files | `expo-file-system` (download with bearer token) + `expo-sharing` (PDF, CSV, ICS, PNG) |
| Images | `expo-image` (event covers, SVG venue maps), `expo-image-picker` (cover upload) |
| Forms | native inputs + `@react-native-community/datetimepicker` |
| Other | `expo-haptics` (scan feedback), `expo-localization`, `@expo/vector-icons` |
| Tests | Jest + `jest-expo` (unit), Node test runner + `tsx` (end-to-end against the real API) |

All native modules are included in **Expo Go**, so no custom development build is needed to run the app.

## Run

```powershell
cd "C:\Users\ealiz\biletflow\github-project\mobile"
npm install
Copy-Item .env.example .env          # set EXPO_PUBLIC_SERVER_URL=http://<laptop-LAN-IP>:3000
npx expo start                       # scan the QR with Expo Go (Android) or the Camera app (iPhone)
```

The API (`api/`, port 4000) and website (`web/`, port 3000) must be running — see `docs/mobile-setup.md`.

Checks:

```powershell
npm run typecheck      # TypeScript
npx eslint src tests   # lint
npm test               # 32 unit tests (Jest)
npm run test:e2e       # 24 end-to-end tests against the running API + website
npx expo-doctor        # Expo dependency/config checks
```

## Demo accounts (password `Demo12345`)

| Role | Email | Opens |
|---|---|---|
| Attendee | `attendee@biletflow.kz`, `attendee2@biletflow.kz` | Home / Search / My tickets / Notifications / Profile |
| Organizer | `organizer@biletflow.kz` | Dashboard / My events / Support / Profile (+ attendee and scanner workspaces) |
| Event Admin | `staff@biletflow.kz` | Assigned events → camera scanner, attendance |
| Platform Admin | `admin@biletflow.kz` | Overview / Search & moderation / Review / Support / Settings |

Promo codes on *The Spirit of Almaty*: `ALMATY10` (10 %), `STUDENT1000` (1 000 ₸ off).

## Navigation

One app, role-aware **workspaces** (switch in Profile → Workspace). The server decides what each user may do;
the app only hides navigation that would be rejected anyway.

```
Attendee:   Home · Search · My tickets · Notifications · Profile
Organizer:  Dashboard · My events · Support · Profile        (event → Overview/Tickets/Paid sales/Campaigns/Attendees/Orders/Staff/History/Analytics)
Event Admin: Assigned events · Profile                        (event → Camera scanner · Attendance)
Admin:      Overview · Search · Review · Support · Settings
```

Deep links: `biletflow://event/<slug>`, `biletflow://c/<campaign-token>` (promo link), `biletflow://order/<id>`.
Notification links (website paths such as `/orders/12`) open the matching app screen.

## Folder structure

```
mobile/
  app.json, .env.example, package.json, tsconfig.json, eslint.config.js
  assets/                      BiletFlow icons
  src/app/                     Expo Router routes (thin files that re-export feature screens)
    (attendee)/ (organizer)/ (staff)/ (admin)/   tab layouts per workspace
    event/[slug] order/[id] pay/[id] ticket/[id] support/… org-event/[id] scan/[eventId] attendance/[eventId] c/[token] …
  src/features/
    auth/        AuthProvider (SecureStore session, refresh, workspaces), login/register/reset/verify screens
    events/      home, search & filters, event detail + checkout (seat map, promo, server quote)
    checkout/    orders, order detail (countdown, pay, cancel), DEMO payment
    tickets/     my tickets (upcoming/past/cancelled/refunded), ticket QR + PDF
    organizer/   events list, event form, event management, organizer profile/identity/payout
    analytics/   organizer dashboard and per-event analytics
    campaigns/   promo-link handler
    scanner/     assigned events, camera scanner, attendance (search, manual check-in, undo, recent scans)
    support/     my cases, staff inbox, new case, conversation
    admin/       overview & monitoring, search & moderation, activations & reports, settings & CSV exports
    profile/     profile, workspaces, language, notifications
  src/components/  UI kit (same palette as the website), seat map, QR, charts, date pickers
  src/services/    apiClient.ts (platform-independent REST client), api.ts (app instance)
  src/lib/         config, theme, i18n (website dictionary RU/KK/EN), formatting, types, files, links
  tests/unit/      Jest unit tests          tests/e2e/   end-to-end tests against the real API
```

## Known limitations

See `docs/mobile-feature-audit.md` and `docs/mobile-testing.md`. In short: not yet run on a physical phone or emulator
from this PC (camera scanning therefore unverified on hardware); Google sign-in and Halyk ePay are website-only;
no push notifications (the backend has none) — in-app notifications with polling instead; organizer/admin screens are
in English (as on the website).
