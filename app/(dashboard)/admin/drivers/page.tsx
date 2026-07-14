import { db, drivers, users, bookings } from '@/lib/db';
import { eq, desc, inArray } from 'drizzle-orm';
import { Box, Heading } from '@chakra-ui/react';
import { DriversClient } from './DriversClient';
import { haversineDistanceMiles } from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import {
  ACTIVE_DRIVER_SITUATION_STATUSES,
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
} from '@/lib/admin/driverSituation';

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function AdminDriversPage() {
  // Fetch all drivers with their user info
  const [driversList, activeBookings] = await Promise.all([
    db
      .select({
        id: drivers.id,
        userId: drivers.userId,
        isOnline: drivers.isOnline,
        status: drivers.status,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        locationAt: drivers.locationAt,
        createdAt: drivers.createdAt,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .orderBy(desc(drivers.createdAt)),
    db
      .select({
        driverId: bookings.driverId,
        refNumber: bookings.refNumber,
        status: bookings.status,
        serviceType: bookings.serviceType,
        quantity: bookings.quantity,
        paymentType: bookings.paymentType,
        customerLat: bookings.lat,
        customerLng: bookings.lng,
      })
      .from(bookings)
      .where(inArray(bookings.status, [...ACTIVE_DRIVER_SITUATION_STATUSES])),
  ]);

  const activeBookingByDriver = new Map(
    activeBookings
      .filter((booking) => booking.driverId)
      .map((booking) => [booking.driverId!, booking]),
  );

  // Transform for client
  const driversData = driversList.map((d) => {
    const activeBooking = activeBookingByDriver.get(d.id) ?? null;
    const customerLat = toNumber(activeBooking?.customerLat);
    const customerLng = toNumber(activeBooking?.customerLng);
    const driverLat = toNumber(d.currentLat);
    const driverLng = toNumber(d.currentLng);
    const outboundMinutes =
      activeBooking && customerLat != null && customerLng != null && driverLat != null && driverLng != null
        ? estimateUrbanDriveMinutesFromMiles(
            haversineDistanceMiles(
              { lat: driverLat, lng: driverLng },
              { lat: customerLat, lng: customerLng },
            ),
          )
        : null;
    const returnMinutes =
      activeBooking && customerLat != null && customerLng != null
        ? estimateUrbanDriveMinutesFromMiles(
            haversineDistanceMiles(
              { lat: customerLat, lng: customerLng },
              { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
            ),
          )
        : null;

    return {
      id: d.id,
      userId: d.userId,
      name: d.name,
      email: d.email,
      phone: d.phone,
      isOnline: d.isOnline ?? false,
      status: d.status ?? 'offline',
      currentLat: d.currentLat?.toString() ?? null,
      currentLng: d.currentLng?.toString() ?? null,
      locationAt: d.locationAt?.toISOString() ?? null,
      createdAt: d.createdAt?.toISOString() ?? null,
      activeJobRef: activeBooking?.refNumber ?? null,
      driverSituation: activeBooking
        ? calculateDriverSituation({
            jobRef: activeBooking.refNumber,
            driverId: d.id,
            bookingStatus: activeBooking.status,
            driverIsOnline: d.isOnline ?? false,
            driverStatus: d.status ?? null,
            lastLocationAt: d.locationAt ?? null,
            outboundMinutes,
            returnMinutes,
            serviceType: activeBooking.serviceType,
            tyreCount: activeBooking.quantity,
            paymentStatus: activeBooking.paymentType,
            returnEstimateAvailable: returnMinutes != null,
            routeAvailable: outboundMinutes != null,
            garageConfigured: true,
          })
        : null,
    };
  });

  return (
    <Box>
      <Heading size="lg" mb={6}>
        Drivers
      </Heading>
      <DriversClient drivers={driversData} />
    </Box>
  );
}
