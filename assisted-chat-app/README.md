# Tyre Rescue — Assisted Chat (Android operator app)

Standalone Expo Android app that mirrors the existing
`/admin/assisted-chat` web flow as a mobile operator screen. Opens to a
simple Tyre Rescue login screen; after sign-in the Assisted Chat screen
appears. The login uses the existing
`POST /api/mobile/admin/auth/login` endpoint — no new auth system.

## Run locally

```bash
cd assisted-chat-app
npm install
npm run start
```

Metro bundles on `http://localhost:8081`.

For an Android emulator:

```bash
npm run android
```

## Required env vars

Create `assisted-chat-app/.env` (or `.env.local`) with:

```
# Local Next.js API base. On Android emulator the auto-detected hostUri:3000
# usually works. Override here if you run the API on a LAN IP / different port.
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000

# Mapbox public token — same value as the web app's NEXT_PUBLIC_MAPBOX_TOKEN.
EXPO_PUBLIC_MAPBOX_TOKEN=pk.your-public-mapbox-token

# Optional dev-only Bearer token fallback. Normal usage does not need this —
# log in through the in-app login screen and the token is stored in
# AsyncStorage under `assistedChat.adminToken.v1`. Leave empty for
# production-style local runs.
# EXPO_PUBLIC_ADMIN_TOKEN=
```

## Auth flow

- The app boots into `LoginScreen` if no token is saved.
- `POST /api/mobile/admin/auth/login` is called with `{ email, password }`
  and returns `{ token, user }` (existing endpoint, unchanged).
- The token is saved in AsyncStorage and sent as `Authorization: Bearer …`
  on every API call.
- If any protected call returns `401`, the saved token is cleared and the
  login screen reappears with "Session expired. Please log in again."
- A "Log out" button in the header clears the saved token.

## Login 401 troubleshooting

- Confirm the Next.js server is running:

  ```powershell
  cd C:\tyrerescue
  npm run dev
  ```

- Confirm `EXPO_PUBLIC_API_BASE_URL` is `http://localhost:3000` (or omit it
  on web — the app auto-detects the browser host).
- Confirm you are using an existing admin email/password (the same
  credentials that work on the `/admin` web login).
- A `401` means the credentials were rejected by the existing API. The Expo
  app does not create admin users — register/reset the account on the web
  first.

## Android localhost handling

The API client (`src/lib/api.ts`) resolves the base URL in this order:

1. `EXPO_PUBLIC_API_BASE_URL` if set.
2. Expo Metro `hostUri` host + `:3000` (works for LAN devices and emulators
   when Metro is on the same host).
3. Fallback `http://10.0.2.2:3000` (Android emulator alias for host
   localhost).

## Customer location-share link origin

The `/locate/<token>` link the operator copies / SMS / WhatsApps must
point at the same server the assisted-chat-app is polling, otherwise the
customer writes their coordinates to one database while the app reads
from another and "Location shared!" never reaches the operator.

- The backend now generates the link from `getAppOrigin()`
  (`lib/config/site.ts`). In production this is always
  `https://www.tyrerescue.uk`. In dev it follows the same env vars used by
  Stripe/email links (`NEXT_PUBLIC_APP_URL` / `APP_URL` /
  `NEXT_PUBLIC_BASE_URL` / `NEXTAUTH_URL`) and falls back to
  `http://localhost:3000`.
- The Expo client also normalizes any `/locate/<token>` link returned by
  the backend to the current `EXPO_PUBLIC_API_BASE_URL` whenever that base
  is `localhost`, `127.0.0.1`, `10.0.2.2`, or a private LAN IP. This is a
  safety net so a stale prod link from an out-of-date dev API can still be
  tested locally without changing token values.

Recommended dev configurations:

- **Desktop browser at `http://localhost:8081` + API at
  `http://localhost:3000`** — leave `EXPO_PUBLIC_API_BASE_URL` unset; the
  client auto-detects the browser host. Generated link will be
  `http://localhost:3000/locate/<token>`.
- **Real phone over LAN** — set
  `EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:3000` and make sure
  `NEXT_PUBLIC_APP_URL` (or `NEXTAUTH_URL`) on the Next.js dev server is
  set to the same LAN URL so the backend emits a phone-reachable link.
- **Real phone via tunnel** — point both
  `EXPO_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_APP_URL` at the tunnel URL.

If `EXPO_PUBLIC_API_BASE_URL` is local but the backend still returns a
`https://www.tyrerescue.uk/locate/...` link, the LocationSection now
shows a compact warning banner — the typical fix is to set
`NEXT_PUBLIC_APP_URL=http://localhost:3000` in the Next.js `.env.local`
and restart `npm run dev`.

## Future EAS build (do not run automatically)

EAS config is in `eas.json` with a `preview` profile that produces an
**APK** for direct sideload. To build manually later:

```bash
cd assisted-chat-app
npx eas-cli login          # one-time
npx eas-cli build:configure # only if a project ID has not been linked
npx eas-cli build --platform android --profile preview
```

This produces an `.apk` (not `.aab`). No Google Play submit is configured.

## Auth model

The admin endpoints reused by this app
(`/api/admin/quick-book`, `/api/admin/quick-book/[id]`,
`/api/admin/quick-book/[id]/finalize`,
`/api/admin/quick-book/[id]/checkout-session`,
`/api/admin/quick-book/send-link`) gate access via `requireAdminMobile()`
(`lib/auth.ts`), which accepts **either** the web admin session cookie
(NextAuth) **or** a Bearer mobile JWT signed with `NEXTAUTH_SECRET`.

This Expo app:

1. POSTs `email`/`password` to `/api/mobile/admin/auth/login`.
2. Receives `{ token, user }` and persists `{ token, user }` in
   AsyncStorage under `assistedChat.adminToken.v1`.
3. Attaches `Authorization: Bearer <token>` to every protected request via
   `src/lib/api.ts`.
4. Clears the stored token on any 401 response and returns the user to
   the login screen via the `setOnUnauthorized` hook in `useAdminSession`.

`EXPO_PUBLIC_ADMIN_TOKEN` is supported as an optional dev-only fallback
when no operator has logged in yet — useful for quick local debugging.


## Urgent customer-booking alert system

This APK is intended for internal/admin distribution and uses every reliable
Expo path to surface a customer emergency booking as fast as possible.

### What is implemented

- Android notification channels (created on first launch):
  - `urgent-bookings` — MAX importance, custom sound
    (`urgent-booking.mp3`), strong vibration pattern, lock-screen visibility
    PUBLIC where supported, orange LED.
  - `default` — standard importance for everything else.
  - `admin_bookings` — kept for back-compat with previously registered
    push tokens.
- Custom sound: `assets/sounds/urgent-booking.mp3`, registered in
  `expo.plugins["expo-notifications"].sounds`. The Expo config plugin
  bundles it into Android `res/raw/` at build time. Expo Go and web
  preview fall back to the system default sound.
- Local urgent notification triggered while the app is foregrounded so
  the operator hears the channel sound + feels vibration even when the
  device would otherwise stay silent.
- Full-screen in-app `UrgentBookingPopup` with dark overlay, pulsing red
  banner, customer summary, "Open bookings" / "Dismiss for now" buttons,
  and `Vibration.vibrate(...)` on open.
- 20s polling fallback (`useNewCustomerBookingAlert`) for cases where
  the push notification is delayed or dropped by the OEM.
- 60s reminder cadence while the popup remains open and the booking is
  not yet resolved.
- Notification tap → `assistedChat.pendingOpenBookings.v1` AsyncStorage
  flag; `AssistedChatScreen` consumes it on mount so a cold-start push
  tap still opens the bookings modal.
- Per-booking-id dedupe: one popup + one sound per booking id; dismiss
  hides the popup but keeps the "All bookings" red shimmer active until
  the operator actually opens the bookings list.
- `NotificationReliabilityCard` exposes one-tap shortcuts to Android
  notification settings + app settings via `Linking.openSettings()` /
  `Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', ...)`.

### Backend push payload (no new endpoints — uses the existing token registry)

Push tokens are still registered through `POST /api/mobile/admin/push-token`
exactly as before. **The mobile app cannot show a push by itself — the
backend MUST send one when a customer creates an emergency booking.**

Send via Expo Push API (`https://exp.host/--/api/v2/push/send`) to every
admin token currently in the registry, with payload:

```json
{
  "to": "ExponentPushToken[...]",
  "channelId": "urgent-bookings",
  "priority": "high",
  "sound": "urgent-booking.mp3",
  "title": "Emergency booking received",
  "body": "Open Assisted Chat now",
  "data": { "type": "urgent_booking", "bookingId": "<uuid>" }
}
```

If the custom sound is not yet available on a given build, fall back to
`"sound": "default"`. The `data.type === "urgent_booking"` marker is what
triggers the cold-start "open bookings" path on tap.

### Android admin device setup checklist

Open the app's "Notification setup" card (or system Settings) and enable:

1. Notifications → **Allow notifications**.
2. Notifications → **Urgent bookings** channel → Importance **Urgent**,
   **Sound on**, **Vibrate on**, **Show on lock screen** = full content.
3. Battery → **Unrestricted** (Samsung: also Sleeping/Deep-sleeping apps
   list → remove this app; Xiaomi: Autostart on + Battery saver = No
   restrictions; OnePlus/Oppo/Vivo: Battery → Don't optimise).
4. Do Not Disturb → add this app to the exceptions list if DND is used.
5. Sound profile is not silent (channel sound cannot override silent mode
   unless DND override is granted).
6. Keep the device connected to Wi-Fi or mobile data so Expo/FCM can
   reach it.

### Honest limitations

Expo/Android cannot guarantee a 100% forceful popup over lock screen or
other apps on every device. What this implementation actually delivers:

- **Foreground:** guaranteed `UrgentBookingPopup` + vibration. Sound plays
  if the channel sound is not muted by the user / DND.
- **Background:** high-priority push notification via the
  `urgent-bookings` channel. Heads-up banner where the OEM honours it.
- **Locked screen:** lock-screen notification (PUBLIC visibility) where
  device settings allow. No reliable full-screen-intent in the Expo
  managed workflow.
- **Killed app:** push delivery depends on Android, FCM, and the OEM
  battery optimiser. Aggressive killers (Samsung, Xiaomi, Huawei,
  OnePlus, Oppo, Vivo) can silently drop pushes — this is why the setup
  checklist above is mandatory for the admin device.

Full-screen intents and bypass-DND require native Android changes beyond
the Expo managed workflow and are intentionally not claimed here.
