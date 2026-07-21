import { notFound } from 'next/navigation';
import { db, bookings, bookingTyres, bookingStatusHistory, drivers, users, tyreProducts } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { Box, Heading } from '@chakra-ui/react';
import { BookingDetailClient } from './BookingDetailClient';
import { auth } from '@/lib/auth';
import { normaliseTyreDetailsFromDb } from '@/lib/bookings/normalise-tyre-details';
import { getBookingPaymentSummary, type PaymentSummary } from '@/lib/payments/payment-summary';
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

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

  // Fetch tyres (left join so rows with deleted products still appear)
  const tyres = await db
    .select({
      id: bookingTyres.id,
      quantity: bookingTyres.quantity,
      unitPrice: bookingTyres.unitPrice,
      service: bookingTyres.service,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
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
        isOnline: drivers.isOnline,
        status: drivers.status,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        locationAt: drivers.locationAt,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(drivers.id, booking.driverId))
      .limit(1);
    assignedDriver = driver
      ? {
          ...driver,
          currentLat: driver.currentLat?.toString() ?? null,
          currentLng: driver.currentLng?.toString() ?? null,
          locationAt: driver.locationAt?.toISOString() ?? null,
        }
      : null;
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
    distanceSource: booking.distanceSource ?? null,
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
    // UTM attribution
    utmSource: booking.utmSource ?? null,
    utmMedium: booking.utmMedium ?? null,
    utmCampaign: booking.utmCampaign ?? null,
    utmTerm: booking.utmTerm ?? null,
    utmContent: booking.utmContent ?? null,
    gclid: booking.gclid ?? null,
    landingPage: booking.landingPage ?? null,
    referrer: booking.referrer ?? null,
    createdAt: booking.createdAt?.toISOString() ?? null,
    assignedAt: booking.assignedAt?.toISOString() ?? null,
    acceptedAt: booking.acceptedAt?.toISOString() ?? null,
    acceptanceDeadline: booking.acceptanceDeadline?.toISOString() ?? null,
    enRouteAt: booking.enRouteAt?.toISOString() ?? null,
    arrivedAt: booking.arrivedAt?.toISOString() ?? null,
    inProgressAt: booking.inProgressAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
  };

  const tyreRows = tyres.map((t) => ({
    brand: t.brand,
    pattern: t.pattern,
    sizeDisplay: t.sizeDisplay,
    width: t.width,
    aspect: t.aspect,
    rim: t.rim,
    quantity: t.quantity,
    unitPrice: t.unitPrice.toString(),
    service: t.service,
  }));

  const tyreDetails = normaliseTyreDetailsFromDb(
    {
      tyreSizeDisplay: booking.tyreSizeDisplay,
      quantity: booking.quantity,
      lockingNutStatus: booking.lockingNutStatus,
      serviceType: booking.serviceType,
      notes: booking.notes,
    },
    tyreRows,
  );

  const historyData = buildBookingTimeline(statusHistory);
  const bookingInformation = deriveBookingInformation({
    timeline: historyData,
    bookingCreatedAt: booking.createdAt,
    bookingUpdatedAt: booking.updatedAt,
  });

  const driversData = availableDrivers.map((d) => ({
    id: d.id,
    name: d.name,
  }));

  const session = await auth();

  // Compute ledger-backed payment summary so admin sees the same truth as the driver.
  const payment: PaymentSummary = await getBookingPaymentSummary({
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

  return (
    <Box>
      <Heading size="lg" mb={6}>
        Booking {booking.refNumber}
      </Heading>
      <BookingDetailClient
        booking={bookingData}
        tyreDetails={tyreDetails}
        bookingInformation={bookingInformation}
        statusHistory={historyData}
        assignedDriver={assignedDriver}
        availableDrivers={driversData}
        currentUserId={session?.user?.id ?? ''}
        currentUserRole={(session?.user?.role as 'admin' | 'driver' | 'customer') ?? 'admin'}
        payment={payment}
        driverSituation={driverSituation}
      />
    </Box>
  );
}
