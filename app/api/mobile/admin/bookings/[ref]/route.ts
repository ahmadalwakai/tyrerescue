import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  bookings,
  bookingTyres,
  bookingStatusHistory,
  tyreProducts,
  drivers,
  users,
} from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { executeTransition, getValidNextStates, isValidTransition, type BookingStatus } from '@/lib/state-machine';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function GET(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const [tyres, statusHistory, availableDrivers] = await Promise.all([
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
        actorRole: bookingStatusHistory.actorRole,
        note: bookingStatusHistory.note,
        createdAt: bookingStatusHistory.createdAt,
      })
      .from(bookingStatusHistory)
      .where(eq(bookingStatusHistory.bookingId, booking.id))
      .orderBy(desc(bookingStatusHistory.createdAt)),
    db
      .select({ id: drivers.id, name: users.name, isOnline: drivers.isOnline, status: drivers.status })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id)),
  ]);

  let assignedDriver: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string | null;
    isOnline: boolean | null;
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
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(drivers.id, booking.driverId))
      .limit(1);

    if (driver) assignedDriver = driver;
  }

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
    statusHistory: statusHistory.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt?.toISOString() ?? null,
    })),
    assignedDriver,
    availableDrivers,
    validNextStatuses: getValidNextStates(booking.status as BookingStatus),
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
  if (body.tyreSizeDisplay !== undefined) updates.tyreSizeDisplay = body.tyreSizeDisplay ? String(body.tyreSizeDisplay).trim() : null;
  if (body.quantity !== undefined) {
    const q = parseInt(String(body.quantity), 10);
    if (q >= 1 && q <= 20) updates.quantity = q;
  }
  if (body.lockingNutStatus !== undefined) {
    const allowed = ['standard', 'has_key', 'no_key'];
    if (allowed.includes(body.lockingNutStatus)) updates.lockingNutStatus = body.lockingNutStatus;
  }
  if (body.serviceType !== undefined) {
    const allowed = ['tyre_replacement', 'puncture_repair', 'locking_nut_removal'];
    if (allowed.includes(body.serviceType)) updates.serviceType = body.serviceType;
  }
  if (body.bookingType !== undefined) {
    const allowed = ['emergency', 'scheduled'];
    if (allowed.includes(body.bookingType)) updates.bookingType = body.bookingType;
  }
  if (body.scheduledAt !== undefined) {
    updates.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  }
  if (body.subtotal !== undefined) {
    const v = parseFloat(String(body.subtotal));
    if (Number.isFinite(v) && v >= 0) updates.subtotal = v.toFixed(2);
  }
  if (body.vatAmount !== undefined) {
    const v = parseFloat(String(body.vatAmount));
    if (Number.isFinite(v) && v >= 0) updates.vatAmount = v.toFixed(2);
  }
  if (body.totalAmount !== undefined) {
    const v = parseFloat(String(body.totalAmount));
    if (Number.isFinite(v) && v >= 0) updates.totalAmount = v.toFixed(2);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  updates.updatedAt = new Date();
  await db.update(bookings).set(updates).where(eq(bookings.id, booking.id));

  await db.insert(bookingStatusHistory).values({
    bookingId: booking.id,
    fromStatus: booking.status,
    toStatus: booking.status,
    actorUserId: user.id,
    actorRole: 'admin',
    note: `Booking edited via mobile admin app: ${Object.keys(updates).filter((k) => k !== 'updatedAt').join(', ')}`,
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

  if (!allowed.includes(nextStatus) && nextStatus !== 'cancelled') {
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
  } else {
    await db.update(bookings).set({ status: nextStatus, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: currentStatus,
      toStatus: nextStatus,
      actorUserId: user.id,
      actorRole: 'admin',
      note: note || 'Status changed by mobile admin app',
    });
  }

  return NextResponse.json({ success: true, previousStatus: currentStatus, status: nextStatus });
}
