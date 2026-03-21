import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoSnapshots } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { fetchPageSpeedData } from '../route';

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cwv = await fetchPageSpeedData('https://www.tyrerescue.uk');

    // Traffic for today
    const todayTraffic = await db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE search_engine IN ('Google','Bing','Yahoo','DuckDuckGo','Ecosia'))::int as organic,
        COUNT(*) FILTER (WHERE search_engine = 'Direct' OR search_engine IS NULL)::int as direct,
        COUNT(*) FILTER (WHERE search_engine IN ('Facebook','Instagram','TikTok','WhatsApp'))::int as social,
        AVG(session_duration)::real as avg_duration
      FROM site_visitors
      WHERE created_at > CURRENT_DATE
    `);

    // Bounce rate (visitors with 1 page view only)
    const bounceData = await db.execute(sql`
      SELECT
        CASE WHEN COUNT(*) > 0
          THEN (COUNT(*) FILTER (WHERE pv_count = 1)::float / COUNT(*) * 100)
          ELSE 0
        END as bounce_rate
      FROM (
        SELECT sv.id, COUNT(vpv.id) as pv_count
        FROM site_visitors sv
        LEFT JOIN visitor_page_views vpv ON vpv.visitor_id = sv.id
        WHERE sv.created_at > CURRENT_DATE
        GROUP BY sv.id
      ) sub
    `);

    const row = ((todayTraffic.rows ?? todayTraffic) as Record<string, unknown>[])[0] ?? {};
    const bounce = ((bounceData.rows ?? bounceData) as Record<string, unknown>[])[0] ?? {};

    await db.insert(seoSnapshots).values({
      date: new Date(),
      performanceScore: cwv?.performanceScore ?? null,
      accessibilityScore: cwv?.accessibilityScore ?? null,
      bestPracticesScore: cwv?.bestPracticesScore ?? null,
      seoScore: cwv?.seoScore ?? null,
      lcp: cwv?.lcp ?? null,
      fid: cwv?.fid ?? null,
      cls: cwv?.cls ?? null,
      fcp: cwv?.fcp ?? null,
      ttfb: cwv?.ttfb ?? null,
      totalVisitors: Number(row.total) || 0,
      organicVisitors: Number(row.organic) || 0,
      directVisitors: Number(row.direct) || 0,
      socialVisitors: Number(row.social) || 0,
      bounceRate: Number(bounce.bounce_rate) || null,
      avgSessionDuration: Number(row.avg_duration) || null,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Snapshot error:', e);
    return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 });
  }
}
