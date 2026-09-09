import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { CoverageError, getCoverageForPostcode } from '@/lib/coverage';
import type { CoverageErrorResponse } from '@/types/coverage';
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  logSecurityRejection,
} from '@/lib/security';

export const runtime = 'nodejs';

const bodySchema = z.object({
  postcode: z.string().min(2).max(12),
});

function errorResponse(
  body: CoverageErrorResponse,
  status: number,
): NextResponse<CoverageErrorResponse> {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`coverage-check:${ip}`, RATE_LIMITS.coverageCheck);
  if (!rl.ok) {
    logSecurityRejection({ req: request, reason: 'rate_limited', route: '/api/coverage/check', status: 429, routeKey: 'coverage-check' });
    return NextResponse.json(
      { error: 'Too many requests — please slow down.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' } },
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
