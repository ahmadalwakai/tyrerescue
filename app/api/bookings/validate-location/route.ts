import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveDistance, haversineDistanceMiles, SERVICE_CENTER, type DistanceResult } from '@/lib/mapbox';
import { db } from '@/lib/db';
import { serviceAreas, pricingRules, drivers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { parsePricingRules } from '@/lib/pricing-engine';

const validateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().optional(),
});

/**
 * POST /api/bookings/validate-location
 *
 * Driver-based distance validation.
 * Priority: nearest driver → nearest service area → SERVICE_CENTER.
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

    // Load pricing rules, drivers, and service areas in parallel.
    // Use explicit column selection for serviceAreas to avoid crashes
    // when DB schema is missing optional columns (e.g. "priority").
    let rulesRows: Array<{ key: string; value: string }>;
    let driverRows: Array<{ id: string; currentLat: string | null; currentLng: string | null }>;
    let areaRows: Array<{ id: string; name: string | null; centerLat: string | null; centerLng: string | null; radiusMiles: string | null }>;

    try {
      const [r, d, a] = await Promise.all([
        db.select().from(pricingRules),
        db.select({
          id: drivers.id,
          currentLat: drivers.currentLat,
          currentLng: drivers.currentLng,
        })
          .from(drivers)
          .where(and(eq(drivers.isOnline, true), eq(drivers.status, 'available'))),
        db.select({
          id: serviceAreas.id,
          name: serviceAreas.name,
          centerLat: serviceAreas.centerLat,
          centerLng: serviceAreas.centerLng,
          radiusMiles: serviceAreas.radiusMiles,
        })
          .from(serviceAreas)
          .where(eq(serviceAreas.active, true)),
      ]);
      rulesRows = r.map((row) => ({ key: row.key, value: row.value }));
      driverRows = d.map((row) => ({ id: row.id, currentLat: row.currentLat, currentLng: row.currentLng }));
      areaRows = a.map((row) => ({ id: row.id, name: row.name, centerLat: row.centerLat, centerLng: row.centerLng, radiusMiles: row.radiusMiles }));
    } catch (dbError) {
      // DB query failed (e.g. schema mismatch) — fall back to driver-only or SERVICE_CENTER
      console.error('validate-location DB error (falling back):', dbError);
      rulesRows = [];
      driverRows = [];
      areaRows = [];
    }

    const parsedRules = parsePricingRules(rulesRows);
    const maxServiceMiles = parsedRules.max_service_miles;

    // Build driver candidates
    const driverCandidates = driverRows
      .filter((d) => d.currentLat != null && d.currentLng != null)
      .map((d) => ({
        id: d.id,
        lat: parseFloat(d.currentLat!),
        lng: parseFloat(d.currentLng!),
      }))
      .filter((d) => !isNaN(d.lat) && !isNaN(d.lng));

    // Build service area candidates
    const areaCandidates = areaRows
      .filter((a) => a.centerLat != null && a.centerLng != null)
      .map((a) => ({
        id: a.id,
        lat: Number(a.centerLat),
        lng: Number(a.centerLng),
      }));

    // Resolve distance: driver → service area → SERVICE_CENTER
    const result: DistanceResult = await resolveDistance(
      { lat, lng },
      driverCandidates,
      areaCandidates,
    );

    const distanceMiles = result.distanceMiles;
    const valid = distanceMiles <= maxServiceMiles;

    // Find nearest area name for human-readable message
    let nearestAreaName = 'Glasgow';
    if (areaCandidates.length > 0) {
      let best = Infinity;
      for (const a of areaRows) {
        if (!a.centerLat || !a.centerLng) continue;
        const d = haversineDistanceMiles(
          { lat: Number(a.centerLat), lng: Number(a.centerLng) },
          { lat, lng },
        );
        if (d < best) { best = d; nearestAreaName = a.name || 'Glasgow'; }
      }
    }

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
        ? `Location is ${Math.round(distanceMiles)} miles from ${result.distanceSource === 'driver' ? 'nearest driver' : nearestAreaName}`
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
