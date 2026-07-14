import { NextRequest, NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { db, bookings, drivers } from '@/lib/db';
import { bookingTyres, tyreProducts } from '@/lib/db/schema';
import { desc, sql, ilike, eq, and, gte, lte, or, exists } from 'drizzle-orm';
import { haversineDistanceMiles } from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import {
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
} from '@/lib/admin/driverSituation';

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const perPage = 25;
  const offset = (page - 1) * perPage;
  const status = searchParams.get('status') || '';
  const search = searchParams.get('search') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const conditions = [];

  if (status && status !== 'all') {
    conditions.push(eq(bookings.status, status));
  }

  if (search) {
    const searchTerm = `%${search}%`;
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
      ),
    );
  }

  if (dateFrom) {
    conditions.push(gte(bookings.createdAt, new Date(dateFrom)));
  }

  if (dateTo) {
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);
    conditions.push(lte(bookings.createdAt, endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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

  const bookingsData = bookingsList.map((b) => {
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
      driverSituation: calculateDriverSituation({
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
      }),
    };
  });

  return NextResponse.json({
    bookings: bookingsData,
    page,
    totalPages,
    totalCount,
  });
}
