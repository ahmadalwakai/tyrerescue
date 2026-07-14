# Tyre Rescue Driver

Expo React Native app for Tyre Rescue drivers — iOS & Android.

## Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npx expo`)
- iOS Simulator (macOS) or Android Emulator, or Expo Go on physical device

## Setup

```bash
cd driver-app
npm install
```

Create `.env` from the example:

```bash
cp .env.example .env
```

Edit `.env` with your backend URL (e.g. `https://tyrerescue.uk` for production or `http://<your-ip>:3000` for local dev).

## Development

```bash
npx expo start
```

- Press **i** for iOS Simulator
- Press **a** for Android Emulator
- Scan QR with Expo Go on a physical device

## Project Structure

```
driver-app/
├── app/                     # Expo Router file-based routes
│   ├── _layout.tsx          # Root layout (fonts, auth, splash)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx        # Login screen
│   └── (tabs)/
│       ├── _layout.tsx      # Bottom tab navigator
│       ├── index.tsx        # Dashboard (online toggle, stats, active jobs)
│       ├── jobs/
│       │   ├── _layout.tsx
│       │   ├── index.tsx    # Job list (active/completed tabs)
│       │   └── [ref].tsx    # Job detail + status actions + navigation
│       ├── chat/
│       │   ├── _layout.tsx
│       │   ├── index.tsx    # Conversation list
│       │   └── [id].tsx     # Chat messages
│       └── profile.tsx      # Profile info + password change + logout
├── src/
│   ├── api/client.ts        # Typed API client (driver + chat endpoints)
│   ├── auth/context.tsx     # AuthProvider + useAuth hook (SecureStore)
│   ├── components/          # Reusable components
│   ├── constants/theme.ts   # Brand colors, spacing, typography
│   └── hooks/               # useLocation, useRefreshOnFocus
├── app.json                 # Expo config (permissions, bundles)
├── package.json
└── tsconfig.json
```

## Backend API Endpoints Used

| Endpoint | Method | Description |
|---|---|---|
| `/api/driver/auth/login` | POST | Mobile login (returns JWT) |
| `/api/driver/jobs` | GET | Active + completed jobs |
| `/api/driver/jobs/[ref]` | GET | Job detail |
| `/api/driver/jobs/[ref]/accept` | PATCH | Accept/reject job |
| `/api/driver/jobs/[ref]/status` | PATCH | Update job status |
| `/api/driver/status` | GET/POST | Online status |
| `/api/driver/location` | POST | GPS location broadcast |
| `/api/driver/profile` | GET | Driver profile |
| `/api/driver/profile/password` | POST | Change password |
| `/api/chat/conversations` | GET/POST | Chat conversations |
| `/api/chat/conversations/[id]/messages` | GET/POST | Chat messages |
| `/api/chat/conversations/[id]/read` | POST | Mark read |
| `/api/chat/unread` | GET | Unread count |

## Building for App Stores

### EAS Build Setup

```bash
npm install -g eas-cli
eas login
eas build:configure
```

### iOS (TestFlight / App Store)

```bash
eas build --platform ios --profile production
eas submit --platform ios
```

### Android (Google Play)

```bash
eas build --platform android --profile production
eas submit --platform android
```

### Apple App Review Notes

- **Location**: Used for route guidance and dispatch tracking while a driver is working on an active job.
- **Background location**: Enabled for active-job tracking only. Tracking stops when the job is completed or cancelled.
- **Notifications**: Used for new driver job alerts and urgent job updates. iOS uses standard Apple notifications with sound and Time Sensitive interruption where permitted by iOS/user settings.
- **Foreground job alert**: The full-screen alert is an in-app alert shown only when the app is open.
- **PushKit/CallKit**: Not used for normal job alerts.
- **Critical Alerts**: Not used unless Apple entitlement approval is granted and explicitly enabled in a future build.
- **No camera/photos**: No permissions requested.
- **Encryption**: `usesNonExemptEncryption: false` (HTTPS only, no custom crypto).
- **Login credential for review**: Provide a test driver account.

## Environment Variables

The app reads `API_URL` from SecureStore (set via the API client). Default: `https://tyrerescue.uk`.

For local development, the first-launch default can be overridden by setting it programmatically or editing `src/api/client.ts`.
