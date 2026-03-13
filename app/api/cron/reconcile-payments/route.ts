import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { payments, bookings } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find payments in pending state
  const pendingPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.status, 'pending'));

  let reconciled = 0;

  for (const payment of pendingPayments) {
    try {
      const pi = await stripe.paymentIntents.retrieve(payment.stripePiId);

      if (pi.status === 'succeeded' && payment.status !== 'succeeded') {
        await db
          .update(payments)
          .set({ status: 'succeeded', updatedAt: new Date() })
          .where(eq(payments.id, payment.id));

        // Update booking status if still waiting for payment
        if (payment.bookingId) {
          const [booking] = await db
            .select({ status: bookings.status })
            .from(bookings)
            .where(eq(bookings.id, payment.bookingId))
            .limit(1);

          if (booking && booking.status === 'pending_payment') {
            await db
              .update(bookings)
              .set({ status: 'paid', updatedAt: new Date() })
              .where(eq(bookings.id, payment.bookingId));
          }
        }
        reconciled++;
      } else if (pi.status === 'canceled') {
        await db
          .update(payments)
          .set({ status: 'canceled', updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
        reconciled++;
      }
    } catch {
      // Skip individual failures, continue with rest
    }
  }

  return NextResponse.json({ reconciled });
}
