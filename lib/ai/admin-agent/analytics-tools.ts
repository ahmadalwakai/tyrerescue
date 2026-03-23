/* ── Zyphon – Visitor Analytics Tools (Phase 3) ───────── */

import { db } from '@/lib/db';
import {
  siteVisitors,
  visitorPageViews,
  visitorClicks,
  seoSnapshots,
  demandSnapshots,
} from '@/lib/db/schema';
import { sql, gte, desc, lte, and, eq } from 'drizzle-orm';
import type { ToolResult } from './types';

/* ── Helpers ──────────────────────────────────────────── */

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ── Visitor Analytics ────────────────────────────────── */

export async function getVisitorAnalyticsData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 7;
  const since = daysAgo(days);

  const [stats] = await db
    .select({
      totalVisitors: sql<number>`count(distinct ${siteVisitors.id})::int`,
      totalPageViews: sql<number>`count(${visitorPageViews.id})::int`,
      avgSessionDuration: sql<number>`coalesce(avg(${siteVisitors.sessionDuration}), 0)::int`,
      mobileCount: sql<number>`count(case when ${siteVisitors.device} = 'mobile' then 1 end)::int`,
      desktopCount: sql<number>`count(case when ${siteVisitors.device} = 'desktop' then 1 end)::int`,
      returningVisitors: sql<number>`count(case when ${siteVisitors.visitCount} > 1 then 1 end)::int`,
    })
    .from(siteVisitors)
    .leftJoin(visitorPageViews, eq(visitorPageViews.visitorId, siteVisitors.id))
    .where(gte(siteVisitors.createdAt, since));

  return { success: true, data: { period: `${days} days`, ...stats } };
}

/* ── Traffic Sources ──────────────────────────────────── */

export async function getTrafficSourcesData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 7;

  // Use seoSnapshots which already track organic/direct/social visitors
  const rows = await db
    .select({
      date: seoSnapshots.date,
      totalVisitors: seoSnapshots.totalVisitors,
      organicVisitors: seoSnapshots.organicVisitors,
      directVisitors: seoSnapshots.directVisitors,
      socialVisitors: seoSnapshots.socialVisitors,
      bounceRate: seoSnapshots.bounceRate,
    })
    .from(seoSnapshots)
    .where(gte(seoSnapshots.date, daysAgo(days)))
    .orderBy(desc(seoSnapshots.date))
    .limit(days);

  // Also get referrer breakdown from siteVisitors
  const since = daysAgo(days);
  const referrerBreakdown = await db
    .select({
      referrer: siteVisitors.referrer,
      count: sql<number>`count(*)::int`,
    })
    .from(siteVisitors)
    .where(gte(siteVisitors.createdAt, since))
    .groupBy(siteVisitors.referrer)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  return { success: true, data: { dailySnapshots: rows, referrerBreakdown } };
}

/* ── Top Pages ────────────────────────────────────────── */

export async function getTopPagesData(params: { days?: number; limit?: number }): Promise<ToolResult> {
  const days = params.days ?? 7;
  const limit = params.limit ?? 15;
  const since = daysAgo(days);

  const rows = await db
    .select({
      path: visitorPageViews.path,
      title: visitorPageViews.title,
      views: sql<number>`count(*)::int`,
      uniqueVisitors: sql<number>`count(distinct ${visitorPageViews.visitorId})::int`,
    })
    .from(visitorPageViews)
    .where(gte(visitorPageViews.timestamp, since))
    .groupBy(visitorPageViews.path, visitorPageViews.title)
    .orderBy(sql`count(*) desc`)
    .limit(limit);

  return { success: true, data: rows };
}

/* ── Realtime Visitors ────────────────────────────────── */

export async function getRealtimeVisitorsData(): Promise<ToolResult> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [stats] = await db
    .select({
      onlineNow: sql<number>`count(case when ${siteVisitors.isOnline} = true then 1 end)::int`,
      recentVisitors: sql<number>`count(distinct ${siteVisitors.id})::int`,
    })
    .from(siteVisitors)
    .where(gte(siteVisitors.lastHeartbeat, fiveMinAgo));

  // Recent page views in last 5 min
  const recentPages = await db
    .select({
      path: visitorPageViews.path,
      count: sql<number>`count(*)::int`,
    })
    .from(visitorPageViews)
    .where(gte(visitorPageViews.timestamp, fiveMinAgo))
    .groupBy(visitorPageViews.path)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  return { success: true, data: { ...stats, recentPages } };
}

/* ── Conversion Funnel ────────────────────────────────── */

export async function getConversionFunnelData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 7;
  const since = daysAgo(days);

  // Aggregate from demand snapshots
  const [funnel] = await db
    .select({
      totalPageViews: sql<number>`coalesce(sum(${demandSnapshots.pageViews}), 0)::int`,
      callClicks: sql<number>`coalesce(sum(${demandSnapshots.callClicks}), 0)::int`,
      bookingStarts: sql<number>`coalesce(sum(${demandSnapshots.bookingStarts}), 0)::int`,
      bookingCompletes: sql<number>`coalesce(sum(${demandSnapshots.bookingCompletes}), 0)::int`,
      whatsappClicks: sql<number>`coalesce(sum(${demandSnapshots.whatsappClicks}), 0)::int`,
    })
    .from(demandSnapshots)
    .where(gte(demandSnapshots.hourStart, since));

  const conversionRate = funnel.totalPageViews > 0
    ? Math.round((funnel.bookingCompletes / funnel.totalPageViews) * 10000) / 100
    : 0;

  return {
    success: true,
    data: {
      period: `${days} days`,
      ...funnel,
      conversionRate: `${conversionRate}%`,
    },
  };
}

/* ── Demand Signals ───────────────────────────────────── */

export async function getDemandSignalsData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 3;
  const since = daysAgo(days);

  // Hourly demand pattern
  const hourly = await db
    .select({
      hour: sql<number>`extract(hour from ${demandSnapshots.hourStart})::int`,
      avgPageViews: sql<number>`round(avg(${demandSnapshots.pageViews}))::int`,
      avgCallClicks: sql<number>`round(avg(${demandSnapshots.callClicks}))::int`,
      avgBookingStarts: sql<number>`round(avg(${demandSnapshots.bookingStarts}))::int`,
    })
    .from(demandSnapshots)
    .where(gte(demandSnapshots.hourStart, since))
    .groupBy(sql`extract(hour from ${demandSnapshots.hourStart})`)
    .orderBy(sql`extract(hour from ${demandSnapshots.hourStart})`);

  // Top search keywords driving visitors
  const keywords = await db
    .select({
      keyword: siteVisitors.searchKeyword,
      count: sql<number>`count(*)::int`,
    })
    .from(siteVisitors)
    .where(
      and(
        gte(siteVisitors.createdAt, since),
        sql`${siteVisitors.searchKeyword} IS NOT NULL AND ${siteVisitors.searchKeyword} != ''`,
      ),
    )
    .groupBy(siteVisitors.searchKeyword)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  return { success: true, data: { hourlyPattern: hourly, topKeywords: keywords } };
}
