# BiletFlow mobile app — Windows setup

The mobile app (`mobile/`, React Native + Expo SDK 58) talks to the **same** Express API and PostgreSQL database
as the website. Nothing runs in the cloud: the phone connects to your laptop over Wi‑Fi.

```
 phone (Expo Go / dev build) ──Wi‑Fi──► laptop :3000 (Next.js website) ──/api──► :4000 (Express API) ──► PostgreSQL (Docker)
                             └──────────► laptop :8081 (Expo Metro bundler, JavaScript of the app)
```

## 1. Prerequisites (checked on this PC)

| Tool | Needed for | Status on the development PC |
|---|---|---|
| Node.js 24+ | API, website, Expo | Node 26.13 installed |
| Docker Desktop | PostgreSQL + Mailpit | installed |
| **Expo Go** app on your phone | running the app without a build | install from Google Play / App Store (must support SDK 58) |
| Android Studio + emulator | optional, emulator testing | **not installed** |
| macOS + Xcode | iOS simulator | **not possible on Windows** |

## 2. Start the backend and website (PowerShell)

```powershell
cd "C:\Users\ealiz\biletflow\github-project"
docker compose up -d db mailpit
cd api;  npm install; npm run migrate:dev; npm run seed:dev; npm run dev     # window 1 — API on :4000
```

```powershell
cd "C:\Users\ealiz\biletflow\github-project\web"; npm install; npm run dev     # window 2 — website on :3000
```

`.env` (repository root, not committed) already contains `DB_PORT=5434` because this PC runs its own PostgreSQL 18
on 5432. On another computer you can keep the default 5432.

Everything in Docker instead: `docker compose up --build` (website :3000, API :4000, Mailpit :8025).

## 3. Find the laptop's Wi‑Fi address

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object InterfaceAlias -match "Wi-Fi|Беспроводная|Ethernet" | Select-Object InterfaceAlias, IPAddress
```

On the development PC this is `192.168.1.76` (adapter "Беспроводная сеть"). Ignore `169.254.*` and VPN adapters
(e.g. Radmin VPN `26.*`). The phone and the laptop must be on **the same Wi‑Fi network** (no guest/isolated network).

## 4. Allow the ports through Windows Firewall (once, as Administrator)

Windows usually blocks incoming connections from other devices. Run **PowerShell as Administrator**:

```powershell
New-NetFirewallRule -DisplayName "BiletFlow dev (web, API, Expo)" -Direction Inbound -Protocol TCP -LocalPort 3000,4000,8081 -Action Allow -Profile Private
```

Make sure your Wi‑Fi is a **Private** network (Settings → Network → Wi‑Fi → Network profile type → Private).
To remove the rule later: `Remove-NetFirewallRule -DisplayName "BiletFlow dev (web, API, Expo)"`.
Do not expose these ports to the internet (no port forwarding) — they are development servers.

## 5. Configure and start the app

```powershell
cd "C:\Users\ealiz\biletflow\github-project\mobile"
npm install
Copy-Item .env.example .env      # then edit .env
npx expo start
```

`mobile/.env`:

| Where the app runs | `EXPO_PUBLIC_SERVER_URL` |
|---|---|
| Physical phone (Android or iPhone, same Wi‑Fi) | `http://<laptop-IP>:3000`, e.g. `http://192.168.1.76:3000` |
| Android emulator | `http://10.0.2.2:3000` (the emulator's alias for the host PC) |
| iOS simulator (Mac only) / Expo web preview | `http://localhost:3000` |

`EXPO_PUBLIC_API_URL` is optional; leave it empty to reach the API through the website (`…:3000/api`), or set
`http://<laptop-IP>:4000/api` to call Express directly. Restart `npx expo start` after changing `.env`.
`EXPO_PUBLIC_*` values are bundled into the app — **never put secrets there** (no JWT/QR secrets, no DB passwords).

### Open the app

- **Android phone:** open Expo Go → "Scan QR code" → scan the QR shown in the terminal.
- **iPhone:** scan the terminal QR with the Camera app → opens in Expo Go.
- If the phone cannot load the bundle, start with `npx expo start --lan` (same Wi‑Fi) — or `npx expo start --tunnel`
  as a last resort (this goes through Expo's tunnel service; use only if your network isolates devices).
- **Android emulator:** start an AVD in Android Studio, then press `a` in the Expo terminal.
- **Web preview (no phone):** `npx expo start --web` and set `CORS_ORIGINS=http://localhost:8081` in the root `.env`
  (already done here). The camera scanner is replaced by a manual QR-text field on the web.

## 6. Test the connection

1. On the phone, open `http://<laptop-IP>:3000/api/health` in the browser → `{"status":"ok"}`.
2. In the app: Profile tab → the bottom card shows the server and API addresses it uses.
3. Log in with `attendee@biletflow.kz` / `Demo12345`.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| "Cannot reach the BiletFlow server at …" | Wrong IP in `mobile/.env`, phone on another network, firewall rule missing, or API/website not running. Check step 6.1. |
| Expo Go: "Could not connect to development server" | Port 8081 blocked (firewall) or different network; try `npx expo start --lan`. |
| Works on emulator but not on phone | You used `10.0.2.2` or `localhost`; use the laptop IP. |
| Images do not load | `EXPO_PUBLIC_SERVER_URL` must point to the **website** (pictures are served by it). |
| "Your session has expired" | Tokens last 7 days and are refreshed on app start; sign in again. |
| Camera stays black / permission denied | Allow camera access for Expo Go in phone settings; the scanner screen has an "Open settings" button. |

## 8. iOS on Windows

An iOS **simulator** cannot run on Windows (it needs Xcode on macOS). A **physical iPhone with Expo Go** works the
same way as an Android phone (steps 5–6). Building a standalone `.ipa` needs an Apple developer account and EAS Build
(cloud) or a Mac — not required for this project and not done.
