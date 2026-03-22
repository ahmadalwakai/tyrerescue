import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  quickBookings,
  bookings,
  bookingTyres,
  bookingStatusHistory,
  pricingRules,
  bankHolidays,
  invoices,
  invoiceItems,
  payments,
} from '@/lib/db/schema';
import { eq, count, ilike } from 'drizzle-orm';
import { generateRefNumber } from '@/lib/utils';
import {
  calculatePricing,
  parsePricingRules,
  type PricingBreakdown,
  type TyreSelection as PricingTyreSelection,
} from '@/lib/pricing-engine';
import { v4 as uuidv4 } from 'uuid';
import { createAdminNotification } from '@/lib/notifications';
import { createCheckoutSession } from '@/lib/stripe';

const SERVICE_MAP: Record<string, string> = {
  fit: 'tyre_replacement',
  repair: 'puncture_repair',
  assess: 'locking_nut_removal',
};

const COMPANY = {
  name: 'Tyre Rescue',
  address: '3, 10 Gateside St, Glasgow G31 1PD',
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

  // Calculate distance in miles
  const distanceKm = qb.distanceKm ? Number(qb.distanceKm) : 5; // fallback 5km
  const distanceMiles = distanceKm * 0.621371;

  // Load pricing rules from DB
  const rulesRows = await db.select().from(pricingRules);
  const rules = parsePricingRules(rulesRows.map((r) => ({ key: r.key, value: r.value })));

  // Check bank holidays
  const todayStr = new Date().toISOString().split('T')[0];
  const holidays = await db.select().from(bankHolidays);
  const isBankHoliday = holidays.some(
    (h) => h.date === todayStr
  );

  // Build pricing input
  const serviceType = qb.serviceType as 'fit' | 'repair' | 'assess';
  const quantity = qb.tyreCount ?? 1;

  // Quick bookings never have specific tyre products selected (admin is on a phone
  // call, not browsing the catalogue). The pricing engine's repair-only path is
  // the only one that accepts empty tyre selections, so we always use it.
  // For 'fit'/'assess', we swap in the fitting fee after calculation.
  const pricingInput = {
    tyreSelections: [] as PricingTyreSelection[],
    distanceMiles,
    bookingType: 'emergency' as const, // phone calls are emergency
    bookingDate: new Date(),
    isBankHoliday,
    serviceType: 'repair' as const, // forces repair-only code path (no tyre selections needed)
    tyreQuantity: quantity,
  };

  let breakdown: PricingBreakdown = calculatePricing(pricingInput, rules, true);

  // If actual service is fit/assess, replace the repair fee line item with fitting fee
  if (breakdown.isValid && serviceType !== 'repair') {
    const fittingFee = rules.fitting_fee_per_tyre;
    const fittingTotal = fittingFee * quantity;
    const repairTotal = rules.repair_fee_per_tyre * quantity;
    const diff = fittingTotal - repairTotal;

    if (diff !== 0) {
      // Recalculate with fitting fee by adjusting the final totals
      const adjustedSubtotal = breakdown.subtotal + diff;
      // VAT removed from system - total equals subtotal
      const adjustedTotal = adjustedSubtotal;

      const label = serviceType === 'fit'
        ? `Tyre Fitting × ${quantity}`
        : `Assessment × ${quantity}`;

      breakdown = {
        ...breakdown,
        lineItems: breakdown.lineItems.map((li) =>
          li.type === 'service'
            ? { ...li, label, unitPrice: fittingFee, amount: fittingTotal }
            : li.type === 'subtotal'
              ? { ...li, amount: adjustedSubtotal }
              : li.type === 'total'
                ? { ...li, amount: adjustedTotal }
                : li
        ).filter((li) => li.type !== 'vat'), // Remove any VAT line items
        totalServiceFee: fittingTotal,
        subtotal: adjustedSubtotal,
        vatAmount: 0,
        total: adjustedTotal,
      };
    } else {
      // Same fee, just fix label
      const label = serviceType === 'fit'
        ? `Tyre Fitting × ${quantity}`
        : `Assessment × ${quantity}`;
      breakdown = {
        ...breakdown,
        lineItems: breakdown.lineItems.map((li) =>
          li.type === 'service' ? { ...li, label } : li
        ),
      };
    }
  }

  if (!breakdown.isValid) {
    return NextResponse.json(
      { error: `Pricing error: ${breakdown.error}` },
      { status: 400 }
    );
  }

  // Generate real booking
  const refNumber = generateRefNumber();
  const bookingId = uuidv4();
  const customerEmail = qb.customerEmail || 'phone-booking@tyrerescue.uk';

  const addressLine = qb.locationAddress || qb.locationPostcode || `${lat}, ${lng}`;

  const initialStatus = paymentMethod === 'stripe' ? 'awaiting_payment' : 'paid';

  await db.insert(bookings).values({
    id: bookingId,
    refNumber,
    userId: null,
    status: initialStatus,
    bookingType: 'emergency',
    serviceType: SERVICE_MAP[serviceType] || 'puncture_repair',
    addressLine,
    lat: String(lat),
    lng: String(lng),
    distanceMiles: distanceMiles.toFixed(2),
    distanceSource: 'service_center',
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

  // Stripe Checkout Session (if not cash)
  let checkoutUrl: string | null = null;
  let stripePaymentIntentId: string | null = null;

  if (paymentMethod === 'stripe') {
    const { checkoutUrl: url, paymentIntentId, sessionId } = await createCheckoutSession(
      breakdown.total,
      {
        bookingId,
        refNumber,
        customerEmail,
      }
    );

    checkoutUrl = url;
    stripePaymentIntentId = paymentIntentId;

    // Store PI or session on booking
    await db
      .update(bookings)
      .set({ stripePiId: paymentIntentId || sessionId })
      .where(eq(bookings.id, bookingId));

    // Create payment record
    await db.insert(payments).values({
      id: uuidv4(),
      bookingId,
      stripePiId: paymentIntentId || sessionId,
      amount: breakdown.total.toFixed(2),
      currency: 'gbp',
      status: 'pending',
    });
  }

  // Status history
  const statusNote = paymentMethod === 'stripe'
    ? 'Quick booking finalized by admin — awaiting Stripe payment'
    : 'Quick booking finalized by admin — cash payment collected';

  await db.insert(bookingStatusHistory).values({
    id: uuidv4(),
    bookingId,
    fromStatus: null,
    toStatus: initialStatus,
    actorUserId: session.user.id,
    actorRole: 'admin',
    note: statusNote,
  });

  // Create invoice
  const invoiceNumber = await generateInvoiceNumber();
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invoiceItems_data = breakdown.lineItems
    .filter((li) => li.type !== 'subtotal' && li.type !== 'vat' && li.type !== 'total')
    .map((li) => ({
      description: li.label,
      quantity: li.quantity ?? 1,
      unitPrice: li.unitPrice ?? li.amount,
      totalPrice: li.amount,
    }));

  const invoiceStatus = paymentMethod === 'stripe' ? 'issued' : 'paid';

  const [createdInvoice] = await db.insert(invoices).values({
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

  // Insert invoice line items
  if (invoiceItems_data.length > 0 && createdInvoice) {
    await db.insert(invoiceItems).values(
      invoiceItems_data.map((it, i) => ({
        invoiceId: createdInvoice.id,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice.toFixed(2),
        totalPrice: it.totalPrice.toFixed(2),
        sortOrder: i,
      }))
    );
  }

  // Link quick booking to real booking
  await db
    .update(quickBookings)
    .set({
      bookingId,
      status: 'finalized',
      totalPrice: breakdown.total.toFixed(2),
      basePrice: breakdown.subtotal.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(quickBookings.id, id));

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
