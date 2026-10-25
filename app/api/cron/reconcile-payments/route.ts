import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { payments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { stripe } from '@/lib/stripe';
import { checkoutAndIntentAgree, stripePaymentIdentity } from '@/lib/payments/stripe-webhook';
import { persistStripeWebhook, type VerifiedStripePayment } from '@/lib/payments/stripe-webhook-store';
import { commitReservationsForBooking } from '@/lib/inventory/stock-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pendingPayments = await db.select().from(payments).where(eq(payments.status, 'pending')).limit(100);
  let reconciled = 0;
  let skipped = 0;
  let failed = 0;
  for (const payment of pendingPayments) {
    try {
      let intent: Stripe.PaymentIntent | null = null;
      let checkout: Stripe.Checkout.Session | null = null;
      if (payment.stripePiId.startsWith('cs_')) {
        checkout = await stripe.checkout.sessions.retrieve(payment.stripePiId, { expand: ['payment_intent'] });
        intent = typeof checkout.payment_intent === 'string'
          ? await stripe.paymentIntents.retrieve(checkout.payment_intent)
          : checkout.payment_intent;
      } else if (payment.stripePiId.startsWith('pi_')) {
        intent = await stripe.paymentIntents.retrieve(payment.stripePiId);
      }
      const identity = intent ? stripePaymentIdentity(intent, checkout?.id)
        : checkout ? stripePaymentIdentity(checkout) : null;
      const sessionIdentity = checkout ? stripePaymentIdentity(checkout) : null;
      if (!identity || identity.bookingId !== payment.bookingId ||
        (checkout && (!sessionIdentity || (intent && !checkoutAndIntentAgree(sessionIdentity, identity))))) {
        skipped += 1;
        continue;
      }
      let outcome: VerifiedStripePayment['outcome'] | null = null;
      if (intent?.status === 'succeeded' && intent.amount_received === identity.amountPence &&
        (!checkout || (checkout.status === 'complete' && checkout.payment_status === 'paid'))) {
        outcome = 'succeeded';
      } else if (checkout?.status === 'expired' && checkout.payment_status !== 'paid') {
        outcome = 'expired';
      } else if (intent?.status === 'canceled') {
        outcome = 'failed';
      }
      if (!outcome) { skipped += 1; continue; }
      const saved = await persistStripeWebhook({
        eventId: `reconcile:cron:${identity.paymentIntentId ?? identity.sessionId}:${outcome}`,
        eventType: 'server_reconciliation.stripe_payment', source: 'system',
        createdAt: new Date(), outcome, payment: identity,
        expiresAt: checkout?.expires_at ? new Date(checkout.expires_at * 1000) : null,
      });
      if (saved.state === 'ignored' || saved.state === 'needs_checking') { skipped += 1; continue; }
      if (outcome === 'succeeded') {
        const stock = await commitReservationsForBooking({
          bookingId: identity.bookingId, actor: 'system',
          note: `Verified Stripe reconciliation: ${identity.paymentIntentId}`,
        });
        if (!stock.success) throw new Error('Inventory commitment requires retry');
      }
      reconciled += 1;
    } catch (error) {
      failed += 1;
      console.error('[reconcile-payments] payment reconciliation failed', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  return NextResponse.json({ reconciled, skipped, failed });
}
