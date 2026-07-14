# iOS Driver App Audit And App Store Readiness

## Current Architecture

- The driver app is already an Expo/React Native app, not an Android-only app.
- The iOS bundle identifier is `uk.tyrerescue.driver`.
- iPad support is disabled with `supportsTablet: false`.
- Shared driver screens are under `app/(auth)` and `app/(tabs)`.
- Android-only lock-screen/full-screen alert code is guarded in `src/services/driver-watcher.ts` and is not run on iOS.
- The Android native folder exists for Android-specific alert behavior. No separate iOS native folder is required for the current Expo implementation.

## Existing Driver Screens

- Login/session: `app/(auth)/login.tsx`, forgot/reset password screens, `src/auth/context.tsx`.
- Dashboard/current job: `app/(tabs)/index.tsx`.
- Job list: `app/(tabs)/jobs/index.tsx`.
- Job detail: `app/(tabs)/jobs/[ref].tsx`.
- Driver route/navigation: `app/(tabs)/jobs/[ref]/route.tsx`.
- Map fallback/live map: `app/(tabs)/jobs/[ref]/map.tsx`.
- Notifications inbox: `app/(tabs)/notifications.tsx`.
- Profile/settings/help surface: `app/(tabs)/profile.tsx`.
- Chat: `app/(tabs)/chat`.

## Shared Code Reused On iOS

- Driver auth/session and secure token storage: `src/api/client.ts`, `src/auth/context.tsx`.
- Driver jobs and status APIs: `src/api/client.ts`.
- Canonical driver location updates: `src/hooks/useLocation.ts`, `src/services/background-location.ts`.
- Mapbox route requests and fallback directions: `src/services/directions.ts`.
- Route geometry, snapping, drift/off-route calculations: `src/lib/navigation/routeGeometry.ts`.
- Job Time Control: `src/lib/navigation/jobTimeEstimate.ts`.
- Dev GPS simulator: `src/lib/dev/driverGpsSimulator.ts`.
- Payment/status display remains sourced from booking/payment state.

## Backend Endpoints Used By Driver App

- `POST /api/driver/auth/login`
- `GET /api/driver/me`
- `GET /api/driver/status`
- `PATCH /api/driver/status`
- `POST /api/driver/location`
- `GET /api/driver/jobs`
- `GET /api/driver/jobs/[ref]`
- `POST /api/driver/jobs/[ref]/accept`
- `PATCH /api/driver/jobs/[ref]/status`
- `GET /api/driver/jobs/[ref]/route`
- `POST /api/driver/push-token`
- `DELETE /api/driver/push-token`

## Push Notification Provider

- Android keeps the existing native FCM path for data-only critical job alerts and full-screen intent behavior.
- iOS registers an Expo Push token through the existing `/api/driver/push-token` endpoint as `ios:expo`.
- The backend relays iOS job alerts through Expo Push/APNs with Time Sensitive interruption metadata and the existing job notification category.
- No PushKit or CallKit is used for normal job alerts.
- Critical Alerts are not requested. Critical Alerts require Apple entitlement approval and must stay disabled until approved.
- No new push environment variables, database columns, or endpoints were added.

## iOS Permissions

- `NSLocationWhenInUseUsageDescription`: used for route display and dispatch updates during active work.
- `NSLocationAlwaysAndWhenInUseUsageDescription`: used because active-job background location updates are required.
- `UIBackgroundModes`: `location` and `remote-notification` only.
- No camera or photo library permissions are configured because those features are not used here.

## iOS Assets

- App icon: `assets/icon.png`
- Adaptive icon for Android: `assets/adaptive-icon.png`
- Splash image: `assets/splash.png`
- Notification icon: `assets/notification-icon.png`
- Notification sounds:
  - `assets/sounds/new_job.wav`
  - `assets/sounds/notification_tone.mp3`
  - `assets/sounds/unvversfiled_ringtone_021_365652.mp3`

### Icon Verification

- `assets/icon.png` is `1024x1024`.
- `assets/icon.png` is PNG RGB with no alpha channel.
- This icon is the app icon referenced by Expo config and is suitable for the iOS build asset pipeline.

## App Store Connect Blockers

Do not create or submit the App Store Connect record until these values are verified. They are required by Apple or by the submission rules for this project and must not be guessed.

- Missing SKU / SKU convention.
- Missing distribution decision: public App Store, unlisted, TestFlight-only, or Apple Business/private distribution.
- Missing App Review contact first name, last name, email, and phone.
- Missing permanent demo driver account that does not require OTP, SMS, 2FA, admin approval, or phone approval.
- Missing assigned demo job for the review account.
- Missing confirmation that an iOS build is uploaded in App Store Connect for bundle ID `uk.tyrerescue.driver`.
- Missing real iOS screenshots from an iPhone build/simulator/device.
- iPad screenshots are not required unless tablet support is enabled. Current config has `supportsTablet: false`.

## App Store Review Notes Draft

The Driver app is for assigned drivers to receive job alerts, view job details, navigate to customers, update dispatch with live location during active jobs, call customers, and complete jobs. Notifications are used for new job alerts and urgent job updates. Location is used during active jobs for routing and dispatch tracking, and tracking stops when the job is completed or cancelled.

## Privacy Labels Checklist

- Location: used for active job routing, dispatch tracking, ETA, and customer-safe tracking.
- Contact info: driver login/account data and customer phone numbers are used to operate assigned jobs.
- User content/messages: chat and job notes may be displayed if present.
- Diagnostics: only standard app/runtime diagnostics if enabled by the build platform.
- Customer tracking must not expose driver return-to-garage, available-after, or internal workload details.

## Manual iOS Test Checklist

1. Fresh install: login works, notification permission prompt is clear, location permission prompt is clear.
2. Foreground new job: full-screen in-app alert appears once, sound plays if allowed, Open job and Navigate route correctly.
3. Background/locked new job: Time Sensitive iOS notification appears where allowed, tapping opens the correct job or route.
4. Route screen: selected Mapbox route, alternatives, avoid options, marker snapping, raw accuracy circle, GPS weak/drift/off-route, Open Waze, Call, payment badge, and Job Clock remain correct.
5. Tracking: `/api/driver/location` receives raw canonical driver GPS only; snapped display coordinates are not sent.
6. Admin/customer tracking: latest raw canonical location is reflected; customer-safe tracking does not expose return-to-garage or available-after.
7. Permission denied: notification denial and location denial show clear warnings and do not crash the app.
8. Completed/cancelled job: active tracking stops and closed job state remains canonical.

## Build Notes

- Run `npm run typecheck` in `driver-app`.
- Run targeted ESLint for changed driver files.
- Run an iOS simulator/device build on macOS/Xcode or through EAS. A Windows machine cannot run the iOS simulator locally.
