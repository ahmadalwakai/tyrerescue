# B2B Stock API — Contract Documentation

## Purpose

The B2B Stock API allows approved tyre partners and external B2B clients to read
stock availability, check tyre availability by size, and reserve stock atomically.
Access is controlled entirely by the admin team via API keys generated in the
admin panel at `/admin/b2b-api-keys`.

---

## Authentication

All B2B endpoints require an API key in the `Authorization` header:

```
Authorization: Bearer tr_b2b_live_<64-hex-chars>
```

There is no other authentication method. Web sessions, Google OAuth, and mobile
JWT tokens are not accepted on `/api/b2b/*` routes.

### Key format

```
tr_b2b_live_<64 hex characters>
```

Example (not a real key):
```
tr_b2b_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
```

Only the **key prefix** (e.g. `tr_b2b_live_a1b2c3d4`) is stored visibly in the
admin panel. The full key is shown **once only** at creation and is never stored
in plaintext anywhere.

---

## Admin generation flow

1. Navigate to `/admin/b2b-api-keys`.
2. Click **+ New API Key**.
3. Fill in client details (company name, contact, notes).
4. Select scopes and platforms.
5. Set rate limit and optional expiry.
6. Review the **access preview** which shows exactly what the key can and cannot access.
7. Click **Generate Key**.
8. **Copy the key immediately** — it is shown once only.
9. The key prefix is stored for future identification.

---

## Scopes

Each key must be granted explicit scopes. No scope grants wildcard access.

| Scope | What it allows |
|---|---|
| `stock:read` | List available tyre stock (brand, size, season, quantity) |
| `stock:availability:read` | Check availability for a specific tyre size |
| `stock:prices:read` | Include tyre selling price in responses |
| `stock:reserve` | Reserve stock items atomically |
| `stock:movement:read` | Read stock movement / audit trail |
| `stock:sync:read` | Stock sync read for app integrations |

Prices are **always hidden** unless `stock:prices:read` is explicitly granted.

---

## Platform flags

Each key is also constrained to specific platforms:

| Flag | Description |
|---|---|
| `admin_web` | Admin web application |
| `android_admin_app` | Android admin app (assisted-chat-app) |
| `android_mobile_app` | Android mobile customer app |
| `android_driver_app` | Android driver app |
| `external_b2b_api` | External B2B API partner |

Platform enforcement is server-side. A key granted `android_mobile_app` cannot be
used on `external_b2b_api` endpoints even if the bearer token is valid.

---

## Endpoints

### GET /api/b2b/stock

List available tyre stock.

**Required scope:** `stock:read`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number (default: 1) |
| `perPage` | integer | Results per page, max 100 (default: 50) |
| `search` | string | Search by brand, pattern, or size |
| `width` | integer | Filter by tyre width (e.g. 205) |
| `rim` | integer | Filter by rim size (e.g. 16) |
| `season` | string | `allseason`, `summer`, or `winter` |

**Example request:**

```bash
curl -H "Authorization: Bearer tr_b2b_live_<key>" \
     "https://www.tyrerescue.uk/api/b2b/stock?width=205&rim=16&season=summer"
```

**Example response (200):**

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "brand": "Michelin",
      "pattern": "Pilot Sport 4",
      "sizeDisplay": "205/55R16",
      "width": 205,
      "aspect": 55,
      "rim": 16,
      "season": "summer",
      "speedRating": "V",
      "loadIndex": 91,
      "runFlat": false,
      "isLocalStock": true,
      "availableQty": 4,
      "priceNew": "89.99",
      "updatedAt": "2026-01-01T12:00:00Z"
    }
  ],
  "page": 1,
  "perPage": 50,
  "totalCount": 12,
  "totalPages": 1
}
```

Note: `priceNew` is only included when `stock:prices:read` scope is granted.

---

### GET /api/b2b/stock/availability

Check availability for a specific tyre size.

**Required scope:** `stock:availability:read`

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `size` | string | Yes | Tyre size e.g. `205/55R16` |

**Example request:**

```bash
curl -H "Authorization: Bearer tr_b2b_live_<key>" \
     "https://www.tyrerescue.uk/api/b2b/stock/availability?size=205%2F55R16"
```

**Example response — available (200):**

```json
{
  "ok": true,
  "available": true,
  "totalQty": 6,
  "matches": [
    {
      "id": "uuid",
      "brand": "Michelin",
      "pattern": "Pilot Sport 4",
      "sizeDisplay": "205/55R16",
      "season": "summer",
      "runFlat": false,
      "isLocalStock": true,
      "availableQty": 4,
      "updatedAt": "2026-01-01T12:00:00Z"
    }
  ]
}
```

**Example response — not available (200):**

```json
{
  "ok": true,
  "available": false,
  "totalQty": 0,
  "matches": []
}
```

---

### POST /api/b2b/stock/reserve

Reserve stock atomically. The reservation prevents overselling and holds the
stock until it expires.

**Required scope:** `stock:reserve`

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `tyreId` | string (UUID) | Yes | ID from `/api/b2b/stock` |
| `quantity` | integer | Yes | Number to reserve (1–1000) |
| `reference` | string | Yes | Your reference number (stored in audit log) |
| `expiryMinutes` | integer | No | Reservation lifetime in minutes (default: 60, max: 10080) |

**Example request:**

```bash
curl -X POST \
     -H "Authorization: Bearer tr_b2b_live_<key>" \
     -H "Content-Type: application/json" \
     -d '{"tyreId":"uuid","quantity":2,"reference":"ORDER-123","expiryMinutes":120}' \
     "https://www.tyrerescue.uk/api/b2b/stock/reserve"
```

**Example response — success (200):**

```json
{
  "ok": true,
  "reservationId": "uuid",
  "tyreId": "uuid",
  "sizeDisplay": "205/55R16",
  "brand": "Michelin",
  "quantity": 2,
  "stockAfter": 2,
  "expiresAt": "2026-01-01T14:00:00Z",
  "reference": "ORDER-123"
}
```

**Example response — insufficient stock (409):**

```json
{
  "ok": false,
  "error": {
    "code": "insufficient_stock",
    "message": "Insufficient stock: 1 available, 2 requested"
  }
}
```

The reservation is atomic and race-safe. Concurrent requests for the same product
cannot both succeed if there is insufficient stock.

---

## Error responses

All errors follow this format:

```json
{
  "ok": false,
  "error": {
    "code": "string",
    "message": "Human-readable description"
  }
}
```

| HTTP status | Code | Meaning |
|---|---|---|
| 401 | `missing_api_key` | No `Authorization: Bearer` header |
| 401 | `invalid_api_key` | Key not found or invalid format |
| 403 | `key_suspended` | Key is suspended |
| 403 | `client_inactive` | Client account is not active |
| 403 | `insufficient_scope` | Key does not have the required scope |
| 403 | `platform_not_allowed` | Platform not permitted for this key |
| 404 | `product_not_found` | Tyre product not found or unavailable |
| 409 | `insufficient_stock` | Not enough stock to fulfil reservation |
| 410 | `key_revoked` | Key has been permanently revoked |
| 410 | `key_expired` | Key has passed its expiry date |
| 422 | `product_unavailable` | Product exists but is not available for reservation |
| 429 | `rate_limited` | Too many requests — slow down |
| 500 | `internal_error` | Server error — do not retry immediately |

---

## What the B2B API CAN return

- Tyre brand, pattern, size, season, speed rating, load index
- Whether the tyre is run-flat or local stock
- Available quantity (physical stock minus active reservations)
- Selling price **only when `stock:prices:read` scope is granted**
- Reservation ID and expiry on successful reserve

---

## What the B2B API CANNOT return

- Customer names, emails, addresses, phone numbers
- Booking details, booking reference numbers
- Payment amounts, Stripe IDs, card details
- SMS messages or conversation content
- Driver names, locations, or private data
- Admin user details
- Internal supplier costs or purchase prices
- Any write or delete operation on stock (only reservation is allowed)

These restrictions are enforced server-side and cannot be bypassed by any client
regardless of scope.

---

## Security notes

- Keys are generated using 32 cryptographically-secure random bytes (64 hex chars).
- Only the SHA-256 hash of the key is stored in the database. The raw key is
  displayed once and then discarded.
- Rate limiting is enforced per key using the audit log (DB-backed, accurate on
  serverless deployments).
- All authentication rejections and successful API calls are written to the audit log.
- IP address and user-agent are logged for forensics (not returned to callers).
- Revoked keys are immediately rejected — there is no grace period.
- Suspended keys are immediately rejected.
- Expired keys are immediately rejected.

---

## Key rotation rules

1. Generate a new key via the admin panel.
2. Update your integration to use the new key.
3. Revoke the old key via the admin panel once the new key is confirmed working.

There is no automatic rotation. Keys do not auto-rotate.

---

## Revocation rules

- Only admin users can revoke keys.
- Revoking a client revokes all its keys simultaneously.
- Revoked keys are permanently rejected — they cannot be reactivated.
- Suspension is reversible (admin can reactivate). Revocation is not.

---

## Android integration notes

### Current Android apps and stock access

| App | Uses stock API | Auth method |
|---|---|---|
| `assisted-chat-app` | Yes | Admin session / Bearer JWT (existing flow) |
| `driver-app` | No | N/A |
| `admin-alert-android` | No | FCM only |

The `assisted-chat-app` (Android admin app) uses the existing admin-authenticated
mobile endpoints (`/api/mobile/admin/stock/*`) and does **not** need a B2B API key.
B2B keys are intended for **external partners**, not internal admin apps.

### If an external app needs B2B stock access

1. Admin generates a B2B key with the appropriate scopes and platform flags.
2. The key is delivered to the external app securely at runtime (e.g. via your
   own secure backend). **Never hardcode a real key into an APK.**
3. The app includes the key in every request: `Authorization: Bearer <key>`.
4. Handle all error codes listed above, especially 401/403/410/429.

### Error handling checklist for Android clients

- `401` → Key missing or invalid: prompt user or contact admin
- `403 key_suspended` / `403 client_inactive` → Show "access suspended" UI
- `410 key_revoked` → Show "access revoked, contact support" UI
- `410 key_expired` → Show "key expired, contact admin" UI
- `429` → Back off and retry after the `Retry-After` header value
- `404` → Product not found; refresh stock list
- `409` → Insufficient stock; show "not available" UI
- Network error → Show offline/retry UI

---

## Manual QA checklist

Use this checklist if no automated tests are present.

### Key management

- [ ] Admin can open `/admin/b2b-api-keys` without error
- [ ] Empty state shows "No B2B API keys yet"
- [ ] Click "+ New API Key" opens create modal
- [ ] Submitting empty form shows validation errors on required fields
- [ ] Access preview appears after selecting scopes/platforms
- [ ] Access preview shows denied items correctly
- [ ] Submitting valid form calls POST and shows raw key modal
- [ ] Raw key is displayed in the modal (format: `tr_b2b_live_...`)
- [ ] Copy button copies the key to clipboard
- [ ] Closing the modal without copying warns / key is gone
- [ ] Raw key is NOT visible after reopening the page or detail view
- [ ] List shows client name, status, key count, last used, created date
- [ ] Suspend button changes status to "suspended"
- [ ] Suspended key is rejected with 403 `key_suspended`
- [ ] Reactivate button changes status back to "active"
- [ ] Reactivated key works again
- [ ] Revoke button (with confirmation) changes status to "revoked"
- [ ] Revoked key is rejected with 410 `key_revoked`
- [ ] Revoke cannot be undone (no reactivate option shown)
- [ ] Detail page shows scopes, platforms, rate limit, expiry, audit log

### B2B stock API

```bash
# Set your test key
KEY="tr_b2b_live_<paste key here>"
BASE="https://www.tyrerescue.uk"
```

- [ ] Missing key returns 401:
  ```bash
  curl $BASE/api/b2b/stock
  # Expect: {"ok":false,"error":{"code":"missing_api_key",...}}
  ```

- [ ] Invalid key returns 401:
  ```bash
  curl -H "Authorization: Bearer invalid" $BASE/api/b2b/stock
  ```

- [ ] Valid key with stock:read returns stock list:
  ```bash
  curl -H "Authorization: Bearer $KEY" $BASE/api/b2b/stock
  ```

- [ ] Prices hidden without stock:prices:read:
  Verify `priceNew` is absent in response when scope not granted.

- [ ] Prices visible with stock:prices:read:
  Verify `priceNew` appears in response when scope is granted.

- [ ] Availability check returns available/not-available:
  ```bash
  curl -H "Authorization: Bearer $KEY" "$BASE/api/b2b/stock/availability?size=205%2F55R16"
  ```

- [ ] Reserve with valid data returns reservationId:
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d '{"tyreId":"<id from stock list>","quantity":1,"reference":"QA-001"}' \
    $BASE/api/b2b/stock/reserve
  ```

- [ ] Reserve with quantity > stock returns 409 insufficient_stock

- [ ] Reserve with unknown tyreId returns 404

- [ ] Suspended key returns 403 key_suspended

- [ ] Revoked key returns 410 key_revoked

- [ ] Key with `stock:read` only cannot access `stock:reserve`:
  ```bash
  # POST to /api/b2b/stock/reserve with a key that only has stock:read
  # Expect: 403 insufficient_scope
  ```

- [ ] Audit log in detail page shows entries after API calls

- [ ] Existing booking/pricing/payment/driver flows still work after deploying
