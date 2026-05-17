# Admin Alert Native Android App — Setup Guide

This document covers everything needed to build, sign, install, and operate
the `admin-alert-android` companion app for urgent customer booking alerts.

---

## Overview

The **Tyre Rescue Alert** native Android app (`uk.tyrerescue.adminalert`) is a
companion alert tool, separate from the existing Expo **Assisted Chat** app.

| App | Package | Purpose |
|-----|---------|---------|
| Tyre Rescue Assisted Chat | `uk.tyrerescue.assistedchat` | Full admin booking workflow (Expo) |
| Tyre Rescue Alert | `uk.tyrerescue.adminalert` | Urgent booking push alerts (native) |

**Do not modify the Assisted Chat Expo app as part of this setup.**

---

## Part A — Android Signing Key

### Step 1 — Prerequisites

Install one of the following:
- [Android Studio](https://developer.android.com/studio) (includes keytool)
- [JDK 17](https://adoptium.net/temurin/releases/?version=17)

Reopen PowerShell after installing.

### Step 2 — Generate the keystore

Open PowerShell at the repo root and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-admin-alert-keystore.ps1
```

The script will:
- Check `keytool` is available.
- Prompt for a password securely (not echoed).
- Create the keystore only if it does not already exist.
- Print a confirmation with the file path and alias.

### Step 3 — Save the password

After creation, save these details in a **password manager or encrypted vault**:

| Field | Value |
|-------|-------|
| Keystore file | `C:\tyrerescue\android-keys\admin-alert-release.keystore` |
| Keystore alias | `admin-alert-key` |
| Keystore password | *(the password you chose)* |
| Key password | *(same as keystore password)* |

### ⚠️ Critical warnings

- **Never upload the keystore to GitHub, Dropbox, or any cloud storage.**
- The `android-keys/` folder is excluded from git via `.gitignore`.
- Losing the keystore or password means future APK updates **cannot use the same
  signing identity**. Users would need to uninstall and reinstall the app.

### Key file reference

| File | Purpose |
|------|---------|
| `admin-alert-release.keystore` | APK signing key (keep secret) |
| `google-services.json` | Firebase project config (keep secret) |

---

## Part B — Firebase Setup

### Step 1 — Firebase Console

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com).
2. Open the existing Tyre Rescue Firebase project, **or** create a new one.
3. Click **Add app** → Android.
4. Enter:
   - **Package name**: `uk.tyrerescue.adminalert`
   - **App nickname**: `Tyre Rescue Alert`
5. Skip the SHA-1 step (not required for FCM only).
6. Click **Register app**.
7. Download `google-services.json`.

### Step 2 — Place the config file

```
admin-alert-android/
  app/
    google-services.json   ← place here
```

**Do not commit `google-services.json`** — it is excluded by `.gitignore`.

### Step 3 — Verify FCM env vars on the backend

The backend already uses:

```
FCM_PROJECT_ID          — Firebase project ID
FCM_SERVICE_ACCOUNT_JSON — Full JSON of the Firebase service account key
```

These are defined in `lib/env.ts` and used by `lib/notifications/fcm.ts`.
Confirm they are set in your `.env.local` / Vercel environment.

---

## Part C — Building the APK

### Step 1 — Open in Android Studio

1. Open Android Studio.
2. **File → Open** → select `C:\tyrerescue\admin-alert-android`.
3. Wait for Gradle sync to complete.

### Step 2 — Set signing environment variables

Either set environment variables before opening Android Studio:

```powershell
$env:ADMIN_ALERT_KEYSTORE_FILE     = "C:\tyrerescue\android-keys\admin-alert-release.keystore"
$env:ADMIN_ALERT_KEYSTORE_PASSWORD = "your-password"
$env:ADMIN_ALERT_KEY_PASSWORD      = "your-password"
```

Or temporarily edit `app/build.gradle` locally (do not commit):

```groovy
storeFile file("C:/tyrerescue/android-keys/admin-alert-release.keystore")
storePassword "your-password"
keyPassword "your-password"
```

### Step 3 — Custom notification sound (optional but recommended)

Copy the sound from the Expo app and convert to WAV:

```bash
ffmpeg -i assisted-chat-app/assets/sounds/urgent_booking.mp3 \
       -acodec pcm_s16le -ar 44100 \
       admin-alert-android/app/src/main/res/raw/urgent_booking.wav
```

If the WAV file is absent the channel uses the Android default notification sound.

### Step 4 — Build release APK

In Android Studio:
1. **Build → Generate Signed Bundle / APK**.
2. Select **APK**.
3. Choose `release` build variant.
4. If prompted for keystore credentials enter them manually.
5. APK is saved to `app/release/app-release.apk`.

Or via Gradle command line (after setting env vars):

```powershell
cd C:\tyrerescue\admin-alert-android
.\gradlew assembleRelease
```

---

## Part D — Installing on Admin Phone

1. Transfer `app-release.apk` to the admin phone (USB, email, or LAN).
2. On the phone: **Settings → Install unknown apps** → allow the file manager.
3. Tap the APK to install.
4. Open the app once.
5. Grant notification permission when prompted.

---

## Part E — Android Settings Checklist

After installing, configure Android settings on the admin phone:

```
Settings → Apps → Tyre Rescue Alert → Notifications
  → Urgent bookings
    ☑ Importance: High or Urgent
    ☑ Sound: enabled (select a loud ringtone or the custom sound if present)
    ☑ On-screen pop-up: enabled

Settings → Apps → Tyre Rescue Alert → Battery
  ☑ Battery usage: Unrestricted

Settings → Lock screen
  ☑ Show all notification content

Do Not Disturb
  ☑ Off — OR — add Tyre Rescue Alert to the Priority apps list
```

---

## Part F — Backend Integration

### New endpoint for native token registration

A new endpoint has been created at:

```
POST /api/mobile/admin/native-alert-token
```

This stores the native Android FCM token separately from Expo push tokens.

The native app must call this endpoint after obtaining its FCM token.
Auth: `Authorization: Bearer <admin JWT>` (same token as the Expo app).

### Required backend work to send urgent booking pushes

When a customer emergency booking is confirmed (paid/finalised), the backend
must call `lib/notifications/fcm.ts → sendFcmNotification()` with the following
payload for each registered native alert token:

```json
{
  "token": "NATIVE_FCM_TOKEN",
  "notification": {
    "title": "Emergency booking received",
    "body": "Open Assisted Chat now"
  },
  "android": {
    "priority": "high",
    "notification": {
      "channel_id": "urgent_bookings_v1",
      "sound": "urgent_booking",
      "visibility": "public",
      "notification_priority": "PRIORITY_MAX"
    }
  },
  "data": {
    "type": "urgent_booking",
    "bookingId": "BOOKING_UUID",
    "customerPhone": "+44 7700 900123",
    "createdAt": "2026-05-17T12:00:00Z",
    "url": "tyrerescue-assisted://bookings/BOOKING_UUID"
  }
}
```

The function signature in `lib/notifications/fcm.ts`:

```typescript
sendFcmNotification(
  deviceToken,
  title,
  body,
  data,
  { channelId: 'urgent_bookings_v1', priority: 'high', sound: 'urgent_booking',
    notificationPriority: 'PRIORITY_MAX', visibility: 'PUBLIC' }
)
```

This call should be added to the booking creation/payment confirmation flow.
Identify the exact location in your existing booking routes and add it there.

### Required env vars (already exist — do not rename)

```
FCM_PROJECT_ID
FCM_SERVICE_ACCOUNT_JSON
```

---

## Part G — Expo Deep Link Compatibility

### Current situation

The existing Expo Assisted Chat app (`assisted-chat-app/app.json`) registers
the URL scheme:

```
"scheme": "tyrerescueassistedchat"
```

The native alert app expects to deep link using:

```
tyrerescue-assisted://bookings/{bookingId}
```

These are **different schemes**. The deep link from the native alert app will
fall back to the web URL (`https://www.tyrerescue.uk/admin/bookings/{bookingId}`)
until the Expo app registers the `tyrerescue-assisted` scheme.

### Required Expo change (minimal, safe)

To add the additional scheme to the Expo app without breaking the existing build,
add it to `assisted-chat-app/app.json` in the `android.intentFilters` section:

```json
"android": {
  "package": "uk.tyrerescue.assistedchat",
  "intentFilters": [
    {
      "action": "VIEW",
      "autoVerify": true,
      "data": [
        {
          "scheme": "tyrerescue-assisted",
          "host": "bookings"
        }
      ],
      "category": ["BROWSABLE", "DEFAULT"]
    }
  ]
}
```

Then add a route handler in the Expo app so:

```
tyrerescue-assisted://bookings/{bookingId}
```

opens the All Bookings screen or navigates to the specific booking if supported.

**Do not run `eas build` as part of this change. Test in development first.**

---

## Part H — Commercial Safety Net (Escalation Plan)

Native Android push notifications are the most reliable push delivery mechanism
available, but **no push mechanism can guarantee 100% delivery on all devices**.

The following restrictions can override app behaviour:

- **Android OEM battery restrictions** (Huawei, Xiaomi, Samsung, OnePlus):
  These manufacturers aggressively kill background processes. The admin phone
  should be set to **Unrestricted** battery mode (see Part E).

- **Do Not Disturb / Focus mode**: All notifications are silenced unless the
  app is added to the priority allow-list.

- **Android 14+ full-screen intent**: Full-screen "call-style" popups are
  restricted to alarm/call use cases only by Android 14+. The app cannot
  force a full-screen overlay without `USE_FULL_SCREEN_INTENT` permission,
  which Google Play restricts to specific app categories.

- **Notification channel settings**: Once a channel is created on a device,
  the user can lower the importance in Android Settings. The app cannot
  override this.

**Recommended commercial escalation ladder:**

| Delay | Action |
|-------|--------|
| 0 sec | Native FCM push (this app) — primary alert |
| 0 sec | Expo assisted-chat-app push (existing) — belt and braces |
| 30 sec | Repeat push if booking not acknowledged |
| 60 sec | SMS to admin phone via Voodoo SMS (already configured) |
| 90 sec | WhatsApp message or automated call fallback |
| 120 sec | Backup admin contact |

Implement acknowledgement tracking in the backend using the existing
`adminNotifications` table or a new `bookingAlerts` table.

---

## File Reference

| File | Purpose |
|------|---------|
| `android-keys/admin-alert-release.keystore` | APK signing key (local only) |
| `admin-alert-android/app/google-services.json` | Firebase config (local only) |
| `scripts/create-admin-alert-keystore.ps1` | Keystore generator script |
| `admin-alert-android/` | Native Kotlin Android project scaffold |
| `app/api/mobile/admin/native-alert-token/route.ts` | FCM token registration endpoint |
