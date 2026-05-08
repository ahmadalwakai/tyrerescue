import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, bookings } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(25),
});

function buildWhere(search?: string): SQL | undefined {
  const conditions: SQL[] = [eq(users.role, 'customer')];
  if (search) {
    const term = `%${search}%`;
    const searchClause = or(
      ilike(users.name, term),
      ilike(users.email, term),
      ilike(users.phone, term),
    );
    if (searchClause) conditions.push(searchClause);
  }
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    search: url.searchParams.get('search') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    perPage: url.searchParams.get('perPage') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
  }
  const { search, page, perPage } = parsed.data;
  const offset = (page - 1) * perPage;
  const where = buildWhere(search);

  // Aggregate booking stats per customer (paid bookings only for paidTotal).
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
      .limit(perPage)
      .offset(offset),
    db.select({ value: count() }).from(users).where(where),
  ]);

  const total = Number(totals[0]?.value ?? 0);

  return NextResponse.json({
    customers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      emailVerified: Boolean(r.emailVerified),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      lastBookingAt: r.lastBookingAt ? new Date(r.lastBookingAt).toISOString() : null,
      bookingCount: Number(r.bookingCount ?? 0),
      paidTotal: String(r.paidTotal ?? '0'),
    })),
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  });
}
