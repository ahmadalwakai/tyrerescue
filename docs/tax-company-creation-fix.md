# Tax company creation: verified profile, not an HTTP success message

The supplied iOS build 44 screenshot shows `Company Created` followed by
`undefined has been saved`. The diagnostic fields report no captured JavaScript
exception, which does not prove a successful database write.

A read-only unauthenticated GET of
`https://www.tyrerescue.uk/api/admin/tax/companies` returned a 404 HTML response
on 21 October 2026. The observed deployment was
`dpl_8ZR7nxgMXKihATSfGpxQwLYm5MSX`; its source commit does not contain this route.
This confirms the Tax API is missing from that deployment. It does not establish
the exact response body that the installed build received at screenshot time.
No customer or company records were created or changed during this check.

## Client changes

- Company lists and profiles are runtime-validated against the existing flat
  profile/list contracts. HTML, `{ok:true}`, missing names, invalid identifiers,
  and incompatible response envelopes cannot produce a success notification.
- Creation is unavailable until a valid company list permits it. Missing API
  routes show a server-update explanation, rather than an empty creation form.
- A valid creation response must match the submitted company number, legal
  name, address and supplied optional details. It installs the company directly into the overview state without
  waiting for another list request that could fail after a successful save.
- Same-tick double taps share a synchronous write lock. A failed/lost response
  can reconcile against the current administrator's protected company list;
  it never automatically repeats POST or grants access to another account's
  existing company. No matching verified profile means no success alert.
- Empty optional fields are omitted before sending. Login/project changes,
  unmounts, and late requests cannot publish a company or a save alert into a
  different session.
- Product copy distinguishes a saved Assisted Chat profile from registering a
  company or filing with HMRC.
- The next overview request is also validated before rendering company tax
  statuses. HTML, missing status arrays or another company's profile produce
  an explanatory error and a Retry Overview button while retaining the saved
  company card. Older account/project/company responses cannot overwrite it.

## Server changes

`createCompany` previously called an interactive `db.transaction(callback)`.
The configured `drizzle-orm/neon-http` implementation throws before entering
that callback. Creation now uses one parameterized PostgreSQL writable CTE to
insert the company, founder access, initial revision, three unknown registration
statuses, and audit record atomically. A failure rolls back every related write.
Duplicate company numbers still return 409 without granting new membership.
Blank optional company email is accepted as null; invalid nonblank email remains
a validation error. No database migration is required by this focused fix.

## Verification and release limits

Permanent isolated client tests execute the actual hook, response validators and
API adapter. API/validation tests check the flat response contract and the real
native form payload. An in-memory PostgreSQL suite executes migration 0026 and
the actual service/route SQL, including atomic rollback, duplicate creation,
cross-account isolation, and concurrent retries. All fetches in local tests
are isolated; no real company or customer data is used.

The subsequent monthly payroll change replaces the incompatible transaction
callbacks for company updates, registration declarations and the core payroll
setup/review/finalisation services with scoped Neon WebSocket transactions.
It adds actual employee deductions and immutable finalised results; see
[monthly PAYE implementation and release limits](monthly-payroll-liability.md).
This is still not a complete tax filing product: unsupported payroll cases are
blocked, VAT and Corporation Tax have separate data requirements, and live HMRC
submission is disabled.

Development verification did not create or change a real company. The later
authorised 21 October 2026 release applied the required production schema,
delivered Assisted Chat 1.0.12 (46) to internal TestFlight, and deployed the Tax
API to www.tyrerescue.uk. Its live unauthenticated response is now JSON 401,
rather than the prior 404 HTML. No authenticated real company creation was
performed during release checks. Build 44 must be updated through TestFlight.
See [the release record](releases/tyrerescue-production-2026-10-21.md).
