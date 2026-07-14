# iOS Driver App Store Screenshot Generator

This workflow generates five App Store-ready PNG screenshots for the **Tyre Rescue Driver iOS app only**.

It must not be used with Android screenshots, customer app screenshots, admin app screenshots, browser screenshots, website screenshots, Google Play artwork, or any image containing real customer personal data.

## Input

Place exactly five real iOS Driver App PNG screenshots in:

```text
scripts/app-store-screenshots/input/
```

Use screenshots captured from the real `Tyre Rescue Driver` iOS build or an iOS Simulator/device running that build. Keep the files in the order you want them mapped to the five App Store slides. A simple naming pattern is:

```text
01-accept-urgent-jobs-source.png
02-navigate-job-details-source.png
03-job-status-source.png
04-mobile-drivers-source.png
05-driver-operations-source.png
```

Before running the generator, confirm every input screenshot:

- is from `Tyre Rescue Driver` / `uk.tyrerescue.driver`
- is captured from the real iOS build, iOS Simulator, or iOS device
- is a portrait iOS phone screenshot
- does not show the customer app
- does not show Android UI or an Android status bar
- does not show browser chrome, a website, or App Store Connect
- does not contain real customer personal data

The current known Expo Web/browser source hashes are blocked by the script so they cannot be reused by mistake.

## Run

From the repository root:

```powershell
npm run appstore:screenshots
```

The script uses `sharp`. It is available in the current install via `next`, but it is not a direct root dependency. If a clean install cannot resolve `sharp`, do not add it silently; get approval before adding the dependency.

## Output

The generator exports exactly five iPhone PNG files to:

```text
scripts/app-store-screenshots/output/
```

Generated files:

```text
01-accept-urgent-jobs.png
02-navigate-job-details.png
03-job-status.png
04-mobile-drivers.png
05-driver-operations.png
```

Every output is validated as:

- `1290x2796`
- PNG
- portrait
- dark charcoal background with orange accents
- large marketing headline and short supporting sentence
- real app screenshot inside a clean iPhone-style device frame

## Slide Copy

1. Accept urgent jobs fast
   New tyre rescue jobs are shown clearly so drivers can act quickly.

2. Navigate with job details
   See the customer location, tyre details, and route information in one place.

3. Know every job status
   Track active, completed, and payment status without confusion.

4. Built for mobile drivers
   Simple controls for busy roadside work.

5. Driver operations made clear
   Focused screens for dispatch, progress, and completion.

## Safety Rules

Do not include claims about iOS lock-screen popups, PushKit, CallKit, VoIP, or Critical Alerts.

Do not include Google Play references.

Do not include Android screenshots.

Do not include customer app screenshots.

Do not include browser or website screenshots.

Do not include real customer personal data.

## App Store Connect

Upload generated PNG files only to the iOS Driver App record in App Store Connect:

```text
ASC App ID: 6784984848
Bundle ID: uk.tyrerescue.driver
```

Do not upload screenshots generated from the current `raw-driver-web-sources` files.

Do not click **Submit for Review** until the app owner has reviewed and approved the final build, metadata, privacy answers, and screenshots.
