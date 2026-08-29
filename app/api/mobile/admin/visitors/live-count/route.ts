import { NextRequest, NextResponse } from 'next/server';
import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { siteVisitors } from '@/lib/db/schema';
import { getMobileAdminUser, unauthorizedResponse } from '../../_lib';

export const dynamic = 'force-dynamic';

const ACTIVE_VISITOR_WINDOW_SECONDS = 60;

export async function GET(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  await db
    .update(siteVisitors)
    .set({ isOnline: false, updatedAt: new Date() })
    .where(
      and(
        eq(siteVisitors.isOnline, true),
        sql`${siteVisitors.lastHeartbeat} < NOW() - (${ACTIVE_VISITOR_WINDOW_SECONDS} * INTERVAL '1 second')`,
      ),
    );

  const [liveRow] = await db
    .select({ count: count() })
    .from(siteVisitors)
    .where(
      and(
        eq(siteVisitors.isOnline, true),
        sql`${siteVisitors.lastHeartbeat} >= NOW() - (${ACTIVE_VISITOR_WINDOW_SECONDS} * INTERVAL '1 second')`,
      ),
    );

  return NextResponse.json({
    liveCount: Number(liveRow?.count || 0),
    activeWindowSeconds: ACTIVE_VISITOR_WINDOW_SECONDS,
    updatedAt: new Date().toISOString(),
    source: 'site_visitors',
  });
}
