import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.hoisted runs before any imports and before vi.mock factories, so these
// refs are available inside mock factory functions.
const { fakeLimitFn } = vi.hoisted(() => ({ fakeLimitFn: vi.fn() }));

// Declare module-level mocks BEFORE importing the module under test.
// Vitest hoists these to the top so dynamic `await import('@upstash/redis')`
// calls inside rate-limit.ts receive the mocked implementations.
//
// In-memory tests never trigger these mocks because initRedis() short-circuits
// when UPSTASH_REDIS_REST_URL / TOKEN env vars are absent.
// Vitest 4.x requires `mockImplementation` with a class (not an arrow fn or
// mockReturnValue) when the mock is called with `new`. We use `vi.hoisted`
// so `fakeLimitFn` is available inside the factory closures.
vi.mock('@upstash/redis', () => ({
  Redis: class {},
}));
vi.mock('@upstash/ratelimit', () => {
  const limitFn = fakeLimitFn;
  return {
    Ratelimit: class Ratelimit {
      limit = limitFn;
      static slidingWindow() { return 'sliding'; }
    },
  };
});

import {
  checkRateLimit,
  _resetRateLimitForTests,
  RATE_LIMITS,
} from '../../security/rate-limit';
import {
  normalizeIp,
  checkProxyRateLimit,
  resetProxyRateLimitForTests,
} from '../../security/proxy-rate-limit';

// ---------------------------------------------------------------------------
// In-memory rate limiter (no env vars → Redis is never attempted)
// ---------------------------------------------------------------------------

describe('checkRateLimit (in-memory fallback)', () => {
  beforeEach(() => {
    _resetRateLimitForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('allows requests up to the limit', async () => {
    const cfg = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit('test:1.2.3.4', cfg);
      expect(result.ok).toBe(true);
    }
  });

  it('blocks the request that exceeds the limit', async () => {
    const cfg = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) await checkRateLimit('test:1.2.3.4', cfg);
    const result = await checkRateLimit('test:1.2.3.4', cfg);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('computes accurate Retry-After (within 2s of window)', async () => {
    vi.useFakeTimers();
    const windowMs = 30_000;
    const cfg = { limit: 1, windowMs };
    await checkRateLimit('test:1.2.3.4', cfg);
    vi.advanceTimersByTime(500);
    const result = await checkRateLimit('test:1.2.3.4', cfg);
    expect(result.ok).toBe(false);
    // After 500ms of a 30s window, ~29.5s remain → rounds up to 30.
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(28);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(30);
    vi.useRealTimers();
  });

  it('does not count blocked requests against the quota', async () => {
    const cfg = { limit: 2, windowMs: 60_000 };
    await checkRateLimit('test:1.2.3.4', cfg);
    await checkRateLimit('test:1.2.3.4', cfg);
    const r3 = await checkRateLimit('test:1.2.3.4', cfg);
    const r4 = await checkRateLimit('test:1.2.3.4', cfg);
    expect(r3.ok).toBe(false);
    expect(r4.ok).toBe(false);
  });

  it('resets the bucket after the window expires', async () => {
    vi.useFakeTimers();
    const cfg = { limit: 2, windowMs: 1_000 };
    await checkRateLimit('test:1.2.3.4', cfg);
    await checkRateLimit('test:1.2.3.4', cfg);
    expect((await checkRateLimit('test:1.2.3.4', cfg)).ok).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect((await checkRateLimit('test:1.2.3.4', cfg)).ok).toBe(true);
    vi.useRealTimers();
  });

  it('keeps independent counters per route key', async () => {
    const cfg = { limit: 2, windowMs: 60_000 };
    await checkRateLimit('auth:1.2.3.4', cfg);
    await checkRateLimit('auth:1.2.3.4', cfg);
    expect((await checkRateLimit('auth:1.2.3.4', cfg)).ok).toBe(false);

    // A different route key for the same IP must still have its own quota.
    expect((await checkRateLimit('booking:1.2.3.4', cfg)).ok).toBe(true);
  });

  it('different IPs on the same route are independent', async () => {
    const cfg = { limit: 1, windowMs: 60_000 };
    await checkRateLimit('auth:1.1.1.1', cfg);
    expect((await checkRateLimit('auth:1.1.1.1', cfg)).ok).toBe(false);
    expect((await checkRateLimit('auth:2.2.2.2', cfg)).ok).toBe(true);
  });

  it('handles 10 concurrent requests correctly (5 allowed, 5 blocked)', async () => {
    const cfg = { limit: 5, windowMs: 60_000 };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkRateLimit('concurrent:1.2.3.4', cfg)),
    );
    const allowed = results.filter((r) => r.ok).length;
    const blocked = results.filter((r) => !r.ok).length;
    expect(allowed).toBe(5);
    expect(blocked).toBe(5);
  });

  it('in-memory instances do not share counters (per-serverless-instance isolation)', async () => {
    const cfg = { limit: 2, windowMs: 60_000 };
    await checkRateLimit('test:1.2.3.4', cfg);
    await checkRateLimit('test:1.2.3.4', cfg);
    expect((await checkRateLimit('test:1.2.3.4', cfg)).ok).toBe(false);

    // Simulate a new serverless cold-start: fresh in-memory state means the
    // counter resets — demonstrating that in-memory does NOT share quota.
    _resetRateLimitForTests();
    expect((await checkRateLimit('test:1.2.3.4', cfg)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Storage failure guard
// ---------------------------------------------------------------------------

describe('checkRateLimit storage-failure fallback', () => {
  beforeEach(() => {
    _resetRateLimitForTests();
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    fakeLimitFn.mockReset();
    fakeLimitFn.mockRejectedValue(new Error('Redis connection refused'));
  });

  afterEach(() => {
    _resetRateLimitForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.restoreAllMocks();
  });

  it('attempts Redis before falling back to in-memory', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cfg = { limit: 2, windowMs: 60_000 };

    await checkRateLimit('login:1.2.3.4', cfg);

    // The mocked Redis limiter must have been called.
    expect(fakeLimitFn).toHaveBeenCalled();
  });

  it('logs console.error for sensitive keys when Redis fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cfg = { limit: 2, windowMs: 60_000 };

    await checkRateLimit('login:1.2.3.4', cfg);

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[rate-limit]'),
      expect.anything(),
    );
  });

  it('logs console.warn (not error) for non-sensitive keys when Redis fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cfg = { limit: 20, windowMs: 60_000 };

    await checkRateLimit('coverageCheck:1.2.3.4', cfg);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[rate-limit]'),
      expect.anything(),
    );
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('falls back to in-memory and still enforces limits when Redis.limit() throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cfg = { limit: 2, windowMs: 60_000 };

    // Should not throw; degrades gracefully.
    const r1 = await checkRateLimit('login:1.2.3.4', cfg);
    expect(r1.ok).toBe(true);

    // In-memory still enforces the limit after the Redis fallback.
    await checkRateLimit('login:1.2.3.4', cfg);
    const blocked = await checkRateLimit('login:1.2.3.4', cfg);
    expect(blocked.ok).toBe(false);
  });

  it('does not throw when Redis is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cfg = { limit: 5, windowMs: 60_000 };
    await expect(checkRateLimit('login:1.2.3.4', cfg)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RATE_LIMITS constants
// ---------------------------------------------------------------------------

describe('RATE_LIMITS', () => {
  it('has limit > 0 and windowMs > 0 for every entry', () => {
    for (const [name, cfg] of Object.entries(RATE_LIMITS)) {
      expect(cfg.limit, `${name}.limit`).toBeGreaterThan(0);
      expect(cfg.windowMs, `${name}.windowMs`).toBeGreaterThan(0);
    }
  });

  it('defines all required auth and route buckets', () => {
    const keys = Object.keys(RATE_LIMITS);
    for (const expected of [
      'login', 'register', 'forgotPassword',
      'sms', 'coverageCheck', 'analyticsEvent',
      'bookingCreate', 'bookingQuote',
    ]) {
      expect(keys, `missing key: ${expected}`).toContain(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Proxy middleware helpers (pure, no Next.js dependencies)
// ---------------------------------------------------------------------------

describe('normalizeIp', () => {
  it('strips IPv6 brackets', () => {
    expect(normalizeIp('[::1]')).toBe('::1');
    expect(normalizeIp('[2001:db8::1]')).toBe('2001:db8::1');
  });

  it('lowercases the result', () => {
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('leaves plain IPv4 unchanged', () => {
    expect(normalizeIp('192.168.1.100')).toBe('192.168.1.100');
  });
});

describe('checkProxyRateLimit', () => {
  beforeEach(() => resetProxyRateLimitForTests());

  it('never rate-limits GET /api/auth/callback/google (OAuth callback)', () => {
    for (let i = 0; i < 50; i++) {
      const r = checkProxyRateLimit('1.2.3.4', '/api/auth/callback/google', 'GET');
      expect(r.limited).toBe(false);
    }
  });

  it('never rate-limits GET /api/auth/session (NextAuth session reads)', () => {
    for (let i = 0; i < 50; i++) {
      const r = checkProxyRateLimit('1.2.3.4', '/api/auth/session', 'GET');
      expect(r.limited).toBe(false);
    }
  });

  it('never rate-limits GET /api/auth/csrf (CSRF token fetch)', () => {
    for (let i = 0; i < 50; i++) {
      const r = checkProxyRateLimit('1.2.3.4', '/api/auth/csrf', 'GET');
      expect(r.limited).toBe(false);
    }
  });

  it('rate-limits POST /api/auth/signin after RATE_LIMIT requests', () => {
    const ip = '10.0.0.1';
    for (let i = 0; i < 20; i++) {
      checkProxyRateLimit(ip, '/api/auth/signin', 'POST');
    }
    const result = checkProxyRateLimit(ip, '/api/auth/signin', 'POST');
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('Retry-After is based on actual window, not hardcoded', () => {
    vi.useFakeTimers();
    const ip = '10.0.0.2';
    for (let i = 0; i < 21; i++) {
      checkProxyRateLimit(ip, '/api/auth/signin', 'POST');
    }
    vi.advanceTimersByTime(1_000);
    const result = checkProxyRateLimit(ip, '/api/auth/signin', 'POST');
    // 1s into a 60s window: ~59s remain.
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(58);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    vi.useRealTimers();
  });

  it('keeps independent per-route buckets (auth flooding does not block driver/location)', () => {
    const ip = '10.0.0.3';
    for (let i = 0; i < 21; i++) {
      checkProxyRateLimit(ip, '/api/auth/signin', 'POST');
    }
    expect(checkProxyRateLimit(ip, '/api/auth/signin', 'POST').limited).toBe(true);
    expect(checkProxyRateLimit(ip, '/api/driver/location', 'POST').limited).toBe(false);
  });

  it('does not rate-limit unmatched paths', () => {
    const r = checkProxyRateLimit('1.2.3.4', '/api/contact', 'POST');
    expect(r.limited).toBe(false);
  });

  it('different IPs have independent counters', () => {
    for (let i = 0; i < 21; i++) {
      checkProxyRateLimit('1.1.1.1', '/api/auth/signin', 'POST');
    }
    expect(checkProxyRateLimit('1.1.1.1', '/api/auth/signin', 'POST').limited).toBe(true);
    expect(checkProxyRateLimit('2.2.2.2', '/api/auth/signin', 'POST').limited).toBe(false);
  });
});
