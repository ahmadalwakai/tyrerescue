import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db, bookings, siteVisitors, demandSnapshots } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [bookingStats, visitorStats, demandHistory] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
      })
      .from(bookings)
      .where(sql`${bookings.createdAt} >= ${thirtyDaysAgo}`),
    db
      .select({
        totalVisitors: sql<number>`count(*)::int`,
        liveVisitors: sql<number>`count(*) filter (where ${siteVisitors.isOnline} = true)::int`,
        avgSessionSeconds: sql<number>`coalesce(avg(${siteVisitors.sessionDuration}), 0)::numeric`,
      })
      .from(siteVisitors)
      .where(sql`${siteVisitors.createdAt} >= ${thirtyDaysAgo}`),
    db
      .select()
      .from(demandSnapshots)
      .orderBy(desc(demandSnapshots.hourStart))
      .limit(24),
  ]);

  return NextResponse.json({
    bookings: {
      total: Number(bookingStats[0]?.total || 0),
      completed: Number(bookingStats[0]?.completed || 0),
      revenue: String(bookingStats[0]?.revenue || '0'),
    },
    visitors: {
      total: Number(visitorStats[0]?.totalVisitors || 0),
      live: Number(visitorStats[0]?.liveVisitors || 0),
      avgSessionSeconds: Math.round(Number(visitorStats[0]?.avgSessionSeconds || 0)),
    },
    demandHistory: demandHistory.map((row) => ({
      ...row,
      surchargeApplied: row.surchargeApplied?.toString() ?? '0',
      hourStart: row.hourStart?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
  });
}
