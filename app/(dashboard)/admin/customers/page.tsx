import { Box, Heading, Text } from '@chakra-ui/react';
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { colorTokens as c } from '@/lib/design-tokens';
import { db, users, bookings } from '@/lib/db';
import { CustomersTable } from './CustomersTable';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    search?: string;
    page?: string;
  }>;
}

const PER_PAGE = 25;

function buildWhere(search?: string): SQL | undefined {
  const conditions: SQL[] = [eq(users.role, 'customer')];
  if (search) {
    const term = `%${search}%`;
    const clause = or(
      ilike(users.name, term),
      ilike(users.email, term),
      ilike(users.phone, term),
    );
    if (clause) conditions.push(clause);
  }
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

export default async function AdminCustomersPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = (params.search ?? '').trim();
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const offset = (page - 1) * PER_PAGE;
  const where = buildWhere(search || undefined);

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        bookingCount: sql<number>`COALESCE((
          SELECT COUNT(*) FROM ${bookings} WHERE ${bookings.userId} = ${users.id}
        ), 0)`,
        lastBookingAt: sql<Date | null>`(
          SELECT MAX(${bookings.createdAt}) FROM ${bookings} WHERE ${bookings.userId} = ${users.id}
        )`,
        paidTotal: sql<string>`COALESCE((
          SELECT SUM(${bookings.totalAmount})
          FROM ${bookings}
          WHERE ${bookings.userId} = ${users.id}
            AND ${bookings.status} IN ('paid','assigned','accepted','en_route','arrived','in_progress','completed')
        ), 0)`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PER_PAGE)
      .offset(offset),
    db.select({ value: count() }).from(users).where(where),
  ]);

  const total = Number(totals[0]?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const customers = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? null,
    emailVerified: Boolean(r.emailVerified),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    lastBookingAt: r.lastBookingAt ? new Date(r.lastBookingAt).toISOString() : null,
    bookingCount: Number(r.bookingCount ?? 0),
    paidTotal: String(r.paidTotal ?? '0'),
  }));

  return (
    <Box>
      <Heading size="lg" mb={2}>
        Customer accounts
      </Heading>
      <Text fontSize="sm" color={c.muted} mb={6}>
        Customers who registered an account on the site. Phone-only bookings are not listed here.
      </Text>
      <CustomersTable
        customers={customers}
        totalCount={total}
        currentPage={page}
        totalPages={totalPages}
        search={search}
      />
    </Box>
  );
}
