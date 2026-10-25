# TyreRescue production release — 21 October 2026

Status: **Complete.** Assisted Chat 1.0.12 (46) is available for internal
TestFlight testing, the required production schema is applied, and the
verified Vercel release is live on both production domains.

The authorised order is Assisted Chat iOS build, TestFlight submission, then
Vercel deployment. No public App Store review/release was requested.

## iOS

Assisted Chat **1.0.12 (46)** finished its native build and was uploaded at
03:23:06 UTC. Apple confirmed `VALID` / `IN_BETA_TESTING` at 03:26:37 UTC.
See [the signed application release record](assisted-chat-ios-46-2026-10-21.md).

## Server source and verification

The production domain initially resolved to deployment
`dpl_8ZR7nxgMXKihATSfGpxQwLYm5MSX`, from production source
`dd695eec136548319dcb434d4aa09581dfaba93c`. The release overlays the authorised
payment, booking notification, driver journey, persistent device session,
SEO and tax/payroll changes onto that exact baseline. Existing production
Caledonia validation and security behaviour are preserved. Unrelated Redis
branch work, AI receptionist changes, native app projects and private files
are excluded.

Local Next.js 16.2 production compilation, TypeScript, all 2,086 generated
pages and optimisation passed. Another 242 isolated tests ran against the
actual staged server source. Earlier application/financial checks include
401 unit/client tests, 109 synthetic PostgreSQL cases, 378 session/payment/
notification/journey tests, and the native notification startup checks.
Some suites overlap; these numbers must not be summed as unique coverage.

The actual CLI upload contains 928 real source files. Its authoritative
source SHA-256 is
`b18a66067aea804b9fbef0661f37c18f966d9772980ca4c0831dd0c296d2b76c`.
The deployment command's optional `releaseSourceSha256` metadata accidentally
contains a short placeholder; it is not evidence of the uploaded source.
The verified disk upload manifest and this full digest are authoritative.

Deployment: `dpl_A7gzwkpCWHiQcP2mPY9xZPAS3Az6`.
[Verified deployment](https://tyrerescue-jjfhed2gi-gorbalstyres-5277s-projects.vercel.app).
The candidate was built with Production variables and `--prod --skip-domain`,
then checked before promotion. Promotion completed at **03:35:16 UTC**
(04:35 BST). Both `www.tyrerescue.uk` and `tyrerescue.uk` resolve to this READY
deployment. The apex redirects to www; both pass HTTPS verification.

Post-promotion checks on the actual www domain passed at 03:35:46 UTC:

- Home, Isle of Skye and Glasgow pages return 200 with HTML and 10–15-minute
  response copy. The candidate's Portree page also passed before promotion.
- Tax companies, monthly liability, device sessions and driver journeys return
  JSON 401 without administrator authentication.
- Stripe requests with missing and invalid signatures return 400 before
  processing. No actual Stripe event was sent by these probes.
- A fresh read-only Stripe check confirms the original account readiness and
  exactly matching before/after destination configuration fingerprints.

## Production database and protected configuration

Migrations 0026–0032 were rehearsed twice on a separate Neon branch and then
committed atomically to production after TestFlight upload. The release uses
explicit source-hash migration records because the older 0026–0028 journal
timestamps would have been skipped by the normal timestamp-only migrator.
All seven applied markers match their source hashes. All required columns and
34 previously missing tables are present. The unrelated 0025 AI migration is
intentionally excluded.

Schema changes did not update existing bookings, payment records, quotes,
quick bookings, stock balances/reservations or push token rows. Their counts
were unchanged within the migration transaction.

A new 32-byte payroll field encryption key was generated in process and
stored in Vercel **Production Sensitive**. It was not printed, written as
plaintext to a file or included in either release. Existing secrets were
preserved. The isolated rehearsal branch is retained for audit with a
five-minute auto-suspend; production is separate.

## Stripe and device verification boundaries

A read-only Stripe check confirmed the production key and account readiness.
The TyreRescue destination and the separate Isle of Skye destination remain
enabled with their original event sets. No Stripe configuration was changed.
The before/after destination fingerprint matches:
`20d21cfab35d62de9ba31a671710aee051d74030235f97956e0c078100a8e675`.

Live smoke probes did not create bookings, charge money, finalise real
payroll, send customer messages or remove devices. An unsigned/invalid
signature probe only checks rejection; it is not delivery of a Stripe event.
Physical iPhone installation and notification arrival remain device tests.
Unassigned-driver background GPS improvements require the corresponding
driver app version; this release builds Assisted Chat only.
