import { notFound, redirect } from 'next/navigation';
import { db, drivers, bookings, bookingTyres, tyreProducts, bookingStatusHistory } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { Box, Heading } from '@chakra-ui/react';
import { JobDetailClient } from './JobDetailClient';

interface Props {
  params: Promise<{ ref: string }>;
}

export default async function DriverJobDetailPage({ params }: Props) {
  const session = await auth();
  if (!session || session.user.role !== 'driver') {
    redirect('/login');
  }

  const { ref } = await params;

  // Get driver record
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.userId, session.user.id))
    .limit(1);

  if (!driver) {
    redirect('/login');
  }

  // Get booking - must belong to this driver
  const [booking] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.refNumber, ref),
        eq(bookings.driverId, driver.id)
      )
    )
    .limit(1);

  if (!booking) {
    notFound();
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

  // Transform data for client
  const bookingData = {
    id: booking.id,
    refNumber: booking.refNumber,
    status: booking.status,
    bookingType: booking.bookingType,
    serviceType: booking.serviceType,
    addressLine: booking.addressLine,
    lat: booking.lat.toString(),
    lng: booking.lng.toString(),
    tyreSizeDisplay: booking.tyreSizeDisplay,
    quantity: booking.quantity,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    tyrePhotoUrl: booking.tyrePhotoUrl,
    scheduledAt: booking.scheduledAt?.toISOString() ?? null,
    notes: booking.notes,
    createdAt: booking.createdAt?.toISOString() ?? null,
    acceptedAt: booking.acceptedAt?.toISOString() ?? null,
    assignedAt: booking.assignedAt?.toISOString() ?? null,
    enRouteAt: booking.enRouteAt?.toISOString() ?? null,
    arrivedAt: booking.arrivedAt?.toISOString() ?? null,
    inProgressAt: booking.inProgressAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    vehicleReg: booking.vehicleReg,
    vehicleMake: booking.vehicleMake,
    vehicleModel: booking.vehicleModel,
    lockingNutStatus: booking.lockingNutStatus,
  };

  const tyresData = tyres.map((t) => ({
    id: t.id,
    quantity: t.quantity,
    unitPrice: t.unitPrice.toString(),
    service: t.service,
    brand: t.brand,
    pattern: t.pattern,
    width: t.width,
    aspect: t.aspect,
    rim: t.rim,
  }));

  const historyData = statusHistory.map((h) => ({
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorRole: h.actorRole,
    createdAt: h.createdAt?.toISOString() ?? null,
  }));

  return (
    <Box>
      <Heading size="lg" mb={6}>
        Job {booking.refNumber}
      </Heading>
      <JobDetailClient
        booking={bookingData}
        tyres={tyresData}
        statusHistory={historyData}
      />
    </Box>
  );
}
