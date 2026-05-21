import { NextResponse } from 'next/server';
import type { RateLimitResult } from './rate-limit';

/**
 * Standard JSON shapes returned by the anti-abuse layer.
 * Always include `ok: false` and a stable `code` so clients can branch.
 */

export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: 'Too many attempts. Please try again shortly.',
      code: 'RATE_LIMITED',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'Cache-Control': 'no-store',
      },
    },
  );
}

export function suspiciousSubmissionResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: 'We could not process this request. Please try again.',
      code: 'SUSPICIOUS_SUBMISSION',
    },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function validationErrorResponse(
  fieldErrors: Record<string, string[] | undefined>,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: 'Please check the form and try again.',
      code: 'VALIDATION_ERROR',
      fieldErrors,
    },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );
}
