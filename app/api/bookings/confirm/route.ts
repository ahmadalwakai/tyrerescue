import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  bookings,
  bookingStatusHistory,
  payments,
  inventoryReservations,
  inventoryMovements,
  tyreProducts,
  bookingTyres,
  pricingRules,
} from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getPaymentIntent } from '@/lib/stripe';
import { createNotificationAndSend } from '@/lib/email/resend';
import {
  bookingConfirmed,
  paymentReceipt,
  adminNewBooking,
} from '@/lib/email/templates';
import { v4 as uuidv4 } from 'uuid';
import { createAdminNotification } from '@/lib/notifications';
import { sendVoodooSms } from '@/lib/voodoo-sms';
import { buildBookingConfirmationSmsMessage } from '@/lib/quick-book-message-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const confirmSchema = z.object({
  bookingId: z.string().min(1),
  paymentIntentId: z.string().startsWith('pi_'),
  redirectStatus: z.string().optional(),
});

/**
 * POST /api/bookings/confirm
 *
 * Client-side payment confirmation. Called by the success page after Stripe
 * redirects back. Verifies the PaymentIntent directly with Stripe and
 * transitions the booking from awaiting_payment → paid.
 *
 * The webhook is a safety net; this route is the primary confirmation path.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { bookingId: refNumber, paymentIntentId } = parsed.data;

    // 1. Look up booking by refNumber
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, refNumber))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Idempotency: if already paid (or further), return current status
    if (booking.status !== 'awaiting_payment') {
      return NextResponse.json({ status: booking.status });
    }

    // 2. Verify payment with Stripe
    const pi = await getPaymentIntent(paymentIntentId);

    if (pi.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Payment not successful (status: ${pi.status})` },
        { status: 402 },
      );
    }

    // Ensure this PaymentIntent actually belongs to this booking
    if (pi.metadata?.bookingId !== booking.id) {
      return NextResponse.json({ error: 'Payment mismatch' }, { status: 400 });
    }

    // 3. Idempotency: check if payment record already exists
    const [existingPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePiId, paymentIntentId))
      .limit(1);

    if (existingPayment && existingPayment.status === 'succeeded') {
      // Payment already recorded (by webhook) — make sure booking status is up-to-date
      if (booking.status === 'awaiting_payment') {
        await db
          .update(bookings)
          .set({ status: 'paid', updatedAt: new Date() })
          .where(eq(bookings.id, booking.id));
      }
      return NextResponse.json({ status: 'paid' });
    }

    // 4. Record payment
    if (existingPayment) {
      await db
        .update(payments)
        .set({
          status: 'succeeded',
          stripePayload: pi as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));
    } else {
      await db.insert(payments).values({
        id: uuidv4(),
        bookingId: booking.id,
        stripePiId: paymentIntentId,
        amount: (pi.amount / 100).toString(),
        currency: pi.currency,
        status: 'succeeded',
        stripePayload: pi as unknown as Record<string, unknown>,
      });
    }

    // 5. Update booking status
    await db
      .update(bookings)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(eq(bookings.id, booking.id));

    // 6. Record status history
    await db.insert(bookingStatusHistory).values({
      id: uuidv4(),
      bookingId: booking.id,
      fromStatus: 'awaiting_payment',
      toStatus: 'paid',
      actorUserId: null,
      actorRole: 'system',
      note: `Payment confirmed via client-side verification (${paymentIntentId})`,
    });

    // 7. Mark inventory reservations permanent
    await db
      .update(inventoryReservations)
      .set({ released: false })
      .where(
        and(
          eq(inventoryReservations.bookingId, booking.id),
          eq(inventoryReservations.released, false),
        ),
      );

    // 8. Record inventory movements
    const tyresInBooking = await db
      .select()
      .from(bookingTyres)
      .where(eq(bookingTyres.bookingId, booking.id));

    for (const bookingTyre of tyresInBooking) {
      if (!bookingTyre.tyreId) continue;
      const [tyre] = await db
        .select()
        .from(tyreProducts)
        .where(eq(tyreProducts.id, bookingTyre.tyreId))
        .limit(1);

      if (tyre) {
        await db.insert(inventoryMovements).values({
          id: uuidv4(),
          tyreId: bookingTyre.tyreId,
          bookingId: booking.id,
          movementType: 'sale',
          quantityDelta: -bookingTyre.quantity,
          stockAfter: tyre.stockNew ?? 0,
          actorUserId: null,
          note: `Sold via booking ${booking.refNumber}`,
        });
      }
    }

    // 9. Send emails (fire-and-forget — don't block response)
    sendConfirmationEmails(booking, tyresInBooking).catch((err) =>
      console.error('Email dispatch error:', err),
    );

    // 9b. Send booking confirmation SMS (fire-and-forget)
    if (booking.customerPhone) {
      const siteUrl = process.env.NEXTAUTH_URL || 'https://www.tyrerescue.uk';
      sendVoodooSms({
        to: booking.customerPhone,
        message: buildBookingConfirmationSmsMessage({
          customerName: booking.customerName,
          refNumber: booking.refNumber,
          trackingUrl: `${siteUrl}/tracking/${booking.refNumber}`,
        }),
      }).catch((err) => console.error('Booking confirmation SMS error:', err));
    }

    // 10. Admin notification (fire-and-forget)
    createAdminNotification({
      type: 'payment.received',
      title: 'Payment Received',
      body: `£${parseFloat(booking.totalAmount?.toString() ?? '0').toFixed(2)} from ${booking.customerName} — ${booking.refNumber}`,
      entityType: 'payment',
      entityId: booking.id,
      link: `/admin/bookings/${booking.refNumber}`,
      severity: 'success',
      metadata: { refNumber: booking.refNumber, amount: booking.totalAmount },
    }).catch(console.error);

    return NextResponse.json({ status: 'paid' });
  } catch (error) {
    console.error('Confirm route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function sendConfirmationEmails(
  booking: typeof bookings.$inferSelect,
  tyresInBooking: (typeof bookingTyres.$inferSelect)[],
) {
  const siteUrl = process.env.NEXTAUTH_URL || 'https://www.tyrerescue.uk';
  const trackingUrl = `${siteUrl}/tracking/${booking.refNumber}`;

  // Build tyre summary
  let tyreSummary = 'Tyre service';
  let tyreSizeDisplay = 'N/A';
  if (tyresInBooking.length > 0 && tyresInBooking[0].tyreId) {
    const [tyre] = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.id, tyresInBooking[0].tyreId))
      .limit(1);
    if (tyre) {
      tyreSummary = `${tyre.brand} ${tyre.pattern} ${tyre.sizeDisplay}`;
      tyreSizeDisplay = tyre.sizeDisplay;
    }
  }

  const priceSnapshot = booking.priceSnapshot as {
    subtotal: number;
    vatAmount: number;
    total: number;
  };

  // Customer: booking confirmation
  try {
    const confirmedEmail = bookingConfirmed({
      customerName: booking.customerName,
      refNumber: booking.refNumber,
      bookingType: booking.bookingType as 'emergency' | 'scheduled',
      serviceType: booking.serviceType,
      scheduledAt: booking.scheduledAt || undefined,
      address: booking.addressLine,
      tyreSummary,
      quantity: booking.quantity,
      trackingUrl,
    });
    await createNotificationAndSend({
      to: booking.customerEmail,
      subject: confirmedEmail.subject,
      html: confirmedEmail.html,
      type: 'booking-confirmed',
      userId: booking.userId,
      bookingId: booking.id,
    });
  } catch (e) {
    console.error('Failed to send booking confirmation email:', e);
  }

  // Customer: payment receipt
  try {
    const vatRules = await db
      .select({ key: pricingRules.key, value: pricingRules.value })
      .from(pricingRules)
      .where(inArray(pricingRules.key, ['vat_registered', 'vat_number']));
    const vatMap = new Map(vatRules.map((r) => [r.key, r.value]));

    const receiptEmail = paymentReceipt({
      customerName: booking.customerName,
      refNumber: booking.refNumber,
      invoiceDate: new Date(),
      lineItems: [
        {
          description: `${tyreSummary} x${booking.quantity}`,
          quantity: booking.quantity,
          unitPrice: priceSnapshot.subtotal / booking.quantity,
          total: priceSnapshot.subtotal,
        },
      ],
      subtotal: priceSnapshot.subtotal,
      vatAmount: priceSnapshot.vatAmount,
      total: priceSnapshot.total,
      vatRegistered: vatMap.get('vat_registered') === 'true',
      vatNumber: vatMap.get('vat_number') || '',
    });
    await createNotificationAndSend({
      to: booking.customerEmail,
      subject: receiptEmail.subject,
      html: receiptEmail.html,
      type: 'payment-receipt',
      userId: booking.userId,
      bookingId: booking.id,
    });
  } catch (e) {
    console.error('Failed to send payment receipt email:', e);
  }

  // Admin notification
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    try {
      const adminNotification = adminNewBooking(
        {
          refNumber: booking.refNumber,
          bookingType: booking.bookingType as 'emergency' | 'scheduled',
          serviceType: booking.serviceType,
          customerName: booking.customerName,
          customerPhone: booking.customerPhone,
          customerEmail: booking.customerEmail,
          address: booking.addressLine,
          lat: parseFloat(booking.lat),
          lng: parseFloat(booking.lng),
          tyreSizeDisplay,
          quantity: booking.quantity,
          total: priceSnapshot.total,
          scheduledAt: booking.scheduledAt || undefined,
        },
        `${siteUrl}/admin/bookings/${booking.id}`,
      );
      await createNotificationAndSend({
        to: adminEmail,
        subject: adminNotification.subject,
        html: adminNotification.html,
        type: 'admin-new-booking',
        bookingId: booking.id,
      });
    } catch (e) {
      console.error('Failed to send admin notification:', e);
    }
  }
}
