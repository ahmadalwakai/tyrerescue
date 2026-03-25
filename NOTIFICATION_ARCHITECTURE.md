# Notification Architecture — v1.2.0

> Production architecture overhaul: Direct FCM, critical alert reliability, upcoming job alerts v2, admin sound management, Android channel versioning, and dedupe protection.

---

## 1. Push Delivery: Direct FCM (Expo Push relay removed from critical path)

### Before
All push notifications were routed through Expo Push Service (`https://exp.host/--/api/v2/push/send`). Expo Push acts as a relay — your server sends to Expo, Expo sends to FCM/APNs. This introduced an unnecessary hop, added latency, removed control over Android notification payloads (channel, sound, priority, vibrate pattern), and created a single point of failure outside your infra.

### After
Primary delivery uses **FCM HTTP v1 API** directly. The driver app registers a native FCM device token (via `getDevicePushTokenAsync()`) instead of an Expo Push Token. The backend authenticates using a Firebase service account and sends directly to `fcm.googleapis.com/v1/projects/{project_id}/messages:send`.

**Fallback:** Old app versions that still have an `ExponentPushToken[...]` stored continue to receive via Expo Push relay until they upgrade. Token type is detected automatically.

### Files changed
| File | Change |
|------|--------|
| `lib/notifications/fcm.ts` | **NEW** — FCM HTTP v1 client with JWT auth, `sendFcmNotification()` |
| `lib/notifications/driver-push.ts` | Rewritten — routes to FCM or Expo based on token type |
| `lib/env.ts` | Added `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` |
| `app/api/driver/push-token/route.ts` | Accepts `tokenType` field (`'fcm'` or `'expo'`) |
| `driver-app/src/services/notifications.ts` | Uses `getDevicePushTokenAsync()` → native FCM token |

### Required env vars
```
FCM_PROJECT_ID=your-firebase-project-id
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":...}
```

### Required file
`driver-app/google-services.json` — download from Firebase Console → Project Settings → Android app.

---

## 2. Alert Architecture: Foreground / Background / Killed

### Problem
Previous architecture relied on in-app polling (`useNewJobDetector`) as the only reliable alert mechanism. Background/killed states depended entirely on Expo Push relay with no control over Android notification presentation — no channel targeting, no sound control, no bypass-DnD.

### Solution

| App State | Mechanism | Sound Source |
|-----------|-----------|-------------|
| **Foreground** | `expo-notifications` foreground handler → `fireJobAlert()` → in-app popup + `expo-av` sound | `expo-av` Audio |
| **Background** | FCM data message → Android system tray notification on `jobs_critical_v3` channel | Native channel sound (`new_job.wav`) |
| **Killed** | FCM data message → Android system tray notification on `jobs_critical_v3` channel | Native channel sound (`new_job.wav`) |
| **Cold start (tap)** | `getLastNotificationResponseAsync()` → route to job + mark alerted | N/A (already heard) |

Key enablers:
- FCM `priority: 'high'` + `android.priority: 'MAX'` ensures delivery even in Doze mode
- `channel_id` in FCM payload targets the correct Android notification channel
- `bypassDnd: true` on critical channels
- `shouldPlaySound: true` in notification handler lets Android play channel sound

### Files changed
| File | Change |
|------|--------|
| `driver-app/src/services/notifications.ts` | Full rewrite — native token, versioned channels, `fireLocalCriticalNotification()` |
| `driver-app/src/services/sound.ts` | Expanded `SoundEvent` type, critical event protection |
| `driver-app/src/services/job-alert.ts` | Composite key dedupe (`ref:eventType`), generic `fireJobAlert()` |
| `driver-app/app/_layout.tsx` | Multi-type notification handling, `toAlertType()`/`toSoundEvent()` helpers |
| `driver-app/src/context/job-alert-context.tsx` | Added `JobAlertType`, `alertType` in data |
| `driver-app/src/components/JobAlertPopup.tsx` | Type-specific title, icon, button label |
| `driver-app/src/hooks/useNewJobDetector.ts` | Uses `fireJobAlert('new_job')` + explicit dedupe |

---

## 3. Upcoming Job Alert v2

### Before
`upcoming` notifications were treated as silent/informational. No critical alert experience, no popup, no dedicated channel.

### After
`upcoming_v2` is a full critical alert with its own channel (`jobs_upcoming_v2`), in-app popup, and push notification. A Vercel cron job runs every 5 minutes, finds bookings starting within 30 minutes, and pushes to assigned drivers.

### Dedupe
The cron checks the `driverNotifications` table for an existing `upcoming_v2` notification for the same booking ref + driver combo before sending.

### Files changed
| File | Change |
|------|--------|
| `app/api/cron/upcoming-alerts/route.ts` | **NEW** — cron endpoint, 30-min window, dedupe via driverNotifications |
| `lib/notifications/driver-push.ts` | Added `notifyDriverUpcomingJob()` export |
| `vercel.json` | Added cron: `*/5 * * * *` → `/api/cron/upcoming-alerts` |

---

## 4. Android Notification Channels (Versioned)

### Why version?
Android caches channel settings at creation time. Once a user has channel `jobs`, changing its sound/priority in code has no effect — the OS ignores updates. Bumping the version suffix forces a fresh channel with the new settings.

### Channel map (v1.2.0)

| Channel ID | Importance | Priority | Sound | Bypass DnD | Use |
|------------|-----------|----------|-------|-----------|-----|
| `jobs_critical_v3` | MAX | MAX | `new_job.wav` | Yes | new_job, reassignment |
| `jobs_upcoming_v2` | MAX | MAX | default | Yes | upcoming_v2 |
| `messages_v2` | HIGH | HIGH | default | No | new_message |
| `updates_v2` | DEFAULT | DEFAULT | default | No | job_accepted, job_completed |
| `jobs` | DEFAULT | — | — | No | Legacy (kept for compat) |
| `jobs_v2` | DEFAULT | — | — | No | Legacy (kept for compat) |

### FCM ↔ Channel mapping
`driver-push.ts` contains `EVENT_CHANNEL_MAP` that routes each notification type to the correct channel ID. The `channel_id` is set in the FCM Android notification payload so the OS uses the right channel even when the app is killed.

### Files changed
| File | Change |
|------|--------|
| `driver-app/src/services/notifications.ts` | Creates all channels on app start |
| `lib/notifications/driver-push.ts` | `EVENT_CHANNEL_MAP` for FCM payloads |
| `driver-app/app.json` | `USE_FULL_SCREEN_INTENT` permission |

---

## 5. Dedupe & Conflict Protection

### Three-layer dedupe chain

1. **Push handler (notifications.ts)**: `fireJobAlert(eventType)` → checks `isAlerted(ref, eventType)` before showing popup
2. **Polling handler (useNewJobDetector)**: Same `isAlerted(ref, 'new_job')` gate
3. **Tap handler (_layout.tsx)**: `markAlerted(ref, eventType)` on notification tap to suppress future duplicates

### Composite key
Dedupe key is `${bookingRef}:${eventType}`, allowing different alert types for the same booking (e.g., `ABC123:new_job` and `ABC123:upcoming_v2` are independent).

### Server-side
`upcoming-alerts` cron queries `driverNotifications` for existing records before sending.

---

## 6. Reassignment Notifications

### Before
Reassigned jobs used the same `notifyDriverNewJob()` function as initial assignments.

### After
Reassignment has its own dedicated function (`notifyDriverReassignment()`), notification type (`reassignment`), in-app popup style (swap icon, "Job Reassignment" title), and dedupe key.

### Files changed
| File | Change |
|------|--------|
| `lib/notifications/driver-push.ts` | Added `notifyDriverReassignment()` |
| `app/api/admin/bookings/[ref]/assign/route.ts` | Calls `notifyDriverReassignment()` for reassignment case |
| `driver-app/src/i18n/locales/en.json` | Added `jobAlert.titleReassignment` |
| `driver-app/src/i18n/locales/ar.json` | Added Arabic translation |

---

## 7. Admin Sound Management

### Capabilities
- **6 configurable event types**: `new_job`, `reassignment`, `upcoming_v2`, `job_accepted`, `job_completed`, `new_message`
- **Sound library**: bundled `new_job.wav` + uploaded custom sounds (WAV, MP3, OGG, max 2 MB)
- **Upload**: `POST /api/admin/driver-sounds/upload` → Vercel Blob storage + `driverSoundAssets` DB table
- **Delete**: `DELETE /api/admin/driver-sounds/{id}` → removes from Blob + DB, resets critical events to default
- **Critical event protection**: `new_job`, `reassignment`, `upcoming_v2` cannot be disabled, minimum volume 30%
- **Upsert**: PATCH creates a settings row if none exists for the event

### DB schema addition
```sql
driverSoundAssets (
  id          uuid PK,
  fileName    text NOT NULL,
  displayName text NOT NULL,
  fileUrl     text NOT NULL,
  mimeType    text NOT NULL,
  fileSize    integer NOT NULL,
  uploadedBy  text → users.id,
  createdAt   timestamp
)
```

### Files changed
| File | Change |
|------|--------|
| `lib/db/schema.ts` | Added `driverSoundAssets` table |
| `app/api/admin/driver-sounds/route.ts` | Rewritten — 6 events, critical protection, sound assets, upsert |
| `app/api/admin/driver-sounds/upload/route.ts` | **NEW** — Vercel Blob upload |
| `app/api/admin/driver-sounds/[id]/route.ts` | **NEW** — DELETE/PATCH for individual sound assets |
| `app/(dashboard)/admin/driver-sounds/DriverSoundsClient.tsx` | Rewritten — 6 events, upload widget, delete, critical badges |
| `app/(dashboard)/admin/driver-sounds/page.tsx` | Updated description text |

---

## 8. Version & Release

| Property | Before | After |
|----------|--------|-------|
| `app.json` version | 1.1.0 | 1.2.0 |
| `app.json` android.versionCode | 1 | 3 |
| `package.json` version (driver-app) | 1.0.0 | 1.2.0 |
| `app.json` android.googleServicesFile | — | `./google-services.json` |
| `app.json` android.permissions | — | `USE_FULL_SCREEN_INTENT` |

---

## 9. Pre-Release Checklist

- [ ] Create Firebase project and add Android app with package `uk.tyrerescue.driver`
- [ ] Download `google-services.json` → `driver-app/google-services.json`
- [ ] Set `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON` in Vercel environment
- [ ] Run `npm run db:push` (or equivalent) to create `driverSoundAssets` table
- [ ] Seed `driverSoundSettings` rows for new event types (`reassignment`, `upcoming_v2`) if not auto-created by upsert
- [ ] Build with EAS: `eas build --platform android --profile production`
- [ ] Test critical alert in foreground, background, and killed states
- [ ] Verify upcoming-v2 cron fires at `/api/cron/upcoming-alerts`
- [ ] Verify admin sound page shows all 6 events with critical badges
- [ ] Verify old app versions with Expo Push tokens still receive notifications (fallback path)

---

## Complete File Inventory

### New files (7)
1. `lib/notifications/fcm.ts` — FCM HTTP v1 client
2. `app/api/cron/upcoming-alerts/route.ts` — upcoming v2 cron
3. `app/api/admin/driver-sounds/upload/route.ts` — sound upload endpoint
4. `app/api/admin/driver-sounds/[id]/route.ts` — sound asset CRUD

### Modified files (18)
5. `lib/notifications/driver-push.ts` — FCM primary, Expo fallback, new exports
6. `lib/env.ts` — FCM env vars
7. `lib/db/schema.ts` — driverSoundAssets table
8. `app/api/driver/push-token/route.ts` — tokenType field
9. `app/api/admin/bookings/[ref]/assign/route.ts` — reassignment push
10. `app/api/admin/driver-sounds/route.ts` — 6 events, critical protection, upsert
11. `vercel.json` — upcoming-alerts cron
12. `driver-app/app.json` — version bump, google-services, permissions
13. `driver-app/package.json` — version 1.2.0
14. `driver-app/src/services/notifications.ts` — native FCM token, versioned channels
15. `driver-app/src/services/sound.ts` — expanded events, critical set
16. `driver-app/src/services/job-alert.ts` — composite key dedupe, generic fireJobAlert
17. `driver-app/app/_layout.tsx` — multi-type notification handling
18. `driver-app/src/context/job-alert-context.tsx` — JobAlertType
19. `driver-app/src/components/JobAlertPopup.tsx` — type-specific UI
20. `driver-app/src/hooks/useNewJobDetector.ts` — explicit event type
21. `driver-app/src/i18n/locales/en.json` — new alert strings
22. `driver-app/src/i18n/locales/ar.json` — Arabic translations
23. `app/(dashboard)/admin/driver-sounds/DriverSoundsClient.tsx` — full rewrite
24. `app/(dashboard)/admin/driver-sounds/page.tsx` — updated description
