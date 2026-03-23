import { NextResponse } from 'next/server';
import { requireDriverMobile } from '@/lib/auth';
import { db, drivers, bookings } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { createAdminNotification } from '@/lib/notifications';

export async function POST(request: Request) {
  try {
    const { driverId } = await requireDriverMobile(request);
    const { is_online } = await request.json();

    if (typeof is_online !== 'boolean') {
      return NextResponse.json(
        { error: 'is_online must be a boolean' },
        { status: 400 }
      );
    }

    const driver = { id: driverId };

    // Prevent going offline while having active jobs
    if (!is_online) {
      const [activeJob] = await db
        .select({ id: bookings.id, refNumber: bookings.refNumber })
        .from(bookings)
        .where(
          and(
            eq(bookings.driverId, driver.id),
            inArray(bookings.status, ['driver_assigned', 'en_route', 'arrived', 'in_progress'])
          )
        )
        .limit(1);

      if (activeJob) {
        return NextResponse.json(
          { error: `Cannot go offline while you have an active job (${activeJob.refNumber}). Complete or contact admin to reassign.` },
          { status: 400 }
        );
      }
    }

    // Update driver status
    // IMPORTANT: We do NOT clear lat/lng/locationAt on offline.
    // The last-known location is valuable for admin visibility and
    // the backend presence evaluator uses locationAt for staleness.
    await db
      .update(drivers)
      .set({
        isOnline: is_online,
        status: is_online ? 'available' : 'offline',
      })
      .where(eq(drivers.id, driver.id));

    // Notify admin of driver status change
    createAdminNotification({
      type: 'driver.status.changed',
      title: `Driver ${is_online ? 'Online' : 'Offline'}`,
      body: `Driver went ${is_online ? 'online' : 'offline'}`,
      entityType: 'driver',
      entityId: driverId,
      link: '/admin/drivers',
      severity: is_online ? 'info' : 'warning',
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      isOnline: is_online,
    });
  } catch (error) {
    console.error('Error updating driver status:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Driver access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { driverId } = await requireDriverMobile(request);

    // Get driver record
    const [driver] = await db
      .select({
        isOnline: drivers.isOnline,
        status: drivers.status,
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

    return NextResponse.json({
      isOnline: driver.isOnline ?? false,
      status: driver.status ?? 'offline',
    });
  } catch (error) {
    console.error('Error fetching driver status:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Driver access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
