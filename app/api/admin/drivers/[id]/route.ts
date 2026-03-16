import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, users, drivers, bookings } from '@/lib/db';
import { eq, and, sql, notInArray } from 'drizzle-orm';

// GET /api/admin/drivers/[id] — fetch single driver with stats
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const [driver] = await db
      .select({
        id: drivers.id,
        userId: drivers.userId,
        isOnline: drivers.isOnline,
        status: drivers.status,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        locationAt: drivers.locationAt,
        createdAt: drivers.createdAt,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(drivers.id, id))
      .limit(1);

    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Get job counts
    const [stats] = await db
      .select({
        totalJobs: sql<number>`count(*)`,
        completedJobs: sql<number>`count(*) filter (where ${bookings.status} = 'completed')`,
        activeJobs: sql<number>`count(*) filter (where ${bookings.status} not in ('completed', 'cancelled', 'refunded', 'draft'))`,
      })
      .from(bookings)
      .where(eq(bookings.driverId, id));

    return NextResponse.json({
      ...driver,
      currentLat: driver.currentLat?.toString() ?? null,
      currentLng: driver.currentLng?.toString() ?? null,
      locationAt: driver.locationAt?.toISOString() ?? null,
      createdAt: driver.createdAt?.toISOString() ?? null,
      totalJobs: Number(stats?.totalJobs ?? 0),
      completedJobs: Number(stats?.completedJobs ?? 0),
      activeJobs: Number(stats?.activeJobs ?? 0),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to fetch driver' }, { status: 500 });
  }
}

// PUT /api/admin/drivers/[id] — update driver details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();

    // Find the driver
    const [driver] = await db
      .select({ id: drivers.id, userId: drivers.userId })
      .from(drivers)
      .where(eq(drivers.id, id))
      .limit(1);

    if (!driver || !driver.userId) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Update user fields (name, email, phone)
    const userUpdates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      userUpdates.name = body.name.trim();
    }
    if (body.email !== undefined) {
      if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
      }
      // Check uniqueness
      const [dup] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, body.email.toLowerCase()), sql`${users.id} != ${driver.userId}`))
        .limit(1);
      if (dup) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      userUpdates.email = body.email.toLowerCase();
    }
    if (body.phone !== undefined) {
      userUpdates.phone = body.phone?.trim() || null;
    }

    if (Object.keys(userUpdates).length > 0) {
      userUpdates.updatedAt = new Date();
      await db.update(users).set(userUpdates).where(eq(users.id, driver.userId));
    }

    // Update driver fields (status, isOnline)
    const driverUpdates: Record<string, unknown> = {};
    if (body.status !== undefined) {
      const validStatuses = ['offline', 'available', 'en_route', 'arrived', 'in_progress'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
      }
      driverUpdates.status = body.status;
      driverUpdates.isOnline = body.status !== 'offline';
    }

    if (Object.keys(driverUpdates).length > 0) {
      await db.update(drivers).set(driverUpdates).where(eq(drivers.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Error updating driver:', error);
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 });
  }
}

// DELETE /api/admin/drivers/[id] — delete driver (cascade deletes user too)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const [driver] = await db
      .select({ id: drivers.id, userId: drivers.userId })
      .from(drivers)
      .where(eq(drivers.id, id))
      .limit(1);

    if (!driver || !driver.userId) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Check for active bookings
    const [active] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, id),
          notInArray(bookings.status, ['completed', 'cancelled', 'refunded', 'draft'])
        )
      );

    if (Number(active?.count) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete driver with active bookings. Reassign or complete them first.' },
        { status: 409 }
      );
    }

    // Unlink driver from completed bookings (keep booking history)
    await db
      .update(bookings)
      .set({ driverId: null })
      .where(eq(bookings.driverId, id));

    // Delete user (cascades to driver record and accounts)
    await db.delete(users).where(eq(users.id, driver.userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Error deleting driver:', error);
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 });
  }
}
