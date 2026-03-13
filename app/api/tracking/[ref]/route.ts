import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, bookingStatusHistory, drivers, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getDrivingDistanceMiles } from '@/lib/mapbox';

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  note: string | null;
}

interface TrackingResponse {
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

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

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
      note: h.note,
    }));

    // Fetch driver info if assigned
    let driverLat: number | null = null;
    let driverLng: number | null = null;
    let driverLocationAt: string | null = null;
    let driverName: string | null = null;
    let driverPhone: string | null = null;
    let etaMinutes: number | null = null;

    if (booking.driverId) {
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
        driverLat = driverInfo.currentLat ? parseFloat(driverInfo.currentLat) : null;
        driverLng = driverInfo.currentLng ? parseFloat(driverInfo.currentLng) : null;
        driverLocationAt = driverInfo.locationAt?.toISOString() || null;

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

        // Calculate ETA if driver has location
        if (driverLat && driverLng) {
          const customerLat = parseFloat(booking.lat);
          const customerLng = parseFloat(booking.lng);

          const drivingResult = await getDrivingDistanceMiles(
            { lat: driverLat, lng: driverLng },
            { lat: customerLat, lng: customerLng }
          );

          if (drivingResult) {
            etaMinutes = drivingResult.durationMinutes;
          }
        }
      }
    }

    // Find completed timestamp if booking is completed
    const completedEntry = statusHistory.find(
      (h) => h.status === 'completed'
    );

    const response: TrackingResponse = {
      status: booking.status,
      bookingType: booking.bookingType,
      customerLat: parseFloat(booking.lat),
      customerLng: parseFloat(booking.lng),
      driverLat,
      driverLng,
      driverLocationAt,
      driverName,
      driverPhone,
      etaMinutes,
      statusHistory,
      addressLine: booking.addressLine,
      scheduledAt: booking.scheduledAt?.toISOString() || null,
      completedAt: completedEntry?.timestamp || null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tracking data' },
      { status: 500 }
    );
  }
}
