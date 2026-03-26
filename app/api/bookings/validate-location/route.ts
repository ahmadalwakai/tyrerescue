import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveDistance, type DistanceResult } from '@/lib/mapbox';
import { db } from '@/lib/db';
import { pricingRules } from '@/lib/db/schema';
import { parsePricingRules } from '@/lib/pricing-engine';
import { loadAvailableDriverDistanceCandidates } from '@/lib/driver-distance-candidates';

const validateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().optional(),
});

/**
 * POST /api/bookings/validate-location
 *
 * Driver-based distance validation.
 * Priority: nearest available driver → garage fallback.
 * Single source of truth for max distance: pricingRules.max_service_miles (default 190).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateLocationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { lat, lng } = validation.data;

    // Load pricing rules and available drivers in parallel.
    let rulesRows: Array<{ key: string; value: string }>;
    let driverCandidates: Array<{ id: string; lat: number; lng: number }>;

    try {
      const [r, d] = await Promise.all([
        db.select().from(pricingRules),
        loadAvailableDriverDistanceCandidates(),
      ]);
      rulesRows = r.map((row) => ({ key: row.key, value: row.value }));
      driverCandidates = d;
    } catch (dbError) {
      // DB query failed — allow garage fallback resolution.
      console.error('validate-location DB error (falling back):', dbError);
      rulesRows = [];
      driverCandidates = [];
    }

    const parsedRules = parsePricingRules(rulesRows);
    const maxServiceMiles = parsedRules.max_service_miles;

    // Resolve distance: driver → garage.
    const result: DistanceResult = await resolveDistance({ lat, lng }, driverCandidates);

    const distanceMiles = result.distanceMiles;
    const valid = distanceMiles <= maxServiceMiles;

    const nearestAreaName = 'Glasgow';

    console.log('[validate-location]', {
      lat, lng, distanceMiles: result.distanceMiles,
      source: result.distanceSource, provider: result.distanceProvider,
      driverId: result.selectedDriverId, maxServiceMiles, valid,
    });

    return NextResponse.json({
      valid,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      estimatedMinutes: result.durationMinutes ?? undefined,
      nearestArea: nearestAreaName,
      distanceSource: result.distanceSource,
      distanceProvider: result.distanceProvider,
      selectedDriverId: result.selectedDriverId,
      message: valid
        ? `Location is ${Math.round(distanceMiles)} miles from ${result.distanceSource === 'driver' ? 'nearest driver' : 'garage'}`
        : `We do not currently cover your area (${Math.round(distanceMiles)} miles). Call 0141 266 0690 to discuss.`,
    });
  } catch (error) {
    console.error('Location validation error:', error);
    // NEVER reject silently — if everything fails, allow with a warning
    return NextResponse.json({
      valid: true,
      distanceMiles: 0,
      nearestArea: 'Glasgow',
      message: 'Unable to verify distance — booking will be confirmed after manual review.',
      fallback: true,
    });
  }
}
