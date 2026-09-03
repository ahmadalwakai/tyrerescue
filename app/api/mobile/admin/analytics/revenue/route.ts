import { NextResponse } from 'next/server';
import { sql, gte } from 'drizzle-orm';
import { db, bookings } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days') || '30')));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [totals, daily, bySource, byStatus] = await Promise.all([
    db
      .select({
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
        bookingCount: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
        avgOrderValue: sql<number>`coalesce(avg(${bookings.totalAmount}) filter (where ${bookings.totalAmount} > 0), 0)::numeric`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, since)),

    db
      .select({
        date: sql<string>`date_trunc('day', ${bookings.createdAt})::date::text`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
        bookingCount: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, since))
      .groupBy(sql`1`)
      .orderBy(sql`1`),

    db
      .select({
        sourceApp: bookings.sourceApp,
        sourceLabel: bookings.sourceLabel,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
        bookingCount: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, since))
      .groupBy(bookings.sourceApp, bookings.sourceLabel)
      .orderBy(sql`coalesce(sum(${bookings.totalAmount}), 0) desc`),

    db
      .select({
        status: bookings.status,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, since))
      .groupBy(bookings.status)
      .orderBy(sql`coalesce(sum(${bookings.totalAmount}), 0) desc`),
  ]);

  const totalRev = Number(totals[0]?.revenue ?? 0);
  const totalBookings = Number(totals[0]?.bookingCount ?? 0);
  const totalCompleted = Number(totals[0]?.completed ?? 0);
  const avgOrderValue = Number(totals[0]?.avgOrderValue ?? 0);

  return NextResponse.json({
    period: { days },
    totals: {
      revenue: totalRev.toFixed(2),
      bookings: totalBookings,
      completed: totalCompleted,
      avgOrderValue: avgOrderValue.toFixed(2),
      completionRate: totalBookings > 0 ? ((totalCompleted / totalBookings) * 100).toFixed(1) : '0',
    },
    daily: daily.map((d) => ({
      date: d.date,
      revenue: Number(d.revenue),
      bookings: Number(d.bookingCount),
      completed: Number(d.completed),
    })),
    bySource: bySource.map((s) => ({
      sourceApp: s.sourceApp,
      sourceLabel: s.sourceLabel,
      revenue: Number(s.revenue),
      bookings: Number(s.bookingCount),
    })),
    byStatus: byStatus.map((s) => ({
      status: s.status,
      revenue: Number(s.revenue),
      count: Number(s.count),
    })),
  });
}
