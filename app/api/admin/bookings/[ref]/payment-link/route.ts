import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { getAppOrigin } from '@/lib/config/site';
import { requireAdminMobile } from '@/lib/auth';
import { db, bookings, bookingStatusHistory, payments } from '@/lib/db';
import { createCheckoutSession } from '@/lib/stripe';
import { computeDriverPaymentSummary } from '@/lib/payments/driver-payment';

interface Props {
  params: Promise<{ ref: string }>;
}

// Statuses where collecting a new online payment makes no sense.
const TERMINAL_STATUSES = new Set([
  'cancelled',
  'refunded',
  'paid',
  'completed',
]);

const bodySchema = z.object({
  // Optional explicit amount (pence). When omitted we collect the full
  // outstanding balance derived from the booking. If supplied, it must match
  // the outstanding balance exactly; partial admin links are not supported by
  // the current booking/payment schema.
  amountPence: z.number().int().positive().optional(),
  note: z.string().trim().max(280).optional(),
});

const partialPaymentLinkError = {
  ok: false,
  code: 'PARTIAL_PAYMENT_LINK_NOT_SUPPORTED',
  message:
    'Partial payment links are not supported for this booking. Create a full outstanding balance link instead.',
} as const;

const noOutstandingBalanceError = {
  ok: false,
  code: 'NO_OUTSTANDING_BALANCE',
  message: 'This booking has no outstanding balance to collect.',
} as const;

/**
 * POST /api/admin/bookings/[ref]/payment-link
 *
 * Admin-only. Creates a Stripe Checkout payment link for an EXISTING booking's
 * outstanding balance and records it as a pending payment. This NEVER marks the
 * booking as paid — the Stripe webhook (`type: 'admin_link'`) is the single
 * source of truth for completion.
 */
export async function POST(request: Request, { params }: Props) {
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ref } = await params;

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    // Empty body is allowed — defaults to full outstanding balance.
  }
  const parsed = bodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.refNumber, ref))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (TERMINAL_STATUSES.has(booking.status)) {
    return NextResponse.json(
      { error: `Cannot create a payment link for a booking in status: ${booking.status}` },
      { status: 409 },
    );
  }

  // Derive the outstanding amount the same way the driver app does, so the
  // figures always reconcile across surfaces.
  const summary = computeDriverPaymentSummary({
    paymentType: booking.paymentType,
    totalAmount: booking.totalAmount,
    subtotal: booking.subtotal,
    vatAmount: booking.vatAmount,
    depositAmountPence: booking.depositAmountPence,
    remainingBalancePence: booking.remainingBalancePence,
    depositPaidAt: booking.depositPaidAt,
    stripePiId: booking.stripePiId,
  });

  const outstandingPence = summary.amountToCollectPence;
  if (outstandingPence <= 0) {
    return NextResponse.json(noOutstandingBalanceError, { status: 409 });
  }

  if (
    parsed.data.amountPence !== undefined &&
    parsed.data.amountPence !== outstandingPence
  ) {
    return NextResponse.json(partialPaymentLinkError, { status: 400 });
  }

  const amountPence = outstandingPence;
  const baseUrl = getAppOrigin();
  const checkout = await createCheckoutSession(
    amountPence / 100,
    {
      bookingId: booking.id,
      refNumber: booking.refNumber,
      customerEmail: booking.customerEmail,
    },
    {
      purpose: 'admin_link',
      metadata: {
        adminLinkKind: 'full_outstanding_balance',
        amountPence: String(amountPence),
        outstandingPence: String(outstandingPence),
      },
      description: parsed.data.note?.trim()
        ? parsed.data.note.trim()
        : 'Mobile tyre service — balance',
      successUrl: `${baseUrl}/admin/bookings/${booking.refNumber}?payment=success`,
      cancelUrl: `${baseUrl}/admin/bookings/${booking.refNumber}?payment=cancelled`,
    },
  );

  // Reference Stripe uses to confirm the payment. PaymentIntent id is the
  // webhook key; fall back to the session id when Stripe has not yet attached
  // a PI (mirrors the existing quick-book finalize behaviour).
  const stripeRef = checkout.paymentIntentId ?? checkout.sessionId;
  const createdAtIso = new Date().toISOString();

  // Record a PENDING payment row (existing schema). The webhook flips this to
  // 'succeeded'. payments.stripePiId is unique, giving idempotency for free.
  try {
    await db.insert(payments).values({
      id: uuidv4(),
      bookingId: booking.id,
      stripePiId: stripeRef,
      amount: (amountPence / 100).toFixed(2),
      currency: 'gbp',
      status: 'pending',
      stripePayload: {
        kind: 'admin_payment_link',
        paymentScope: 'full_outstanding_balance',
        sessionId: checkout.sessionId,
        checkoutUrl: checkout.checkoutUrl,
        amountPence,
        outstandingPence,
        createdAtIso,
      },
    });
  } catch (err) {
    // A unique-constraint clash only happens on a rare PI-id reuse; the link
    // itself is still valid, so we log and continue rather than fail the call.
    console.error('[payment-link] failed to record pending payment:', err);
  }

  await db
    .update(bookings)
    .set({ stripePiId: stripeRef, updatedAt: new Date() })
    .where(eq(bookings.id, booking.id));

  await db.insert(bookingStatusHistory).values({
    id: uuidv4(),
    bookingId: booking.id,
    fromStatus: booking.status,
    toStatus: booking.status,
    actorUserId: null,
    actorRole: 'admin',
    note: `Full outstanding payment link created (£${(amountPence / 100).toFixed(2)})${
      parsed.data.note ? ` — ${parsed.data.note}` : ''
    }`,
  });

  return NextResponse.json({
    ok: true,
    refNumber: booking.refNumber,
    bookingId: booking.id,
    paymentUrl: checkout.checkoutUrl,
    sessionId: checkout.sessionId,
    amountPence,
    outstandingPence,
    currency: 'gbp',
    // The link is only SENT/awaiting — never paid until the webhook confirms.
    status: 'awaiting_payment',
    createdAtIso,
  });
}
