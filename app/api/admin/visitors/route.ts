import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteVisitors, visitorPageViews, visitorClicks } from '@/lib/db/schema';
import { sql, eq, gte, count, avg, and, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'week';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
  const offset = (page - 1) * limit;

  // Mark visitors offline if no heartbeat for 60 seconds
  await db
    .update(siteVisitors)
    .set({ isOnline: false })
    .where(
      and(
        eq(siteVisitors.isOnline, true),
        sql`${siteVisitors.lastHeartbeat} < NOW() - INTERVAL '60 seconds'`
      )
    );

  // Period filter
  const periodFilter =
    period === 'today'
      ? sql`${siteVisitors.createdAt} >= CURRENT_DATE`
      : period === 'month'
      ? sql`${siteVisitors.createdAt} >= NOW() - INTERVAL '30 days'`
      : sql`${siteVisitors.createdAt} >= NOW() - INTERVAL '7 days'`;

  const priorPeriodFilter =
    period === 'today'
      ? sql`${siteVisitors.createdAt} >= CURRENT_DATE - INTERVAL '1 day' AND ${siteVisitors.createdAt} < CURRENT_DATE`
      : period === 'month'
      ? sql`${siteVisitors.createdAt} >= NOW() - INTERVAL '60 days' AND ${siteVisitors.createdAt} < NOW() - INTERVAL '30 days'`
      : sql`${siteVisitors.createdAt} >= NOW() - INTERVAL '14 days' AND ${siteVisitors.createdAt} < NOW() - INTERVAL '7 days'`;

  // Fetch visitors with page views and clicks
  const visitors = await db
    .select()
    .from(siteVisitors)
    .where(periodFilter)
    .orderBy(desc(siteVisitors.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch page views and clicks for these visitors
  const visitorIds = visitors.map((v) => v.id);

  let pageViews: { visitorId: string; path: string; title: string | null; timestamp: Date | null }[] = [];
  let clicks: { visitorId: string; buttonText: string; path: string | null; timestamp: Date | null }[] = [];

  if (visitorIds.length > 0) {
    pageViews = await db
      .select({
        visitorId: visitorPageViews.visitorId,
        path: visitorPageViews.path,
        title: visitorPageViews.title,
        timestamp: visitorPageViews.timestamp,
      })
      .from(visitorPageViews)
      .where(sql`${visitorPageViews.visitorId} IN ${visitorIds}`);

    clicks = await db
      .select({
        visitorId: visitorClicks.visitorId,
        buttonText: visitorClicks.buttonText,
        path: visitorClicks.path,
        timestamp: visitorClicks.timestamp,
      })
      .from(visitorClicks)
      .where(sql`${visitorClicks.visitorId} IN ${visitorIds}`);
  }

  // Aggregate stats
  const [statsRow] = await db
    .select({
      total: count(),
      avgDuration: avg(siteVisitors.sessionDuration),
    })
    .from(siteVisitors)
    .where(periodFilter);

  const [priorRow] = await db
    .select({ total: count() })
    .from(siteVisitors)
    .where(priorPeriodFilter);

  const [liveRow] = await db
    .select({ count: count() })
    .from(siteVisitors)
    .where(eq(siteVisitors.isOnline, true));

  const totalVisitors = Number(statsRow?.total || 0);
  const priorTotal = Number(priorRow?.total || 0);
  const liveCount = Number(liveRow?.count || 0);
  const avgSessionDuration = Math.round(Number(statsRow?.avgDuration || 0));

  // Device breakdown
  const deviceBreakdown = await db
    .select({ device: siteVisitors.device, count: count() })
    .from(siteVisitors)
    .where(periodFilter)
    .groupBy(siteVisitors.device);

  // Referrer breakdown
  const referrerBreakdown = await db
    .select({ referrer: siteVisitors.referrer, count: count() })
    .from(siteVisitors)
    .where(periodFilter)
    .groupBy(siteVisitors.referrer)
    .orderBy(desc(count()));

  // City breakdown
  const cityBreakdown = await db
    .select({ city: siteVisitors.city, count: count() })
    .from(siteVisitors)
    .where(periodFilter)
    .groupBy(siteVisitors.city)
    .orderBy(desc(count()));

  // Demographics (consent-only)
  const ageBreakdown = await db
    .select({ ageGroup: siteVisitors.ageGroup, count: count() })
    .from(siteVisitors)
    .where(and(periodFilter, eq(siteVisitors.consentGiven, true)))
    .groupBy(siteVisitors.ageGroup);

  const genderBreakdown = await db
    .select({ gender: siteVisitors.gender, count: count() })
    .from(siteVisitors)
    .where(and(periodFilter, eq(siteVisitors.consentGiven, true)))
    .groupBy(siteVisitors.gender);

  // Button click heatmap
  const buttonBreakdown = await db
    .select({ buttonText: visitorClicks.buttonText, count: count() })
    .from(visitorClicks)
    .innerJoin(siteVisitors, eq(visitorClicks.visitorId, siteVisitors.id))
    .where(periodFilter)
    .groupBy(visitorClicks.buttonText)
    .orderBy(desc(count()));

  // Top pages
  const topPages = await db
    .select({ path: visitorPageViews.path, count: count() })
    .from(visitorPageViews)
    .innerJoin(siteVisitors, eq(visitorPageViews.visitorId, siteVisitors.id))
    .where(periodFilter)
    .groupBy(visitorPageViews.path)
    .orderBy(desc(count()))
    .limit(10);

  // Daily trend (for weekly view)
  const dailyTrend = await db
    .select({
      day: sql<string>`TO_CHAR(${siteVisitors.createdAt}, 'Dy')`,
      count: count(),
    })
    .from(siteVisitors)
    .where(sql`${siteVisitors.createdAt} >= NOW() - INTERVAL '7 days'`)
    .groupBy(sql`TO_CHAR(${siteVisitors.createdAt}, 'Dy'), DATE_TRUNC('day', ${siteVisitors.createdAt})`)
    .orderBy(sql`DATE_TRUNC('day', ${siteVisitors.createdAt})`);

  // Monthly trend
  const monthlyTrend = await db
    .select({
      month: sql<string>`TO_CHAR(${siteVisitors.createdAt}, 'Mon')`,
      count: count(),
    })
    .from(siteVisitors)
    .where(sql`${siteVisitors.createdAt} >= NOW() - INTERVAL '12 months'`)
    .groupBy(sql`TO_CHAR(${siteVisitors.createdAt}, 'Mon'), DATE_TRUNC('month', ${siteVisitors.createdAt})`)
    .orderBy(sql`DATE_TRUNC('month', ${siteVisitors.createdAt})`);

  // Calculate trend percentage
  const trendPct = priorTotal > 0
    ? Number((((totalVisitors - priorTotal) / priorTotal) * 100).toFixed(1))
    : 0;

  // Mobile percentage
  const mobileCount = deviceBreakdown.find(d => d.device === 'Mobile')?.count || 0;
  const mobilePct = totalVisitors > 0 ? Math.round((Number(mobileCount) / totalVisitors) * 100) : 0;

  // Merge page views and clicks into visitors
  const enrichedVisitors = visitors.map((v) => ({
    ...v,
    // Strip demographics if no consent
    ageGroup: v.consentGiven ? v.ageGroup : null,
    gender: v.consentGiven ? v.gender : null,
    interests: v.consentGiven ? v.interests : null,
    pagesVisited: pageViews
      .filter((pv) => pv.visitorId === v.id)
      .map((pv) => ({ path: pv.path, title: pv.title, timestamp: pv.timestamp })),
    buttonsClicked: clicks
      .filter((c) => c.visitorId === v.id)
      .map((c) => ({ buttonText: c.buttonText, path: c.path, timestamp: c.timestamp })),
  }));

  return NextResponse.json({
    visitors: enrichedVisitors,
    stats: {
      totalVisitors,
      liveCount,
      avgSessionDuration,
      trendPct,
      mobilePct,
      deviceBreakdown: deviceBreakdown.map(d => ({ device: d.device, count: Number(d.count) })),
      referrerBreakdown: referrerBreakdown.map(r => ({ referrer: r.referrer, count: Number(r.count) })),
      cityBreakdown: cityBreakdown.map(c => ({ city: c.city, count: Number(c.count) })),
      ageBreakdown: ageBreakdown.map(a => ({ ageGroup: a.ageGroup, count: Number(a.count) })),
      genderBreakdown: genderBreakdown.map(g => ({ gender: g.gender, count: Number(g.count) })),
      buttonBreakdown: buttonBreakdown.map(b => ({ buttonText: b.buttonText, count: Number(b.count) })),
      topPages: topPages.map(p => ({ path: p.path, count: Number(p.count) })),
      dailyTrend: dailyTrend.map(d => ({ day: d.day, visitors: Number(d.count) })),
      monthlyTrend: monthlyTrend.map(m => ({ month: m.month, visitors: Number(m.count) })),
    },
    page,
    totalCount: totalVisitors,
  });
}
