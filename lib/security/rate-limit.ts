/**
 * Lightweight in-memory rate limiter.
 *
 * IMPORTANT: This is a BEST-EFFORT limiter. On Vercel / serverless / multi-instance
 * environments each function instance has its own memory, so a determined attacker
 * can defeat per-instance counters by hitting different cold starts. We intentionally
 * do not introduce Redis / Upstash / external services here — this is a small
 * defence-in-depth layer on top of validation + honeypots, not a hardened WAF.
 *
 * Buckets are keyed by `${routeKey}:${ip}` so a single IP is limited per-route,
 * not globally.
 */

export interface RateLimitConfig {
  /** Maximum number of attempts allowed in the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the bucket resets. Always >= 1 when ok=false. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60_000;

function maybeCleanup(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Increment and check the bucket for the given key.
 * If the call would exceed `limit`, returns `ok: false` and does NOT increment.
 */
export function checkRateLimit(key: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + cfg.windowMs });
    return { ok: true, remaining: cfg.limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= cfg.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return { ok: true, remaining: cfg.limit - existing.count, retryAfterSeconds: 0 };
}

/**
 * Conservative per-route defaults. Picked to keep normal humans well under the cap
 * while making bot loops obvious. Tune per-route, not globally.
 */
export const RATE_LIMITS = {
  contact: { limit: 5, windowMs: 10 * 60_000 },
  callback: { limit: 5, windowMs: 10 * 60_000 },
  bookingQuote: { limit: 12, windowMs: 10 * 60_000 },
  bookingCreate: { limit: 3, windowMs: 10 * 60_000 },
  validateLocation: { limit: 30, windowMs: 60_000 },
  quoteCalculate: { limit: 30, windowMs: 60_000 },
  vehicleLookup: { limit: 30, windowMs: 60_000 },
  locationShare: { limit: 10, windowMs: 10 * 60_000 },
  sms: { limit: 3, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

/** Test-only: clear all buckets. Not exported by default index. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
  lastCleanupAt = 0;
}
