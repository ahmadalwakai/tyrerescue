# Assisted Chat iOS 1.0.12 (47)

Status: Complete. Native production build finished, the exact build 47 was uploaded to App Store Connect, and Apple confirmed availability in the existing internal TestFlight groups.

## Release identity

- Expo project: `@ahmadawadalwakai/tyre-rescue-assisted-chat`.
- Project ID: `7b51b2be-7b4e-484e-bb94-82628e8253e5`.
- Bundle identifier: `uk.tyrerescue.assistedchat`.
- Apple team: `BXK52CMHR2`; App Store Connect app: `6786223270`.
- Version: `1.0.12`; iOS build: `47` (previous verified TestFlight build: `46`).
- Production API: `https://www.tyrerescue.uk`.
- [EAS build](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue-assisted-chat/builds/2bef59bf-7775-4627-b7d2-6bc27d0d3813).
- Build ID: `2bef59bf-7775-4627-b7d2-6bc27d0d3813`.
- Build created: `2026-10-21T11:33:03.535Z`.
- Native build completed: `2026-10-21T11:37:12.149Z` (`FINISHED`).
- EAS fingerprint: `483b443e870988c14f04bdb42091dd68a44d017b`.
- [Signed IPA artifact](https://expo.dev/artifacts/eas/CqApyvR6TN2TLDY3fHbnNXncdBVQe7LDIkuwwPA35Sw.ipa).
- [TestFlight upload submission](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue-assisted-chat/submissions/bf55f959-c275-4f3a-94b4-e018a848b2a4).
- Submission ID: `bf55f959-c275-4f3a-94b4-e018a848b2a4`.
- Submission completed: `2026-10-21T11:38:52.026Z` (`FINISHED`, CLI exit code 0).
- [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6786223270/testflight/ios).
- Apple status verified at `2026-10-21T11:41:42.424Z`: processing `VALID`, internal `IN_BETA_TESTING`, external `READY_FOR_BETA_SUBMISSION`, not expired. Apple build ID: `cd15145b-48c7-4c05-8557-a607105edfba`.
- Build 47 is associated with both existing internal groups, `ty` and `ts`; each has access to all builds. Build notification setting `autoNotifyEnabled` is `true`. Existing members can access this build through TestFlight.
- The existing external group, `Assisted Chat External Testers`, is not associated with build 47 and its public link remains disabled. External beta review was not requested.

## Scope and verified preflight

- Includes the payroll setup readiness flow for a saved company before activation, explicit setup actions, permission-aware controls, focus refresh after setup, and clearer internal registration status wording.
- Full application TypeScript check and both notification checks passed.
- Notification startup remains enabled; SecureStore and the existing notification plugin remain configured.
- Production project and account environment names were checked. Only the expected public Mapbox variable was found; no diagnostic disable flags or public secret variables were present.
- Dependency pins are unchanged. Package lock SHA-256: `2b87f938d0a79ceadf45fbabad4c8940fc9435a40b6bea02e2f8b19560fd49c3`.
- The app-only source archive contains 207 files and 6,521,145 bytes. Inspection found zero private files, secret token literals, or changes between the inspected archive and the application source. Compressed upload: 4.3 MB.
- Inspected source manifest SHA-256: `a4e7e36048cddcf3e5d7707d79fce1c07c3b8f19605445702504924325d29ac2`.
- Production iOS Metro/Hermes export passed. The 5,046,425-byte bundle contains the production API, remote session revocation handling, payroll readiness contract, and setup action; no secret literal was detected.
- Local Hermes bundle SHA-256: `c0c3f702c852d0b797e0838e517030accd8c7f87afdc22ebbb4c2692755c0e9b`.
- Existing Apple production signing credentials and provisioning profile are active for the correct team through 3 October 2027.
- Actual signed IPA inspection confirmed version 1.0.12/build 47, matching bundle and Apple team, production APNs entitlement, compiled native SecureStore, production API, remote session revocation handling, and the new payroll readiness and setup action. No secret literal was detected in the shipped Hermes bundle.
- Signed IPA SHA-256: `d5d6fae23551440ba8fd834bfdc2c071cb89b5debf2ed901b3bcdc8275fc1d3a` (17,977,089 bytes).
- Shipped Hermes bundle SHA-256: `2bffef816e3a9869fb30f3445a84012d1ad1061210abbc2c22027f92c022ceb8` (5,047,293 bytes).

Expo Doctor reported newer SDK 55 patch versions, as it did for build 46. This release retains the tested pinned dependencies and version-specific notification patch; the cloud build continued into native compilation after that advisory.

## Delivery limits

The destination is the existing internal TestFlight groups. Group access was checked read-only without querying tester identities. No external beta review, new tester invitation, group setting change, App Store review, or public release was performed. This report does not claim specific-account membership, receipt of a real notification/email, or an installation test on an iPhone. No Apple security interaction was needed.

Vercel deployment is handled separately after successful TestFlight upload. No Stripe setting or customer booking was changed by this iOS release task.
