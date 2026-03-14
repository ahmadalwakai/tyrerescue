import { notFound } from 'next/navigation';
import { db, bookings, bookingTyres, bookingStatusHistory, drivers, users, tyreProducts } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { Box, Heading, VStack, Grid, GridItem, Text, Flex } from '@chakra-ui/react';
import { BookingDetailClient } from './BookingDetailClient';

interface Props {
  params: Promise<{ ref: string }>;
}

export default async function AdminBookingDetailPage({ params }: Props) {
  const { ref } = await params;

  // Fetch booking
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.refNumber, ref))
    .limit(1);

  if (!booking) {
    notFound();
  }

  // Fetch tyres
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

  // Fetch status history
  const statusHistory = await db
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
    .orderBy(desc(bookingStatusHistory.createdAt));

  // Fetch assigned driver if any
  let assignedDriver = null;
  if (booking.driverId) {
    const [driver] = await db
      .select({
        id: drivers.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(drivers.id, booking.driverId))
      .limit(1);
    assignedDriver = driver || null;
  }

  // Fetch all available drivers for assignment dropdown
  const availableDrivers = await db
    .select({
      id: drivers.id,
      name: users.name,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id));

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
    distanceMiles: booking.distanceMiles?.toString() ?? null,
    quantity: booking.quantity,
    tyreSizeDisplay: booking.tyreSizeDisplay,
    vehicleReg: booking.vehicleReg,
    vehicleMake: booking.vehicleMake,
    vehicleModel: booking.vehicleModel,
    tyrePhotoUrl: booking.tyrePhotoUrl,
    lockingNutStatus: booking.lockingNutStatus,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    scheduledAt: booking.scheduledAt?.toISOString() ?? null,
    priceSnapshot: booking.priceSnapshot as Record<string, unknown>,
    subtotal: booking.subtotal.toString(),
    vatAmount: booking.vatAmount.toString(),
    totalAmount: booking.totalAmount.toString(),
    stripePiId: booking.stripePiId,
    notes: booking.notes,
    createdAt: booking.createdAt?.toISOString() ?? null,
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
    note: h.note,
    createdAt: h.createdAt?.toISOString() ?? null,
  }));

  const driversData = availableDrivers.map((d) => ({
    id: d.id,
    name: d.name,
  }));

  return (
    <Box>
      <Heading size="lg" mb={6}>
        Booking {booking.refNumber}
      </Heading>
      <BookingDetailClient
        booking={bookingData}
        tyres={tyresData}
        statusHistory={historyData}
        assignedDriver={assignedDriver}
        availableDrivers={driversData}
      />
    </Box>
  );
}
