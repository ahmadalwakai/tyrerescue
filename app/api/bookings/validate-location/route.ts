import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDrivingDistanceMiles, haversineDistanceMiles, SERVICE_CENTER } from '@/lib/mapbox';

const validateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().optional(),
});

const MAX_SERVICE_MILES = 50;

/**
 * POST /api/bookings/validate-location
 * 
 * Validates if a location is within our 50-mile service radius.
 * Returns distance and whether the location is serviceable.
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

    // Calculate driving distance
    let distanceMiles: number;
    let durationMinutes: number | undefined;

    const drivingResult = await getDrivingDistanceMiles(
      { lat: SERVICE_CENTER.lat, lng: SERVICE_CENTER.lng },
      { lat, lng }
    );

    if (drivingResult) {
      distanceMiles = drivingResult.distanceMiles;
      durationMinutes = drivingResult.durationMinutes;
    } else {
      // Fallback to Haversine with road approximation
      distanceMiles = haversineDistanceMiles(SERVICE_CENTER, { lat, lng }) * 1.3;
    }

    const isWithinServiceArea = distanceMiles <= MAX_SERVICE_MILES;

    return NextResponse.json({
      valid: isWithinServiceArea,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      estimatedMinutes: durationMinutes,
      maxServiceMiles: MAX_SERVICE_MILES,
      message: isWithinServiceArea
        ? `Location is ${Math.round(distanceMiles)} miles from our base`
        : `Sorry, this location is ${Math.round(distanceMiles)} miles away, which is outside our ${MAX_SERVICE_MILES}-mile service area. Please call 0141 266 0690 for assistance.`,
    });
  } catch (error) {
    console.error('Location validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate location' },
      { status: 500 }
    );
  }
}
