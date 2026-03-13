import { Suspense } from 'react';
import { db, bookings } from '@/lib/db';
import { desc, sql, ilike, eq, and, gte, lte, or } from 'drizzle-orm';
import { Heading, Box } from '@chakra-ui/react';
import { BookingsTable } from './BookingsTable';

interface Props {
  searchParams: Promise<{
    page?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
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
        ilike(bookings.customerEmail, searchTerm)
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
      })
      .from(bookings)
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
  const bookingsData = bookingsList.map((b) => ({
    ...b,
    totalAmount: b.totalAmount.toString(),
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    createdAt: b.createdAt?.toISOString() ?? null,
  }));

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
