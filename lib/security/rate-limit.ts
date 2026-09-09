/**
 * Hybrid rate limiter: uses Upstash Redis when UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN are present, otherwise falls back to a
 * best-effort in-memory implementation.
 *
 * Redis mode is shared across all serverless instances — a determined
 * attacker cannot bypass it by hitting different cold-starts.
 *
 * In-memory mode is per-instance and remains useful as a defence-in-depth
 * layer when Redis is not configured.
 *
 * Buckets are keyed by `${routeKey}:${ip}` so a single IP is limited
 * per-route, not globally.
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

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

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

function checkRateLimitInMemory(key: string, cfg: RateLimitConfig): RateLimitResult {
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

// ---------------------------------------------------------------------------
// Redis-backed limiter (lazy-initialised)
// ---------------------------------------------------------------------------

// Ratelimit instances are cached per (limit, windowMs) combination.
let redisLimiterCache: Map<string, import('@upstash/ratelimit').Ratelimit> | null = null;
let redisClient: import('@upstash/redis').Redis | null | false = false; // false = not yet checked

async function getRedisLimiter(
  cfg: RateLimitConfig,
): Promise<import('@upstash/ratelimit').Ratelimit | null> {
  if (redisClient === false) {
    // First call — try to initialise
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      try {
        const { Redis } = await import('@upstash/redis');
        redisClient = new Redis({ url, token });
        redisLimiterCache = new Map();
      } catch {
        redisClient = null;
      }
    } else {
      redisClient = null;
    }
  }

  if (!redisClient || !redisLimiterCache) return null;

  const cacheKey = `${cfg.limit}:${cfg.windowMs}`;
  if (!redisLimiterCache.has(cacheKey)) {
    const { Ratelimit } = await import('@upstash/ratelimit');
    redisLimiterCache.set(
      cacheKey,
      new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(cfg.limit, `${cfg.windowMs} ms`),
        prefix: '@tr/rl',
      }),
    );
  }
  return redisLimiterCache.get(cacheKey)!;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Increment and check the bucket for the given key.
 * Returns `ok: false` (and does NOT increment) when the limit is exceeded.
 *
 * Prefers Redis when UPSTASH_REDIS_REST_URL / _TOKEN are set;
 * otherwise falls back to in-memory.
 */
export async function checkRateLimit(key: string, cfg: RateLimitConfig): Promise<RateLimitResult> {
  const limiter = await getRedisLimiter(cfg);

  if (limiter) {
    const result = await limiter.limit(key);
    return {
      ok: result.success,
      remaining: result.remaining,
      retryAfterSeconds: result.success
        ? 0
        : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  }

  return checkRateLimitInMemory(key, cfg);
}

/**
 * Conservative per-route defaults. Tune per-route, not globally.
 */
export const RATE_LIMITS = {
  // ---- public forms ----
  contact:          { limit: 5,  windowMs: 10 * 60_000 },
  callback:         { limit: 5,  windowMs: 10 * 60_000 },
  bookingQuote:     { limit: 12, windowMs: 10 * 60_000 },
  bookingCreate:    { limit: 3,  windowMs: 10 * 60_000 },
  validateLocation: { limit: 30, windowMs: 60_000 },
  quoteCalculate:   { limit: 30, windowMs: 60_000 },
  vehicleLookup:    { limit: 30, windowMs: 60_000 },
  locationShare:    { limit: 10, windowMs: 10 * 60_000 },
  sms:              { limit: 3,  windowMs: 15 * 60_000 },
  coverageCheck:    { limit: 20, windowMs: 60_000 },
  analyticsEvent:   { limit: 60, windowMs: 60_000 },

  // ---- auth ----
  login:            { limit: 8,  windowMs: 15 * 60_000 },
  register:         { limit: 5,  windowMs: 60 * 60_000 },
  forgotPassword:   { limit: 5,  windowMs: 15 * 60_000 },

  // ---- admin internals ----
  adminAddAdminPin: { limit: 5,  windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

/** Test-only: clear all in-memory buckets. Not exported by the default index. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
  lastCleanupAt = 0;
}
