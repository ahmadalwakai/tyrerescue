import { db, drivers, bookings, bookingTyres, tyreProducts } from '@/lib/db';
import { eq, and, inArray, gte, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Box, Heading } from '@chakra-ui/react';
import { DriverDashboardClient } from './DriverDashboardClient';

export default async function DriverDashboardPage() {
  const session = await auth();
  if (!session || session.user.role !== 'driver') {
    redirect('/login');
  }

  // Get driver record
  const [driver] = await db
    .select({
      id: drivers.id,
      isOnline: drivers.isOnline,
      status: drivers.status,
    })
    .from(drivers)
    .where(eq(drivers.userId, session.user.id))
    .limit(1);

  if (!driver) {
    redirect('/login');
  }

  // Get active job (statuses: driver_assigned, en_route, arrived, in_progress)
  const activeStatuses = ['driver_assigned', 'en_route', 'arrived', 'in_progress'];
  const [activeJob] = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      status: bookings.status,
      addressLine: bookings.addressLine,
      lat: bookings.lat,
      lng: bookings.lng,
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      quantity: bookings.quantity,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      tyrePhotoUrl: bookings.tyrePhotoUrl,
      scheduledAt: bookings.scheduledAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.driverId, driver.id),
        inArray(bookings.status, activeStatuses)
      )
    )
    .limit(1);

  // Get tyre details for active job
  let activeJobTyres: { quantity: number; brand: string | null; pattern: string | null }[] = [];
  if (activeJob) {
    activeJobTyres = await db
      .select({
        quantity: bookingTyres.quantity,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
      })
      .from(bookingTyres)
      .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
      .where(eq(bookingTyres.bookingId, activeJob.id));
  }

  // Get today's completed jobs count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [todayStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.driverId, driver.id),
        eq(bookings.status, 'completed'),
        gte(bookings.updatedAt, today)
      )
    );

  // Get this week's completed jobs count (start from Monday)
  const weekStart = new Date();
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
  weekStart.setDate(weekStart.getDate() - diff);
  weekStart.setHours(0, 0, 0, 0);

  const [weekStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.driverId, driver.id),
        eq(bookings.status, 'completed'),
        gte(bookings.updatedAt, weekStart)
      )
    );

  // Transform data for client
  const activeJobData = activeJob
    ? {
        id: activeJob.id,
        refNumber: activeJob.refNumber,
        status: activeJob.status,
        addressLine: activeJob.addressLine,
        lat: activeJob.lat.toString(),
        lng: activeJob.lng.toString(),
        tyreSizeDisplay: activeJob.tyreSizeDisplay,
        quantity: activeJob.quantity,
        customerName: activeJob.customerName,
        customerPhone: activeJob.customerPhone,
        tyrePhotoUrl: activeJob.tyrePhotoUrl,
        scheduledAt: activeJob.scheduledAt?.toISOString() ?? null,
        tyres: activeJobTyres.map((t) => ({
          quantity: t.quantity,
          brand: t.brand,
          pattern: t.pattern,
        })),
      }
    : null;

  return (
    <Box>
      <Heading size="lg" mb={6}>
        Dashboard
      </Heading>
      <DriverDashboardClient
        initialIsOnline={driver.isOnline ?? false}
        activeJob={activeJobData}
        jobsToday={Number(todayStats?.count || 0)}
        jobsThisWeek={Number(weekStats?.count || 0)}
      />
    </Box>
  );
}
