import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
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
import { v4 as uuidv4 } from 'uuid';
import { createAdminNotification } from '@/lib/notifications';
import { createCheckoutSession } from '@/lib/stripe';
import { resolveDistance } from '@/lib/mapbox';
import { loadAvailableDriverDistanceCandidates } from '@/lib/driver-distance-candidates';
import { GARAGE_ADDRESS } from '@/lib/garage';

const SERVICE_MAP: Record<string, string> = {
  fit: 'tyre_replacement',
  repair: 'puncture_repair',
  assess: 'locking_nut_removal',
};

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
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse body — paymentMethod defaults to 'stripe'
  let paymentMethod: 'stripe' | 'cash' = 'stripe';
  try {
    const body = await request.json();
    if (body.paymentMethod === 'cash') paymentMethod = 'cash';
  } catch {
    // empty body → default to stripe
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

  const lat = Number(qb.locationLat);
  const lng = Number(qb.locationLng);

  const fallbackDistanceKm = qb.distanceKm ? Number(qb.distanceKm) : NaN;
  let resolvedDistanceMiles = Number.isFinite(fallbackDistanceKm)
    ? fallbackDistanceKm * 0.621371
    : 5;
  let resolvedDistanceSource: 'driver' | 'garage' = 'garage';

  try {
    const driverCandidates = await loadAvailableDriverDistanceCandidates();
    const distanceResult = await resolveDistance({ lat, lng }, driverCandidates);
    resolvedDistanceMiles = distanceResult.distanceMiles;
    resolvedDistanceSource = distanceResult.distanceSource;
  } catch (distanceError) {
    console.error('[quick-book:finalize] distance resolution fallback', distanceError);
  }

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
  const customerEmail = qb.customerEmail || 'phone-booking@tyrerescue.uk';

  const addressLine = qb.locationAddress || qb.locationPostcode || `${lat}, ${lng}`;

  const initialStatus = paymentMethod === 'stripe' ? 'awaiting_payment' : 'paid';
  let checkoutUrl: string | null = null;

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

  const invoiceStatus = paymentMethod === 'stripe' ? 'issued' : 'paid';
  const statusNote = paymentMethod === 'stripe'
    ? 'Quick booking finalized by admin — awaiting Stripe payment'
    : 'Quick booking finalized by admin — cash payment collected';

  type BookingWriteExecutor = Pick<typeof db, 'insert' | 'update'>;

  const persistFinalizeWrites = async (executor: BookingWriteExecutor) => {
    await executor.insert(bookings).values({
      id: bookingId,
      refNumber,
      userId: null,
      status: initialStatus,
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
      customerEmail,
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
      const checkout = await createCheckoutSession(breakdown.total, {
        bookingId,
        refNumber,
        customerEmail,
      });

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
      customerEmail: qb.customerEmail || 'phone-booking@tyrerescue.uk',
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
      vatRate: '20.00',
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
    const isUnsupportedTransaction =
      error instanceof Error && error.message.includes('No transactions support');

    if (!isUnsupportedTransaction) {
      throw error;
    }

    console.warn('[quick-book:finalize] transaction unsupported, falling back to non-transactional writes');
    await persistFinalizeWrites(db);
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

  // Stripe Checkout URL for payment
  const paymentUrl = checkoutUrl;

  return NextResponse.json({
    bookingId,
    refNumber,
    invoiceNumber,
    paymentMethod,
    paymentUrl,
    stripeClientSecret: null,
    breakdown: {
      subtotal: breakdown.subtotal,
      vatAmount: breakdown.vatAmount,
      total: breakdown.total,
      lineItems: breakdown.lineItems,
    },
  });
}
