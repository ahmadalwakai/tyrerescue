import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { CoverageError, getCoverageForPostcode } from '@/lib/coverage';
import type { CoverageErrorResponse } from '@/types/coverage';

export const runtime = 'nodejs';

const bodySchema = z.object({
  postcode: z.string().min(2).max(12),
});

// ── Rate limiting ────────────────────────────────────────────────────────
// TODO: replace with Upstash / Redis once we have a shared instance. For
// now an in-memory token-bucket per IP is fine — the endpoint is cheap and
// only mutates a process-local Map.
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1_000;

interface IpBucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, IpBucket>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

function consumeRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_PER_MINUTE) return false;
  bucket.count += 1;
  return true;
}

function errorResponse(
  body: CoverageErrorResponse,
  status: number
): NextResponse<CoverageErrorResponse> {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!consumeRateLimit(ip)) {
    return errorResponse(
      { error: 'Too many requests — please slow down.', code: 'rate_limited' },
      429
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse({ error: 'Invalid JSON body.', code: 'invalid_postcode' }, 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse({ error: 'A postcode is required.', code: 'invalid_postcode' }, 400);
  }

  try {
    const result = await getCoverageForPostcode(parsed.data.postcode);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof CoverageError) {
      const status =
        err.code === 'invalid_postcode' ? 400 : err.code === 'not_found' ? 404 : 502;
      return errorResponse({ error: err.message, code: err.code }, status);
    }
    console.error('[api/coverage/check] unexpected', err);
    return errorResponse({ error: 'Unexpected server error.', code: 'unknown' }, 500);
  }
}
