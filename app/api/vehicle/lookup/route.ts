import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { lookupVrm, normalizeVrm } from '@/lib/dvla';
import { getTyreSizeForVehicle } from '@/lib/tyre-sizes';
import type { TyreSize, Vehicle, VrmErrorCode } from '@/types/vehicle';

export const runtime = 'nodejs';

const bodySchema = z.object({
  registrationNumber: z.string().min(2).max(10),
});

// In-memory rate limit per IP. TODO: swap for Upstash when available.
const RATE_LIMIT_PER_MINUTE = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
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

interface SuccessResponse {
  ok: true;
  vehicle: Vehicle;
  tyreSize: TyreSize | null;
}

interface ErrorResponse {
  ok: false;
  error: { code: VrmErrorCode; message: string };
}

export async function POST(request: NextRequest) {
  // Feature flag — server side too, in case the client ever bypasses gate.
  if (process.env.NEXT_PUBLIC_VRM_ENABLED !== 'true') {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: { code: 'disabled', message: 'VRM lookup is not enabled.' } },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  if (!consumeRateLimit(ip)) {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } },
      { status: 429 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: { code: 'invalid_format', message: 'Invalid JSON body.' } },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: { code: 'invalid_format', message: 'A registration is required.' } },
      { status: 400 }
    );
  }

  const result = await lookupVrm(normalizeVrm(parsed.data.registrationNumber));
  if (!result.ok) {
    const status =
      result.error.code === 'not_found'
        ? 404
        : result.error.code === 'invalid_format'
          ? 400
          : result.error.code === 'rate_limited'
            ? 429
            : result.error.code === 'upstream_error'
              ? 502
              : 500;
    return NextResponse.json<ErrorResponse>({ ok: false, error: result.error }, { status });
  }

  const tyreSize = getTyreSizeForVehicle(
    result.vehicle.make,
    result.vehicle.model,
    result.vehicle.yearOfManufacture
  );

  return NextResponse.json<SuccessResponse>(
    { ok: true, vehicle: result.vehicle, tyreSize },
    { status: 200 }
  );
}
