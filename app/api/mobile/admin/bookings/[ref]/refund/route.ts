import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, bookings, refunds, bookingStatusHistory } from '@/lib/db';
import { createRefund } from '@/lib/stripe';
import { restoreBookingStock } from '@/lib/inventory/stock-service';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import type { BookingStatus } from '@/lib/state-machine';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function POST(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const body = await request.json();
  const reason = String(body?.reason || '').trim();

  if (!reason) {
    return NextResponse.json({ error: 'Refund reason is required' }, { status: 400 });
  }

  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (!booking.stripePiId) {
    return NextResponse.json({ error: 'Booking has no payment intent to refund' }, { status: 400 });
  }

  const currentStatus = booking.status as BookingStatus;
  if (!['paid', 'driver_assigned', 'completed'].includes(currentStatus)) {
    return NextResponse.json({ error: `Cannot refund booking from ${currentStatus}` }, { status: 400 });
  }

  const pendingStatus: BookingStatus = currentStatus === 'completed' ? 'refunded_partial' : 'cancelled_refund_pending';

  await db.insert(bookingStatusHistory).values({
    bookingId: booking.id,
    fromStatus: currentStatus,
    toStatus: pendingStatus,
    actorUserId: user.id,
    actorRole: 'admin',
    note: `Refund initiated: ${reason}`,
  });

  await db.update(bookings).set({ status: pendingStatus, updatedAt: new Date() }).where(eq(bookings.id, booking.id));

  try {
    const stripeRefund = await createRefund(booking.stripePiId, undefined, reason);

    await db.insert(refunds).values({
      bookingId: booking.id,
      stripeRefundId: stripeRefund.id,
      amount: booking.totalAmount.toString(),
      reason,
      issuedBy: user.id,
    });

    const finalStatus: BookingStatus = currentStatus === 'completed' ? 'refunded_partial' : 'refunded';

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: pendingStatus,
      toStatus: finalStatus,
      actorUserId: user.id,
      actorRole: 'admin',
      note: `Refund completed: ${stripeRefund.id}`,
    });

    await db.update(bookings).set({ status: finalStatus, updatedAt: new Date() }).where(eq(bookings.id, booking.id));

    await restoreBookingStock({
      bookingId: booking.id,
      reason: 'refund',
      actor: 'admin',
      actorUserId: user.id,
      note: `Refund ${stripeRefund.id}: stock restored`,
    });

    return NextResponse.json({ success: true, refundId: stripeRefund.id });
  } catch {
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: pendingStatus,
      toStatus: currentStatus,
      actorUserId: user.id,
      actorRole: 'admin',
      note: 'Refund failed and booking status reverted',
    });

    await db.update(bookings).set({ status: currentStatus, updatedAt: new Date() }).where(eq(bookings.id, booking.id));

    return NextResponse.json({ error: 'Failed to issue refund' }, { status: 500 });
  }
}
