import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  db,
  bookings,
  bookingTyres,
  bookingStatusHistory,
  invoices,
  tyreProducts,
  drivers,
  users,
} from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { executeTransition, getValidNextStates, isValidTransition, type BookingStatus } from '@/lib/state-machine';
import {
  getBookingPaymentSummary,
  isPaymentFullySettledForInvoice,
  recordPaymentEvent,
} from '@/lib/payments/payment-summary';
import { notifyCustomerBookingStatus } from '@/lib/notifications/customer-push';
import { haversineDistanceMiles } from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import { buildBookingTimeline, deriveBookingInformation } from '@/lib/bookings/booking-audit';
import {
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
} from '@/lib/admin/driverSituation';

interface Props {
  params: Promise<{ ref: string }>;
}

const DIRECT_AMOUNT_FIELDS = ['subtotal', 'vatAmount', 'totalAmount'] as const;
const PRICING_INPUT_FIELDS = ['tyreSizeDisplay', 'quantity', 'serviceType', 'bookingType', 'scheduledAt'] as const;

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function numericSnapshotValue(snapshot: unknown, key: 'subtotal' | 'vatAmount' | 'total'): number | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const value = (snapshot as Record<string, unknown>)[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const [tyres, statusHistory, availableDrivers, invoice] = await Promise.all([
    db
      .select({
        id: bookingTyres.id,
        quantity: bookingTyres.quantity,
        unitPrice: bookingTyres.unitPrice,
        service: bookingTyres.service,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
      })
      .from(bookingTyres)
      .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
      .where(eq(bookingTyres.bookingId, booking.id)),
    db
      .select({
        id: bookingStatusHistory.id,
        fromStatus: bookingStatusHistory.fromStatus,
        toStatus: bookingStatusHistory.toStatus,
        actorUserId: bookingStatusHistory.actorUserId,
        actorRole: bookingStatusHistory.actorRole,
        actorName: users.name,
        actorEmail: users.email,
        note: bookingStatusHistory.note,
        createdAt: bookingStatusHistory.createdAt,
      })
      .from(bookingStatusHistory)
      .leftJoin(users, eq(bookingStatusHistory.actorUserId, users.id))
      .where(eq(bookingStatusHistory.bookingId, booking.id))
      .orderBy(desc(bookingStatusHistory.createdAt)),
    db
      .select({ id: drivers.id, name: users.name, isOnline: drivers.isOnline, status: drivers.status })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id)),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        totalAmount: invoices.totalAmount,
      })
      .from(invoices)
      .where(and(eq(invoices.bookingId, booking.id), isNull(invoices.deletedAt)))
      .orderBy(desc(invoices.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  let assignedDriver: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string | null;
    isOnline: boolean | null;
    currentLat: string | null;
    currentLng: string | null;
    locationAt: string | null;
  } | null = null;

  if (booking.driverId) {
    const [driver] = await db
      .select({
        id: drivers.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        status: drivers.status,
        isOnline: drivers.isOnline,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        locationAt: drivers.locationAt,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(drivers.id, booking.driverId))
      .limit(1);

    if (driver) {
      assignedDriver = {
        ...driver,
        currentLat: driver.currentLat?.toString() ?? null,
        currentLng: driver.currentLng?.toString() ?? null,
        locationAt: driver.locationAt?.toISOString() ?? null,
      };
    }
  }

  const paymentSummary = await getBookingPaymentSummary({
    id: booking.id,
    refNumber: booking.refNumber,
    status: booking.status,
    paymentType: booking.paymentType,
    totalAmount: booking.totalAmount.toString(),
    subtotal: booking.subtotal.toString(),
    vatAmount: booking.vatAmount.toString(),
    depositAmountPence: booking.depositAmountPence,
    remainingBalancePence: booking.remainingBalancePence,
    depositPaidAt: booking.depositPaidAt,
    stripePiId: booking.stripePiId,
    stripeDepositPiId: booking.stripeDepositPiId,
  });

  const customerLat = toNumber(booking.lat);
  const customerLng = toNumber(booking.lng);
  const driverLat = toNumber(assignedDriver?.currentLat);
  const driverLng = toNumber(assignedDriver?.currentLng);
  const outboundMinutes =
    customerLat != null && customerLng != null && driverLat != null && driverLng != null
      ? estimateUrbanDriveMinutesFromMiles(
          haversineDistanceMiles(
            { lat: driverLat, lng: driverLng },
            { lat: customerLat, lng: customerLng },
          ),
        )
      : null;
  const returnMinutes =
    customerLat != null && customerLng != null
      ? estimateUrbanDriveMinutesFromMiles(
          haversineDistanceMiles(
            { lat: customerLat, lng: customerLng },
            { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
          ),
        )
      : null;
  const driverSituation = calculateDriverSituation({
    jobRef: booking.refNumber,
    driverId: booking.driverId ?? null,
    bookingStatus: booking.status,
    driverIsOnline: assignedDriver?.isOnline ?? false,
    driverStatus: assignedDriver?.status ?? null,
    lastLocationAt: assignedDriver?.locationAt ?? null,
    outboundMinutes,
    returnMinutes,
    serviceType: booking.serviceType,
    tyreCount: booking.quantity,
    paymentStatus: booking.paymentType,
    returnEstimateAvailable: returnMinutes != null,
    routeAvailable: outboundMinutes != null,
    garageConfigured: true,
  });
  const timeline = buildBookingTimeline(statusHistory);
  const bookingInformation = deriveBookingInformation({
    timeline,
    bookingCreatedAt: booking.createdAt,
    bookingUpdatedAt: booking.updatedAt,
  });

  return NextResponse.json({
    booking: {
      ...booking,
      lat: booking.lat.toString(),
      lng: booking.lng.toString(),
      distanceMiles: booking.distanceMiles?.toString() ?? null,
      subtotal: booking.subtotal.toString(),
      vatAmount: booking.vatAmount.toString(),
      totalAmount: booking.totalAmount.toString(),
      scheduledAt: booking.scheduledAt?.toISOString() ?? null,
      createdAt: booking.createdAt?.toISOString() ?? null,
      updatedAt: booking.updatedAt?.toISOString() ?? null,
      assignedAt: booking.assignedAt?.toISOString() ?? null,
      acceptedAt: booking.acceptedAt?.toISOString() ?? null,
      enRouteAt: booking.enRouteAt?.toISOString() ?? null,
      arrivedAt: booking.arrivedAt?.toISOString() ?? null,
      inProgressAt: booking.inProgressAt?.toISOString() ?? null,
      completedAt: booking.completedAt?.toISOString() ?? null,
    },
    tyres: tyres.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toString(),
    })),
    bookingInformation,
    statusHistory: timeline,
    assignedDriver,
    availableDrivers,
    validNextStatuses: getValidNextStates(booking.status as BookingStatus),
    paymentSummary: {
      ...paymentSummary,
      isFullyPaid: isPaymentFullySettledForInvoice(paymentSummary, booking.status),
    },
    invoice: invoice
      ? {
          ...invoice,
          totalAmount: invoice.totalAmount?.toString() ?? null,
        }
      : null,
    driverSituation,
  });
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const TERMINAL = new Set(['completed', 'cancelled', 'refunded', 'refunded_partial', 'cancelled_refund_pending']);
  if (TERMINAL.has(booking.status)) {
    return NextResponse.json({ error: `Cannot edit booking in ${booking.status} status` }, { status: 400 });
  }

  const body = await request.json();
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const bodyRecord = body as Record<string, unknown>;
  const directAmountEdit = DIRECT_AMOUNT_FIELDS.find((field) => hasOwn(bodyRecord, field));
  if (directAmountEdit) {
    return NextResponse.json(
      {
        error:
          `${directAmountEdit} is derived from priceSnapshot. Use the canonical pricing/manual-adjustment flow for price changes.`,
      },
      { status: 400 },
    );
  }

  const pricingInputEdit = PRICING_INPUT_FIELDS.find((field) => hasOwn(bodyRecord, field));
  if (pricingInputEdit) {
    return NextResponse.json(
      {
        error:
          `${pricingInputEdit} affects pricing and cannot be edited from mobile admin without backend repricing.`,
      },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};

  if (body.customerName !== undefined) {
    const v = String(body.customerName || '').trim();
    if (v.length < 2) return NextResponse.json({ error: 'Customer name too short' }, { status: 400 });
    updates.customerName = v;
  }
  if (body.customerEmail !== undefined) {
    const v = String(body.customerEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    updates.customerEmail = v;
  }
  if (body.customerPhone !== undefined) {
    const v = String(body.customerPhone || '').trim();
    if (v.length < 5) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    updates.customerPhone = v;
  }
  if (body.addressLine !== undefined) updates.addressLine = String(body.addressLine || '').trim();
  if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;
  if (body.vehicleReg !== undefined) updates.vehicleReg = body.vehicleReg ? String(body.vehicleReg).trim().toUpperCase() : null;
  if (body.vehicleMake !== undefined) updates.vehicleMake = body.vehicleMake ? String(body.vehicleMake).trim() : null;
  if (body.vehicleModel !== undefined) updates.vehicleModel = body.vehicleModel ? String(body.vehicleModel).trim() : null;
  if (body.lockingNutStatus !== undefined) {
    const allowed = ['standard', 'has_key', 'no_key'];
    if (allowed.includes(body.lockingNutStatus)) updates.lockingNutStatus = body.lockingNutStatus;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const editedFields = Object.keys(updates);
  updates.updatedAt = new Date();
  const snapshotTotal = numericSnapshotValue(booking.priceSnapshot, 'total');
  if (snapshotTotal != null) {
    const snapshotSubtotal = numericSnapshotValue(booking.priceSnapshot, 'subtotal');
    const snapshotVatAmount = numericSnapshotValue(booking.priceSnapshot, 'vatAmount') ?? 0;
    updates.totalAmount = snapshotTotal.toFixed(2);
    if (snapshotSubtotal != null) updates.subtotal = snapshotSubtotal.toFixed(2);
    updates.vatAmount = snapshotVatAmount.toFixed(2);
  }

  await db.update(bookings).set(updates).where(eq(bookings.id, booking.id));

  await db.insert(bookingStatusHistory).values({
    bookingId: booking.id,
    fromStatus: booking.status,
    toStatus: booking.status,
    actorUserId: user.id,
    actorRole: 'admin',
    note: `Booking edited via mobile admin app: ${editedFields.join(', ')}`,
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const body = await request.json();
  const nextStatus = String(body?.status || '') as BookingStatus;
  const note = body?.note ? String(body.note) : undefined;

  if (!nextStatus) {
    return NextResponse.json({ error: 'Status is required' }, { status: 400 });
  }

  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const currentStatus = booking.status as BookingStatus;
  const allowed = getValidNextStates(currentStatus);
  const adminOneStepCompleteFrom = new Set<BookingStatus>([
    'paid',
    'deposit_paid',
    'driver_assigned',
    'en_route',
    'arrived',
    'in_progress',
  ]);
  const isAdminOneStepComplete =
    nextStatus === 'completed' && adminOneStepCompleteFrom.has(currentStatus);

  if (!allowed.includes(nextStatus) && nextStatus !== 'cancelled' && !isAdminOneStepComplete) {
    return NextResponse.json(
      { error: `Cannot transition from ${currentStatus} to ${nextStatus}`, validTransitions: allowed },
      { status: 400 },
    );
  }

  if (isValidTransition(currentStatus, nextStatus)) {
    const result = await executeTransition(
      booking.id,
      nextStatus,
      { userId: user.id, role: 'admin' },
      note || 'Status changed by mobile admin app',
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Transition failed' }, { status: 400 });
    }
    if (nextStatus === 'completed') {
      await db.update(bookings).set({ completedAt: new Date(), updatedAt: new Date() }).where(eq(bookings.id, booking.id));
    }
  } else {
    await db
      .update(bookings)
      .set({
        status: nextStatus,
        updatedAt: new Date(),
        ...(nextStatus === 'completed' ? { completedAt: new Date() } : {}),
      })
      .where(eq(bookings.id, booking.id));
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: currentStatus,
      toStatus: nextStatus,
      actorUserId: user.id,
      actorRole: 'admin',
      note: note || 'Status changed by mobile admin app',
    });
  }

  if (nextStatus === 'paid') {
    const amountPence = Number.isFinite(Number(booking.totalAmount))
      ? Math.round(Number(booking.totalAmount) * 100)
      : null;
    await recordPaymentEvent({
      bookingId: booking.id,
      bookingRef: booking.refNumber,
      eventType: 'manual_paid',
      paymentMethod: 'manual',
      paidVia: 'manual',
      amountPence,
      currency: 'gbp',
      source: 'admin',
      status: 'succeeded',
      metadata: {
        note: note ?? null,
        previousStatus: currentStatus,
        via: 'mobile_admin',
      },
    });
  }

  await notifyCustomerBookingStatus({
    bookingId: booking.id,
    status: nextStatus,
  });

  return NextResponse.json({ success: true, previousStatus: currentStatus, status: nextStatus });
}
