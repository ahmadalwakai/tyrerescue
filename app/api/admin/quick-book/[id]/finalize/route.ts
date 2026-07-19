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
  extractQuickBookTyreLineSelections,
  extractQuickBookTyreSnapshot,
  QuickBookPricingError,
  type QuickBookTyreLineInput,
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
import { recordPaymentEvent } from '@/lib/payments/payment-summary';

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

const MIN_STRIPE_CHECKOUT_AMOUNT_PENCE = 30;

function formatPence(amountPence: number): string {
  return `£${(amountPence / 100).toFixed(2)}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

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
  let bodyTyreLines: QuickBookTyreLineInput[] | null = null;
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
    const hasBodyTyreLines = Array.isArray(body.tyreLines) || Array.isArray(body.items);
    const rawLines = Array.isArray(body.tyreLines)
      ? body.tyreLines
      : Array.isArray(body.items)
      ? body.items
      : [];
    const parsedBodyTyreLines = rawLines.flatMap((line: unknown, index: number) => {
      if (!line || typeof line !== 'object') return [];
      const value = line as Record<string, unknown>;
      const size = typeof value.size === 'string' ? value.size.trim() : '';
      const quantity = Number(value.quantity);
      if (!size || !Number.isFinite(quantity) || quantity < 1) return [];
      return [{
        id: typeof value.id === 'string' ? value.id : `tyre-${index + 1}`,
        size,
        quantity: Math.max(1, Math.min(10, Math.round(quantity))),
        brand: typeof value.brand === 'string' ? value.brand : null,
        pattern: typeof value.pattern === 'string' ? value.pattern : null,
        season: typeof value.season === 'string' ? value.season : null,
        source: typeof value.source === 'string' ? value.source : null,
        price: typeof value.price === 'number' && Number.isFinite(value.price) ? value.price : null,
      }];
    });
    bodyTyreLines = hasBodyTyreLines ? parsedBodyTyreLines : null;
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
  let resolvedServiceDistanceMiles = Number.isFinite(fallbackDistanceKm)
    ? fallbackDistanceKm * 0.621371
    : 5;
  let resolvedPricingDistanceMiles = resolvedServiceDistanceMiles;
  let resolvedDistanceSource: 'driver' | 'garage' = 'garage';
  let resolvedDurationMinutes: number | null = null;
  let resolvedPricingDurationMinutes: number | null = null;
  let resolvedGarageDistanceMiles: number | null = null;
  let resolvedPricingDistanceSource: 'driver' | 'garage' | 'garage_floor' = 'garage';
  let resolvedDistanceFloorApplied = false;
  let usedFreshDistanceResult = false;

  try {
    const driverCandidates = await loadAvailableDriverDistanceCandidates();
    const distanceResult = await resolveDistance({ lat, lng }, driverCandidates);
    resolvedServiceDistanceMiles = distanceResult.distanceMiles;
    resolvedPricingDistanceMiles = distanceResult.pricingDistanceMiles;
    resolvedDistanceSource = distanceResult.distanceSource;
    resolvedDurationMinutes = distanceResult.durationMinutes ?? null;
    resolvedPricingDurationMinutes = distanceResult.distanceFloorApplied
      ? distanceResult.garageDurationMinutes ?? distanceResult.durationMinutes ?? null
      : distanceResult.durationMinutes ?? null;
    resolvedGarageDistanceMiles = distanceResult.garageDistanceMiles;
    resolvedPricingDistanceSource = distanceResult.pricingDistanceSource;
    resolvedDistanceFloorApplied = distanceResult.distanceFloorApplied;
    usedFreshDistanceResult = true;
  } catch (distanceError) {
    console.error('[quick-book:finalize] distance resolution fallback', distanceError);
  }

  const quickBreakdown = qb.priceBreakdown as Record<string, unknown> | null;
  if (
    !usedFreshDistanceResult &&
    typeof quickBreakdown?.pricingDistanceMiles === 'number' &&
    Number.isFinite(quickBreakdown.pricingDistanceMiles)
  ) {
    resolvedPricingDistanceMiles = quickBreakdown.pricingDistanceMiles;
  }
  if (resolvedDurationMinutes == null) {
    const existingEta = (quickBreakdown?.serviceOrigin as { etaMinutes?: unknown } | undefined)?.etaMinutes;
    resolvedDurationMinutes = typeof existingEta === 'number' && Number.isFinite(existingEta)
      ? existingEta
      : null;
  }
  if (resolvedPricingDurationMinutes == null) {
    resolvedPricingDurationMinutes =
      typeof quickBreakdown?.pricingDurationMinutes === 'number' && Number.isFinite(quickBreakdown.pricingDurationMinutes)
        ? quickBreakdown.pricingDurationMinutes
        : resolvedDurationMinutes;
  }
  if (resolvedGarageDistanceMiles == null) {
    resolvedGarageDistanceMiles =
      typeof quickBreakdown?.garageDistanceMiles === 'number' && Number.isFinite(quickBreakdown.garageDistanceMiles)
        ? quickBreakdown.garageDistanceMiles
        : null;
  }
  if (!usedFreshDistanceResult) {
    if (
      quickBreakdown?.pricingDistanceSource === 'driver' ||
      quickBreakdown?.pricingDistanceSource === 'garage' ||
      quickBreakdown?.pricingDistanceSource === 'garage_floor'
    ) {
      resolvedPricingDistanceSource = quickBreakdown.pricingDistanceSource as 'driver' | 'garage' | 'garage_floor';
    }
    if (typeof quickBreakdown?.distanceFloorApplied === 'boolean') {
      resolvedDistanceFloorApplied = quickBreakdown.distanceFloorApplied;
    }
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
  const adminDistanceLimitMiles =
    typeof quickBreakdown?.adminDistanceLimitMiles === 'number' && Number.isFinite(quickBreakdown.adminDistanceLimitMiles)
      ? quickBreakdown.adminDistanceLimitMiles
      : undefined;

  const resolvedDistanceKm = Math.round(resolvedServiceDistanceMiles * 1.60934 * 100) / 100;

  const serviceType = qb.serviceType as QuickBookServiceType;
  const quantity = qb.tyreCount ?? 1;
  const storedTyreLineSelections = extractQuickBookTyreLineSelections({ priceBreakdown: qb.priceBreakdown });
  const fallbackTyreLines: QuickBookTyreLineInput[] = serviceType === 'assess'
    ? []
    : bodyTyreLines !== null
    ? bodyTyreLines
    : storedTyreLineSelections.length > 0
    ? storedTyreLineSelections.map((line, index) => ({
        id: line.id || `tyre-${index + 1}`,
        size: line.normalizedSize ?? line.sizeDisplay ?? line.requestedSize,
        quantity: line.quantity,
        brand: line.brand,
        pattern: line.pattern,
        price: line.unitPrice,
      }))
    : qb.tyreSize
    ? [{ id: 'tyre-1', size: qb.tyreSize, quantity }]
    : [];
  const totalQuantity = fallbackTyreLines.reduce((sum, line) => sum + line.quantity, 0) || quantity;
  const primaryTyreSizeDisplay = fallbackTyreLines[0]?.size ?? qb.tyreSize ?? null;

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

  if (serviceType === 'fit' && !selectedTyreSnapshot && storedTyreLineSelections.length === 0) {
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
      tyreCount: totalQuantity,
      tyreLines: fallbackTyreLines,
      distanceMiles: resolvedPricingDistanceMiles,
      selectedTyreSnapshot: storedTyreLineSelections.length > 0 ? null : selectedTyreSnapshot,
      selectedTyreSnapshots: storedTyreLineSelections,
      resolveTyreFromSize: false,
      requireTyreForFit: serviceType === 'fit',
      adminAdjustmentAmount: Number(qb.adminAdjustmentAmount ?? 0),
      adminAdjustmentReason: qb.adminAdjustmentReason,
      adminDistanceLimitMiles,
      pricingContext,
      durationMinutes: resolvedPricingDurationMinutes,
      weatherContext,
    });
  } catch (error) {
    if (error instanceof QuickBookPricingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[quick-book:finalize] pricing error', error);
    return NextResponse.json({ error: 'Failed to calculate pricing' }, { status: 500 });
  }

  for (const selection of priced.tyreLineSelections) {
    const [existingTyre] = await db
      .select({ id: tyreProducts.id })
      .from(tyreProducts)
      .where(eq(tyreProducts.id, selection.productId))
      .limit(1);

    if (!existingTyre) {
      return NextResponse.json(
        { error: 'Selected tyre product no longer exists' },
        { status: 400 }
      );
    }
  }

  const breakdown = {
    ...priced.breakdown,
    tyreLines: priced.tyreLineSelections,
    ...(adminDistanceLimitMiles != null ? { adminDistanceLimitMiles } : {}),
    serviceDistanceMiles: resolvedServiceDistanceMiles,
    pricingDistanceMiles: priced.breakdown.distanceMiles,
    pricingDurationMinutes: resolvedPricingDurationMinutes,
    garageDistanceMiles: resolvedGarageDistanceMiles,
    pricingDistanceSource: resolvedPricingDistanceSource,
    distanceFloorApplied: resolvedDistanceFloorApplied,
  };
  const tyreSummaryLines = priced.tyreLineSelections.length > 0
    ? priced.tyreLineSelections.map((line) => {
        const size = line.sizeDisplay ?? line.normalizedSize ?? line.requestedSize ?? 'Tyre';
        return `${size} tyre x${line.quantity}`;
      })
    : fallbackTyreLines.map((line) => `${line.size ?? 'Tyre'} tyre x${line.quantity}`);
  const tyreSummary = tyreSummaryLines.length > 0
    ? tyreSummaryLines.join(', ')
    : `${SERVICE_MAP[serviceType] || 'Tyre service'} x${totalQuantity}`;

  const refNumber = generateRefNumber();
  const bookingId = uuidv4();

  // يُستخدم عنوان walk-in فقط لتلبية إلزامية العمود في قاعدة البيانات
  // لا يُرسَل إليه بريد إلكتروني في أي حال
  const dbCustomerEmail = qb.customerEmail || WALK_IN_DB_EMAIL;

  const addressLine = qb.locationAddress || qb.locationPostcode || `${lat}, ${lng}`;

  const initialStatus = 'awaiting_payment';
  let checkoutUrl: string | null = null;
  let checkoutSessionId: string | null = null;
  let checkoutPaymentIntentId: string | null = null;
  let checkoutExpiresAt: Date | null = null;

  const totalInPence = Math.round(breakdown.total * 100);
  const depositAmountPence = paymentMethod === 'deposit' ? Math.round(totalInPence * depositPercent) : null;
  const remainingBalancePence = depositAmountPence ? totalInPence - depositAmountPence : null;

  if (!Number.isFinite(totalInPence) || totalInPence <= 0) {
    return NextResponse.json(
      {
        error: 'Quote total must be greater than zero before finalizing.',
        code: 'INVALID_PAYMENT_AMOUNT',
        amountPence: Number.isFinite(totalInPence) ? totalInPence : null,
      },
      { status: 400 },
    );
  }

  if (
    (paymentMethod === 'stripe' || paymentMethod === 'deposit') &&
    totalInPence < MIN_STRIPE_CHECKOUT_AMOUNT_PENCE
  ) {
    return NextResponse.json(
      {
        error: `Payment links need a quote of at least ${formatPence(MIN_STRIPE_CHECKOUT_AMOUNT_PENCE)}. Current quote is ${formatPence(totalInPence)}.`,
        code: 'PAYMENT_AMOUNT_TOO_LOW',
        amountPence: totalInPence,
        minimumAmountPence: MIN_STRIPE_CHECKOUT_AMOUNT_PENCE,
      },
      { status: 400 },
    );
  }

  if (
    paymentMethod === 'deposit' &&
    depositAmountPence != null &&
    depositAmountPence < MIN_STRIPE_CHECKOUT_AMOUNT_PENCE
  ) {
    return NextResponse.json(
      {
        error: `Deposit payment links need a deposit of at least ${formatPence(MIN_STRIPE_CHECKOUT_AMOUNT_PENCE)}. Current deposit is ${formatPence(depositAmountPence)}.`,
        code: 'DEPOSIT_AMOUNT_TOO_LOW',
        amountPence: depositAmountPence,
        minimumAmountPence: MIN_STRIPE_CHECKOUT_AMOUNT_PENCE,
      },
      { status: 400 },
    );
  }

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

  const invoiceStatus = 'issued';
  const statusNote = paymentMethod === 'stripe'
    ? 'Quick booking finalized by admin — awaiting Stripe payment'
    : paymentMethod === 'deposit'
    ? 'Quick booking finalized by admin — awaiting deposit payment'
    : 'Quick booking finalized by admin — cash to collect on arrival';

  if (paymentMethod === 'stripe') {
    try {
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
        return NextResponse.json(
          {
            error: 'Payment amount mismatch',
            code: 'PAYMENT_AMOUNT_MISMATCH',
          },
          { status: 500 },
        );
      }

      checkoutUrl = checkout.checkoutUrl;
      checkoutSessionId = checkout.sessionId;
      checkoutPaymentIntentId = checkout.paymentIntentId;
      checkoutExpiresAt = checkout.expiresAt;
    } catch (error) {
      console.error('[quick-book:finalize] Stripe checkout failed', error);
      return NextResponse.json(
        {
          error: 'Stripe could not create the payment link. Check the quote amount and Stripe configuration, then try again.',
          code: 'STRIPE_CHECKOUT_FAILED',
          detail: process.env.NODE_ENV === 'production' ? undefined : getErrorMessage(error),
        },
        { status: 502 },
      );
    }
  }

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
      distanceMiles: resolvedPricingDistanceMiles.toFixed(2),
      distanceSource: resolvedDistanceSource,
      quantity: totalQuantity,
      tyreSizeDisplay: primaryTyreSizeDisplay,
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
      if (!checkoutSessionId || !checkoutUrl) {
        throw new Error('STRIPE_CHECKOUT_NOT_READY');
      }

      await executor
        .update(bookings)
        .set({ stripePiId: checkoutPaymentIntentId || checkoutSessionId })
        .where(eq(bookings.id, bookingId));

      await executor.insert(payments).values({
        id: uuidv4(),
        bookingId,
        stripePiId: checkoutPaymentIntentId || checkoutSessionId,
        amount: breakdown.total.toFixed(2),
        currency: 'gbp',
        status: 'pending',
        stripePayload: {
          kind: 'quick_book_checkout',
          sessionId: checkoutSessionId,
          checkoutUrl,
          amountPence: totalInPence,
        },
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
      console.error('[quick-book:finalize] failed', error);
      return NextResponse.json(
        {
          error: 'Failed to finalize quick booking.',
          code: 'FINALIZE_FAILED',
          detail: process.env.NODE_ENV === 'production' ? undefined : getErrorMessage(error),
        },
        { status: 500 },
      );
    }

    console.warn('[quick-book:finalize] transaction unsupported, falling back to non-transactional writes');
    try {
      await persistFinalizeWrites(db);
    } catch (fallbackError) {
      console.error('[quick-book:finalize] fallback write failed', fallbackError);
      return NextResponse.json(
        {
          error: 'Failed to finalize quick booking.',
          code: 'FINALIZE_FAILED',
          detail: process.env.NODE_ENV === 'production' ? undefined : getErrorMessage(fallbackError),
        },
        { status: 500 },
      );
    }
  }

  // Cash quick bookings are confirmed for dispatch, but not paid yet.
  if (paymentMethod === 'cash') {
    const commitResult = await commitReservationsForBooking({
      bookingId,
      actor: 'admin',
      actorUserId: session.user.id,
      note: `Quick booking ${refNumber}: cash to collect on arrival`,
    });
    if (!commitResult.success) {
      console.error(
        `[quick-book:finalize] stock commit failed for ${refNumber}:`,
        commitResult.error,
      );
    }
  } else if (paymentMethod === 'stripe') {
    await recordPaymentEvent({
      bookingId,
      bookingRef: refNumber,
      eventType: 'link_sent',
      paymentMethod: 'card_link',
      linkStatus: 'sent',
      amountPence: totalInPence,
      currency: 'gbp',
      stripeSessionId: checkoutSessionId,
      stripePaymentIntentId: checkoutPaymentIntentId,
      stripeCheckoutUrl: checkoutUrl,
      source: 'quick_book',
      status: 'pending',
      expiresAt: checkoutExpiresAt,
      metadata: { kind: 'quick_book_checkout' },
    });
  }

  // إرسال تأكيد الحجز للعميل إذا طُلب ذلك صراحةً وكان البريد صالحًا
  // هذا fire-and-forget — لا يُعيق استجابة الـ API في حالة الفشل
  if (customerEmailMode === 'send_customer_confirmation' && confirmedCustomerEmail) {
    const siteUrl = getOutboundUrl();
    const trackingUrl = `${siteUrl}/tracking/${refNumber}`;
    void (async () => {
      try {
        const email = bookingConfirmed({
          customerName: qb.customerName,
          refNumber,
          bookingType: 'emergency',
          serviceType: SERVICE_MAP[serviceType] || 'Tyre service',
          address: addressLine,
          tyreSummary,
          quantity: totalQuantity,
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

  // Assisted Chat created this booking in the foreground, so do not
  // interrupt the same operator with an urgent popup/push for their own work.
  if (pricingContext !== 'assisted_chat') {
    void sendUrgentBookingTopicPush({
      bookingId,
      customerPhone: qb.customerPhone,
      createdAt: new Date().toISOString(),
      title: 'Emergency booking received',
      body: `${qb.customerName} — ${paymentMethod === 'cash' ? 'cash on site' : 'awaiting payment'}`,
    }).catch((err: unknown) => console.error('[quick-book:finalize] urgent push failed:', err));
  }

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
      serviceDistanceMiles: breakdown.serviceDistanceMiles,
      pricingDistanceMiles: breakdown.pricingDistanceMiles,
      pricingDurationMinutes: breakdown.pricingDurationMinutes,
      garageDistanceMiles: breakdown.garageDistanceMiles,
      pricingDistanceSource: breakdown.pricingDistanceSource,
      distanceFloorApplied: breakdown.distanceFloorApplied,
      fittingPrice: breakdown.fittingPrice,
      tyrePrice: breakdown.tyrePrice,
      totalPrice: breakdown.totalPrice,
      tyreLines: breakdown.tyreLines,
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
