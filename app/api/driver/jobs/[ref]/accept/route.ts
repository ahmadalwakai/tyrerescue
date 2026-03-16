import { NextResponse } from 'next/server';
import { requireDriver } from '@/lib/auth';
import { db, drivers, bookings, bookingStatusHistory } from '@/lib/db';
import { eq } from 'drizzle-orm';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await requireDriver();
    const { ref } = await params;
    const { action } = await request.json();

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be accept or reject' }, { status: 400 });
    }

    // Get driver record
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, session.user.id))
      .limit(1);

    if (!driver) {
      return NextResponse.json({ error: 'Driver record not found' }, { status: 404 });
    }

    // Get booking
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.driverId !== driver.id) {
      return NextResponse.json({ error: 'This job is not assigned to you' }, { status: 403 });
    }

    if (booking.status !== 'driver_assigned') {
      return NextResponse.json({ error: 'Job can only be accepted/rejected while in driver_assigned status' }, { status: 400 });
    }

    if (action === 'accept') {
      const now = new Date();
      await db
        .update(bookings)
        .set({ acceptedAt: now, updatedAt: now })
        .where(eq(bookings.id, booking.id));

      await db.insert(bookingStatusHistory).values({
        bookingId: booking.id,
        fromStatus: 'driver_assigned',
        toStatus: 'driver_assigned',
        actorUserId: session.user.id,
        actorRole: 'driver',
        note: 'Driver accepted the job',
      });

      return NextResponse.json({ success: true, action: 'accepted' });
    }

    // Reject — unassign driver, revert to paid
    const now = new Date();
    await db
      .update(bookings)
      .set({
        status: 'paid',
        driverId: null,
        assignedAt: null,
        acceptedAt: null,
        acceptanceDeadline: null,
        updatedAt: now,
      })
      .where(eq(bookings.id, booking.id));

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: 'driver_assigned',
      toStatus: 'paid',
      actorUserId: session.user.id,
      actorRole: 'driver',
      note: 'Driver rejected the job',
    });

    return NextResponse.json({ success: true, action: 'rejected' });
  } catch (error) {
    console.error('Error accepting/rejecting job:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Driver access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
