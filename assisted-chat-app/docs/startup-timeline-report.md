# Assisted Chat Startup Timeline Report

Date: 2026-07-22
Scope: `assisted-chat-app` startup instrumentation for the next TestFlight build.
Build status: startup instrumentation added; TestFlight submission attempts are tracked in EAS build logs.

## Instrumentation Added

All new runtime diagnostics use the app's existing console logging surface and also keep an in-memory `globalThis.__TYRE_RESCUE_STARTUP_TIMELINE__` array for the current JS runtime.

Checkpoint labels now emitted:

1. Native app started
2. JS runtime started
3. Root component mounted
4. Providers initialized
5. Navigation ready
6. Session hydration started
7. Session hydration completed
8. Notifications initialization started
9. Notifications initialization completed
10. Home screen mounted
11. Assisted Chat mounted

Every instrumented startup module logs `started`, `completed`, and `failed` when an exception/rejection reaches that module boundary. Failure handlers rethrow after logging.

## Startup Execution Order

Actual order in the current app, preserving business logic:

1. `src/startup-entry.js`
   - Loads `@expo/metro-runtime`.
   - Logs `Native app started`.
   - Logs `JS runtime started`.
   - Requires `expo-router/entry` inside a rethrowing try/catch.
2. Expo Router registration
   - Registers the Expo Router root component.
3. `app/_layout.tsx`
   - Module starts.
   - Starts `SplashScreen.preventAutoHideAsync()`.
   - Renders `GestureHandlerRootView`, `SafeAreaProvider`, `StatusBar`, and `Slot`.
   - Logs `Root component mounted`.
   - Logs `Providers initialized`.
   - Starts `SplashScreen.hideAsync()`.
   - Logs `Navigation ready` once `useRootNavigationState()` has a root key.
4. `app/index.tsx`
   - Imports `LoginScreen`, `useAdminSession`, and `colors`.
   - Logs `Home route module`.
   - Mounts the index route and logs `Home screen mounted`.
5. `src/lib/api.ts`
   - Runs at module scope through `useAdminSession`.
   - Resolves `API_BASE_URL`.
   - Release path uses `https://www.tyrerescue.uk` when no explicit `EXPO_PUBLIC_API_BASE_URL` is set.
6. `src/hooks/useAdminSession.ts`
   - Logs `Session hydration started`.
   - Reads `assistedChat.adminToken.v1` from AsyncStorage.
   - On valid stored token, sets the admin token and marks `logged-in`.
   - Otherwise falls back to `EXPO_PUBLIC_ADMIN_TOKEN` or `logged-out`.
   - Logs `Session hydration completed`.
   - Hydration errors log `failed` and rethrow.
7. Logged-out path
   - Renders `LoginScreen`.
   - Assisted Chat, notifications initialization, WebView maps, camera flows, and Stripe payment link actions do not run.
8. Logged-in path
   - `app/index.tsx` logs `Assisted Chat import started`.
   - Dynamically requires `src/components/AssistedChatScreen.tsx`.
   - If any static dependency under Assisted Chat fails at module scope, the import logs `failed` and rethrows.
9. `src/components/AssistedChatScreen.tsx` static import tree
   - Loads static hooks, UI components, API helpers, payment-link helpers, header video helpers, notification helpers, urgent alert helpers, and workflow helpers.
   - `src/lib/notifications.ts` imports `expo-notifications` and installs `Notifications.setNotificationHandler()` at module scope.
   - `src/lib/urgent-alerts.ts` imports `src/lib/urgent-watcher.ts`.
   - `src/lib/urgent-watcher.ts` reads `NativeModules.UrgentWatcherModule` at module scope and logs availability.
   - End of `AssistedChatScreen.tsx` logs `Assisted Chat module completed`.
10. Assisted Chat first mount
    - Calls `useAssistedChatDraft()`, which logs `Assisted Chat draft hydration started`.
    - Logs `Assisted Chat mounted`.
    - Starts notification arming and logs `Notifications initialization started`.
    - Calls `ensureUrgentAlertsArmed()`.
    - Logs `Notifications initialization completed` after the first arming attempt returns.
11. Hydrated Assisted Chat UI
    - After draft hydration, the main chat UI renders.
    - `DeferredLocationSection` logs `Location Section import started/completed`.
    - That import pulls in `react-native-webview` and Mapbox WebView route-map code.
12. Interaction-deferred modules
    - `VirtualLandlineModal`, `ChatHubModal`, `DriverChatModal`, `AdminStockModal`, `ActiveJobsModal`, `TrackingModal`, and `UrgentBookingPopup` now have import checkpoints, but they only load when their visible/open state is true.

Note: the user-requested checkpoint list is all emitted, but exact chronological order must reflect existing React/Expo behavior. For example, the home route mounts before auth hydration finishes, and Assisted Chat mounts before notification initialization completes because notification arming is an effect inside that screen. Forcing the requested textual order would require delaying existing rendering, which was intentionally not done.

## Startup Dependency Graph

`src/startup-entry.js`
-> `@expo/metro-runtime`
-> `src/lib/startup-logging.ts`
-> `expo-router/entry`
-> Expo Router root registration
-> `app/_layout.tsx`
-> `GestureHandlerRootView`
-> `SafeAreaProvider`
-> `Slot`
-> `app/index.tsx`
-> `src/hooks/useAdminSession.ts`
-> `src/lib/api.ts`
-> AsyncStorage auth token read

Logged-in branch:

`app/index.tsx`
-> dynamic `src/components/AssistedChatScreen.tsx`
-> static hooks/components:
`useAssistedChatDraft`, `useAssistedChatPrice`, `useAssistedChatDispatch`, `useAdminPaymentLink`, `useAssistedChatLocationShare`, `useAssistedChatQuoteActions`, `useTodayBookings`, `useRecentCustomers`, `useDuplicateBookingWarning`, `useNewCustomerBookingAlert`, `useBookingTracking`, `useActiveJobs`
-> static libs:
`api`, `invoice-download`, `payment-link-status`, `header-video`, `customer-message`, `clipboard`, `money`, `notifications`, `urgent-alerts`, `assisted-chat-workflow`, `operator-workflow-state`, `header-layout`, `header-notifications`
-> `notifications`
-> `expo-notifications`, `expo-device`, AsyncStorage
-> `urgent-alerts`
-> `urgent-watcher`
-> `NativeModules.UrgentWatcherModule`
-> first mount effects
-> draft hydration AsyncStorage
-> notification arming
-> hydrated UI
-> `LocationSection`
-> `react-native-webview`, Mapbox HTML

Deferred interaction branches:

`ChatHubModal` and `DriverChatModal`
-> `expo-image-picker` camera/library permissions

`AdminStockModal` and `VirtualLandlineModal`
-> `expo-document-picker`

`ActiveJobsModal`, `TrackingModal`, `LiveTrackingMapMobile`
-> `react-native-webview`, Mapbox HTML

Download actions
-> dynamic `expo-file-system` and `expo-sharing`

## Release-Only And Native Audit

`__DEV__`
- `src/lib/api.ts`: logs resolved API base only in dev.
- `src/lib/notifications.ts`: raw token type warning only in dev.
- `src/components/AssistedChatScreen.tsx`: urgent alert armed and header video diagnostics only in dev.
- `src/components/alerts/UrgentBookingPopup.tsx`: popup/native sound diagnostics only in dev.
- `src/lib/native-urgent-sound.ts`: native sound catch warnings only in dev.

Production-only branches
- `src/lib/api.ts`: when `process.env.NODE_ENV === 'production'` and no explicit API base is present, the release API target is `https://www.tyrerescue.uk`.
- Expo Router internals skip LogBox setup in production; app code was not changed there.

`Platform.select`
- Used for shadows and presentation styles in login, cards, buttons, workflow cards, and modal shells.
- No startup business logic is selected through `Platform.select`.

`Platform.OS`
- Web bypasses notifications, native animation driver, some download/share flows, and iframe/WebView switching.
- iOS uses keyboard behavior and notification token upload platform value.
- Android-only urgent watcher, raw FCM token, channel setup, and topic subscription are gated behind Android checks.

`NativeModules`
- `src/lib/urgent-watcher.ts` reads `NativeModules.UrgentWatcherModule` at module scope. It is Android-gated for use, but lookup now logs during Assisted Chat import.
- `src/lib/native-urgent-sound.ts` reads `NativeModules.UrgentSoundModule` only through `getModule()`, used by the deferred urgent popup path.

Notifications
- `src/lib/notifications.ts` statically imports `expo-notifications`.
- `Notifications.setNotificationHandler()` runs at module scope during Assisted Chat import.
- `registerAdminPushNotifications()` runs during notification arming after Assisted Chat mounts and an admin token exists.

SecureStore
- No `SecureStore` usage found in `assisted-chat-app`.
- Startup auth and draft state use `@react-native-async-storage/async-storage`.

WebView
- `LocationSection` imports `react-native-webview` and is loaded after Assisted Chat draft hydration when the main UI renders.
- `ActiveJobsModal`, `TrackingModal`, and `LiveTrackingMapMobile` also import `react-native-webview`, but they are deferred until modal/tracking paths open.

Camera
- Camera usage is through `expo-image-picker`, not a native Camera module.
- `ChatHubModal` and `DriverChatModal` import `expo-image-picker`, but those modules are deferred until the chat modals open.

Maps
- No native map SDK found.
- Map rendering uses Mapbox GL JS inside WebView HTML.
- Startup-relevant map path is `LocationSection` after draft hydration.

Stripe
- No native Stripe SDK dependency found in `assisted-chat-app/package.json`.
- Stripe references are backend payment-link state, copy, labels, and payment status API checks.

## Highest-Risk Startup Module

Highest-risk by startup blast radius, not by proven cause: `src/lib/notifications.ts`.

Reason: it statically imports `expo-notifications` and calls `Notifications.setNotificationHandler()` at module scope during the logged-in Assisted Chat import path. That is native-backed, release-relevant, and runs before the main Assisted Chat UI can finish rendering.

Second-highest risk: `src/components/LocationSection.tsx`, because it imports `react-native-webview` and renders the Mapbox WebView path once the Assisted Chat draft has hydrated. It is now bracketed by the `Location Section import` checkpoint.

## Remaining Uncertainty Before Next TestFlight

1. The app has no iOS native project checked in under `assisted-chat-app`, so `Native app started` is the earliest JS-entry checkpoint, not a true AppDelegate/pre-JS native marker.
2. If iOS crashes before the JS bundle starts, none of these checkpoints can run. Apple/TestFlight crash metadata remains required for that case.
3. If a native module crashes during static import before module body execution, the nearest enclosing checkpoint will be the parent import. Example: `Assisted Chat import started` without `Notifications module started` points at a static dependency load before `notifications.ts` could execute.
4. Console logs may not be included in every TestFlight crash submission. Device console capture during launch is still the strongest way to read the timeline.
5. If the tester is logged out or has no stored admin token, the Assisted Chat, notifications, WebView, camera, map, and Stripe-related logged-in branches will not run.
