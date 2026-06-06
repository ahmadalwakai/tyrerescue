# Driver App — In-App Road Navigation Fix Report

## Problem
The job route screen drew a **straight line** between the driver and the
customer instead of a real, road-following route, and offered no in-app
turn-by-turn guidance — the driver had to open a third-party maps app to
actually navigate. Two underlying causes:

1. **No road geometry / no steps.** The screen relied on the backend
   `/api/driver/jobs/[ref]/route` endpoint, which returns no maneuver `steps`
   and whose server-side Mapbox call (`MAPBOX_SECRET_TOKEN`) was failing, so it
   fell back to a haversine straight line (`source: 'haversine'`).
2. **Map 401 / black map.** `EXPO_PUBLIC_MAPBOX_TOKEN` in `driver-app/.env`
   pointed at a deleted Mapbox account (`ahmadk99`), returning
   `{"code":"TokenInvalid"}`. Replaced with a valid `dukesttyres` public token
   (verified HTTP 200 from both the Styles and Directions APIs).

## Solution Overview
Implemented a full, Uber-style in-app navigation experience that no longer
depends on a third-party maps app. **No backend changes** were required or made.

### Files changed
| File | Change |
|------|--------|
| `driver-app/.env` | `EXPO_PUBLIC_MAPBOX_TOKEN` swapped to the valid `dukesttyres` public token. |
| `driver-app/src/services/directions.ts` | **NEW** — typed, client-side Mapbox Directions service. |
| `driver-app/app/(tabs)/jobs/[ref]/route.tsx` | **Rewritten** — live, road-following navigation screen. |
| `driver-app/assets/sounds/unvversfiled_ringtone_021_365652.mp3` | New job-alert sound (asset). |
| `driver-app/android/app/src/main/res/raw/unvversfiled_ringtone_021_365652.mp3` | Same sound bundled natively. |
| `.../DriverJobAlertNotifier.kt`, `.../DriverJobAlertActivity.kt` | Channel bump `v6→v7` + new `SOUND_RES_NAME`. |

## Mapbox token (existing variable, reused)
Per the project's Phase 4 decision, the navigation uses the **existing public
token** `EXPO_PUBLIC_MAPBOX_TOKEN` for **client-side** Directions requests. The
secret token is never shipped to the client, and the backend route endpoint is
left untouched so other consumers are unaffected.

## Directions API integration (`directions.ts`)
- `fetchDirections(origin, destination, signal?)` calls
  `https://api.mapbox.com/directions/v5/mapbox/driving/{lng,lat;lng,lat}` with
  `geometries=geojson&steps=true&overview=full&alternatives=false&language=en`.
- Coordinates validated and emitted in **lng,lat** order as Mapbox requires.
- 10 s timeout via `AbortController`; the caller can also abort to supersede an
  in-flight request. Never throws — returns `{ route }` or `{ error }`
  (`invalid-coords | network | http | no-route | aborted`).
- Parses `routes[0].legs[0].steps` into typed `RouteStep`s
  (`maneuver.instruction / type / modifier`, `location`).
- Helpers: `haversineMeters`, `distanceToRouteMeters` (point-to-polyline),
  `metersToMiles`, `secondsToMinutes`, `isValidCoord`.

## Navigation screen (`route.tsx`)
- **Real road route** rendered as a Mapbox GL JS GeoJSON line (casing + orange
  fill) inside the existing `react-native-webview` map (this app uses
  mapbox-gl-js in a WebView, not `@rnmapbox/maps`).
- **Distance & ETA** taken straight from the Directions response.
- **Live GPS tracking** via a single foreground `expo-location`
  `watchPositionAsync` subscription (High, 2 s / 5 m); instant first render via
  `getLastKnownPositionAsync`. Foreground-only, **does not POST**, fully removed
  on unmount, and the in-flight Directions request is aborted on unmount.
- **Camera follow + re-center**: camera eases to follow the driver; panning sets
  free-look and shows a re-center button that snaps back and re-enables follow.
- **Turn-by-turn card**: maneuver icon + distance-to-maneuver + instruction,
  auto-advancing as the driver passes each step.
- **Off-route reroute**: > 70 m off the polyline for > 5 s triggers a debounced
  re-fetch with a "Rerouting…" pill.
- **Periodic refresh** after > 35 m movement (min 12 s interval); auto-upgrades
  from fallback to a real road route when possible.
- **Driver marker** is an animated radar-pulse dot; customer is a green pin.

## Error / fallback states
- **Labelled fallback line**: if Directions fails, draws a clearly-labelled
  dashed "Approximate line — road route unavailable" with an estimated ETA —
  never silently faking a real route.
- **Map fatal** (401/403/WebGL/style failure): style auto-falls-back once
  (`streets-v12 → streets-v11`); a watchdog remounts the canvas up to twice then
  shows a Retry card with on-screen diagnostics.
- **Location permission denied**: overlay with an Enable button that re-requests.
- **Google Maps fallback retained** as a secondary action.
- Start Job / status transitions and Complete Job flow unchanged.

## Verification
| Command | Result |
|---------|--------|
| `npm run typecheck` (driver-app) | Pass |
| `npx eslint` on the two changed files | Clean (0 errors, 0 warnings) |
| `npm run lint` (whole app) | Only **pre-existing** errors in unrelated files |
| `:app:assembleRelease` | `BUILD SUCCESSFUL` |

> No ADB device was connected, so on-device runtime testing could not be
> automated. Token verified independently (HTTP 200 from Mapbox Styles +
> Directions APIs).

## Build artifact
- `C:\tyrerescue\builds\driver-app-production.apk` (~92.6 MB), built after
  clearing the Metro/Haste caches so the new token and code are inlined.

---

# Driver App — Mapbox "Map unavailable" / Black Map Fix Report

## Summary

On the live route screen (after the driver accepts a job and taps Start Job) the
Mapbox map area first appeared **black/blank**, and after the first fix attempt it
showed a **"Map unavailable — Couldn't load the map. Check your connection and
retry."** card while the bottom route card still showed correct distance/ETA
(7.8 mi / 19 min). Job/route **data was always fine** — the failure was purely in
the **Mapbox map render path**.

## Map stack (verified by inspecting the actual code)

- The only live map screen used is
  `driver-app/app/(tabs)/jobs/[ref]/route.tsx`. It renders Mapbox via
  `react-native-webview` loading **mapbox-gl-js v3.7.0** from the Mapbox CDN.
- This project does **not** use `@rnmapbox/maps` (no native `MapView`,
  `Camera`, `Mapbox.setAccessToken`, `StyleURL`, `onDidFailLoadingMap`,
  `onMapLoadingError` anywhere). So the fix is in the WebView/mapbox-gl-js layer.
- `driver-app/app/(tabs)/jobs/[ref]/map.tsx` is an **unused** legacy placeholder
  screen (static "tap to navigate" text, no real map) — nothing routes to it.
  Left untouched; not a duplicate map render.
- External navigation ("Open in Google Maps") is a deep link only, not a map
  render. Kept (allowed).

## Token (production)

- Existing env var (unchanged, not reinvented): **`EXPO_PUBLIC_MAPBOX_TOKEN`**,
  read in `getMapboxToken()`.
- Source: `driver-app/.env`. `EXPO_PUBLIC_*` vars are inlined by Metro into the
  **release** JS bundle at build time, so the token ships in the production APK
  (not dev-only).
- Token presence: **present**. Length: ~90+ chars. Masked prefix: `pk.eyJ1Ijoi…`.
  Starts with **`pk.`** → correct **public** token for client map rendering
  (no secret `sk.` token in the client). The full token is **never logged**.
- If the token is missing, the UI shows **"Map unavailable — missing Mapbox
  token"** (no black map).

## Root cause

Two layered issues:

1. **Original black map:** the WebView mounts during the expo-router screen
   transition at **0×0**, so Mapbox GL initialised its WebGL canvas at 0×0 and
   never recovered → solid black. There was also no remount across the
   `driver_assigned → in_progress` status transitions.

2. **The visible "Map unavailable" card (the regression in the screenshot):**
   the first fix treated **any** `map.on('error')` event from mapbox-gl-js as
   fatal. mapbox-gl-js fires `error` for **benign, non-fatal** conditions too —
   most commonly the telemetry POST to `events.mapbox.com` being blocked, or a
   single tile/sprite 4xx. Those events were flipping the whole (otherwise
   working) map to the error card.

## The fix (all in `driver-app/app/(tabs)/jobs/[ref]/route.tsx`)

1. **Fatal vs benign error classification (in the WebView).**
   `map.on('error')` now classifies the error:
   - **Fatal** (shows retry card): auth failures (HTTP 401/403, "unauthorized",
     "forbidden", "access token", "invalid token") and WebGL failures —
     **only when the map has not loaded yet**.
   - **Benign** (logged, never blanks the map): everything else (telemetry,
     tiles, sprites) and **any error after the map has loaded**.
   - Pre-construction guards post a fatal reason if `mapboxgl` failed to load
     from the CDN or `mapboxgl.supported()` is false (WebGL unsupported in the
     WebView), and the `new mapboxgl.Map(...)` call is wrapped in try/catch.

2. **Valid, visible style + fallback.** Switched the primary style to
   `mapbox://styles/mapbox/streets-v12` (a first-party, always-valid, clearly
   non-black style — proves the canvas rendered and avoids "dark style over dark
   app = looks blank"). If the style ever fails to load before first render, it
   falls back **once** to `streets-v11`.

3. **Remount on status change (fresh, correctly-sized canvas).** The `WebView`
   has a stable `key = `${job.id}:${job.status}:${mapReloadKey}``. Status
   changes recreate the canvas at the now-correct size. Readiness is **derived**
   from a keyed `mapStatus` (`{ key, phase }`) so a remount reads as "loading"
   without any setState-in-effect.

4. **Bounded watchdog + focus/AppState resize.** If a fresh canvas never reports
   `map-loaded` within 6 s it remounts (max 2 attempts via `recoveryAttemptsRef`,
   no loops); after the retries are exhausted it shows the clean retry card.
   `useFocusEffect` and an `AppState` `active` listener call `__resizeMap()` so a
   stale canvas is re-sized when it becomes visible again.

5. **Clean states, never a black box.**
   - Initialising → **"Loading map…"** spinner overlay over a real surface.
   - Fatal → **"Map unavailable / Couldn't load the map. Check your connection
     and retry."** + **Retry** button.
   - Missing token → **"Map unavailable — missing Mapbox token"**.
   - `source: 'none'` from the route API → **"Route unavailable for this job"**
     line (markers/map still render — route-API failure is **not** treated as a
     Mapbox failure).

6. **Retry behavior.** Retry only bumps `mapReloadKey` → the keyed derivation
   resets the **MapView only** (not the whole job screen, not job status). It
   does not touch Complete Job or Open in Google Maps. No infinite loop.

7. **Coordinate validation.** `buildStateJson()` drops any non-finite
   coordinate, sends Mapbox **[lng, lat]** order, and only draws the route line
   when there are ≥ 2 valid points. If geometry is missing, markers still render.
   Cannot crash on null/string/NaN/reversed coordinates.

8. **Layout.** `mapWrap` has `width: '100%'`, `minHeight: 240`,
   `overflow: 'hidden'`, `position: 'relative'`, real surface background; the
   overlay uses `StyleSheet.absoluteFillObject`. The map area cannot collapse and
   stays visible above the route card at 360 px width. The route card and bottom
   nav remain fully usable.

9. **No localhost / no dev-only logic.** The WebView `baseUrl` is
   `https://www.tyrerescue.uk/` (real https origin; removed the previous
   `https://localhost/`). No fake fallback coordinates. No duplicate map.

10. **Safe diagnostics.** Classified errors are forwarded to RN and logged via
    `console.warn('[route-map]', reason)` (reason text only — **never** the
    token) so the real technical cause is visible in `adb logcat` while the user
    sees the clean retry UI.

## Android permissions (verified, already present)

`driver-app/android/app/src/main/AndroidManifest.xml` already declares:
`android.permission.INTERNET`, `android.permission.ACCESS_FINE_LOCATION`,
`android.permission.ACCESS_COARSE_LOCATION`. No `usesCleartextTraffic` /
`networkSecurityConfig` blocks HTTPS to `api.mapbox.com`. No new permissions
added.

## Style URL used

- Primary: `mapbox://styles/mapbox/streets-v12`
- Fallback: `mapbox://styles/mapbox/streets-v11`

## Commands run

- `npm run typecheck` (tsc --noEmit): **pass**, no errors.
- `npx eslint app/(tabs)/jobs/[ref]/route.tsx`: my changes are **clean**; the
  only remaining findings are **pre-existing** in untouched code
  (`fetchJob()` / initial `refreshRoute()` effects, a `driverCoord` deps
  warning) and were not introduced by this fix.
- `cd driver-app/android; .\gradlew :app:assembleRelease --no-daemon`: builds the
  production APK (no Metro/dev server required).

## APK

- Copied to: `C:\tyrerescue\builds\driver-app-production.apk`.

## Files changed

- `driver-app/app/(tabs)/jobs/[ref]/route.tsx` — all of the above.
