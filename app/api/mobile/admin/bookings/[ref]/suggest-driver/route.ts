import { NextResponse } from 'next/server';
import { and, eq, gte, or, sql } from 'drizzle-orm';
import { db, bookings, drivers, users } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

interface Props {
  params: Promise<{ ref: string }>;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const customerLat = Number(booking.lat);
  const customerLng = Number(booking.lng);

  const allDrivers = await db
    .select({
      id: drivers.id,
      userId: drivers.userId,
      name: users.name,
      isOnline: drivers.isOnline,
      status: drivers.status,
      currentLat: drivers.currentLat,
      currentLng: drivers.currentLng,
      locationAt: drivers.locationAt,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .where(or(eq(drivers.isOnline, true), eq(drivers.status, 'available')));

  if (allDrivers.length === 0) {
    return NextResponse.json({ rankedDrivers: [], recommendation: 'No available drivers' });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const activeCounts = await db
    .select({ driverId: bookings.driverId, count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, todayStart),
        sql`${bookings.status} NOT IN ('cancelled', 'completed', 'refunded', 'refunded_partial', 'draft')`,
      ),
    )
    .groupBy(bookings.driverId);

  const activeByDriver = new Map(activeCounts.map((row) => [row.driverId, Number(row.count || 0)]));

  const ranked = allDrivers
    .map((driver) => {
      const hasLocation = driver.currentLat != null && driver.currentLng != null;
      const distance = hasLocation
        ? haversineMiles(Number(driver.currentLat), Number(driver.currentLng), customerLat, customerLng)
        : 999;
      const jobs = Number(activeByDriver.get(driver.id) || 0);
      const score = Math.max(0, 100 - Math.round(distance * 5) - jobs * 8);

      return {
        driverId: driver.id,
        name: driver.name,
        score,
        reason: `${distance.toFixed(1)} miles, ${jobs} active jobs`,
        distanceToCustomer: Number(distance.toFixed(1)),
        activeJobsToday: jobs,
        isOnline: Boolean(driver.isOnline),
        status: driver.status,
        locationAt: driver.locationAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return NextResponse.json({
    rankedDrivers: ranked,
    recommendation: ranked[0] ? `Recommended: ${ranked[0].name}` : 'No suitable driver found',
    aiPowered: false,
  });
}
