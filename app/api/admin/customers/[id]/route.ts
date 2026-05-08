import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, bookings } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = ParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const { id } = parsed.data;

  const [customer] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, 'customer')))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const recent = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      status: bookings.status,
      serviceType: bookings.serviceType,
      bookingType: bookings.bookingType,
      totalAmount: bookings.totalAmount,
      scheduledAt: bookings.scheduledAt,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(eq(bookings.userId, id))
    .orderBy(desc(bookings.createdAt))
    .limit(20);

  const [aggregate] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      paid: sql<string>`COALESCE(SUM(CASE WHEN ${bookings.status} IN ('paid','assigned','accepted','en_route','arrived','in_progress','completed') THEN ${bookings.totalAmount} ELSE 0 END), 0)`,
    })
    .from(bookings)
    .where(eq(bookings.userId, id));

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      emailVerified: Boolean(customer.emailVerified),
      createdAt: customer.createdAt ? new Date(customer.createdAt).toISOString() : null,
      updatedAt: customer.updatedAt ? new Date(customer.updatedAt).toISOString() : null,
    },
    bookings: recent.map((b) => ({
      id: b.id,
      refNumber: b.refNumber,
      status: b.status,
      serviceType: b.serviceType,
      bookingType: b.bookingType,
      totalAmount: b.totalAmount?.toString() ?? '0',
      scheduledAt: b.scheduledAt ? new Date(b.scheduledAt).toISOString() : null,
      createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : null,
    })),
    stats: {
      totalBookings: Number(aggregate?.total ?? 0),
      paidTotal: String(aggregate?.paid ?? '0'),
    },
  });
}
