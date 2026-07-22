# Build 17 Startup Architecture Review

Date: 2026-07-22
App: Tyre Rescue Assisted Chat
Expo notifications package: `expo-notifications@55.0.25`

## Decision

The patch-package patch is still required for Build 17 if iOS push notifications are enabled.

The startup refactor prevents `expo-notifications` from running before React renders, so architecture alone prevents the original pre-render startup crash window. It does not remove Expo's native Keychain read. Without the patch, `ServerRegistrationModule.getRegistrationInfoAsync()` can still throw when notifications initialize after the UI is interactive.

The temporary `EXPO_PUBLIC_DISABLE_SERVER_REGISTRATION_STARTUP` flag is no longer required and has been removed from EAS config and app code. Keeping it would make the next iOS build skip notification initialization, which would not validate push behavior.

## getRegistrationInfoAsync Caller Audit

All remaining callers are inside `expo-notifications`; app code has no direct caller.

1. `node_modules/expo-notifications/src/DevicePushTokenAutoRegistration.fx.ts`
   - Module-scope verification: calls `ServerRegistrationModule.getRegistrationInfoAsync().then(...)` when `expo-notifications` is first imported.
   - Why: reads persisted auto-registration state and retries device-token upload if auto registration is enabled.
   - Startup dependency: no longer in the app startup import graph. It executes only after `src/lib/notifications.ts` performs `import('expo-notifications')`.
   - Interactive timing: currently triggered by Assisted Chat notification arming after the screen has mounted.

2. `node_modules/expo-notifications/src/DevicePushTokenAutoRegistration.fx.ts`
   - Push-token listener callback: calls `getRegistrationInfoAsync()` when the native token changes.
   - Why: checks whether Expo server auto-registration is enabled before uploading the changed token.
   - Startup dependency: no direct startup dependency. The listener is installed when the Expo notifications package is loaded.
   - Interactive timing: can run after notification initialization if iOS emits a token-change event.

3. `node_modules/expo-notifications/src/DevicePushTokenAutoRegistration.fx.ts`
   - `setAutoServerRegistrationEnabledAsync(true)`: calls `getRegistrationInfoAsync()` before writing `isEnabled: true`.
   - Why: preserves existing registration metadata while enabling Expo auto-registration.
   - Startup dependency: reached through `Notifications.getExpoPushTokenAsync()` inside `registerAdminPushNotifications()`.
   - Interactive timing: after Assisted Chat mounts, after permission is granted, while registering the Expo push token.

4. `node_modules/expo-notifications/src/utils/updateDevicePushTokenAsync.ts`
   - `getLastRegisteredTokenDataAsync()`: reads registration info to compare the last uploaded native token metadata.
   - Why: avoids unnecessary Expo server token updates.
   - Startup dependency: only reached from Expo auto-registration update paths after notification initialization.
   - Interactive timing: after package load and token update work.

5. `node_modules/expo-notifications/src/utils/updateDevicePushTokenAsync.ts`
   - `setLastRegisteredTokenDataAsync()`: reads registration info before writing updated last-token metadata.
   - Why: preserves other registration state when recording token upload success.
   - Startup dependency: only reached from Expo auto-registration update paths after notification initialization.
   - Interactive timing: after package load and successful Expo server token update.

## Patch Scope

Tracked patch: `patches/expo-notifications+55.0.25.patch`

The patch changes only `ios/ExpoNotifications/ServerRegistration/ServerRegistrationModule.swift`:

- `getRegistrationInfo()` calls `fetchStringWithQuery(..., shouldThrowOnKeychainFailure: false)`.
- `fetchStringWithQuery` keeps the default throwing behavior for all other callers.
- Registration-info Keychain failures return `nil`, matching the existing JS read contract of `string | null | undefined`.

This keeps installation ID reads strict while making only the non-critical server-registration info read fail open.

Patch-package will fail clearly if the Expo package version changes because the patch filename is pinned to `expo-notifications+55.0.25.patch` and the diff context targets exact Swift lines from that package.

## Temporary Patch-Disabled Check

I temporarily reversed the patch with `npx patch-package --reverse`.

Observed unpatched native state:

- `setRegistrationInfoAsync` accepts `String`
- `getRegistrationInfo()` calls `fetchStringWithQuery(registrationGetQuery())`
- `fetchStringWithQuery` throws on non-success/non-item-not-found Keychain status

Checks with patch disabled:

- `npm run typecheck` passed.
- iOS Metro export with `EXPO_PUBLIC_DISABLE_SERVER_REGISTRATION_STARTUP=0` passed.
- Bundle inspection showed our notification facade uses Metro async require for `expo-notifications`, not a static runtime require.

Conclusion: architecture alone prevents the original pre-render startup crash, but not the later notification-initialization crash if the same native Keychain failure occurs. The patch was then reapplied.

## Desired Startup Order

Current Build 17 order:

1. App launch
2. Splash prevent/hide logging starts
3. JS runtime checkpoint
4. Root layout mounts providers
5. Navigation ready checkpoint
6. Home screen mounts
7. Session hydration starts
8. Session hydration completes
9. Logged-in Assisted Chat import
10. Assisted Chat mounts and first UI is available
11. Notification initialization starts
12. `expo-notifications` lazy import starts
13. Expo server registration lookup runs
14. Permission check/request runs
15. Optional Expo push-token registration runs
16. Notification initialization completes or logs unavailable

No notification-related native call is in the pre-render startup import path.

## Push Notification State Matrix

First launch:
- Empty registration info returns `nil`; registration proceeds after permission is granted.

Second launch:
- Existing registration info is read after UI render; if valid and enabled, Expo auto-registration can compare/update the token.

Existing registration:
- Persisted registration info is preserved by Expo code; the app still uploads the Expo token to `/api/mobile/admin/push-token`.

Empty Keychain:
- Expo returns `nil`; no crash.

Corrupted registration:
- Non-string or malformed JSON resolves to empty/disabled state in Expo/app parsing paths; no app startup dependency.

Denied notification permission:
- `registerAdminPushNotifications()` returns `null`; notification initialization logs completed with `armed: false`.

Granted notification permission:
- `getExpoPushTokenAsync()` runs after UI render and uploads the token to the backend.

Physical iOS TestFlight validation is still required for APNs delivery because this environment cannot exercise iOS Keychain/APNs behavior.

## Remaining Technical Debt

- Remove the patch after upgrading to an Expo version that contains an equivalent or stronger fix for `getRegistrationInfoAsync()` Keychain failures.
- Re-audit `setRegistrationInfoAsync(null)` if app code ever calls `setAutoServerRegistrationEnabledAsync(false)`, because Expo `55.0.25` Swift still accepts `String` there.
- Add native iOS tests when the project has a checked-in iOS target.
- Existing lint debt remains outside this startup change.

## Upstream Tracking

Expo issue `expo/expo#43828` and merged PR `expo/expo#43829` cover the same family of iOS `getRegistrationInfoAsync` Keychain failures. The local package already has the TypeScript rejection handler and `AfterFirstUnlock` accessibility, but it still allows the native registration-info read to reject. Keep this patch until a future Expo update is verified locally to make registration-info reads non-fatal in the same Keychain failure states.

## Build 17 Upload Follow-Up

Build `1.0.9 (17)` was uploaded and processed by Apple, but the EAS worker logs showed `patch-package` ran with `No patch files found` during both dependency installation and prebuild. The cause was the repo-root `.easignore`, which archives from the monorepo root and did not allowlist `assisted-chat-app/patches/**`.

Commit `bde021a` fixes the packaging path by allowlisting the patch folder and replacing raw `patch-package` with a guarded postinstall script. The corrected next TestFlight binary must use build number `18`, because App Store Connect has already consumed build number `17`.
