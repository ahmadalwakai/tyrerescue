import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDrivingDistanceMiles, haversineDistanceMiles } from '@/lib/mapbox';
import { db } from '@/lib/db';
import { serviceAreas } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

    // Load active service areas from DB
    const areas = await db
      .select()
      .from(serviceAreas)
      .where(eq(serviceAreas.active, true));

    if (areas.length === 0) {
      // Fallback: no areas seeded — accept within 50 miles of Glasgow
      const fallbackDist = haversineDistanceMiles(
        { lat: 55.8547, lng: -4.2206 },
        { lat, lng }
      ) * 1.3;
      const valid = fallbackDist <= 50;
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

    return NextResponse.json({
      valid: isWithinServiceArea,
      distanceMiles: Math.round(nearestDist * 10) / 10,
      estimatedMinutes: nearestDuration,
      nearestArea: nearestArea.name,
      message: isWithinServiceArea
        ? `Location is ${Math.round(nearestDist)} miles from ${nearestArea.name}`
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
