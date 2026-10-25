# Payroll setup correction — Assisted Chat 1.0.12 (47)

Status: **Complete.** Assisted Chat 1.0.12 (47) is available to the existing
internal TestFlight groups, and the corrected server is live on both production
domains. The isolated checks and all 11 public post-promotion probes pass.

## Problem and resulting behaviour

The saved company profile existed, but payroll had not been explicitly
activated. Founders initially receive company capabilities; payroll read access
is granted by activation. The monthly endpoint previously required payroll
read access first, returning a generic 404 which installed build 46 described
as an unavailable server feature. The same sequence was missed by the earlier
unauthenticated production smoke checks.

The server now returns company-scoped setup guidance before activation, without
querying employee, pay run, payment or adjustment records. Tax liabilities and
remaining balances are null, and record actions are disabled. Activation still
requires the actual company founder's explicit action. Known company members
without active payroll access receive a clear 403; other accounts remain 404.
The inactive settings response keeps the exact build 46-compatible error pair.

Build 47 presents a payroll setup card and schedule action on the overview and
monthly screen, refreshes after navigation, and guides the user to employees
and their tax setup after explicit activation. Before activation it hides the
financial and payment history rows. A generic 404 never enables activation.
Read-only payroll users cannot edit the schedule. A last-working-day option is
available without typing a minus sign on the iPhone numeric keyboard.

Registration labels now show **Not recorded** for unknown internal declarations,
with an explanation that this does not determine HMRC registration. Saving a
company profile or activating a local schedule does not register with HMRC.
No registration status or real payroll data was inferred or changed.

## Verification before deployment

- 414 unit/client tests passed across 16 files, including 13 real-screen
  authenticated onboarding scenarios with synthetic responses.
- Full isolated PostgreSQL suite: 119 passed. The enhanced setup suite then
  passed 11 tests, including actual persistent-device authentication and
  server-to-client decoder bridges. These counts overlap.
- 242 payment, booking notification, device session and driver journey tests
  passed against the actual isolated release source.
- Application and tax/server TypeScript, scoped ESLint, native notification
  contract and iOS startup configuration checks passed.
- Local Next.js 16.2 production build, TypeScript and 2,086 static pages passed.
- A SELECT-only service probe ran the exact staged source against the saved
  production company: setup required, founder activation allowed, all eight
  liability values null, empty financial histories, and record flags false.
  Three SELECT requests ran; no writes or authentication credentials were
  created. The actual archived build 46 decoder accepted its response.

No physical iPhone UI test is claimed. The authenticated lifecycle was tested
in isolated PostgreSQL with actual device-token authentication and synthetic
users and companies. Published HTTP probes verify rejection of unauthenticated
requests; they do not impersonate the real company founder.

## Release source and boundaries

The server artifact starts from the exact currently deployed release
`dpl_A7gzwkpCWHiQcP2mPY9xZPAS3Az6`, adding one readiness service and changing six
related payroll files. Existing payment, notification, booking, SEO, security
and Caledonia integration source is otherwise identical. Unrelated working
branch changes are not part of the artifact.

The actual Vercel CLI upload manifest contains 929 real files, SHA-256:
`10ecb4f70c5a926314ff91771644bb0a62426eb80fcaa584aa680b1642fbfd52`.
No private environment files, protected values or native application projects
are uploaded. The sole driver-app file is the existing pure shared time helper.
The separate filesystem manifest includes .gitignore, which Vercel excludes;
the actual CLI upload manifest is authoritative.

This correction needs no database migration or environment-variable changes.
It does not activate the production company, add employees, finalise payroll,
record payments, charge cards or send customer messages. Stripe configuration
and secrets are unchanged. A real monthly PAYE/NI liability still requires the
actual employee tax setup, earnings, and reviewed/finalised pay runs. VAT and
Corporation Tax remain separate from this PAYE/NI summary.

## Completed delivery and published checks

Assisted Chat **1.0.12 (47)** built successfully at 11:37:12 UTC and the exact
IPA was uploaded to App Store Connect at 11:38:52 UTC. Apple confirmed
**VALID / IN_BETA_TESTING** at 11:41:42 UTC, with access for the existing
internal groups `ty` and `ts`. No external beta review or invitations were
requested. See [the signed iOS release report](assisted-chat-ios-47-2026-10-21.md).

EAS build: `2bef59bf-7775-4627-b7d2-6bc27d0d3813`.
Submission: `bf55f959-c275-4f3a-94b4-e018a848b2a4`.
IPA SHA-256: `d5d6fae23551440ba8fd834bfdc2c071cb89b5debf2ed901b3bcdc8275fc1d3a`.

Vercel candidate creation began after successful TestFlight upload.
Deployment: `dpl_FguHXKnqM9DkX8QPK8GMkUxCZBtn`.
[Verified deployment](https://tyrerescue-p0s9swfzy-gorbalstyres-5277s-projects.vercel.app).
The production candidate used Production variables and `--prod --skip-domain`;
11 checks passed before promotion. The first test harness used a nonexistent
Portree city URL; correcting it to the existing
`/mobile-tyre-fitting/isle-of-skye/portree` route resolved that probe without
any website code change. The initial evidence is retained separately.

Promotion completed at **11:43:16 UTC (12:43 BST)**. Both
[www.tyrerescue.uk](https://www.tyrerescue.uk) and the apex resolve to the new
READY deployment. Direct public HTTPS probes, without deployment-protection
bypass, passed all 11 checks at 11:43:46 UTC:

- Company, monthly liability, payroll settings, devices and driver journeys
  reject unauthenticated access with JSON 401.
- Missing and invalid Stripe signatures return 400 before processing. These
  are rejection probes, not an actual Stripe delivery or payment test.
- Home, Isle of Skye, Portree and Glasgow return HTML 200; response-time
  copy remains 10–15 minutes.
- Fresh read-only Stripe verification confirms a valid account and enabled
  destinations with the exact original configuration fingerprint:
  `20d21cfab35d62de9ba31a671710aee051d74030235f97956e0c078100a8e675`.

No release blocker remains. The saved company still needs the user's explicit
payroll schedule and real employee/earnings setup to produce a calculated
monthly liability. No production payroll activation or tax payment was made.

Ignored evidence files: `root-payroll47-{deployment-receipt,promotion-receipt,
verification-summary,upload-manifest,public-smoke,candidate-smoke}.json`,
`monthly-setup-readonly-runtime-evidence-20261021.json` and
`ios47-release-result.json`, all under `.vercel/`.
