/**
 * Rate-limiting helpers for the proxy (proxy.ts).
 * Extracted here so unit tests can import them without pulling in
 * Next.js / NextAuth dependencies.
 *
 * Buckets go through checkRateLimit(), so they are shared across all
 * serverless instances when Upstash Redis is configured and fall back to
 * per-instance memory otherwise. (A Map in this module alone would give
 * every instance its own quota, which an attacker bypasses by spreading
 * requests across cold starts.)
 */

import { checkRateLimit, _resetRateLimitForTests, type RateLimitConfig } from './rate-limit';

const PROXY_LIMIT: RateLimitConfig = { limit: 20, windowMs: 60_000 };

const RATE_LIMITED_PREFIXES: Array<{ prefix: string; bucket: string }> = [
  { prefix: '/api/auth/',            bucket: 'auth' },
  { prefix: '/api/bookings/create',  bucket: 'booking-create' },
  { prefix: '/api/bookings/quote',   bucket: 'booking-quote' },
  { prefix: '/api/driver/location',  bucket: 'driver-location' },
];

export function normalizeIp(raw: string): string {
  return raw.replace(/^\[|\]$/g, '').toLowerCase();
}

export async function checkProxyRateLimit(
  ip: string,
  pathname: string,
  method: string,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  // OAuth callback must never be rate-limited — even if the bucket is full.
  if (method === 'GET' && pathname === '/api/auth/callback/google') {
    return { limited: false, retryAfterSeconds: 0 };
  }

  // NextAuth GET endpoints (session, csrf, providers) are harmless reads that
  // occur on every page load. Counting them against the auth credential quota
  // would lock out legitimate users after normal browsing.
  if (method === 'GET' && pathname.startsWith('/api/auth/')) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const match = RATE_LIMITED_PREFIXES.find((p) => pathname.startsWith(p.prefix));
  if (!match) return { limited: false, retryAfterSeconds: 0 };

  const result = await checkRateLimit(`proxy-${match.bucket}:${ip}`, PROXY_LIMIT);
  return { limited: !result.ok, retryAfterSeconds: result.retryAfterSeconds };
}

export function resetProxyRateLimitForTests(): void {
  _resetRateLimitForTests();
}
