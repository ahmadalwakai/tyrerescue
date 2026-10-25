# Tyre Rescue Driver iOS 1.3.0 (20) — 22 October 2026

The production iOS build is available for internal TestFlight testing through the existing mp group. Following the user’s explicit request to submit to Apple, version 1.3.0 (20) was submitted for App Store review and is WAITING_FOR_REVIEW. Release is MANUAL, so Apple approval will not automatically publish this version. No external beta review or public release was requested.

## Exact release

| Item | Verified value |
| --- | --- |
| App / bundle | Tyre Rescue Driver / uk.tyrerescue.driver |
| Version / remote build | 1.3.0 / 20 |
| EAS project | c97a7bac-50da-42d8-9aef-3071d6b00925 |
| EAS build | df5f7c72-dbd8-4f51-a853-ac26df013886 |
| Native build completed, UTC | 2026-10-21T23:13:04.891Z |
| EAS submission | a60f728c-dd18-4cf9-9264-c53f9713702a |
| Upload completed, UTC | 2026-10-21T23:13:53.751Z |
| Apple app / build | 6784984848 / 3a27713a-4710-4b4b-8ff2-baccfca3486d |
| Apple processing / internal state | VALID / IN_BETA_TESTING |
| Internal group | mp / 0f73f561-a6fe-4b51-a37d-57a39d0434fc; existing group, exact new build association verified |
| Apple availability checked, UTC | 2026-10-21T23:23:33.776Z |
| Production API | https://www.tyrerescue.uk |

[EAS build](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue/builds/df5f7c72-dbd8-4f51-a853-ac26df013886) · [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6784984848/testflight/ios)

## Validation and release controls

- Root's frozen-source preflight passed native TypeScript and scoped ESLint, 109 navigation tests, and 40 session/location tests. Root also confirmed the deployed server and protected navigation provider checks before TestFlight submission.
- App-only archive: 108 files, 2229740 bytes. No env files, local credentials, private signing material, previous IPAs/APKs, build logs, screenshots, Android files, or other app sources. Archive matched the frozen local sources; the lockfile was preserved.
- Production iOS export passed. Signed IPA inspection confirms the exact bundle/team/version/build, production API URL, native SecureStore, Face ID, location and notification modules, Always-location permission, background location mode, production push entitlement, and Apple MapKit. Five release strings for Face ID/session/tracking/payment/map behavior are present in the shipped Hermes bundle. Known Stripe/private-key secret literal scans passed.
- The old Driver profile was invalid and its EAS certificate association was missing. One new Driver-only App Store profile was created using the already-valid, unchanged distribution certificate, and the exact Driver signing association was repaired. No certificate/key was created, revoked, or rotated; no existing profile was revoked and no other app credentials were changed.
- The existing internal group mp already grants access to all builds. Its association with this exact Apple build was checked. No tester identities, invitations, group settings, external beta review, or App Store review were changed.

## Artifact integrity

| Artifact | SHA-256 / fingerprint |
| --- | --- |
| Signed IPA (19686298 bytes) | aaefb3246b50265deb3c1fd33c98262ff7d7d1d4872afad29c1919a101b0b38a |
| Shipped Hermes bundle (5408421 bytes) | abd9e5fe523bb9c4678b48692295e46e8e27707a0e9b1068d0a3dd25fcd55981 |
| Frozen source manifest | dd716ee7e3804f7025507f5e5b6dd4ac13d0955f942ebfb89e28a7c596780e27 |
| package-lock.json | a3d2f2c8f2a7f07800bf260ef7a3910ec79a09bcee4a2a596799d966b14f45f2 |
| EAS fingerprint | 9b4c78211a198426be78fa7226feccd9e6cb660c |

Protected raw release evidence remains in ignored .vercel/driver13-* files; no private keys, token values, or expiring build-log links are included here.

## App Store review submission

| Item | Verified value |
| --- | --- |
| App Store version | 1.3.0 / 85daa7c6-cd79-42d4-960f-f1c7550da5c5 |
| Exact selected build | 20 / 3a27713a-4710-4b4b-8ff2-baccfca3486d |
| Review submission | b33b46a6-565a-4b55-8727-14ddfdef60ca |
| Submitted, UTC | 2026-10-21T23:42:46.729Z |
| Version / review submission state | WAITING_FOR_REVIEW / WAITING_FOR_REVIEW |
| Release method | MANUAL; no public release requested |
| Independent Apple readback, UTC | 2026-10-21T23:43:43.054Z |
| Approved screenshots retained | 15, all COMPLETE; screenshot content matched the previous approved version |

The existing App Review demo account passed production Driver login with HTTP 200 at 2026-10-21T23:42:03.910Z. Persistent-session creation was explicitly disabled; credentials and the returned token were neither printed nor saved. No customer data was queried and no booking, payment, driver-status, or location update was made.

Approved en-GB metadata, screenshots, contact/demo credentials, category, age declaration, content rights, privacy and availability settings were preserved. New release notes describe navigation, background sharing, saved sign-in with Face ID, payment status, and driver controls. Review notes explain Always location permission, Online sharing between jobs, Offline/sign-out stopping sharing, and an enrolled Face ID iPhone for testing the privacy lock. No new binary upload was needed.

The modern reviewSubmissions flow completed the actual submitted:true request. A subsequent read-only Apple query confirmed WAITING_FOR_REVIEW, exact version/build linkage, MANUAL release, complete screenshots, review contact/demo credential presence, and release notes. Apple returned no missing-field validation blocker. Legacy privacy-label/availability SDK endpoints were unavailable, so no new declarations or availability changes were made.

[App Store Connect](https://appstoreconnect.apple.com/apps/6784984848). Sanitized proof: .vercel/driver13-appstore-submission-proof.json; sanitized demo-login result: .vercel/driver13-appreview-demo-login.json. No credential values or expiring links appear in these reports.

## Practical verification limit

Native build, signing, upload, Apple processing, module/permission inspection, and existing internal TestFlight availability are confirmed. A physical iPhone drive/lock-screen/background-location/Face ID/push test was not performed on this Windows release host. These device behaviors still need field verification after installing 1.3.0 (20), with the appropriate iPhone permissions enabled.
