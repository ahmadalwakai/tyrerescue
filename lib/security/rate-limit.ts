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
// Redis-backed limiter (lazy-initialised, Promise singleton to prevent races)
// ---------------------------------------------------------------------------

// @upstash/redis@1.38.4 uses fetch() internally with NO built-in request
// timeout. We race every limiter.limit() call against this value so a stalled
// Redis connection cannot block a serverless invocation indefinitely.
const REDIS_LIMIT_TIMEOUT_MS = 5_000;

// Keys whose prefix indicates an auth or sensitive operation. When Redis
// falls back for these, shared cross-instance enforcement is lost — log at
// ERROR so monitoring alerts fire rather than just emitting a warning.
const SENSITIVE_KEY_PREFIXES = ['login:', 'register:', 'forgotPassword:', 'sms:'];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PREFIXES.some((p) => key.startsWith(p));
}

// Ratelimit instances are cached per (limit, windowMs) combination.
let redisLimiterCache: Map<string, import('@upstash/ratelimit').Ratelimit> | null = null;
// null  = Redis unavailable (env missing or init failed)
// false = not yet attempted
// Redis = initialised client
let redisClient: import('@upstash/redis').Redis | null | false = false;

// Promise-based singleton: prevents concurrent first-requests from
// racing to initialise two separate Redis clients.
let initPromise: Promise<import('@upstash/redis').Redis | null> | null = null;

async function initRedis(): Promise<import('@upstash/redis').Redis | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    return new Redis({ url, token });
  } catch (err) {
    // Init failure: ALL instances fall back to independent in-memory limiters.
    // A determined attacker hitting different cold-starts can exceed the
    // intended global quota until Redis recovers.
    console.warn(
      '[rate-limit] Redis init failed — all instances operating with per-instance ' +
      'in-memory enforcement (no shared quota):',
      err,
    );
    return null;
  }
}

async function getRedisLimiter(
  cfg: RateLimitConfig,
): Promise<import('@upstash/ratelimit').Ratelimit | null> {
  if (redisClient === false) {
    // First call — use a shared Promise to avoid the init race.
    if (!initPromise) {
      initPromise = initRedis().then((client) => {
        redisClient = client;
        if (client) redisLimiterCache = new Map();
        return client;
      });
    }
    await initPromise;
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
 * falls back to in-memory on storage failure — NEVER silently allows
 * unlimited requests when Redis is configured but temporarily unreachable.
 *
 * Storage-failure policy:
 *   - Redis init failure  → all instances use independent in-memory buckets
 *   - Redis call failure  → this instance uses in-memory; other instances
 *                           continue using Redis (shared state partially lost)
 *   - Sensitive key fail  → escalated to console.error for monitoring alerts
 */
export async function checkRateLimit(key: string, cfg: RateLimitConfig): Promise<RateLimitResult> {
  const limiter = await getRedisLimiter(cfg);

  if (limiter) {
    let timerId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        limiter.limit(key),
        new Promise<never>((_, reject) => {
          timerId = setTimeout(
            () => reject(new Error(`Redis limit() timed out after ${REDIS_LIMIT_TIMEOUT_MS}ms`)),
            REDIS_LIMIT_TIMEOUT_MS,
          );
        }),
      ]);
      clearTimeout(timerId);
      return {
        ok: result.success,
        remaining: result.remaining,
        retryAfterSeconds: result.success
          ? 0
          : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      };
    } catch (err) {
      clearTimeout(timerId);
      // Runtime call failure: this instance falls back to in-memory.
      // In-memory still enforces limits locally but instances do NOT share
      // quota state until Redis recovers.
      const keyPrefix = key.split(':')[0];
      if (isSensitiveKey(key)) {
        console.error(
          `[rate-limit] Redis limit() failed for sensitive route "${keyPrefix}:" — ` +
          `shared enforcement lost; per-instance in-memory fallback active:`,
          err,
        );
      } else {
        console.warn(
          `[rate-limit] Redis limit() failed for "${keyPrefix}:" — ` +
          `falling back to per-instance in-memory enforcement:`,
          err,
        );
      }
    }
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
  redisClient = false;
  initPromise = null;
  redisLimiterCache = null;
}
