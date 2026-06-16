---
description: "B2B Stock API development context for Tyre Rescue. Provides the test API key, endpoint reference, scope list, and error codes so Copilot can write correct integration code without guessing."
name: "B2B Stock API (Tyre Rescue)"
argument-hint: "Optional focus (e.g. 'write a stock check', 'handle errors', 'test the reserve endpoint')"
agent: "agent"
model: ["Claude Sonnet 4.5 (copilot)", "GPT-5 (copilot)"]
---

# Role

Act as a backend integration engineer working against the Tyre Rescue B2B Stock API. Use only the endpoints, key format, scopes, and error codes defined below — do not invent alternatives.

---

# Test API key (local dev only — localhost:3002)

```
tr_b2b_live_ee456c1e9beaa71e4bae5b30db17237a9696f58e63f809f27fbb7ca09221268a
```

**Scopes active on this key:** `stock:read`, `stock:prices:read`, `stock:reserve`

This key is for local development and QA only. It points to the local database on `localhost:3002`. Do not use this key against the production URL.

All requests must include:
```
Authorization: Bearer tr_b2b_live_ee456c1e9beaa71e4bae5b30db17237a9696f58e63f809f27fbb7ca09221268a
```

---

# Base URLs

| Environment | Base URL |
|---|---|
| Local dev | `http://localhost:3002` |
| Production | `https://www.tyrerescue.uk` |

---

# Endpoints

## GET /api/b2b/stock
**Scope required:** `stock:read`

Query params: `page`, `perPage` (max 100), `search`, `width`, `rim`, `season` (`allseason`/`summer`/`winter`)

Returns paginated tyre stock. `priceNew` is only included when `stock:prices:read` is granted.

## GET /api/b2b/stock/availability?size=205%2F55R16
**Scope required:** `stock:availability:read`

Returns `{ ok, available, totalQty, matches[] }`.

## POST /api/b2b/stock/reserve
**Scope required:** `stock:reserve`

Body: `{ tyreId: string, quantity: number, reference: string, expiryMinutes?: number }`

Returns `{ ok, reservationId, tyreId, sizeDisplay, brand, quantity, stockAfter, expiresAt, reference }`.

---

# Error codes

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `missing_api_key` | No Authorization header |
| 401 | `invalid_api_key` | Key not found or wrong format |
| 403 | `key_suspended` | Key suspended |
| 403 | `client_inactive` | Client account inactive |
| 403 | `insufficient_scope` | Key lacks the required scope |
| 403 | `platform_not_allowed` | Platform flag not set on this key |
| 404 | `product_not_found` | Tyre ID not found or unavailable |
| 409 | `insufficient_stock` | Not enough stock to reserve |
| 410 | `key_revoked` | Key permanently revoked |
| 410 | `key_expired` | Key past expiry date |
| 422 | `product_unavailable` | Product exists but unavailable for reservation |
| 429 | `rate_limited` | Too many requests — honour `Retry-After` header |
| 500 | `internal_error` | Server error |

All errors follow: `{ ok: false, error: { code: string, message: string } }`

---

# What the API cannot return

Customer PII, booking details, payment data, driver info, admin user data, supplier costs. These are enforced server-side regardless of scope.

---

# Route files (local codebase)

- `app/api/b2b/stock/route.ts` — stock list
- `app/api/b2b/stock/availability/route.ts` — availability check
- `app/api/b2b/stock/reserve/route.ts` — atomic reservation
- `lib/b2b/auth.ts` — `validateB2BApiKey(request, scope)` middleware
- `docs/b2b-stock-api.md` — full contract documentation
