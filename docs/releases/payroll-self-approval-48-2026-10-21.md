# Payroll self-approval — Assisted Chat 1.0.12 (48)

Status: **Complete.** Assisted Chat 1.0.12 (48) is available in the existing
internal TestFlight groups, and the corrected server is live on both
production domains. All 14 public post-promotion probes passed.

## Behaviour

An administrator with payroll approval permission can submit, review, explicitly
approve and finalise their own pay run. A different administrator remains an
optional reviewer. Submission, approval and finalisation remain separate actions.
Approval requires the visible **I reviewed these figures** confirmation;
finalisation retains its own confirmation. The existing protected settings
response confirms approval permission before the app enables either self-review
or another person's review. The API remains authoritative for permissions.

The server records the real submitter and reviewer identities and decision time.
The existing audit JSON adds `selfReviewed` and `approvalMode`; the Activity Log
identifies a payroll approved or rejected by its submitting administrator.
No database schema or environment-variable change is required.

Company isolation, review/run versions, calculation input hashes, transaction
locks, immutable finalised results, payroll ledger/YTD updates and retry safety
are retained. A changed calculation must be reviewed again. Repeated approval
or finalisation cannot duplicate the payroll liability. No permission is
implicitly granted by creating or submitting a run. The generic service's
separate-reviewer rule remains for VAT and Corporation Tax return types.

## Client and compatibility

The app removes the submitter/reviewer identity inequality from the payroll
review decoder while retaining identity, entity, state, timestamp and version
validation. The workspace permits the same authenticated user to review after
the server confirms their existing approval permission. Team-access wording
makes another administrator optional. The legacy review screen uses the same
workspace, calculation preview, permissions and confirmations.

Build **48** is required for this UI and for decoding self-approved reviews.
Build 47 retains the earlier different-reviewer restriction and should be
updated. Existing reviews approved by another user remain valid.

## Verified tests

- 425 Tax & Payroll unit/client tests passed across 17 files. The new 11
  screen/transport cases include self submit/confirm-approve/confirm-finalise,
  an optional different reviewer, cancellation without a write, read-only and
  invalid permission data, 403/409/changed-calculation failures and logout
  while a confirmation is open.
- 131 isolated PostgreSQL cases passed across six files. The new 11 cases use
  actual opaque device authentication and HTTP handlers for a synthetic full
  earnings-to-monthly-liability self-approval cycle. They cover revoked or
  missing permissions, account isolation, changed inputs, version conflicts,
  concurrency, duplicate finalisation, VAT/CT policy preservation and a
  different entity type presented to a payroll URL.
- Application and backend TypeScript and scoped ESLint passed. Native startup
  and notification checks are repeated before the signed application build.

These are synthetic tests. No real company's payroll was activated, approved,
rejected or finalised by the release work. No real wages or tax were paid.
Physical iPhone UI installation and push arrival are not claimed.

## Server release source

The isolated artifact starts from deployment
`dpl_FguHXKnqM9DkX8QPK8GMkUxCZBtn` and changes only four runtime files:
review service, payroll finalisation, the payroll review HTTP route, and audit
summaries. The actual CLI upload has 929 files, no added/removed source files,
and SHA-256:
`bf619a6f1fbb7aea5cc91eb06b1c0c503044c095c2dbb7a559a021a19198dc46`.

Private environment files and native app projects are excluded. The existing
shared pure driver time helper remains. No private value is embedded in source.
Stripe configuration, secrets and unrelated branch changes are outside this
patch. The authorised delivery order remains iOS build, exact-build TestFlight
upload, then Vercel candidate checks and customer-domain promotion.

The local Next.js production compilation, TypeScript and all 2,086 static pages
passed at `2026-10-21T18:24:26.246Z`. Native build ID:
`ce6de07a-be4b-4f8a-977f-f32596f7ed27`.

## Completed delivery

Assisted Chat **1.0.12 (48)** passed native build and signed-IPA inspection.
Its exact build was uploaded at **2026-10-21T19:05:10.071Z**. Apple
confirmed **VALID / IN_BETA_TESTING**, with explicit access for the existing
internal groups `ty` and `ts`. No external review or invitations were
requested. See [the signed application release report](assisted-chat-ios-48-2026-10-21.md).

EAS build: `ce6de07a-be4b-4f8a-977f-f32596f7ed27`.
Submission: `becf5a25-5e60-4955-9fad-a829043b0ac2`.
IPA SHA-256: `997098de9e4f4b87e6fcdacf0e689bcc1f1b4c6ae05389498fde604020fa11cf`.

After TestFlight upload, Vercel created the Production candidate using
`--prod --skip-domain` and the verified full source hash as deployment metadata.
All 14 candidate checks passed before promotion.

Deployment: `dpl_J3ifvd61WcWN2J9CJjjN8MzF9DzK`.
[Verified deployment](https://tyrerescue-1quwjln1v-gorbalstyres-5277s-projects.vercel.app).
Production promotion: **21 Oct 2026, 20:10:13 BST**
(`2026-10-21T19:10:13.839Z`). Both [www.tyrerescue.uk](https://www.tyrerescue.uk) and
the apex resolve to the new READY deployment.

All 14 direct public HTTPS probes passed at `2026-10-21T19:10:35.337Z`, without
deployment-protection bypass:

- Company, monthly liability, payroll settings, devices and journeys return
  JSON 401 without administrator authentication.
- Payroll review GET/PATCH and finalisation POST return JSON 401 without
  authentication. Synthetic UUIDs are used; no actual payroll is targeted.
- Missing and invalid Stripe signatures return 400 before processing. These
  rejection probes are not an actual Stripe delivery or a charge test.
- Home, Isle of Skye, Portree and Glasgow return HTML 200; SEO response-time
  wording remains 10–15 minutes.
- A fresh read-only Stripe check confirms the original account readiness and
  destination fingerprint `20d21cfab35d62de9ba31a671710aee051d74030235f97956e0c078100a8e675`.

No delivery blocker remains. Physical iPhone installation and push receipt
were not tested. No real payroll was created, approved or finalised during
release verification. The authenticated financial lifecycle was
validated using isolated PostgreSQL and synthetic opaque device credentials,
not by impersonating the real company founder.

Ignored evidence files under `.vercel/`: `root-payroll48-` deployment,
promotion, verification, upload and public/candidate smoke reports;
`ios48-release-result.json` contains the sanitised native delivery evidence.
