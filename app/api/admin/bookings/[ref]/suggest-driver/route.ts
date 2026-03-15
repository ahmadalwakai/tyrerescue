import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, bookings, drivers, users, bookingStatusHistory } from '@/lib/db';
import { eq, and, sql, or, gte } from 'drizzle-orm';
import { askGroqJSON } from '@/lib/groq';

interface Props {
  params: Promise<{ ref: string }>;
}

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3959; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(_request: Request, { params }: Props) {
  try {
    await requireAdmin();
    const { ref } = await params;

    // Get booking
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const customerLat = parseFloat(booking.lat);
    const customerLng = parseFloat(booking.lng);

    // Get all drivers with user info
    const allDrivers = await db
      .select({
        id: drivers.id,
        userId: drivers.userId,
        isOnline: drivers.isOnline,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        locationAt: drivers.locationAt,
        status: drivers.status,
        name: users.name,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(or(eq(drivers.isOnline, true), eq(drivers.status, 'available')));

    if (allDrivers.length === 0) {
      return NextResponse.json({ rankedDrivers: [], recommendation: 'No drivers available' });
    }

    // Get today's active bookings per driver
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const activeJobCounts = await db
      .select({
        driverId: bookings.driverId,
        count: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.createdAt, todayStart),
          sql`${bookings.status} NOT IN ('cancelled', 'completed', 'refunded', 'draft')`
        )
      )
      .groupBy(bookings.driverId);

    const jobCountMap = new Map(activeJobCounts.map((r) => [r.driverId, Number(r.count)]));

    // Get average completion time per driver (driver_assigned → completed)
    const avgTimes = await db
      .select({
        actorUserId: bookingStatusHistory.actorUserId,
        avgMinutes: sql<number>`avg(EXTRACT(EPOCH FROM (
          (SELECT bsh2.created_at FROM booking_status_history bsh2 
           WHERE bsh2.booking_id = ${bookingStatusHistory.bookingId} 
           AND bsh2.to_status = 'completed' LIMIT 1)
          - ${bookingStatusHistory.createdAt}
        )) / 60)`,
      })
      .from(bookingStatusHistory)
      .where(eq(bookingStatusHistory.toStatus, 'driver_assigned'))
      .groupBy(bookingStatusHistory.actorUserId);

    const avgTimeMap = new Map(avgTimes.map((r) => [r.actorUserId, Math.round(Number(r.avgMinutes) || 60)]));

    // Build driver context for Groq
    const driverContext = allDrivers.map((d) => {
      const dLat = d.currentLat ? parseFloat(d.currentLat) : null;
      const dLng = d.currentLng ? parseFloat(d.currentLng) : null;
      const distance = dLat && dLng ? haversineDistance(dLat, dLng, customerLat, customerLng) : 999;

      return {
        id: d.id,
        name: d.name,
        distanceToCustomer: Math.round(distance * 10) / 10,
        activeJobsToday: jobCountMap.get(d.id) || 0,
        avgCompletionMinutes: avgTimeMap.get(d.userId!) || 60,
        lastLocationUpdate: d.locationAt?.toISOString() || null,
        isOnline: d.isOnline,
      };
    });

    // Sort by distance as fallback
    driverContext.sort((a, b) => a.distanceToCustomer - b.distanceToCustomer);

    const context = {
      booking: {
        serviceType: booking.serviceType,
        bookingType: booking.bookingType,
        scheduledAt: booking.scheduledAt?.toISOString() || null,
        distanceMiles: booking.distanceMiles,
        customerLat,
        customerLng,
      },
      drivers: driverContext,
    };

    // Call Groq
    const result = await askGroqJSON(
      `You are a dispatch system for a mobile tyre fitting company in Glasgow, Scotland.
Rank drivers for assignment based on:
1. Distance to customer (most important)
2. Current workload (fewer jobs = better)
3. Response time history (faster = better)
4. Location freshness (recent GPS = better)
Return JSON: { "rankedDrivers": [{ "driverId": "string", "score": number 0-100, "reason": "string max 15 words" }], "recommendation": "string max 20 words" }`,
      JSON.stringify(context),
      600
    );

    if (result && Array.isArray(result.rankedDrivers)) {
      // Merge AI scores with driver data
      const ranked = (result.rankedDrivers as Array<{ driverId: string; score: number; reason: string }>).map((r) => {
        const driver = driverContext.find((d) => d.id === r.driverId);
        return {
          ...r,
          name: driver?.name || 'Unknown',
          distanceToCustomer: driver?.distanceToCustomer || 0,
          activeJobsToday: driver?.activeJobsToday || 0,
        };
      });

      return NextResponse.json({
        rankedDrivers: ranked,
        recommendation: result.recommendation || 'Select the top-ranked driver',
        aiPowered: true,
      });
    }

    // Fallback: distance-sorted
    return NextResponse.json({
      rankedDrivers: driverContext.map((d, i) => ({
        driverId: d.id,
        name: d.name,
        score: Math.max(10, 100 - i * 20 - Math.round(d.distanceToCustomer * 2)),
        reason: `${d.distanceToCustomer} miles away`,
        distanceToCustomer: d.distanceToCustomer,
        activeJobsToday: d.activeJobsToday,
      })),
      recommendation: 'Sorted by distance (AI unavailable)',
      aiPowered: false,
    });
  } catch (error) {
    console.error('Suggest driver error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
