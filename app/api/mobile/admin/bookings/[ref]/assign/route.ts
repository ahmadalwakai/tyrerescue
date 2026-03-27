import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, bookings, drivers, bookingStatusHistory } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { executeTransition, type BookingStatus } from '@/lib/state-machine';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const body = await request.json();
  const driverId = String(body?.driverId || '');

  if (!driverId) {
    return NextResponse.json({ error: 'driverId is required' }, { status: 400 });
  }

  const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  }

  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const currentStatus = booking.status as BookingStatus;
  const now = new Date();

  await db
    .update(bookings)
    .set({
      driverId,
      assignedAt: now,
      acceptedAt: null,
      acceptanceDeadline: new Date(now.getTime() + 10 * 60 * 1000),
      updatedAt: now,
    })
    .where(eq(bookings.id, booking.id));

  if (currentStatus === 'paid') {
    const result = await executeTransition(
      booking.id,
      'driver_assigned',
      { userId: user.id, role: 'admin' },
      'Driver assigned by mobile admin app',
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Unable to assign driver' }, { status: 400 });
    }
  } else {
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: booking.status,
      actorUserId: user.id,
      actorRole: 'admin',
      note: 'Driver reassigned by mobile admin app',
    });
  }

  return NextResponse.json({ success: true });
}
