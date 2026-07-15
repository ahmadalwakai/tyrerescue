import { NextResponse } from 'next/server';
import { db, drivers, driverLocationHistory, bookings, trackingSessions } from '@/lib/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';
import { z } from 'zod';
import { isOlderLocationSample, parseLocationSampleTimestamp } from '@/lib/tracking/tracking-format';
import { logTrackingDiagnostic } from '@/lib/tracking/diagnostic-log';

const ACTIVE_STATUSES = ['driver_assigned', 'en_route', 'arrived', 'in_progress'] as const;
const MAX_ACCEPTED_ACCURACY_METERS = 100;

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  bookingRef: z.string().min(1).optional(),
  timestamp: z.string().min(1).optional(),
  accuracy: z.number().nonnegative().nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  speed: z.number().nullable().optional(),
  source: z.string().optional(),
}).refine((body) => !(body.lat === 0 && body.lng === 0), {
  message: 'Invalid coordinates',
  path: ['lat'],
});

export type DriverLocationWriteResponse = {
  accepted: boolean;
  success: boolean;
  serverTimestamp: string;
  acceptedLocationTimestamp: string | null;
  bridgedBookingRef: string | null;
  reason?: string;
  lat?: number;
  lng?: number;
  source?: string;
};

function jsonLocationResponse(
  body: Omit<DriverLocationWriteResponse, 'serverTimestamp'>,
  init?: ResponseInit,
) {
  return NextResponse.json(
    {
      ...body,
      serverTimestamp: new Date().toISOString(),
    },
    init,
  );
}

function maxDate(...values: (Date | string | null | undefined)[]): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }
  return latest;
}

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
  const endpointHostname = new URL(request.url).hostname;
  logTrackingDiagnostic('location_request_received', { endpointHostname });

  try {
    const authHeader = request.headers.get('authorization');
    const isMobileApp = !!(authHeader?.startsWith('Bearer '));

    const { driverId } = await requireDriverMobile(request);
    logTrackingDiagnostic('authentication_result', {
      endpointHostname,
      result: 'success',
    });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      logTrackingDiagnostic('accepted_or_rejected', {
        endpointHostname,
        result: 'rejected',
        httpStatus: 400,
        reason: 'invalid_body',
      });
      logTrackingDiagnostic('rejection_reason', {
        endpointHostname,
        reason: 'invalid_body',
        httpStatus: 400,
      });
      return jsonLocationResponse(
        {
          accepted: false,
          success: false,
          acceptedLocationTimestamp: null,
          bridgedBookingRef: null,
          reason: 'invalid_body',
        },
        { status: 400 },
      );
    }
    const { lat, lng, bookingRef, timestamp, accuracy, heading, speed } = parsed.data;
    const logBase = {
      endpointHostname,
      jobId: bookingRef ?? null,
      accuracy: accuracy ?? null,
      source: parsed.data.source ?? null,
    };
    const sampleAt = timestamp ? parseLocationSampleTimestamp(timestamp) : new Date();
    if (!sampleAt) {
      logTrackingDiagnostic('timestamp_validation_result', {
        ...logBase,
        result: 'invalid',
        sampleTimestamp: timestamp ?? null,
        httpStatus: 400,
      });
      logTrackingDiagnostic('accepted_or_rejected', {
        ...logBase,
        result: 'rejected',
        httpStatus: 400,
        reason: 'invalid_timestamp',
      });
      logTrackingDiagnostic('rejection_reason', {
        ...logBase,
        reason: 'invalid_timestamp',
        httpStatus: 400,
      });
      return jsonLocationResponse(
        {
          accepted: false,
          success: false,
          acceptedLocationTimestamp: null,
          bridgedBookingRef: null,
          reason: 'invalid_timestamp',
        },
        { status: 400 },
      );
    }
    logTrackingDiagnostic('timestamp_validation_result', {
      ...logBase,
      result: timestamp ? 'valid' : 'server_timestamp_fallback',
      sampleTimestamp: sampleAt.toISOString(),
    });

    if (accuracy != null && accuracy > MAX_ACCEPTED_ACCURACY_METERS) {
      logTrackingDiagnostic('accepted_or_rejected', {
        ...logBase,
        result: 'rejected',
        reason: 'accuracy_too_low',
        httpStatus: 200,
      });
      logTrackingDiagnostic('rejection_reason', {
        ...logBase,
        reason: 'accuracy_too_low',
        httpStatus: 200,
      });
      return jsonLocationResponse({
        accepted: false,
        success: true,
        acceptedLocationTimestamp: null,
        bridgedBookingRef: null,
        reason: 'accuracy_too_low',
      });
    }

    const locationSource = isMobileApp ? 'mobile_app' : 'web_portal';

    const [driver] = await db
      .select({
        id: drivers.id,
        isOnline: drivers.isOnline,
        locationSource: drivers.locationSource,
        locationAt: drivers.locationAt,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) {
      logTrackingDiagnostic('assignment_validation_result', {
        ...logBase,
        result: 'driver_not_found',
        httpStatus: 404,
      });
      logTrackingDiagnostic('accepted_or_rejected', {
        ...logBase,
        result: 'rejected',
        reason: 'driver_not_found',
        httpStatus: 404,
      });
      return jsonLocationResponse(
        {
          accepted: false,
          success: false,
          acceptedLocationTimestamp: null,
          bridgedBookingRef: null,
          reason: 'driver_not_found',
        },
        { status: 404 },
      );
    }

    // Web portal must NOT overwrite fresh mobile app location.
    const mobileLocationIsFresh =
      driver.locationSource === 'mobile_app' &&
      driver.locationAt &&
      (Date.now() - new Date(driver.locationAt).getTime()) < 5 * 60 * 1000;

    const shouldUpdatePrimary = isMobileApp || !mobileLocationIsFresh;

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

    logTrackingDiagnostic('assignment_validation_result', {
      ...logBase,
      result: targetedBooking
        ? 'matched_active_booking'
        : bookingRef
          ? 'booking_not_assigned_or_inactive'
          : 'no_active_booking',
      httpStatus: targetedBooking || !bookingRef ? 200 : 403,
    });

    if (bookingRef && !targetedBooking) {
      logTrackingDiagnostic('accepted_or_rejected', {
        ...logBase,
        result: 'rejected',
        reason: 'booking_not_assigned_or_inactive',
        httpStatus: 403,
      });
      logTrackingDiagnostic('rejection_reason', {
        ...logBase,
        reason: 'booking_not_assigned_or_inactive',
        httpStatus: 403,
      });
      return jsonLocationResponse(
        {
          accepted: false,
          success: false,
          acceptedLocationTimestamp: null,
          bridgedBookingRef: null,
          reason: 'booking_not_assigned_or_inactive',
        },
        { status: 403 },
      );
    }

    const [trackingSession] = targetedBooking
      ? await db
          .select({ lastUpdatedAt: trackingSessions.lastUpdatedAt })
          .from(trackingSessions)
          .where(eq(trackingSessions.bookingId, targetedBooking.id))
          .limit(1)
      : [null];

    const latestPersistedAt = maxDate(driver.locationAt, trackingSession?.lastUpdatedAt ?? null);
    if (isOlderLocationSample(sampleAt, latestPersistedAt)) {
      logTrackingDiagnostic('timestamp_validation_result', {
        ...logBase,
        result: 'older_than_latest_location',
        sampleTimestamp: sampleAt.toISOString(),
        latestPersistedAt: latestPersistedAt?.toISOString() ?? null,
      });
      logTrackingDiagnostic('accepted_or_rejected', {
        ...logBase,
        result: 'rejected',
        reason: 'older_than_latest_location',
        httpStatus: 200,
      });
      logTrackingDiagnostic('rejection_reason', {
        ...logBase,
        reason: 'older_than_latest_location',
        httpStatus: 200,
      });
      return jsonLocationResponse({
        accepted: false,
        success: true,
        acceptedLocationTimestamp: latestPersistedAt?.toISOString() ?? null,
        bridgedBookingRef: targetedBooking?.refNumber ?? null,
        reason: 'older_than_latest_location',
      });
    }

    const slot = takeThrottleSlot(driverId);
    if (!slot.allowed) {
      logTrackingDiagnostic('accepted_or_rejected', {
        ...logBase,
        result: 'rejected',
        reason: 'rate_limited',
        httpStatus: 429,
      });
      logTrackingDiagnostic('rejection_reason', {
        ...logBase,
        reason: 'rate_limited',
        httpStatus: 429,
      });
      return NextResponse.json(
        {
          accepted: false,
          success: false,
          serverTimestamp: new Date().toISOString(),
          acceptedLocationTimestamp: null,
          bridgedBookingRef: targetedBooking?.refNumber ?? null,
          reason: 'rate_limited',
          retryAfterSeconds: slot.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(slot.retryAfterSeconds) },
        },
      );
    }

    let primaryUpdated = true;

    if (shouldUpdatePrimary) {
      const updated = await db
        .update(drivers)
        .set({
          currentLat: lat.toString(),
          currentLng: lng.toString(),
          locationAt: sampleAt,
          locationSource,
        })
        .where(
          and(
            eq(drivers.id, driver.id),
            sql`(${drivers.locationAt} IS NULL OR ${drivers.locationAt} <= ${sampleAt})`,
          ),
        )
        .returning({ id: drivers.id });
      primaryUpdated = updated.length > 0;
    }

    if (!primaryUpdated) {
      logTrackingDiagnostic('database_write_result', {
        ...logBase,
        result: 'skipped_newer_location_already_stored',
        httpStatus: 200,
      });
      logTrackingDiagnostic('accepted_or_rejected', {
        ...logBase,
        result: 'rejected',
        reason: 'newer_location_already_stored',
        httpStatus: 200,
      });
      return jsonLocationResponse({
        accepted: false,
        success: true,
        acceptedLocationTimestamp: latestPersistedAt?.toISOString() ?? null,
        bridgedBookingRef: targetedBooking?.refNumber ?? null,
        reason: 'newer_location_already_stored',
      });
    }

    await db.insert(driverLocationHistory).values({
      driverId: driver.id,
      bookingId: targetedBooking?.id ?? null,
      lat: lat.toString(),
      lng: lng.toString(),
      recordedAt: sampleAt,
    });

    // Bridge to trackingSessions so customer/admin tracking surfaces use the
    // driver's native GPS rather than relying on a separate browser beacon.
    let trackingSessionRows = 0;
    if (shouldUpdatePrimary && targetedBooking) {
      const bridgeNow = new Date();
      const bridged = await db
        .update(trackingSessions)
        .set({
          status: 'in_progress',
          startedAt: sql`COALESCE(${trackingSessions.startedAt}, ${sampleAt})`,
          lastLatitude: lat.toString(),
          lastLongitude: lng.toString(),
          lastAccuracy: accuracy ?? null,
          lastHeading: heading ?? null,
          lastSpeed: speed ?? null,
          lastUpdatedAt: sampleAt,
          updatedAt: bridgeNow,
        })
        .where(
          and(
            eq(trackingSessions.bookingId, targetedBooking.id),
            inArray(trackingSessions.status, ['pending', 'in_progress', 'paused']),
            sql`(${trackingSessions.lastUpdatedAt} IS NULL OR ${trackingSessions.lastUpdatedAt} <= ${sampleAt})`,
          ),
        )
        .returning({ id: trackingSessions.id });
      trackingSessionRows = bridged.length;
    }

    logTrackingDiagnostic('database_write_result', {
      ...logBase,
      result: 'persisted',
      httpStatus: 200,
      primaryUpdated,
      historyInserted: true,
      trackingSessionRows,
      acceptedLocationTimestamp: sampleAt.toISOString(),
    });
    logTrackingDiagnostic('accepted_or_rejected', {
      ...logBase,
      result: 'accepted',
      httpStatus: 200,
      acceptedLocationTimestamp: sampleAt.toISOString(),
    });

    return jsonLocationResponse({
      accepted: true,
      success: true,
      lat,
      lng,
      source: locationSource,
      bridgedBookingRef: targetedBooking?.refNumber ?? null,
      acceptedLocationTimestamp: sampleAt.toISOString(),
    });
  } catch (error) {
    console.error('Error updating driver location:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Unauthorized')) {
      logTrackingDiagnostic('authentication_result', {
        endpointHostname,
        result: 'unauthorized',
        httpStatus: 401,
      });
      logTrackingDiagnostic('accepted_or_rejected', {
        endpointHostname,
        result: 'rejected',
        reason: 'unauthorized',
        httpStatus: 401,
      });
      return jsonLocationResponse(
        {
          accepted: false,
          success: false,
          acceptedLocationTimestamp: null,
          bridgedBookingRef: null,
          reason: 'unauthorized',
        },
        { status: 401 },
      );
    }
    if (message.includes('Forbidden')) {
      logTrackingDiagnostic('authentication_result', {
        endpointHostname,
        result: 'forbidden',
        httpStatus: 403,
      });
      logTrackingDiagnostic('accepted_or_rejected', {
        endpointHostname,
        result: 'rejected',
        reason: 'forbidden',
        httpStatus: 403,
      });
      return jsonLocationResponse(
        {
          accepted: false,
          success: false,
          acceptedLocationTimestamp: null,
          bridgedBookingRef: null,
          reason: 'forbidden',
        },
        { status: 403 },
      );
    }
    logTrackingDiagnostic('accepted_or_rejected', {
      endpointHostname,
      result: 'rejected',
      reason: 'server_error',
      httpStatus: 500,
    });
    return jsonLocationResponse(
      {
        accepted: false,
        success: false,
        acceptedLocationTimestamp: null,
        bridgedBookingRef: null,
        reason: 'server_error',
      },
      { status: 500 },
    );
  }
}
