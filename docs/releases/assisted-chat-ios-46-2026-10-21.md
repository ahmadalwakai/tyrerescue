# Assisted Chat iOS 1.0.12 (46)

Status: Complete. EAS native build finished successfully; the exact build 46 was uploaded to App Store Connect and is available for internal TestFlight testing.

## Release identity

- Expo project: `@ahmadawadalwakai/tyre-rescue-assisted-chat`.
- Project ID: `7b51b2be-7b4e-484e-bb94-82628e8253e5`.
- Bundle identifier: `uk.tyrerescue.assistedchat`.
- Apple team: `BXK52CMHR2`; App Store Connect app: `6786223270`.
- Version: `1.0.12`; iOS build: `46` (previous verified TestFlight build: `45`).
- Production API: `https://www.tyrerescue.uk`.
- [EAS build](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue-assisted-chat/builds/4929f64e-3dd8-48d8-b477-1d34bdc5b7c2).
- Build ID: `4929f64e-3dd8-48d8-b477-1d34bdc5b7c2`.
- Native build completed: `2026-10-21T03:21:17.847Z`.
- EAS fingerprint: `38a7ed2576575c03f1ddc7a920ae549381a6ddba`.
- [IPA artifact](https://expo.dev/artifacts/eas/ppGr7qf-uhqaTCIqTZ4TFUD_J-5doT72ClFuEFvgbJM.ipa).
- [TestFlight upload submission](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue-assisted-chat/submissions/31dc230d-c4b4-4c04-8bb8-00351e3d4b49).
- Submission ID: `31dc230d-c4b4-4c04-8bb8-00351e3d4b49`.
- Submission completed: `2026-10-21T03:23:06.119Z` (`FINISHED`, exit code 0).
- [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6786223270/testflight/ios).
- Apple status verified at `2026-10-21T03:26:37Z`: processing `VALID`, internal `IN_BETA_TESTING`, external `READY_FOR_BETA_SUBMISSION`, not expired. The external state means no external beta review was requested.
- Read-only App Store Connect group check at `2026-10-21T03:31:31.038Z`: build 46 is associated with both existing internal groups, `ty` and `ts`; each has access to all builds. Build notification setting `autoNotifyEnabled` is `true`. The exact Apple build ID is `e98e1c51-dfb5-40aa-bbd9-132795c5a7cf`.
- Existing members of those internal groups have access to build 46 in TestFlight. The existing external group, `Assisted Chat External Testers`, is not associated with this build and its public link is disabled. External beta review is not pending; its state remains `READY_FOR_BETA_SUBMISSION`.

## Verified preflight

- Full application TypeScript check passed.
- Notification contract and iOS notification startup checks passed.
- Notifications are linked and startup is enabled; no production diagnostic disable flag was present.
- SecureStore plugin is enabled; native session storage uses `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
- EAS production environment contains the public Mapbox token variable; no public admin credential or secret-named public variable was found.
- Local production iOS Metro/Hermes export passed: 1,451 modules, 5,036,241-byte Hermes bundle.
- Bundle includes the production API origin and the explicit remote session revocation contract. No Stripe secret, webhook secret, or private key literal was detected.
- EAS upload is restricted to the Assisted Chat application directory. Local environment files, credentials, native build directories, logs, scripts used for previous releases, and signing keys are excluded.
- Source archive inspection: 206 files, 6,511,263 bytes; zero private files or secret token literals. Compressed upload: 4.3 MB.
- Remote Apple signing credentials and provisioning profile are active for the correct team; expiry 3 October 2027.
- The actual signed IPA was inspected: version/build/bundle/team match; `aps-environment` is `production`; the compiled native SecureStore module is present. The shipped Hermes bundle contains the production API and no detected Stripe/private key/secret Mapbox token literal.
- App Store Connect access via the existing remote API key succeeded. Prior build 45 was `VALID` / `IN_BETA_TESTING`.

## Hashes

- Inspected source manifest SHA-256: `ac08fd380bfbce2f545cc04d0ed1ed5f3282281fb88b7bc324ebecc1bf55be65`.
- Local Hermes bundle SHA-256: `b19459215ec044e73385f2b40d116dc1fe90cf62912225d0fcb2468ae0f021ce`.
- Signed IPA SHA-256: `785e961f39ff9ec89d54b45f566947588cbd9b80b03fbe7b84b03a8c17ee00c1` (17,971,671 bytes).

## Dependency compatibility note

The read-only Expo compatibility check found newer patch versions within SDK 55. This build retains the tested pinned dependencies, including the version-specific `expo-notifications` patch. No dependency upgrade was made during release preparation.

## Delivery and testing limits

- EAS Submit succeeded with exit code 0 and confirmed upload to App Store Connect.
- Apple processing and internal testing status are confirmed for build 46 and match the exact EAS build/submission IDs above.
- Existing group settings were inspected without changes. No tester identities were queried, and no invitation or tester message was sent. Specific account membership, email receipt, and installation on an iPhone were not verified.
- No App Store public release or App Review submission was requested.
- This report does not claim delivery of an actual notification to an iPhone or an on-device installation test.

No Vercel deployment, Stripe configuration change, customer booking mutation, or real push delivery was performed by the iOS release task.

An optional TestFlight changelog parameter was rejected before scheduling because EAS restricts it to Enterprise accounts. Submission was then scheduled successfully for the same IPA without that parameter. No Apple security interaction was needed.
