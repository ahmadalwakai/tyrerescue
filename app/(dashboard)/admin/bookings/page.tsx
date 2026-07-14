import { Suspense } from 'react';
import { db, bookings, drivers } from '@/lib/db';
import { bookingTyres, tyreProducts } from '@/lib/db/schema';
import { desc, sql, ilike, eq, and, gte, lte, or, exists } from 'drizzle-orm';
import { Heading, Box } from '@chakra-ui/react';
import { BookingsTable } from './BookingsTable';
import { haversineDistanceMiles } from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import {
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
} from '@/lib/admin/driverSituation';

interface Props {
  searchParams: Promise<{
    page?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function AdminBookingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const perPage = 25;
  const offset = (page - 1) * perPage;

  // Build where conditions
  const conditions = [];

  if (params.status && params.status !== 'all') {
    conditions.push(eq(bookings.status, params.status));
  }

  if (params.search) {
    const searchTerm = `%${params.search}%`;
    conditions.push(
      or(
        ilike(bookings.refNumber, searchTerm),
        ilike(bookings.customerName, searchTerm),
        ilike(bookings.customerEmail, searchTerm),
        exists(
          db
            .select({ one: sql`1` })
            .from(bookingTyres)
            .innerJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
            .where(
              and(
                eq(bookingTyres.bookingId, bookings.id),
                ilike(tyreProducts.sizeDisplay, searchTerm),
              ),
            ),
        ),
      )
    );
  }

  if (params.dateFrom) {
    conditions.push(gte(bookings.createdAt, new Date(params.dateFrom)));
  }

  if (params.dateTo) {
    const endDate = new Date(params.dateTo);
    endDate.setHours(23, 59, 59, 999);
    conditions.push(lte(bookings.createdAt, endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch bookings with pagination
  const [bookingsList, countResult] = await Promise.all([
    db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        customerName: bookings.customerName,
        serviceType: bookings.serviceType,
        bookingType: bookings.bookingType,
        status: bookings.status,
        totalAmount: bookings.totalAmount,
        scheduledAt: bookings.scheduledAt,
        createdAt: bookings.createdAt,
        paymentType: bookings.paymentType,
        quantity: bookings.quantity,
        customerLat: bookings.lat,
        customerLng: bookings.lng,
        driverId: bookings.driverId,
        driverLat: drivers.currentLat,
        driverLng: drivers.currentLng,
        driverIsOnline: drivers.isOnline,
        driverStatus: drivers.status,
        driverLocationAt: drivers.locationAt,
      })
      .from(bookings)
      .leftJoin(drivers, eq(bookings.driverId, drivers.id))
      .where(whereClause)
      .orderBy(desc(bookings.createdAt))
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(whereClause),
  ]);

  const totalCount = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalCount / perPage);

  // Transform for client
  const bookingsData = bookingsList.map((b) => {
    const driverSituation = (() => {
      const customerLat = toNumber(b.customerLat);
      const customerLng = toNumber(b.customerLng);
      const driverLat = toNumber(b.driverLat);
      const driverLng = toNumber(b.driverLng);
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

      return calculateDriverSituation({
        jobRef: b.refNumber,
        driverId: b.driverId ?? null,
        bookingStatus: b.status,
        driverIsOnline: b.driverIsOnline ?? false,
        driverStatus: b.driverStatus ?? null,
        lastLocationAt: b.driverLocationAt ?? null,
        outboundMinutes,
        returnMinutes,
        serviceType: b.serviceType,
        tyreCount: b.quantity,
        paymentStatus: b.paymentType,
        returnEstimateAvailable: returnMinutes != null,
        routeAvailable: outboundMinutes != null,
        garageConfigured: true,
      });
    })();

    return {
      id: b.id,
      refNumber: b.refNumber,
      customerName: b.customerName,
      serviceType: b.serviceType,
      bookingType: b.bookingType,
      status: b.status,
      totalAmount: b.totalAmount.toString(),
      scheduledAt: b.scheduledAt?.toISOString() ?? null,
      createdAt: b.createdAt?.toISOString() ?? null,
      paymentType: b.paymentType,
      driverSituation,
    };
  });

  return (
    <Box>
      <Heading size="lg" mb={6}>
        Bookings
      </Heading>
      <Suspense>
        <BookingsTable
          bookings={bookingsData}
          currentPage={page}
          totalPages={totalPages}
          totalCount={totalCount}
          filters={{
            status: params.status || 'all',
            search: params.search || '',
            dateFrom: params.dateFrom || '',
            dateTo: params.dateTo || '',
          }}
        />
      </Suspense>
    </Box>
  );
}
