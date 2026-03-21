import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteVisitors } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Polling endpoint for live visitor arrivals.
 * Client passes ?since=<ISO timestamp> and gets back new visitors since then.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = req.nextUrl.searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 10_000);

  const newVisitors = await db
    .select({
      id: siteVisitors.id,
      city: siteVisitors.city,
      device: siteVisitors.device,
      browser: siteVisitors.browser,
      referrer: siteVisitors.referrer,
      createdAt: siteVisitors.createdAt,
    })
    .from(siteVisitors)
    .where(sql`${siteVisitors.createdAt} > ${sinceDate}`)
    .orderBy(desc(siteVisitors.createdAt))
    .limit(10);

  return NextResponse.json({ visitors: newVisitors });
}
