import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { siteVisitors } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import { getMobileAdminUser, unauthorizedResponse } from '../../_lib';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const since = request.nextUrl.searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 10_000);

  const newVisitors = await db
    .select({
      id: siteVisitors.id,
      city: siteVisitors.city,
      device: siteVisitors.device,
      browser: siteVisitors.browser,
      referrer: siteVisitors.referrer,
      searchKeyword: siteVisitors.searchKeyword,
      searchEngine: siteVisitors.searchEngine,
      visitCount: siteVisitors.visitCount,
      createdAt: siteVisitors.createdAt,
    })
    .from(siteVisitors)
    .where(sql`${siteVisitors.createdAt} > ${sinceDate}`)
    .orderBy(desc(siteVisitors.createdAt))
    .limit(10);

  return NextResponse.json({ visitors: newVisitors });
}
