import { NextResponse } from 'next/server';
import { and, desc, eq, exists, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { db, bookings, bookingTyres, tyreProducts, drivers, users } from '@/lib/db';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

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
      })
      .from(bookings)
      .where(whereClause)
      .orderBy(desc(bookings.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(whereClause),
  ]);

  const totalCount = Number(countRows[0]?.count || 0);

  const driverIds = rows
    .map((booking) => booking.driverId)
    .filter((id): id is string => Boolean(id));

  let driverNameMap = new Map<string, string>();
  if (driverIds.length > 0) {
    const driverRows = await db
      .select({ driverId: drivers.id, name: users.name })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(inArray(drivers.id, driverIds));

    driverNameMap = new Map(driverRows.map((driver) => [driver.driverId, driver.name]));
  }

  return NextResponse.json({
    items: rows.map((booking) => ({
      ...booking,
      totalAmount: booking.totalAmount.toString(),
      scheduledAt: booking.scheduledAt?.toISOString() ?? null,
      createdAt: booking.createdAt?.toISOString() ?? null,
      driverName: booking.driverId ? (driverNameMap.get(booking.driverId) || null) : null,
    })),
    page,
    perPage,
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
  });
}
