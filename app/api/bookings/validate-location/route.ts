import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDrivingDistanceMiles, haversineDistanceMiles, SERVICE_CENTER } from '@/lib/mapbox';
import { db } from '@/lib/db';
import { serviceAreas, pricingRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { parsePricingRules } from '@/lib/pricing-engine';

const validateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().optional(),
});

/**
 * POST /api/bookings/validate-location
 *
 * Validates if a location is within any active service area.
 * Finds the nearest area and checks if the customer is within its radius.
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

    // Load active service areas and pricing rules in parallel
    const [areas, rulesRows] = await Promise.all([
      db.select().from(serviceAreas).where(eq(serviceAreas.active, true)),
      db.select().from(pricingRules),
    ]);

    const parsedRules = parsePricingRules(
      rulesRows.map((r) => ({ key: r.key, value: r.value }))
    );
    const maxServiceMiles = parsedRules.max_service_miles;

    if (areas.length === 0) {
      // Fallback: no areas seeded — accept within max_service_miles of SERVICE_CENTER
      const fallbackDist = haversineDistanceMiles(
        SERVICE_CENTER,
        { lat, lng }
      ) * 1.3;
      const valid = fallbackDist <= maxServiceMiles;
      return NextResponse.json({
        valid,
        distanceMiles: Math.round(fallbackDist * 10) / 10,
        nearestArea: 'Glasgow',
        message: valid
          ? `Location is ${Math.round(fallbackDist)} miles from our base`
          : `Sorry, this location is ${Math.round(fallbackDist)} miles away, which is outside our service area. Please call 0141 266 0690 for assistance.`,
      });
    }

    // Find nearest service area
    let nearestArea = areas[0];
    let nearestDist = Infinity;
    let nearestDuration: number | undefined;

    for (const area of areas) {
      const areaLat = Number(area.centerLat);
      const areaLng = Number(area.centerLng);

      // Try driving distance
      const driving = await getDrivingDistanceMiles(
        { lat: areaLat, lng: areaLng },
        { lat, lng }
      );

      let dist: number;
      let duration: number | undefined;

      if (driving) {
        dist = driving.distanceMiles;
        duration = driving.durationMinutes;
      } else {
        // Haversine fallback with road approximation
        dist = haversineDistanceMiles({ lat: areaLat, lng: areaLng }, { lat, lng }) * 1.3;
      }

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestDuration = duration;
        nearestArea = area;
      }
    }

    const radiusMiles = Number(nearestArea.radiusMiles);
    const isWithinServiceArea = nearestDist <= radiusMiles;

    // Secondary check: even if outside the nearest area's radius, the customer
    // may still be within overall max_service_miles (quote route would accept them)
    const isWithinMaxRange = nearestDist <= maxServiceMiles;

    return NextResponse.json({
      valid: isWithinServiceArea || isWithinMaxRange,
      distanceMiles: Math.round(nearestDist * 10) / 10,
      estimatedMinutes: nearestDuration,
      nearestArea: nearestArea.name,
      message: isWithinServiceArea
        ? `Location is ${Math.round(nearestDist)} miles from ${nearestArea.name}`
        : isWithinMaxRange
          ? `Location is ${Math.round(nearestDist)} miles from ${nearestArea.name} (on the edge of our coverage)`
          : `We do not currently cover your area. Call 0141 266 0690 to discuss.`,
    });
  } catch (error) {
    console.error('Location validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate location' },
      { status: 500 }
    );
  }
}
