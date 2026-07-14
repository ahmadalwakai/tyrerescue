import { NextResponse } from 'next/server';
import { and, desc, eq, exists, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { db, bookings, bookingTyres, tyreProducts, drivers, users } from '@/lib/db';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
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

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const { page, perPage, offset } = parsePageParams(url, { page: 1, perPage: 25, maxPerPage: 100 });

  const status = url.searchParams.get('status') || '';
  const search = url.searchParams.get('search') || '';
  const dateFrom = url.searchParams.get('dateFrom') || '';
  const dateTo = url.searchParams.get('dateTo') || '';

  const conditions = [];

  if (status && status !== 'all') {
    conditions.push(eq(bookings.status, status));
  }

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(bookings.refNumber, term),
        ilike(bookings.customerName, term),
        ilike(bookings.customerEmail, term),
        exists(
          db
            .select({ one: sql`1` })
            .from(bookingTyres)
            .innerJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
            .where(and(eq(bookingTyres.bookingId, bookings.id), ilike(tyreProducts.sizeDisplay, term))),
        ),
      ),
    );
  }

  if (dateFrom) {
    conditions.push(gte(bookings.createdAt, new Date(dateFrom)));
  }

  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(bookings.createdAt, end));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        status: bookings.status,
        bookingType: bookings.bookingType,
        serviceType: bookings.serviceType,
        customerName: bookings.customerName,
        customerPhone: bookings.customerPhone,
        customerEmail: bookings.customerEmail,
        scheduledAt: bookings.scheduledAt,
        totalAmount: bookings.totalAmount,
        createdAt: bookings.createdAt,
        driverId: bookings.driverId,
        quantity: bookings.quantity,
        customerLat: bookings.lat,
        customerLng: bookings.lng,
        driverName: users.name,
        driverLat: drivers.currentLat,
        driverLng: drivers.currentLng,
        driverIsOnline: drivers.isOnline,
        driverStatus: drivers.status,
        driverLocationAt: drivers.locationAt,
      })
      .from(bookings)
      .leftJoin(drivers, eq(bookings.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .where(whereClause)
      .orderBy(desc(bookings.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(whereClause),
  ]);

  const totalCount = Number(countRows[0]?.count || 0);

  return NextResponse.json({
    items: rows.map((booking) => {
      const customerLat = toNumber(booking.customerLat);
      const customerLng = toNumber(booking.customerLng);
      const driverLat = toNumber(booking.driverLat);
      const driverLng = toNumber(booking.driverLng);
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
        id: booking.id,
        refNumber: booking.refNumber,
        status: booking.status,
        bookingType: booking.bookingType,
        serviceType: booking.serviceType,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        customerEmail: booking.customerEmail,
        scheduledAt: booking.scheduledAt?.toISOString() ?? null,
        totalAmount: booking.totalAmount.toString(),
        createdAt: booking.createdAt?.toISOString() ?? null,
        driverId: booking.driverId,
        driverName: booking.driverName ?? null,
        driverSituation: calculateDriverSituation({
          jobRef: booking.refNumber,
          driverId: booking.driverId ?? null,
          bookingStatus: booking.status,
          driverIsOnline: booking.driverIsOnline ?? false,
          driverStatus: booking.driverStatus ?? null,
          lastLocationAt: booking.driverLocationAt ?? null,
          outboundMinutes,
          returnMinutes,
          serviceType: booking.serviceType,
          tyreCount: booking.quantity,
          paymentStatus: null,
          returnEstimateAvailable: returnMinutes != null,
          routeAvailable: outboundMinutes != null,
          garageConfigured: true,
        }),
      };
    }),
    page,
    perPage,
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
  });
}
