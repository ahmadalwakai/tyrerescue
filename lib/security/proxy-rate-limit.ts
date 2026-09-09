/**
 * Pure rate-limiting helpers for the Edge middleware (proxy.ts).
 * Extracted here so unit tests can import them without pulling in
 * Next.js / NextAuth dependencies.
 */

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;

const RATE_LIMITED_PREFIXES: Array<{ prefix: string; bucket: string }> = [
  { prefix: '/api/auth/',            bucket: 'auth' },
  { prefix: '/api/bookings/create',  bucket: 'booking-create' },
  { prefix: '/api/bookings/quote',   bucket: 'booking-quote' },
  { prefix: '/api/driver/location',  bucket: 'driver-location' },
];

export function normalizeIp(raw: string): string {
  return raw.replace(/^\[|\]$/g, '').toLowerCase();
}

export function checkProxyRateLimit(
  ip: string,
  pathname: string,
  method: string,
): { limited: boolean; retryAfterSeconds: number } {
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

  const key = `${match.bucket}:${ip}`;
  const now = Date.now();
  const entry = rateMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (entry.count >= RATE_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { limited: true, retryAfterSeconds };
  }

  entry.count += 1;
  return { limited: false, retryAfterSeconds: 0 };
}

export function resetProxyRateLimitForTests(): void {
  rateMap.clear();
}

// Periodic cleanup — runs inside the Edge runtime only.
// Safe to call in Node.js test environments too (setInterval is available).
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateMap) {
    if (now > val.resetAt) rateMap.delete(key);
  }
}, 5 * 60_000);
