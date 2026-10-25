# Assisted Chat iOS 1.0.12 (48)

Status: Complete. The exact production build 48 passed signed-artifact inspection, uploaded successfully, and is available in the existing internal TestFlight groups.

## Release identity

- Expo project: `@ahmadawadalwakai/tyre-rescue-assisted-chat`.
- Project ID: `7b51b2be-7b4e-484e-bb94-82628e8253e5`.
- Bundle identifier: `uk.tyrerescue.assistedchat`.
- Apple team: `BXK52CMHR2`; App Store Connect app: `6786223270`.
- Version: `1.0.12`; iOS build: `48` (previous verified TestFlight build: `47`).
- Production API: `https://www.tyrerescue.uk`.
- [EAS build](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue-assisted-chat/builds/ce6de07a-be4b-4f8a-977f-f32596f7ed27).
- Build ID: `ce6de07a-be4b-4f8a-977f-f32596f7ed27`.
- Build created: `2026-10-21T18:27:33.949Z`.
- Native build completed: `2026-10-21T18:31:49.136Z` (`FINISHED`).
- EAS fingerprint: `0363048a359fe70bbc39ae167117b2b1a2cc91d5`.
- [Signed IPA artifact](https://expo.dev/artifacts/eas/5o3HMBBlfXpql7A6d-ywr2lGlZXrWXC2bK09T-qfh38.ipa).
- [TestFlight upload submission](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue-assisted-chat/submissions/becf5a25-5e60-4955-9fad-a829043b0ac2).
- Submission ID: `becf5a25-5e60-4955-9fad-a829043b0ac2`; scheduled at `2026-10-21T18:32:27.046Z`.
- Submission completed: `2026-10-21T19:05:10.071Z` (`FINISHED`, original CLI exit code 0). The queued EAS job completed normally; no fallback upload or cancellation was used.
- [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6786223270/testflight/ios).
- Apple status verified at `2026-10-21T19:14:25.167Z`: processing `VALID`, internal `IN_BETA_TESTING`, external `READY_FOR_BETA_SUBMISSION`, not expired. Apple build ID: `5a15a827-3b11-4449-8cdf-5b4ab18f45c4`.
- Build 48 is associated with both existing internal groups, `ty` and `ts`; both retain access to all builds. Build notification setting `autoNotifyEnabled` is `true`. The associations appeared automatically; the final pre-write check found no missing association, so no manual association request was sent.
- The external group is not associated with this build and its public link remains disabled. No external beta review was requested.

## Scope and verified preflight

- Payroll users with server-confirmed settings permission can explicitly approve their own submitted pay run after reviewing its figures. Finalisation remains a separate step. Sharing payroll access with another administrator is optional.
- The payroll review decoder accepts a confirmed self-reviewed result while retaining status, actor, timestamp, version and entity validation. The canonical review screen checks the server's `canEditSettings` permission before enabling approval/rejection.
- Full application TypeScript check and both notification checks passed. Startup remains enabled for build 48; SecureStore and the notification plugin remain configured.
- Production project/account environment names were checked. Only the expected public Mapbox variable was found; no diagnostic disable flags or public secret variables were present.
- Dependency pins are unchanged. Package lock SHA-256: `2b87f938d0a79ceadf45fbabad4c8940fc9435a40b6bea02e2f8b19560fd49c3`.
- The app-only archive contains 207 files and 6,517,305 bytes. Inspection found zero private files, secret token literals, or changes between the inspected archive and the frozen application source. Compressed upload: 4.3 MB.
- Inspected source manifest SHA-256: `8f36ac4aa39a943047cb257270aa669b08e4f5e55f6eb29c4121e396021bde67`.
- Production iOS Metro/Hermes export passed. Its 5,041,419-byte bundle contains the self-review confirmation and optional team-access wording, approval permission contract, payroll readiness, production API, and remote session revocation handling. No secret literal was detected.
- Local Hermes bundle SHA-256: `c6e9cdf7a7ef88f7ddf3eb5ecd14826c0b9cd4612f5d54402b82d9df0208cf1f`.
- Fresh remote Apple provisioning check succeeded for the correct team and bundle. The existing profile and signing credentials are active through 3 October 2027.
- Actual signed IPA inspection confirmed the correct version/build/team/bundle, production APNs entitlement, compiled native SecureStore, production API, session revocation contract, all five self-review/team-access UI markers, and the approval permission contract. No secret literal was detected in the shipped Hermes bundle.
- Signed IPA SHA-256: `997098de9e4f4b87e6fcdacf0e689bcc1f1b4c6ae05389498fde604020fa11cf` (17,973,551 bytes).
- Shipped Hermes bundle SHA-256: `f6633f8c20f16d81819ea2f15dd0fd4adaf35de747a8dacfd4491e4d07b6d162` (5,042,426 bytes).
- Process-only IPv4-first DNS ordering resolved a delayed local EAS read. No persistent network setting was changed.

Expo Doctor reported the same 13 SDK 55 patch-version recommendations seen in the preceding releases. The tested dependency pins and version-specific notification patch were retained; the cloud build continued into native compilation after that advisory.

## Delivery limits

The destination is the existing internal TestFlight groups. Group access was verified without querying tester identities. No external beta review, new tester invitation, manual group association, group setting change, App Store review, or public release was performed. No Apple security interaction was needed. This report does not claim specific-account membership, receipt of a real notification/email, or installation on an iPhone.

Vercel deployment is handled separately after successful TestFlight upload. No Stripe setting, customer booking, live payroll record, or payment was changed by this iOS release task.
