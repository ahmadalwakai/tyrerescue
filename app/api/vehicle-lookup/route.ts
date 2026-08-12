import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  checkRateLimit,
  getClientIp,
  logSecurityRejection,
  RATE_LIMITS,
  rateLimitedResponse,
} from '@/lib/security';
import { lookupVrm } from '@/lib/dvla';

const regSchema = z
  .string()
  .min(2)
  .max(10)
  .transform((v) => v.replace(/\s+/g, '').toUpperCase());

export async function GET(request: NextRequest) {
  // Light per-IP rate limit. DVLA is a paid third-party — we don't want bots
  // to drain the quota.
  const ip = getClientIp(request);
  const rl = checkRateLimit(`vehicle-lookup:${ip}`, RATE_LIMITS.vehicleLookup);
  if (!rl.ok) {
    logSecurityRejection({
      req: request,
      reason: 'rate_limited',
      route: '/api/vehicle-lookup',
      status: 429,
      routeKey: 'vehicle-lookup',
    });
    return rateLimitedResponse(rl);
  }

  const reg = request.nextUrl.searchParams.get('reg');

  const parsed = regSchema.safeParse(reg);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid registration' },
      { status: 400 }
    );
  }

  try {
    const result = await lookupVrm(parsed.data);
    if (!result.ok) {
      const httpStatus = result.error.code === 'invalid_format' ? 400 : 200;
      return NextResponse.json(
        {
          ok: false,
          status: result.error.code === 'not_found' ? 'dvla_not_found' : 'dvla_unavailable',
          error: result.error.message,
          code: result.error.code,
        },
        { status: httpStatus },
      );
    }

    const vehicle = result.vehicle;
    return NextResponse.json({
      ok: true,
      status: 'dvla_resolved',
      make: vehicle.make || null,
      colour: vehicle.colour || null,
      fuelType: vehicle.fuelType || null,
      year: vehicle.yearOfManufacture?.toString() || null,
      engineSize: null,
    });
  } catch (err) {
    console.error('DVLA lookup error:', err);
    return NextResponse.json(
      { ok: false, status: 'dvla_unavailable', error: 'Vehicle lookup failed' },
      { status: 200 }
    );
  }
}
