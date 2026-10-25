import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, bookingStatusHistory, drivers, trackingSessions, users } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { getDirections, metersToMiles, secondsToMinutes } from '@/lib/mapbox';
import { authMobile } from '@/lib/auth';
import { authorizeCustomerBooking, getCustomerBookingAccessToken, verifyCustomerBookingAccessToken } from '@/lib/customer-booking-access';
import { latestDriverLocation } from '@/lib/tracking/location-sample';
import { getTrackingSessionByCustomerToken } from '@/lib/tracking-session';

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  note: string | null;
}

interface TrackingResponse {
  bookingId: string;
  canChat: boolean;
  bookingAccessToken?: string;
  sourceApp: string;
  sourceLabel: string;
  status: string;
  bookingType: string;
  customerLat: number;
  customerLng: number;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  driverName: string | null;
  driverPhone: string | null;
  etaMinutes: number | null;
  estimatedArrivalAt: string | null;
  distanceMiles: number | null;
  routeCoordinates: [number, number][] | null;
  statusHistory: StatusHistoryItem[];
  addressLine: string;
  scheduledAt: string | null;
  completedAt: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
): Promise<NextResponse<TrackingResponse | { error: string }>> {
  try {
    const { ref } = await params;

    // Fetch booking by reference number
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    const session = await authMobile(request);
    const staffAccess = session?.user?.role === 'admin';
    const customerAccess = booking ? await authorizeCustomerBooking(request, booking) : false;
    // Older driver apps use this endpoint while waiting for a usable GPS fix.
    // A driver session grants access only to its currently assigned booking.
    const [assignedDriver] = booking?.driverId && session?.user?.role === 'driver' && session.user.id
      ? await db.select({ id: drivers.id }).from(drivers)
        .where(and(eq(drivers.id, booking.driverId), eq(drivers.userId, session.user.id))).limit(1)
      : [];
    const assignedDriverAccess = Boolean(assignedDriver);
    const legacyToken = request.headers.get('X-Tracking-Token');
    const legacySession = !customerAccess && legacyToken ? await getTrackingSessionByCustomerToken(legacyToken) : null;
    const trackingOnlyAccess = Boolean(booking && legacySession?.bookingId === booking.id);
    if (!booking || (!staffAccess && !customerAccess && !trackingOnlyAccess && !assignedDriverAccess)) {
      return NextResponse.json(
        { error: 'Sign in to the booking account or open the secure link from your confirmation.' },
        { status: 403 }
      );
    }
    const suppliedCapability = getCustomerBookingAccessToken(request, booking.refNumber);
    const transferableCapability = customerAccess && suppliedCapability && await verifyCustomerBookingAccessToken(suppliedCapability, booking)
      ? suppliedCapability : null;

    // Fetch status history
    const history = await db
      .select({
        status: bookingStatusHistory.toStatus,
        timestamp: bookingStatusHistory.createdAt,
        note: bookingStatusHistory.note,
      })
      .from(bookingStatusHistory)
      .where(eq(bookingStatusHistory.bookingId, booking.id))
      .orderBy(desc(bookingStatusHistory.createdAt));

    // Transform history to response format
    const statusHistory: StatusHistoryItem[] = history.map((h) => ({
      status: h.status,
      timestamp: h.timestamp?.toISOString() || '',
      // Internal dispatch notes are never part of customer tracking.
      note: null,
    }));

    // Fetch driver info if assigned
    let driverLat: number | null = null;
    let driverLng: number | null = null;
    let driverLocationAt: string | null = null;
    let driverName: string | null = null;
    let driverPhone: string | null = null;
    let etaMinutes: number | null = null;
    let estimatedArrivalAt: string | null = null;
    let distanceMiles: number | null = null;
    let routeCoordinates: [number, number][] | null = null;
    const customerLat = parseFloat(booking.lat);
    const customerLng = parseFloat(booking.lng);

    const liveTracking = !['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'].includes(booking.status);
    // A finished booking must never expose the driver's location on a later job.
    const [trackingLocation] = liveTracking ? await db
      .select({
        lastLatitude: trackingSessions.lastLatitude,
        lastLongitude: trackingSessions.lastLongitude,
        lastUpdatedAt: trackingSessions.lastUpdatedAt,
      })
      .from(trackingSessions)
      .where(eq(trackingSessions.bookingId, booking.id))
      .limit(1) : [];

    if (booking.driverId && liveTracking) {
      const [driverInfo] = await db
        .select({
          currentLat: drivers.currentLat,
          currentLng: drivers.currentLng,
          locationAt: drivers.locationAt,
          userId: drivers.userId,
        })
        .from(drivers)
        .where(eq(drivers.id, booking.driverId))
        .limit(1);

      if (driverInfo) {
        const location = latestDriverLocation([
          { lat: trackingLocation?.lastLatitude, lng: trackingLocation?.lastLongitude, updatedAt: trackingLocation?.lastUpdatedAt },
          { lat: driverInfo.currentLat, lng: driverInfo.currentLng, updatedAt: driverInfo.locationAt },
        ]);
        driverLat = location?.lat ?? null;
        driverLng = location?.lng ?? null;
        driverLocationAt = location?.updatedAt.toISOString() ?? null;

        // Fetch driver user info for name and phone
        if (driverInfo.userId) {
          const [driverUser] = await db
            .select({
              name: users.name,
              phone: users.phone,
            })
            .from(users)
            .where(eq(users.id, driverInfo.userId))
            .limit(1);

          if (driverUser) {
            // Only show first name for privacy
            driverName = driverUser.name.split(' ')[0];
            driverPhone = driverUser.phone;
          }
        }

        // Calculate ETA + route if driver has location
        if (driverLat !== null && driverLng !== null && driverLocationAt &&
          Date.now() - Date.parse(driverLocationAt) <= 180_000) {
          const directions = await getDirections(
            { lat: driverLat, lng: driverLng },
            { lat: customerLat, lng: customerLng }
          );

          if (directions) {
            etaMinutes = secondsToMinutes(directions.duration);
            estimatedArrivalAt = new Date(
              Date.now() + Math.max(0, etaMinutes) * 60_000,
            ).toISOString();
            distanceMiles = Math.round(metersToMiles(directions.distance) * 10) / 10;
            routeCoordinates = directions.geometry.coordinates;
          }
        }
      }
    }

    // Find completed timestamp if booking is completed
    const completedEntry = statusHistory.find(
      (h) => h.status === 'completed'
    );

    const response: TrackingResponse = {
      bookingId: booking.id,
      canChat: customerAccess,
      ...(transferableCapability ? { bookingAccessToken: transferableCapability } : {}),
      sourceApp: booking.sourceApp,
      sourceLabel: booking.sourceLabel,
      status: booking.status,
      bookingType: booking.bookingType,
      customerLat: parseFloat(booking.lat),
      customerLng: parseFloat(booking.lng),
      driverLat,
      driverLng,
      driverLocationAt,
      driverName,
      driverPhone: customerAccess || staffAccess ? driverPhone : null,
      etaMinutes,
      estimatedArrivalAt,
      distanceMiles,
      routeCoordinates,
      statusHistory,
      addressLine: booking.addressLine,
      scheduledAt: booking.scheduledAt?.toISOString() || null,
      completedAt: completedEntry?.timestamp || null,
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    console.error('Error fetching tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tracking data' },
      { status: 500 }
    );
  }
}
