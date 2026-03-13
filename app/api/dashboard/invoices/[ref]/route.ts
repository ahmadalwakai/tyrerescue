import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings, payments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  _request: Request,
  props: { params: Promise<{ ref: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ref } = await props.params;

  const [booking] = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      serviceType: bookings.serviceType,
      subtotal: bookings.subtotal,
      vatAmount: bookings.vatAmount,
      totalAmount: bookings.totalAmount,
      createdAt: bookings.createdAt,
      status: bookings.status,
      userId: bookings.userId,
    })
    .from(bookings)
    .where(and(eq(bookings.refNumber, ref), eq(bookings.userId, session.user.id)))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const [payment] = await db
    .select({ stripePiId: payments.stripePiId, status: payments.status })
    .from(payments)
    .where(eq(payments.bookingId, booking.id))
    .limit(1);

  return NextResponse.json({
    invoice: {
      refNumber: booking.refNumber,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      serviceType: booking.serviceType,
      subtotal: booking.subtotal,
      vatAmount: booking.vatAmount,
      totalAmount: booking.totalAmount,
      createdAt: booking.createdAt,
      paymentStatus: payment?.status ?? 'unknown',
      stripePiId: payment?.stripePiId ?? null,
    },
  });
}
