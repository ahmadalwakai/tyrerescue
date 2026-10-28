# bOnline call management — local implementation

Prepared locally for Assisted Chat 1.0.12 source. No app build, deployment,
production migration, outbound provider call or GitHub push was performed.

## What is implemented

- **Follow-ups:** a durable inbound call ledger creates a task only when a
  complete provider terminal snapshot explicitly establishes no answer. Admins
  can claim their own task, release it or resolve it with a note. Concurrent
  claims cannot both win. The main screen displays open/overdue counts; overdue
  means 15 minutes since task creation. Polling runs every 30 seconds in the
  foreground. These are in-app alerts, not new push notifications.
- **Attribution and reporting:** when a verified incoming call supplies the
  draft's phone, saving its quote or final booking creates a server-validated
  link. Changing the phone clears that provenance. Session/workspace changes
  invalidate it; restored drafts do not restore the ephemeral source. A saved
  draft can also be linked explicitly from bOnline Calls. Phone matching alone
  never creates a conversion. Quote links follow their canonical quick booking
  into its final booking. Conflicting prior links are rejected.
- **Outbound calling:** a separate business-call action, confirmed by the
  operator, uses an audited server adapter. It remains disabled until this
  account's API access is verified and provisioned. See
  [outbound setup](bonline-outbound.md). Existing device-call actions remain
  labeled separately; the bOnline action never substitutes a personal call.

## Local migration order before a future authorized deployment

1. `scripts/bonline-call-events.sql`
2. `scripts/bonline-call-management.sql`
3. `scripts/bonline-call-attribution.sql`

The migrations are additive and repeatable. The webhook writer requires the
first two together. The third references the existing bookings and admin quotes
tables. Apply migrations before releasing the new server/mobile routes. No
runtime auto-migration is performed. Historical short-lived feed rows are not
invented as missed calls or backfilled as attributed sales; complete reporting
starts with events observed by the new durable writer.

## Reporting definitions

Reports select calls first received in the last 7, 30 or 90 rolling days and
show the linked sales/payment evidence known when the report runs. This is a
call-cohort report, not a period cash-flow report. Quote/booking conversion is
the proportion of calls with a corresponding link; quote/booking totals count
unique saved records. Revenue counts unique linked bookings once, even if
several calls link to the same booking.

Received GBP money includes confirmed deposits, balance payments, cash and
manual receipts. Canonical and legacy Stripe evidence is deduplicated; recorded
refunds are subtracted without double-counting matching ledger refunds. A quote
amount or a booking marked paid without receipt evidence contributes no
revenue. “Bookings with money received” includes partially paid bookings.

An ended event without explicit unanswered evidence remains unknown. Verified
answer evidence wins over earlier missed events and automatically resolves an
open missed-call task. An answered call is not proof of a paid booking.
Provider call IDs identify records; transfers/ring groups may expose multiple
legs. Conversation-level deduplication is not claimed without verified provider
conversation identifiers. No old Virtual Landline CSV data is used.

## API and access

All mobile routes require an authenticated admin and the configured bOnline
scope/allowlist. Responses use private/no-store caching.

- `GET /api/mobile/admin/phone/calls`: bounded cursor pagination, outcome and
  follow-up filters (`open` includes pending/claimed), current admin ID, and
  scope-wide open/overdue summary.
- `PATCH /api/mobile/admin/phone/calls/[id]/follow-up`: claim/release/resolve.
- `POST /api/mobile/admin/phone/calls/[id]/link`: optional saved `quoteId` and/or
  final `bookingId`, at least one required; validates the caller number.
- `GET /api/mobile/admin/phone/analytics?days=7|30|90`.
- `GET/POST /api/mobile/admin/phone/outbound`: see outbound documentation.

No raw provider payloads or provider credentials are included in the mobile
ledger. Durable customer numbers, follow-up notes, attribution and audit rows
remain admin-only. Existing 24-hour pruning applies only to the live popup feed.

## Validation

Tests exercise the actual SQL in local PGlite, HTTP route authorization,
out-of-order events, duplicate receipts/refunds, conflicting links, concurrent
claims, outbound idempotency and simulated provider errors. Mobile tests cover
scope changes, stale confirmations, attribution retries, popup presentation and
disabled outbound capability. An installed iPhone/provider end-to-end test
requires the later authorized server release and app build.

The mobile TypeScript check and a scoped TypeScript program containing the
bOnline backend modules/routes/tests pass. The repository-wide TypeScript
command also includes unrelated nested projects/tests and reports diagnostics
there; it is not recorded as passing.
