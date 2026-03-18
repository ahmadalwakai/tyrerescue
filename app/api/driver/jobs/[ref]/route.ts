import { NextResponse } from 'next/server';
import { db, bookings, bookingTyres, tyreProducts, bookingStatusHistory } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  try {
    const { driverId } = await requireDriverMobile(request);
    const { ref } = await params;

    const [booking] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.refNumber, ref),
          eq(bookings.driverId, driverId),
        ),
      )
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Get tyre details
    const tyres = await db
      .select({
        id: bookingTyres.id,
        quantity: bookingTyres.quantity,
        unitPrice: bookingTyres.unitPrice,
        service: bookingTyres.service,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        width: tyreProducts.width,
        aspect: tyreProducts.aspect,
        rim: tyreProducts.rim,
      })
      .from(bookingTyres)
      .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
      .where(eq(bookingTyres.bookingId, booking.id));

    // Get status history
    const statusHistory = await db
      .select({
        id: bookingStatusHistory.id,
        fromStatus: bookingStatusHistory.fromStatus,
        toStatus: bookingStatusHistory.toStatus,
        actorRole: bookingStatusHistory.actorRole,
        createdAt: bookingStatusHistory.createdAt,
      })
      .from(bookingStatusHistory)
      .where(eq(bookingStatusHistory.bookingId, booking.id))
      .orderBy(desc(bookingStatusHistory.createdAt));

    return NextResponse.json({
      id: booking.id,
      refNumber: booking.refNumber,
      status: booking.status,
      bookingType: booking.bookingType,
      serviceType: booking.serviceType,
      addressLine: booking.addressLine,
      lat: booking.lat?.toString() ?? null,
      lng: booking.lng?.toString() ?? null,
      tyreSizeDisplay: booking.tyreSizeDisplay,
      quantity: booking.quantity,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      vehicleReg: booking.vehicleReg,
      vehicleMake: booking.vehicleMake,
      vehicleModel: booking.vehicleModel,
      lockingNutStatus: booking.lockingNutStatus,
      tyrePhotoUrl: booking.tyrePhotoUrl,
      notes: booking.notes,
      scheduledAt: booking.scheduledAt?.toISOString() ?? null,
      assignedAt: booking.assignedAt?.toISOString() ?? null,
      acceptedAt: booking.acceptedAt?.toISOString() ?? null,
      enRouteAt: booking.enRouteAt?.toISOString() ?? null,
      arrivedAt: booking.arrivedAt?.toISOString() ?? null,
      inProgressAt: booking.inProgressAt?.toISOString() ?? null,
      completedAt: booking.completedAt?.toISOString() ?? null,
      acceptanceDeadline: booking.acceptanceDeadline?.toISOString() ?? null,
      subtotal: booking.subtotal?.toString() ?? null,
      vatAmount: booking.vatAmount?.toString() ?? null,
      totalAmount: booking.totalAmount?.toString() ?? null,
      createdAt: booking.createdAt?.toISOString() ?? null,
      tyres: tyres.map((t) => ({
        id: t.id,
        quantity: t.quantity,
        unitPrice: t.unitPrice?.toString() ?? null,
        service: t.service,
        brand: t.brand,
        pattern: t.pattern,
        width: t.width,
        aspect: t.aspect,
        rim: t.rim,
      })),
      statusHistory: statusHistory.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorRole: h.actorRole,
        createdAt: h.createdAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
  }
}
