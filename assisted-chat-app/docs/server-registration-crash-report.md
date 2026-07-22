# Server Registration Startup Crash Report

Date: 2026-07-22
App: Tyre Rescue Assisted Chat
Version/build investigated: `1.0.9 (16)`
Bundle ID: `uk.tyrerescue.assistedchat`

## Crash Facts Used

Apple reported an iOS startup abort roughly `0.12s` after launch:

- Exception: `EXC_CRASH (SIGABRT)`
- React path: `RCTFatal` through `RCTExceptionsManager`
- Native stack included:
  - `ServerRegistrationModule.definition()`
  - `ServerRegistrationModule.getRegistrationInfo()`
  - `ServerRegistrationModule.fetchStringWithQuery(_:)`
  - `SecItemCopyMatching`
- Native source lines named by the crash:
  - `ServerRegistrationModule.swift:16`
  - `ServerRegistrationModule.swift:89`
  - `ServerRegistrationModule.swift:137`

The supplied report excerpt did not include the JavaScript exception message or the Keychain `OSStatus`.

## Exact Implementation Paths

Native implementation:

- `node_modules/expo-notifications/ios/ExpoNotifications/ServerRegistration/ServerRegistrationModule.swift`

Expo module registration:

- `ServerRegistrationModule.swift:7` defines `open class ServerRegistrationModule: Module`
- `ServerRegistrationModule.swift:8` defines `definition()`
- `ServerRegistrationModule.swift:9` registers `Name("NotificationsServerRegistrationModule")`
- `ServerRegistrationModule.swift:15` registers `AsyncFunction("getRegistrationInfoAsync")`
- `ServerRegistrationModule.swift:19` registers `AsyncFunction("setRegistrationInfoAsync")`

Native functions:

- `getRegistrationInfo()` was at `ServerRegistrationModule.swift:88`
- `fetchStringWithQuery(_:)` was at `ServerRegistrationModule.swift:135`
- `SecItemCopyMatching` was at `ServerRegistrationModule.swift:137`

Package JS/TS consumers:

- `node_modules/expo-notifications/src/ServerRegistrationModule.native.ts`
- `node_modules/expo-notifications/src/DevicePushTokenAutoRegistration.fx.ts`
- `node_modules/expo-notifications/src/utils/updateDevicePushTokenAsync.ts`
- `node_modules/expo-notifications/src/getExpoPushTokenAsync.ts`

App JS/TS consumers:

- `src/lib/notifications.ts`
- `src/lib/urgent-alerts.ts`
- `src/components/AssistedChatScreen.tsx`
- `src/hooks/useNewCustomerBookingAlert.ts`

## Startup Call Order Before Fix

1. `src/startup-entry.js` loads Expo Router.
2. Expo Router loads `app/_layout.tsx`.
3. The home route imports `src/components/AssistedChatScreen.tsx` after session hydration reports `logged-in`.
4. `AssistedChatScreen.tsx` statically imports `src/lib/notifications.ts`.
5. `src/lib/notifications.ts` statically imports `expo-notifications`.
6. `expo-notifications/src/index.ts` re-exports `setAutoServerRegistrationEnabledAsync` from `DevicePushTokenAutoRegistration.fx.ts`.
7. That re-export executes `DevicePushTokenAutoRegistration.fx.ts` at module scope.
8. `DevicePushTokenAutoRegistration.fx.ts:133` immediately calls `ServerRegistrationModule.getRegistrationInfoAsync()`.
9. Native `getRegistrationInfoAsync` calls `getRegistrationInfo()`.
10. `getRegistrationInfo()` calls `fetchStringWithQuery(registrationGetQuery())`.
11. `fetchStringWithQuery` calls `SecItemCopyMatching`.

This means build 16 could execute the native Keychain read before the app shell had safely finished rendering.

## Exact Fatal Condition

The exact JavaScript fatal message is not present in local logs or the supplied Apple excerpt.

The exact native fatal branch in build 16 was:

- `SecItemCopyMatching` returned something other than `errSecSuccess` or `errSecItemNotFound`.
- `fetchStringWithQuery` then threw `keychainException(status)`.
- The exception name from source is `ERR_NOTIFICATIONS_KEYCHAIN_ACCESS`.
- The exception description format from source is `Keychain access failed: <SecCopyErrorMessageString(status)>`.

Empty Keychain alone should not have triggered this crash in the pre-fix source because `errSecItemNotFound` already returned `nil`. Malformed bytes or an unexpected returned CF type also returned `nil`. The crash therefore indicates a Keychain access/status failure during the registration-info read, but the exact `OSStatus` is still unknown from the provided crash excerpt.

## Native Contract

Before:

- `getRegistrationInfoAsync`: declared as returning `String?`, but could throw for Keychain statuses other than success/item-not-found.
- `setRegistrationInfoAsync`: native closure accepted `String`, while the TypeScript contract accepted `string | null`.
- `getRegistrationInfoAsync` failure could occur during package module-scope startup execution.

After:

- `getRegistrationInfoAsync`: still returns `String?`, but registration-info Keychain failures return `nil` instead of throwing through the bridge.
- `setRegistrationInfoAsync`: unchanged from Expo `55.0.25`; it still accepts `String` in Swift.
- Fresh install, empty Keychain, malformed data, wrong CF result type, inaccessible registration item, and stale bad registration state all resolve to empty registration state for the startup read.

The exact app-level stable read state remains the package's existing contract: `string | null | undefined`. The app does not invent new registration fields.

## Changes Made

- `src/lib/notifications.ts`
  - Replaced static runtime `expo-notifications` import with type-only import plus guarded dynamic import.
  - Moved `setNotificationHandler` out of module scope.
  - Listener setup, badge clearing, local notifications, permission reads, Expo token reads, and device-token reads now return `null`, no-op, or `undetermined` if the module is unavailable.
  - Import failures are logged and do not create unhandled startup rejections.

- `src/lib/notification-contract.ts`
  - Added focused parsing helpers for persisted Expo registration state.

- `patches/expo-notifications+55.0.25.patch`
  - Patches `ServerRegistrationModule.swift` through `patch-package`.
  - Scope is limited to the registration-info read path that appeared in the Apple crash stack.

- `package.json` and `package-lock.json`
  - Added `patch-package`, `postinstall`, and `test:notification-contract`.

- `src/components/AssistedChatScreen.tsx`
  - Notification initialization failure logs and marks alerts as `not_armed` instead of rethrowing from a startup effect.

- `src/hooks/useAdminSession.ts`
  - Session hydration storage/parse failure logs and falls through to env/logged-out recovery instead of rethrowing.

- `app/_layout.tsx`
  - Splash prevent/hide failures log without rethrowing from startup promises.

## Startup Call Order After Fix

1. `src/startup-entry.js`
2. Expo Router
3. `app/_layout.tsx`
4. Home route
5. Session hydration
6. Assisted Chat import
7. `src/lib/notifications.ts` facade import only; `expo-notifications` is not imported at module scope
8. Assisted Chat renders
9. Notification initialization effect starts after render
10. `expo-notifications` loads lazily from the post-render notification path
11. The patched native registration-info read returns `nil` for bad registration Keychain state

## Remaining Startup Audit

- Notifications: fixed startup module-scope execution and native registration-info failure path.
- Session hydration: storage/JSON failure is now recoverable.
- Splash handling: promise failures are now logged without rethrowing.
- SecureStore: no assisted-chat app startup SecureStore use was found.
- WebView/Maps/Camera/Stripe: not in the immediate `ServerRegistrationModule` crash path. WebView still loads after Assisted Chat hydration through `LocationSection`, and camera/payment flows remain interaction-driven.

## Tests And Verification

Passed:

- `npx patch-package --check`
- `npm run test:notification-contract`
- `npm run typecheck` in `assisted-chat-app`
- `npx expo-doctor` in `assisted-chat-app`: `19/19 checks passed`
- `npx expo export:embed --eager --platform ios --dev false`
- `npx tsc --noEmit` at repo root
- `npm test -- --run` at repo root: `57` files, `1077` tests passed
- `git diff --check`

Failed / not available:

- `npm run lint` in `assisted-chat-app` still fails on existing lint debt in `app/index.tsx`, `AssistedChatScreen.tsx`, `LoginScreen.tsx`, and related warnings. The new verification script no longer contributes lint errors after adding its file-level CommonJS lint disable.
- Native Swift compile checks and native unit tests are not available locally because this repo does not have a checked-in `assisted-chat-app/ios` project or Swift test target. The native dependency change is validated by `patch-package --check`; final Swift compile validation must occur in the next EAS iOS build.

## Why Build 16 Crashed

Build 16 still imported `expo-notifications` during Assisted Chat startup. The package's auto server-registration side effect called `NotificationsServerRegistrationModule.getRegistrationInfoAsync()` immediately at module scope. That native method queried the iOS Keychain and threw on a non-success/non-item-not-found status. React Native reported the resulting fatal exception through `RCTFatal`, aborting launch before the app had a recoverable UI.

## Remaining Uncertainty

- The exact Keychain `OSStatus` is not in the provided Apple excerpt.
- The exact JavaScript exception text is not recoverable from local logs.
- The Swift patch has not been compiled by Xcode locally because no local iOS project/test target exists.
- The Swift patch has not been exercised on a physical iOS TestFlight install yet.

## Recommended Next Build Number

Use iOS build number `17`.
