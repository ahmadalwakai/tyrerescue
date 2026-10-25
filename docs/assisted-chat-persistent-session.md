# Assisted Chat persistent administrator sign-in

Administrator sign-in has no automatic age or inactivity deadline. Closing or
restarting the app, going into the background, a network error, or a generic 401
response does not remove the saved device session. A failed storage read opens
a retry screen and preserves saved credentials. Explicit sign-out, including
administrator removal of a specific device, remains available.

## Server

- Assisted Chat opts in with `persistentSession: true` on the existing login
  endpoint. It receives a random, revocable device credential rather than the
  existing seven-day mobile JWT. The database stores only its SHA256 digest.
- Every authenticated request checks the credential, revocation state, and the
  current user's administrator role and verified email. Cached local profile
  data never grants API access by itself.
- `POST /api/mobile/admin/auth/session` can upgrade a still-valid old mobile
  credential without asking for a password. Already expired or revoked
  credentials cannot manufacture a new authenticated session.
- `POST /api/mobile/admin/auth/logout` revokes only the presented device
  credential and is idempotent. Other devices, web sessions, old mobile clients
  and driver JWT lifetime settings are unaffected.
- Durable credentials are sent in Authorization headers, including invoice
  downloads. They are rejected by the old invoice query-string fallback.

## Device

- Native credentials use Expo SecureStore with
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`; reading them does not prompt for Face ID.
  Each backend has its own stored envelope. The web client uses its existing
  browser storage separately.
- Existing plaintext storage is migrated only after successful secure storage.
  Storage errors and malformed records are preserved for explicit recovery.
- A durable, nonsecret sign-out marker prevents a credential from restoring if
  native deletion fails. If even that marker cannot be persisted, the app shows
  a retry state instead of reporting successful sign-out.
- Multiple route hooks share one session revision and snapshot. Late hydration,
  login or upgrade responses cannot undo explicit sign-out or a project change.
- Notification cleanup is bounded so a stalled network request cannot prevent
  the administrator's explicit sign-out. Remote revocation is best effort while
  offline; the local sign-out marker does not wait for network availability.

## Release

The authorised 21 October 2026 release applied `0030_admin_device_sessions.sql`
and `0031_admin_device_session_activity.sql` to production and delivered
Assisted Chat 1.0.12 (46), including native SecureStore, to internal TestFlight.
The new server is live on www.tyrerescue.uk. Install build 46 to receive the
native storage and device-management changes. No real account was signed in,
signed out or removed as part of the release tests. See
[the release record](releases/tyrerescue-production-2026-10-21.md).

Local verification covers cryptographic validation, long inactivity, explicit
per-device revocation, protected routes, storage failures and rollback, old
responses, session/project isolation, and notification cleanup. Physical-device
relaunch and background verification remain release checks.

## Devices and activity

`More → Devices & sessions` lists the signed-in administrator's own durable
sessions, including a badge for the current device. It shows session creation,
last password sign-in, last foreground app activity, last authenticated server
contact, and removal time separately. Missing historical timestamps remain
"Not recorded". A legacy credential upgraded without a password does not invent
a password sign-in time. Legacy JWT and browser-cookie sessions are not device
sessions and are not included in this list.

Expandable details include the available device name/model, platform, OS/app
version, and first/last observed IP address. Device descriptions are untrusted
display labels, not authentication identities; no hardware identifier is
collected. IP addresses describe network connections rather than precise
locations. Times are displayed in Europe/London, including GMT/BST.

The shared app session sends one heartbeat per minute while in the foreground,
with an immediate heartbeat on foreground entry. The server records its own
clock rather than client timestamps. API authentication updates last server
contact at most once a minute. "Active recently" means foreground activity
within two minutes and is not a guaranteed online indicator. The device list
refreshes every 30 seconds while open and active, showing up to 100 sessions,
with the current device first and removed sessions retained in the list for
30 days.

`GET /api/mobile/admin/auth/devices` exposes no credentials, hashes or user agent.
`DELETE /api/mobile/admin/auth/devices/[id]` requires the owning administrator,
revokes just the selected session, and removes its associated push registrations
atomically. Recipient queries also exclude revoked or mismatched associated
sessions and linked owners who no longer have verified administrator access.
Unlinked legacy push registrations and other accounts/devices remain
independent. This controls registered device delivery; existing Android FCM
topic broadcasts are a separate channel and are not remotely unsubscribed by
deleting a device registration.

Removal immediately blocks subsequent authenticated server requests. An offline
device sees the sign-out notice when it next contacts the server in the
foreground. The client accepts remote sign-out only from the heartbeat's
explicit revocation code matching the same credential/session UUID; unrelated
401s, outages, stale responses and project changes cannot trigger it. Native
removal confirmation and fresh server checks protect against deleting the wrong
session. Removing the current device is an explicit sign-out action.

Local isolated verification covers account isolation, exact-secret revocation,
missing history, heartbeat lifecycle and stale responses, removal confirmation,
per-device push preservation, and actual PostgreSQL statements/migrations in an
in-memory database. No production device was removed and no real push was sent.
