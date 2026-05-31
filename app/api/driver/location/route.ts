import { NextResponse } from 'next/server';
import { db, drivers, driverLocationHistory, bookings, trackingSessions } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';
import { z } from 'zod';

const ACTIVE_STATUSES = ['driver_assigned', 'en_route', 'arrived', 'in_progress'] as const;

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  bookingRef: z.string().min(1).optional(),
});

// ── Per-driver write throttle ─────────────────────────────────────────────
// Best-effort, in-memory only (each serverless instance has its own map).
// Hard-caps how often a single driver can write a location, regardless of
// how many client tabs/components/devices are running. Clients should
// throttle themselves first; this is a defence-in-depth guard against
// runaway loops or buggy old clients.
const MIN_WRITE_INTERVAL_MS = 8_000;
const RETRY_AFTER_SECONDS_ON_LIMIT = 30;
const driverLastWriteAt = new Map<string, number>();

function takeThrottleSlot(
  driverId: string,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const last = driverLastWriteAt.get(driverId);
  if (last != null && now - last < MIN_WRITE_INTERVAL_MS) {
    return { allowed: false, retryAfterSeconds: RETRY_AFTER_SECONDS_ON_LIMIT };
  }
  driverLastWriteAt.set(driverId, now);
  if (driverLastWriteAt.size > 500) {
    const cutoff = now - 10 * 60 * 1000;
    for (const [k, ts] of driverLastWriteAt) {
      if (ts < cutoff) driverLastWriteAt.delete(k);
    }
  }
  return { allowed: true };
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const isMobileApp = !!(authHeader?.startsWith('Bearer '));

    const { driverId } = await requireDriverMobile(request);

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { lat, lng, bookingRef } = parsed.data;

    const slot = takeThrottleSlot(driverId);
    if (!slot.allowed) {
      return NextResponse.json(
        { error: 'Too many location updates', retryAfterSeconds: slot.retryAfterSeconds },
        {
          status: 429,
          headers: { 'Retry-After': String(slot.retryAfterSeconds) },
        },
      );
    }

    const locationSource = isMobileApp ? 'mobile_app' : 'web_portal';

    const [driver] = await db
      .select({
        id: drivers.id,
        isOnline: drivers.isOnline,
        locationSource: drivers.locationSource,
        locationAt: drivers.locationAt,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver record not found' },
        { status: 404 }
      );
    }

    // Web portal must NOT overwrite fresh mobile app location.
    const mobileLocationIsFresh =
      driver.locationSource === 'mobile_app' &&
      driver.locationAt &&
      (Date.now() - new Date(driver.locationAt).getTime()) < 5 * 60 * 1000;

    const shouldUpdatePrimary = isMobileApp || !mobileLocationIsFresh;

    if (shouldUpdatePrimary) {
      await db
        .update(drivers)
        .set({
          currentLat: lat.toString(),
          currentLng: lng.toString(),
          locationAt: new Date(),
          locationSource,
        })
        .where(eq(drivers.id, driver.id));
    }

    // Active booking lookup: prefer caller-supplied ref (current job), else first active.
    const activeBookings = await db
      .select({ id: bookings.id, refNumber: bookings.refNumber })
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driver.id),
          inArray(bookings.status, [...ACTIVE_STATUSES]),
        ),
      );

    const targetedBooking = bookingRef
      ? activeBookings.find((b) => b.refNumber === bookingRef) ?? null
      : activeBookings[0] ?? null;

    await db.insert(driverLocationHistory).values({
      driverId: driver.id,
      bookingId: targetedBooking?.id ?? null,
      lat: lat.toString(),
      lng: lng.toString(),
    });

    // Bridge to trackingSessions so customer/admin tracking surfaces use the
    // driver's native GPS rather than relying on a separate beacon.
    if (shouldUpdatePrimary && targetedBooking) {
      await db
        .update(trackingSessions)
        .set({
          lastLatitude: lat.toString(),
          lastLongitude: lng.toString(),
          lastUpdatedAt: new Date(),
        })
        .where(eq(trackingSessions.bookingId, targetedBooking.id));
    }

    return NextResponse.json({
      success: true,
      lat,
      lng,
      source: locationSource,
      bridgedBookingRef: targetedBooking?.refNumber ?? null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error updating driver location:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Driver access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update location' },
      { status: 500 }
    );
  }
}
