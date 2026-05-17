# admin-alert-android

> **DEPRECATED — Not for admin use.**
> Urgent alert functionality has been integrated directly into the
> `assisted-chat-app` (package: `uk.tyrerescue.assistedchat`).
> The admin uses **one app only** — there is no separate alert app to install.
>
> This folder is kept as a **technical reference only** for the Android
> notification channel spec (`urgent_bookings_v1`), FCM topic pattern, and
> Kotlin implementation details.

Native Kotlin Android app that was the original proof-of-concept for urgent
booking push notifications.

---

## What this app does

- Registers a native FCM token with the Tyre Rescue backend.
- Receives high-priority FCM pushes when a customer emergency booking is created.
- Posts a heads-up notification with custom sound and vibration via the
  `urgent_bookings_v1` Android notification channel.
- Shows lock-screen notification (visibility: PUBLIC).
- On tap: opens `AlertActivity` showing booking details and action buttons.
- Alert screen: "Open booking" deep links to the Expo assisted chat app
  (`tyrerescue-assisted://bookings/{bookingId}`) or falls back to the
  web admin panel (`https://www.tyrerescue.uk/admin/bookings/{bookingId}`).

---

## SCAFFOLD STATUS

This is a **fully scaffolded** Android Kotlin project with all source files
present. It is **not yet build-tested** in this environment.

Before building in Android Studio, you must:
1. Add `app/google-services.json` (from Firebase Console — never commit).
2. Generate the signing keystore (see below).
3. Open in Android Studio and sync Gradle.
4. Set the three environment variables (or edit `app/build.gradle` locally):
   - `ADMIN_ALERT_KEYSTORE_FILE`
   - `ADMIN_ALERT_KEYSTORE_PASSWORD`
   - `ADMIN_ALERT_KEY_PASSWORD`
5. Build → Generate Signed APK → release variant.

---

## Signing

Generate the keystore once:

```powershell
cd C:\tyrerescue
powershell -ExecutionPolicy Bypass -File .\scripts\create-admin-alert-keystore.ps1
```

Keystore stored at: `C:\tyrerescue\android-keys\admin-alert-release.keystore`

**Never commit the keystore or the password.**

---

## Release APK build

### Step 1 — Generate keystore (first time only)

```powershell
cd C:\tyrerescue
powershell -ExecutionPolicy Bypass -File .\scripts\create-admin-alert-keystore.ps1
```

### Step 2 — Build signed release APK

```powershell
cd C:\tyrerescue\admin-alert-android
.\gradlew.bat clean assembleRelease `
  -PADMIN_ALERT_KEYSTORE_PATH="C:\tyrerescue\android-keys\admin-alert-release.keystore" `
  -PADMIN_ALERT_KEYSTORE_PASSWORD="YOUR_KEYSTORE_PASSWORD" `
  -PADMIN_ALERT_KEY_ALIAS="admin-alert-key" `
  -PADMIN_ALERT_KEY_PASSWORD="YOUR_KEY_PASSWORD"
```

Replace `YOUR_KEYSTORE_PASSWORD` and `YOUR_KEY_PASSWORD` with the passwords
you chose when running the keystore script.

### Step 3 — Output APK path

```
C:\tyrerescue\admin-alert-android\app\build\outputs\apk\release\app-release.apk
```

### Step 4 — Install on phone

> **You must uninstall the debug build first.**
> Debug and release APKs are signed with different keys — Android will reject
> the install unless the old app is removed.

Phone setup checklist after installing release APK:
- [ ] Uninstall old debug app
- [ ] Install `app-release.apk`
- [ ] Open app once
- [ ] Allow notifications when prompted
- [ ] Set battery optimisation to **Unrestricted** (Settings → Apps → Tyre Rescue Alert → Battery)
- [ ] Enable lock screen notifications
- [ ] Ensure **Urgent bookings** notification channel has sound enabled
- [ ] Turn **Do Not Disturb** off
- [ ] Press **TEST LOCAL URGENT ALERT** — confirm sound and vibration

---

## Firebase setup

1. Go to [Firebase Console](https://console.firebase.google.com).
2. Open or create the Tyre Rescue project.
3. Add Android app:
   - Package name: `uk.tyrerescue.adminalert`
   - App nickname: `Tyre Rescue Alert`
4. Download `google-services.json`.
5. Place it at: `admin-alert-android/app/google-services.json`.
6. **Do not commit `google-services.json`** — it is excluded by `.gitignore`.

---

## Custom notification sound

Place `urgent_booking.wav` in:

```
app/src/main/res/raw/urgent_booking.wav
```

To convert the existing MP3:

```bash
ffmpeg -i ../assisted-chat-app/assets/sounds/urgent_booking.mp3 \
       -acodec pcm_s16le -ar 44100 \
       app/src/main/res/raw/urgent_booking.wav
```

If the file is absent the channel uses the Android default notification sound.

---

## Package name

`uk.tyrerescue.adminalert`

---

## Backend integration

The backend must:

1. Store native FCM tokens from this app separately from Expo push tokens.
   Use the endpoint: `POST /api/mobile/admin/native-alert-token`
   (created at `app/api/mobile/admin/native-alert-token/route.ts`).

2. When a customer emergency booking is created, send an FCM push using
   the existing `lib/notifications/fcm.ts` infrastructure:

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

3. Required existing env vars (already configured):
   - `FCM_PROJECT_ID`
   - `FCM_SERVICE_ACCOUNT_JSON`

---

## Android settings checklist (on the admin phone)

After installing the APK:

```
Settings → Apps → Tyre Rescue Alert → Notifications
  → Urgent bookings
    ✅ Sound: enabled (set to the loud ringtone or custom sound)
    ✅ Importance: High or Urgent

Settings → Apps → Tyre Rescue Alert → Battery → Unrestricted

Settings → Lock screen → Notification visibility: Show all

Do Not Disturb: OFF or add Tyre Rescue Alert to Priority list
```

---

## Deep link note

The deep link `tyrerescue-assisted://bookings/{bookingId}` requires the
Expo assisted-chat-app to register the scheme `tyrerescue-assisted`.

Current Expo scheme (app.json): `tyrerescueassistedchat` (different).

See `docs/admin-alert-native-setup.md` for the required Expo change.
