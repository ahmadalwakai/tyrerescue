import { NextResponse } from 'next/server';
import { db, bookings, bookingTyres, tyreProducts } from '@/lib/db';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { driverId } = await requireDriverMobile(request);

    const operationalStatuses = ['en_route', 'arrived', 'in_progress'];
    const upcomingStatuses = ['driver_assigned'];

    // Active jobs (actually working on)
    const activeJobs = await db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        status: bookings.status,
        bookingType: bookings.bookingType,
        serviceType: bookings.serviceType,
        addressLine: bookings.addressLine,
        lat: bookings.lat,
        lng: bookings.lng,
        tyreSizeDisplay: bookings.tyreSizeDisplay,
        quantity: bookings.quantity,
        customerName: bookings.customerName,
        customerPhone: bookings.customerPhone,
        scheduledAt: bookings.scheduledAt,
        acceptedAt: bookings.acceptedAt,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driverId),
          inArray(bookings.status, operationalStatuses),
        ),
      )
      .orderBy(desc(bookings.createdAt));

    // Upcoming jobs (assigned, waiting to start)
    const upcomingJobs = await db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        status: bookings.status,
        bookingType: bookings.bookingType,
        serviceType: bookings.serviceType,
        addressLine: bookings.addressLine,
        lat: bookings.lat,
        lng: bookings.lng,
        tyreSizeDisplay: bookings.tyreSizeDisplay,
        quantity: bookings.quantity,
        customerName: bookings.customerName,
        customerPhone: bookings.customerPhone,
        scheduledAt: bookings.scheduledAt,
        acceptedAt: bookings.acceptedAt,
        assignedAt: bookings.assignedAt,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driverId),
          inArray(bookings.status, upcomingStatuses),
        ),
      )
      .orderBy(bookings.assignedAt);

    // Completed jobs (last 50)
    const completedJobs = await db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        status: bookings.status,
        bookingType: bookings.bookingType,
        serviceType: bookings.serviceType,
        addressLine: bookings.addressLine,
        tyreSizeDisplay: bookings.tyreSizeDisplay,
        customerName: bookings.customerName,
        completedAt: bookings.completedAt,
        totalAmount: bookings.totalAmount,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driverId),
          eq(bookings.status, 'completed'),
        ),
      )
      .orderBy(desc(bookings.completedAt))
      .limit(50);

    // Get tyre info for active + upcoming jobs
    const allActiveJobs = [...activeJobs, ...upcomingJobs];
    const jobsWithTyres = await Promise.all(
      allActiveJobs.map(async (job) => {
        const tyres = await db
          .select({
            quantity: bookingTyres.quantity,
            brand: tyreProducts.brand,
            pattern: tyreProducts.pattern,
          })
          .from(bookingTyres)
          .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
          .where(eq(bookingTyres.bookingId, job.id));
        return { ...job, tyres };
      }),
    );

    const activeWithTyres = jobsWithTyres.filter(j => operationalStatuses.includes(j.status));
    const upcomingWithTyres = jobsWithTyres.filter(j => upcomingStatuses.includes(j.status));

    return NextResponse.json({
      active: [...activeWithTyres, ...upcomingWithTyres].map(serialise),
      upcoming: upcomingWithTyres.map(serialise),
      completed: completedJobs.map(serialise),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

function serialise(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      v instanceof Date ? v.toISOString() : typeof v === 'object' && v !== null ? v : v?.toString() ?? null,
    ]),
  );
}
