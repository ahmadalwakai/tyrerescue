import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { authorizeCustomerBooking } from '@/lib/customer-booking-access';
import { getPaymentIntent } from '@/lib/stripe';
import { stripePaymentIdentity, validateStripePaymentMatch } from '@/lib/payments/stripe-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: {
    'Cache-Control': 'private, no-store', Vary: 'Authorization, X-Booking-Access, Cookie',
  } });
}

/** Recover this booking's existing payment. This route never creates or charges one. */
export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const refNumber = (await params).ref.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(refNumber)) return response({ error: 'Invalid booking reference' }, 400);

    const [booking] = await db.select({
      id: bookings.id, refNumber: bookings.refNumber, userId: bookings.userId,
      status: bookings.status, totalAmount: bookings.totalAmount,
      stripePiId: bookings.stripePiId, stripeDepositPiId: bookings.stripeDepositPiId,
      depositAmountPence: bookings.depositAmountPence,
    }).from(bookings).where(eq(bookings.refNumber, refNumber)).limit(1);
    if (!booking) return response({ error: 'Booking not found' }, 404);
    if (!await authorizeCustomerBooking(request, booking)) return response({ error: 'Unauthorized' }, 401);

    const paymentIntentId = booking.stripePiId;
    const expectedPaymentIntentId = new URL(request.url).searchParams.get('paymentIntentId');
    if (expectedPaymentIntentId && expectedPaymentIntentId !== paymentIntentId) return response({
      error: 'This booking has a different payment record. Please contact the team before paying.', code: 'PAYMENT_REQUIRES_CHECK',
    }, 409);
    if (!paymentIntentId?.startsWith('pi_')) return response({
      error: 'The team needs to check this payment. Do not make another payment.', code: 'PAYMENT_REQUIRES_CHECK',
    }, 409);

    const pi = await getPaymentIntent(paymentIntentId);
    const identity = stripePaymentIdentity(pi);
    const match = pi.id === paymentIntentId && identity?.purpose === 'full'
      ? validateStripePaymentMatch(identity, booking) : { valid: false as const };
    if (!match.valid || (pi.status === 'succeeded' && pi.amount_received !== match.expectedAmountPence)) {
      return response({ error: 'The team needs to check this payment. Do not make another payment.', code: 'PAYMENT_MISMATCH' }, 409);
    }

    const unpaidBooking = ['awaiting_payment', 'payment_failed', 'draft'].includes(booking.status);
    const resumableStatus = ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status);
    const clientSecret = pi.client_secret;
    const canResume = unpaidBooking && resumableStatus && pi.amount_received === 0
      && typeof clientSecret === 'string' && clientSecret.startsWith(`${paymentIntentId}_secret_`);
    return response({ paymentIntentId, status: pi.status, canResume, amountPence: match.expectedAmountPence, currency: 'gbp',
      ...(canResume ? { clientSecret } : {}),
    });
  } catch (error) {
    console.error('[customer-payment-recovery] failed:', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return response({ error: 'Unable to check this payment. Please try again or contact the team.' }, 500);
  }
}
