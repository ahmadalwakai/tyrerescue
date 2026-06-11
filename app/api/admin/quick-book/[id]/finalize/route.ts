import { NextResponse } from 'next/server';
import { getAppOrigin, getOutboundUrl } from '@/lib/config/site';
import { requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  quickBookings,
  bookings,
  bookingTyres,
  bookingStatusHistory,
  invoices,
  invoiceItems,
  payments,
  tyreProducts,
} from '@/lib/db/schema';
import { eq, count, ilike } from 'drizzle-orm';
import { generateRefNumber } from '@/lib/utils';
import {
  calculateQuickBookPricing,
  extractQuickBookTyreSnapshot,
  QuickBookPricingError,
  type QuickBookServiceType,
} from '@/lib/quick-book-pricing';
import type { PricingContext } from '@/lib/pricing-engine';
import { v4 as uuidv4 } from 'uuid';
import { createAdminNotification } from '@/lib/notifications';
import { sendUrgentBookingTopicPush } from '@/lib/notifications/urgent-booking-push';
import { createCheckoutSession } from '@/lib/stripe';
import { resolveDistance } from '@/lib/mapbox';
import { loadAvailableDriverDistanceCandidates } from '@/lib/driver-distance-candidates';
import { GARAGE_ADDRESS } from '@/lib/garage';
import { commitReservationsForBooking } from '@/lib/inventory/stock-service';
import { ensureTrackingSession } from '@/lib/tracking-session';
import { getWeatherPricingContext, type WeatherPricingContext } from '@/lib/weather';
import { validateRecipientEmail } from '@/lib/email/validate-recipient';
import { sendBookingEmailOnce } from '@/lib/email/resend';
import { bookingConfirmed } from '@/lib/email/templates';
import type { CustomerEmailMode } from '@/app/api/admin/quick-book/route';

const SERVICE_MAP: Record<string, string> = {
  fit: 'tyre_replacement',
  repair: 'puncture_repair',
  assess: 'locking_nut_removal',
};

// عنوان احتياطي لعملاء walk-in الذين لا يملكون بريدًا إلكترونيًا حقيقيًا
// يُستخدم فقط لإلزامية حقل customer_email في قاعدة البيانات — لا يُرسَل إليه بريد أبدًا
const WALK_IN_DB_EMAIL = 'phone-booking@tyrerescue.uk';

const COMPANY = {
  name: 'Tyre Rescue',
  address: GARAGE_ADDRESS,
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const [result] = await db
    .select({ cnt: count() })
    .from(invoices)
    .where(ilike(invoices.invoiceNumber, `${prefix}%`));
  const next = (result?.cnt ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse body — paymentMethod defaults to 'stripe'
  let paymentMethod: 'stripe' | 'cash' | 'deposit' = 'stripe';
  let depositPercent = 0.20;
  let customerEmailMode: CustomerEmailMode = 'walk_in_customer';
  try {
    const body = await request.json();
    if (body.paymentMethod === 'cash') paymentMethod = 'cash';
    if (body.paymentMethod === 'deposit') paymentMethod = 'deposit';
    if (typeof body.depositPercent === 'number' && Number.isFinite(body.depositPercent)) {
      const clamped = Math.min(0.5, Math.max(0.05, body.depositPercent));
      depositPercent = Math.round(clamped * 10000) / 10000;
    }
    if (body.customerEmailMode === 'send_customer_confirmation') {
      customerEmailMode = 'send_customer_confirmation';
    }
  } catch {
    // empty body → defaults
  }

  // Load the quick booking
  const [qb] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, id))
    .limit(1);

  if (!qb) {
    return NextResponse.json({ error: 'Quick booking not found' }, { status: 404 });
  }

  if (qb.bookingId) {
    return NextResponse.json(
      { error: 'Already finalized', bookingId: qb.bookingId },
      { status: 409 }
    );
  }

  // Must have location to finalize
  if (!qb.locationLat || !qb.locationLng) {
    return NextResponse.json(
      { error: 'Location required before finalizing' },
      { status: 400 }
    );
  }

  // التحقق من البريد الإلكتروني إذا طُلب إرسال تأكيد للعميل
  let confirmedCustomerEmail: string | null = null;
  if (customerEmailMode === 'send_customer_confirmation') {
    const emailCheck = validateRecipientEmail(qb.customerEmail);
    if (!emailCheck.ok) {
      return NextResponse.json(
        { error: `Cannot send confirmation: ${emailCheck.reason}. Update the customer email and try again.` },
        { status: 400 },
      );
    }
    confirmedCustomerEmail = emailCheck.email;
  }

  const lat = Number(qb.locationLat);
  const lng = Number(qb.locationLng);

  const fallbackDistanceKm = qb.distanceKm ? Number(qb.distanceKm) : NaN;
  let resolvedDistanceMiles = Number.isFinite(fallbackDistanceKm)
    ? fallbackDistanceKm * 0.621371
    : 5;
  let resolvedDistanceSource: 'driver' | 'garage' = 'garage';
  let resolvedDurationMinutes: number | null = null;

  try {
    const driverCandidates = await loadAvailableDriverDistanceCandidates();
    const distanceResult = await resolveDistance({ lat, lng }, driverCandidates);
    resolvedDistanceMiles = distanceResult.distanceMiles;
    resolvedDistanceSource = distanceResult.distanceSource;
    resolvedDurationMinutes = distanceResult.durationMinutes ?? null;
  } catch (distanceError) {
    console.error('[quick-book:finalize] distance resolution fallback', distanceError);
  }

  const quickBreakdown = qb.priceBreakdown as Record<string, unknown> | null;
  if (resolvedDurationMinutes == null) {
    const existingEta = (quickBreakdown?.serviceOrigin as { etaMinutes?: unknown } | undefined)?.etaMinutes;
    resolvedDurationMinutes = typeof existingEta === 'number' && Number.isFinite(existingEta)
      ? existingEta
      : null;
  }

  let weatherContext: WeatherPricingContext | null = null;
  try {
    weatherContext = await getWeatherPricingContext({
      latitude: lat,
      longitude: lng,
    });
  } catch {
    weatherContext = null;
  }
  const pricingContext: PricingContext =
    typeof quickBreakdown?.pricingContext === 'string'
      ? (quickBreakdown.pricingContext as PricingContext)
      : 'admin_quick_book';

  const resolvedDistanceKm = Math.round(resolvedDistanceMiles * 1.60934 * 100) / 100;

  const serviceType = qb.serviceType as QuickBookServiceType;
  const quantity = qb.tyreCount ?? 1;

  const selectedTyreSnapshot = extractQuickBookTyreSnapshot({
    selectedTyreProductId: qb.selectedTyreProductId,
    selectedTyreUnitPrice: qb.selectedTyreUnitPrice,
    selectedTyreBrand: qb.selectedTyreBrand,
    selectedTyrePattern: qb.selectedTyrePattern,
    selectedTyreSizeDisplay: qb.tyreSize,
  });

  if (qb.selectedTyreProductId && !qb.selectedTyreUnitPrice) {
    return NextResponse.json(
      { error: 'Selected tyre product is missing a price snapshot' },
      { status: 400 }
    );
  }

  if (serviceType === 'fit' && !selectedTyreSnapshot) {
    return NextResponse.json(
      { error: 'Cannot finalize fit booking without a selected tyre product' },
      { status: 400 }
    );
  }

  let priced: Awaited<ReturnType<typeof calculateQuickBookPricing>>;
  try {
    priced = await calculateQuickBookPricing({
      serviceType,
      tyreSize: qb.tyreSize ?? null,
      tyreCount: quantity,
      distanceMiles: resolvedDistanceMiles,
      selectedTyreSnapshot,
      resolveTyreFromSize: false,
      requireTyreForFit: serviceType === 'fit',
      adminAdjustmentAmount: Number(qb.adminAdjustmentAmount ?? 0),
      adminAdjustmentReason: qb.adminAdjustmentReason,
      pricingContext,
      durationMinutes: resolvedDurationMinutes,
      weatherContext,
    });
  } catch (error) {
    if (error instanceof QuickBookPricingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[quick-book:finalize] pricing error', error);
    return NextResponse.json({ error: 'Failed to calculate pricing' }, { status: 500 });
  }

  if (priced.selectedTyreSnapshot) {
    const [existingTyre] = await db
      .select({ id: tyreProducts.id })
      .from(tyreProducts)
      .where(eq(tyreProducts.id, priced.selectedTyreSnapshot.productId))
      .limit(1);

    if (!existingTyre) {
      return NextResponse.json(
        { error: 'Selected tyre product no longer exists' },
        { status: 400 }
      );
    }
  }

  const breakdown = priced.breakdown;

  const refNumber = generateRefNumber();
  const bookingId = uuidv4();

  // يُستخدم عنوان walk-in فقط لتلبية إلزامية العمود في قاعدة البيانات
  // لا يُرسَل إليه بريد إلكتروني في أي حال
  const dbCustomerEmail = qb.customerEmail || WALK_IN_DB_EMAIL;

  const addressLine = qb.locationAddress || qb.locationPostcode || `${lat}, ${lng}`;

  const initialStatus = paymentMethod === 'cash' ? 'paid' : 'awaiting_payment';
  let checkoutUrl: string | null = null;

  const totalInPence = Math.round(breakdown.total * 100);
  const depositAmountPence = paymentMethod === 'deposit' ? Math.round(totalInPence * depositPercent) : null;
  const remainingBalancePence = depositAmountPence ? totalInPence - depositAmountPence : null;

  const invoiceNumber = await generateInvoiceNumber();
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const invoiceItemsData = breakdown.lineItems
    .filter((line) => line.type !== 'subtotal' && line.type !== 'vat' && line.type !== 'total')
    .map((line) => ({
      description: line.label,
      quantity: line.quantity ?? 1,
      unitPrice: line.unitPrice ?? line.amount,
      totalPrice: line.amount,
    }));

  const invoiceStatus = paymentMethod === 'cash' ? 'paid' : 'issued';
  const statusNote = paymentMethod === 'stripe'
    ? 'Quick booking finalized by admin — awaiting Stripe payment'
    : paymentMethod === 'deposit'
    ? 'Quick booking finalized by admin — awaiting deposit payment'
    : 'Quick booking finalized by admin — cash payment collected';

  type BookingWriteExecutor = Pick<typeof db, 'insert' | 'update'>;

  const persistFinalizeWrites = async (executor: BookingWriteExecutor) => {
    await executor.insert(bookings).values({
      id: bookingId,
      refNumber,
      userId: null,
      status: initialStatus,
      paymentType: paymentMethod,
      depositAmountPence,
      remainingBalancePence,
      bookingType: 'emergency',
      serviceType: SERVICE_MAP[serviceType] || 'puncture_repair',
      addressLine,
      lat: String(lat),
      lng: String(lng),
      distanceMiles: resolvedDistanceMiles.toFixed(2),
      distanceSource: resolvedDistanceSource,
      quantity,
      tyreSizeDisplay: qb.tyreSize || null,
      vehicleReg: null,
      vehicleMake: null,
      vehicleModel: null,
      tyrePhotoUrl: null,
      customerName: qb.customerName,
      customerEmail: dbCustomerEmail,
      customerPhone: qb.customerPhone,
      scheduledAt: null,
      priceSnapshot: breakdown,
      subtotal: breakdown.subtotal.toFixed(2),
      vatAmount: breakdown.vatAmount.toFixed(2),
      totalAmount: breakdown.total.toFixed(2),
      quoteExpiresAt: null,
      lockingNutStatus: null,
      hasPreOrderItems: false,
      fulfillmentOption: null,
      notes: qb.notes || 'Admin quick booking (phone call)',
    });

    for (const selection of priced.tyreSelections) {
      await executor.insert(bookingTyres).values({
        id: uuidv4(),
        bookingId,
        tyreId: selection.tyreId,
        quantity: selection.quantity,
        unitPrice: selection.unitPrice.toFixed(2),
        service: selection.service,
      });
    }

    if (paymentMethod === 'stripe') {
      const baseUrl = getAppOrigin();
      const checkout = await createCheckoutSession(
        breakdown.total,
        {
          bookingId,
          refNumber,
          customerEmail: dbCustomerEmail,
        },
        {
          successUrl: `${baseUrl}/admin/bookings/${refNumber}?stripe=success`,
          cancelUrl: `${baseUrl}/admin/bookings/${refNumber}?stripe=cancelled`,
        }
      );
      if (checkout.amountInPence !== totalInPence) {
        throw new Error('PAYMENT_AMOUNT_MISMATCH');
      }

      checkoutUrl = checkout.checkoutUrl;

      await executor
        .update(bookings)
        .set({ stripePiId: checkout.paymentIntentId || checkout.sessionId })
        .where(eq(bookings.id, bookingId));

      await executor.insert(payments).values({
        id: uuidv4(),
        bookingId,
        stripePiId: checkout.paymentIntentId || checkout.sessionId,
        amount: breakdown.total.toFixed(2),
        currency: 'gbp',
        status: 'pending',
      });
    }

    await executor.insert(bookingStatusHistory).values({
      id: uuidv4(),
      bookingId,
      fromStatus: null,
      toStatus: initialStatus,
      actorUserId: session.user.id,
      actorRole: 'admin',
      note: statusNote,
    });

    const [createdInvoice] = await executor.insert(invoices).values({
      invoiceNumber,
      bookingId,
      userId: null,
      status: invoiceStatus,
      customerName: qb.customerName,
      customerEmail: dbCustomerEmail,
      customerPhone: qb.customerPhone,
      customerAddress: addressLine,
      companyName: COMPANY.name,
      companyAddress: COMPANY.address,
      companyPhone: COMPANY.phone,
      companyEmail: COMPANY.email,
      companyVatNumber: null,
      issueDate,
      dueDate,
      subtotal: breakdown.subtotal.toFixed(2),
      vatRate: '0.00',
      vatAmount: breakdown.vatAmount.toFixed(2),
      totalAmount: breakdown.total.toFixed(2),
      notes: `Quick booking ref ${refNumber}`,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    }).returning();

    if (invoiceItemsData.length > 0 && createdInvoice) {
      await executor.insert(invoiceItems).values(
        invoiceItemsData.map((line, index) => ({
          invoiceId: createdInvoice.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice.toFixed(2),
          totalPrice: line.totalPrice.toFixed(2),
          sortOrder: index,
        }))
      );
    }

    await executor
      .update(quickBookings)
      .set({
        bookingId,
        status: 'finalized',
        totalPrice: breakdown.total.toFixed(2),
        basePrice: breakdown.subtotal.toFixed(2),
        distanceKm: resolvedDistanceKm.toFixed(2),
        selectedTyreProductId: priced.selectedTyreSnapshot?.productId ?? null,
        selectedTyreUnitPrice:
          priced.selectedTyreSnapshot?.unitPrice != null
            ? priced.selectedTyreSnapshot.unitPrice.toFixed(2)
            : null,
        selectedTyreBrand: priced.selectedTyreSnapshot?.brand ?? null,
        selectedTyrePattern: priced.selectedTyreSnapshot?.pattern ?? null,
        priceBreakdown: breakdown,
        updatedAt: new Date(),
      })
      .where(eq(quickBookings.id, id));
  };

  try {
    await db.transaction(async (tx) => {
      await persistFinalizeWrites(tx);
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PAYMENT_AMOUNT_MISMATCH') {
      return NextResponse.json(
        {
          error: 'Payment amount mismatch',
          code: 'PAYMENT_AMOUNT_MISMATCH',
        },
        { status: 500 },
      );
    }

    const isUnsupportedTransaction =
      error instanceof Error && error.message.includes('No transactions support');

    if (!isUnsupportedTransaction) {
      throw error;
    }

    console.warn('[quick-book:finalize] transaction unsupported, falling back to non-transactional writes');
    await persistFinalizeWrites(db);
  }

  // Cash quick bookings are paid + confirmed at finalize time.
  if (paymentMethod === 'cash') {
    const commitResult = await commitReservationsForBooking({
      bookingId,
      actor: 'admin',
      actorUserId: session.user.id,
      note: `Quick booking ${refNumber}: cash payment`,
    });
    if (!commitResult.success) {
      console.error(
        `[quick-book:finalize] stock commit failed for ${refNumber}:`,
        commitResult.error,
      );
    }
  }

  // إرسال تأكيد الحجز للعميل إذا طُلب ذلك صراحةً وكان البريد صالحًا
  // هذا fire-and-forget — لا يُعيق استجابة الـ API في حالة الفشل
  if (customerEmailMode === 'send_customer_confirmation' && confirmedCustomerEmail) {
    const siteUrl = getOutboundUrl();
    const trackingUrl = `${siteUrl}/tracking/${refNumber}`;
    const tyreSummary = qb.tyreSize
      ? `${qb.tyreSize} tyre x${quantity}`
      : `${SERVICE_MAP[serviceType] || 'Tyre service'} x${quantity}`;

    void (async () => {
      try {
        const email = bookingConfirmed({
          customerName: qb.customerName,
          refNumber,
          bookingType: 'emergency',
          serviceType: SERVICE_MAP[serviceType] || 'Tyre service',
          address: addressLine,
          tyreSummary,
          quantity,
          trackingUrl,
        });
        await sendBookingEmailOnce({
          to: confirmedCustomerEmail!,
          subject: email.subject,
          html: email.html,
          type: 'booking-confirmed',
          bookingId,
        });
      } catch (err) {
        console.error('[quick-book:finalize] customer confirmation email failed:', err);
      }
    })();
  }

  // Send urgent push for finalized admin emergency quick bookings.
  void sendUrgentBookingTopicPush({
    bookingId,
    customerPhone: qb.customerPhone,
    createdAt: new Date().toISOString(),
    title: 'Emergency booking received',
    body: `${qb.customerName} — ${paymentMethod === 'cash' ? 'paid' : 'awaiting payment'}`,
  }).catch((err: unknown) => console.error('[quick-book:finalize] urgent push failed:', err));

  // Notify admin
  createAdminNotification({
    type: 'booking.created',
    title: 'Quick Booking Finalized',
    body: `${refNumber} — ${qb.customerName} — ${qb.customerPhone}`,
    entityType: 'booking',
    entityId: bookingId,
    link: `/admin/bookings/${refNumber}`,
    severity: 'info',
    createdBy: 'system',
    metadata: {
      refNumber,
      bookingType: 'emergency',
      serviceType: SERVICE_MAP[serviceType] || 'puncture_repair',
      scheduledAt: null,
      customerName: qb.customerName,
      customerPhone: qb.customerPhone,
      important: true,
      updateType: 'created',
      adminPath: `/admin/bookings/${refNumber}`,
    },
  }).catch(console.error);

  ensureTrackingSession(bookingId).catch((err) =>
    console.error('[finalize] ensureTracking failed:', err),
  );

  const paymentUrl = checkoutUrl;

  return NextResponse.json({
    bookingId,
    refNumber,
    invoiceNumber,
    paymentMethod,
    paymentUrl,
    stripeClientSecret: null,
    depositAmountPence: paymentMethod === 'deposit' ? depositAmountPence : null,
    remainingBalancePence: paymentMethod === 'deposit' ? remainingBalancePence : null,
    breakdown: {
      subtotal: breakdown.subtotal,
      vatAmount: breakdown.vatAmount,
      total: breakdown.total,
      lineItems: breakdown.lineItems,
      distanceMiles: breakdown.distanceMiles,
      fittingPrice: breakdown.fittingPrice,
      tyrePrice: breakdown.tyrePrice,
      totalPrice: breakdown.totalPrice,
      adminAdjustmentAmount: breakdown.adminAdjustmentAmount ?? null,
      adminAdjustmentReason: breakdown.adminAdjustmentReason ?? null,
    },
  });
}

/**
 * DELETE /api/admin/quick-book/[id]/finalize
 *
 * Cancels (rolls back) a finalized quick booking that has not yet been paid.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [qb] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, id))
    .limit(1);

  if (!qb) {
    return NextResponse.json({ error: 'Quick booking not found' }, { status: 404 });
  }

  if (!qb.bookingId) {
    return NextResponse.json({ ok: true, alreadyReset: true });
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, qb.bookingId))
    .limit(1);

  if (booking) {
    if (booking.status !== 'awaiting_payment' && booking.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot cancel: booking status is "${booking.status}"` },
        { status: 409 }
      );
    }
    if (booking.depositPaidAt) {
      return NextResponse.json(
        { error: 'Cannot cancel: deposit has already been paid' },
        { status: 409 }
      );
    }
  }

  type BookingWriteExecutor = Pick<typeof db, 'delete' | 'update'>;

  const performRollback = async (executor: BookingWriteExecutor) => {
    if (!qb.bookingId) return;

    await executor.delete(payments).where(eq(payments.bookingId, qb.bookingId));
    await executor
      .delete(bookingStatusHistory)
      .where(eq(bookingStatusHistory.bookingId, qb.bookingId));
    await executor.delete(invoices).where(eq(invoices.bookingId, qb.bookingId));
    await executor.delete(bookings).where(eq(bookings.id, qb.bookingId));

    await executor
      .update(quickBookings)
      .set({ bookingId: null, status: 'pending_location', updatedAt: new Date() })
      .where(eq(quickBookings.id, id));
  };

  try {
    await db.transaction(async (tx) => {
      await performRollback(tx);
    });
  } catch (error) {
    const isUnsupportedTransaction =
      error instanceof Error && error.message.includes('No transactions support');
    if (!isUnsupportedTransaction) {
      console.error('[quick-book:cancel-finalize] failed', error);
      return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
    }
    console.warn('[quick-book:cancel-finalize] transaction unsupported, falling back');
    await performRollback(db);
  }

  return NextResponse.json({ ok: true });
}
