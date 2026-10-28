# bOnline outbound calling: local implementation

This adapter is **disabled by default**. The existing inbound webhook secret is
not a call-origination credential. Retained local account metadata establishes
webhook provisioning only; it does not establish an outbound API host, access
token, origin line, or the account's permission to originate calls.

The adapter implements Wazo's documented `POST /1.0/calls`, requiring
`calld.calls.create`, `X-Auth-Token`, and a server-selected user/line and dialplan
context. A 201 response means initiation was accepted, not that the customer
answered. This is not evidence that bOnline exposes that API to this account.

References:

- [Wazo application API](https://wazo-platform.org/documentation/api/application.html)
- [Wazo call API schema](https://github.com/wazo-platform/wazo-calld/blob/master/wazo_calld/plugins/calls/api.yml)

## Prerequisites before activation

Obtain provider-confirmed account access, HTTPS API base URL, tenant, authorized
token, outbound dialplan context, and the bOnline user/line belonging to each
admin. Confirm that this route accepts E.164 destination numbers and that the
assigned line presents the company's intended caller ID. Caller ID is not
overridden by this implementation.

Apply the reviewed `scripts/bonline-call-management.sql` migration after
`scripts/bonline-call-events.sql`. No migration or provider call is performed by
reading capability status. Do not activate unless both configuration and
provider entitlement have been verified.

Server configuration names (no values are committed):

| Variable | Meaning |
| --- | --- |
| `BONLINE_OUTBOUND_ENABLED` | Must explicitly equal `true`; absent/false disables all initiation. |
| `BONLINE_OUTBOUND_PROVIDER` | Must equal `wazo`. |
| `BONLINE_OUTBOUND_PROVIDER_VERIFIED` | Must explicitly equal `true` only after account verification. |
| `BONLINE_OUTBOUND_API_BASE_URL` | Provider-confirmed HTTPS base ending in `/1.0` or `/api/calld/1.0`; public DNS host, standard HTTPS port, no query/credentials. |
| `BONLINE_OUTBOUND_API_TOKEN` | Server-only Wazo authentication token with the approved call-creation permission; never reuse the inbound webhook secret. |
| `BONLINE_OUTBOUND_TENANT_UUID` | Verified provider tenant. |
| `BONLINE_OUTBOUND_ADMIN_ORIGINS` | JSON object keyed by authenticated app admin ID, each value `{ "userUuid": "provider-user-uuid", "lineId": 123, "context": "provider-confirmed-context" }`. No default shared origin. |

The token's renewal/rotation remains an operational prerequisite. This adapter
does not use browser credentials, silently acquire extra permissions, or fall
back to the device's personal phone line.

## Mobile contract

Authenticated `GET /api/mobile/admin/phone/outbound` returns
`{ enabled, reason, message }`. It reveals no provider credentials or origin IDs.

Authenticated `POST` requires JSON
`{ phone, idempotencyKey, confirmed: true, bookingId?, sourceCallId? }`.
`idempotencyKey` and optional `bookingId` are UUIDs. `sourceCallId` is a bounded
provider call ID. Optional IDs are audit annotations, not automatic conversion
attribution. The app must obtain the operator's explicit call action and retain
the same key when checking/retrying an uncertain request. The server accepts
ordinary UK 01/02/03 landlines and 071–075/077–079 mobiles, excluding the company's
own number. International, service, premium, internal and SIP dial strings are
not supported by this first implementation.

- 202: `{ attemptId, status: "accepted"|"pending"|"unknown", message, replayed }`.
- 502: definite provider rejection, `status: "failed"` with a safe `reason`.
- 409: an idempotency key was reused with different call details.
- 429: fixed-window limit, with `Retry-After: 30`.
- 503: disabled/unprovisioned capability or unavailable durable audit storage.

The database reserves one attempt per admin and provider scope in each 30-second
window. Two requests near a window boundary can be closer than 30 seconds.
Unique constraints arbitrate retries and concurrent server instances. Each
attempt records actor, destination, request hash, optional context, outcome,
provider call ID when known, and timestamps before any network request occurs.
Credentials and provider error bodies are never written to this audit.

Timeouts, ambiguous responses, and audit-update failures are not retried at the
provider. A durable pending/unknown attempt requires checking the assigned
bOnline phone before an operator explicitly starts a new request. Keep the
idempotency records long enough to cover client retries; deleting them can
remove duplicate-call protection. Recording/transcription is outside this
adapter's scope.
