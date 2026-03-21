import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteVisitors, seoSnapshots, pageAnalysis } from '@/lib/db/schema';
import { sql, desc } from 'drizzle-orm';
import { services, serviceCities, getAreasForCity } from '@/lib/areas';
import { articles } from '@/lib/blog/articles';
import { cities } from '@/lib/cities';

/* ── Types ── */
interface CWVData {
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  lcp: number;
  fid: number;
  cls: number;
  fcp: number;
  ttfb: number;
}

/* ── PageSpeed Insights (free API) ── */
export async function fetchPageSpeedData(url: string): Promise<CWVData | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) return null;

  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=mobile`;
    const res = await fetch(apiUrl, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();

    const categories = data.lighthouseResult?.categories;
    const audits = data.lighthouseResult?.audits;

    return {
      performanceScore: Math.round((categories?.performance?.score || 0) * 100),
      accessibilityScore: Math.round((categories?.accessibility?.score || 0) * 100),
      bestPracticesScore: Math.round((categories?.['best-practices']?.score || 0) * 100),
      seoScore: Math.round((categories?.seo?.score || 0) * 100),
      lcp: parseFloat(audits?.['largest-contentful-paint']?.numericValue || 0) / 1000,
      fid: parseFloat(audits?.['max-potential-fid']?.numericValue || 0),
      cls: parseFloat(audits?.['cumulative-layout-shift']?.numericValue || 0),
      fcp: parseFloat(audits?.['first-contentful-paint']?.numericValue || 0) / 1000,
      ttfb: parseFloat(audits?.['server-response-time']?.numericValue || 0),
    };
  } catch (e) {
    console.error('PageSpeed API error:', e);
    return null;
  }
}

/* ── Total pages count (from sitemap structure) ── */
function countTotalPages(): number {
  const staticPages = [
    '', '/emergency', '/book', '/tyres', '/faq', '/contact',
    '/privacy-policy', '/terms-of-service', '/refund-policy', '/cookie-policy',
  ];
  const cityPages = cities.map((c) => `/services/${c.slug}`);
  const serviceCityPages = services.flatMap((s) =>
    serviceCities.map((city) => `/${s.slug}/${city}`),
  );
  const serviceAreaPages = services.flatMap((s) =>
    serviceCities.flatMap((city) =>
      getAreasForCity(city).map((a) => `/${s.slug}/${city}/${a.slug}`),
    ),
  );
  const blogPages = articles.map((a) => `/blog/${a.slug}`);

  return staticPages.length + cityPages.length + serviceCityPages.length +
    serviceAreaPages.length + blogPages.length + 1;
}

/* ── GET handler ── */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // A) Core Web Vitals from PageSpeed Insights API
    const cwvData = await fetchPageSpeedData('https://www.tyrerescue.uk');
    const lastSnapshot = await db.select().from(seoSnapshots)
      .orderBy(desc(seoSnapshots.date)).limit(1);
    const cwvLastChecked = lastSnapshot[0]?.date?.toISOString() ?? null;

    // CWV history from seoSnapshots
    const history = await db.select().from(seoSnapshots)
      .orderBy(desc(seoSnapshots.date))
      .limit(30);

    // B) Traffic from real siteVisitors table
    const trafficQuery = await db.execute(sql`
      SELECT
        date_trunc('week', created_at)::text as week,
        COUNT(*) FILTER (WHERE search_engine IN ('Google','Bing','Yahoo','DuckDuckGo','Ecosia'))::int as organic,
        COUNT(*) FILTER (WHERE search_engine = 'Direct' OR search_engine IS NULL)::int as direct,
        COUNT(*) FILTER (WHERE search_engine IN ('Facebook','Instagram','TikTok','WhatsApp'))::int as social,
        COUNT(*) FILTER (WHERE search_engine NOT IN ('Google','Bing','Yahoo','DuckDuckGo','Ecosia','Direct','Facebook','Instagram','TikTok','WhatsApp') AND search_engine IS NOT NULL)::int as referral,
        COUNT(*)::int as total
      FROM site_visitors
      WHERE created_at > NOW() - INTERVAL '12 weeks'
      GROUP BY date_trunc('week', created_at)
      ORDER BY week ASC
    `);

    const trafficRows = (trafficQuery.rows ?? trafficQuery) as Array<{
      week: string; organic: number; direct: number; social: number; referral: number; total: number;
    }>;

    const trafficWeeks = trafficRows.map((r) => ({
      week: r.week,
      organic: Number(r.organic) || 0,
      direct: Number(r.direct) || 0,
      social: Number(r.social) || 0,
      referral: Number(r.referral) || 0,
      total: Number(r.total) || 0,
    }));

    // Traffic summary
    const totalVisitors = trafficWeeks.reduce((s, w) => s + w.total, 0);
    const totalOrganic = trafficWeeks.reduce((s, w) => s + w.organic, 0);
    const organicPct = totalVisitors > 0 ? Math.round((totalOrganic / totalVisitors) * 100) : 0;

    // Trend: compare last half vs prior half
    const mid = Math.floor(trafficWeeks.length / 2);
    const recentTotal = trafficWeeks.slice(mid).reduce((s, w) => s + w.total, 0);
    const priorTotal = trafficWeeks.slice(0, mid).reduce((s, w) => s + w.total, 0);
    const trend = priorTotal > 0 ? Math.round(((recentTotal - priorTotal) / priorTotal) * 100) : 0;

    // C) Keywords from real visitor search data
    const keywordsQuery = await db.execute(sql`
      SELECT
        search_keyword as keyword,
        COUNT(*)::int as impressions,
        COUNT(*) FILTER (WHERE (
          SELECT COUNT(*) FROM visitor_clicks vc WHERE vc.visitor_id = site_visitors.id
        ) > 0)::int as clicks
      FROM site_visitors
      WHERE search_keyword IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY search_keyword
      ORDER BY COUNT(*) DESC
      LIMIT 30
    `);

    const keywordRows = (keywordsQuery.rows ?? keywordsQuery) as Array<{
      keyword: string; impressions: number; clicks: number;
    }>;

    const keywords = keywordRows.map((r) => ({
      keyword: r.keyword,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
      ctr: Number(r.impressions) > 0
        ? Math.round((Number(r.clicks) / Number(r.impressions)) * 1000) / 10
        : 0,
    }));

    // D) Page crawl data
    const pages = await db.select().from(pageAnalysis)
      .orderBy(desc(pageAnalysis.lastCrawled))
      .limit(50);

    const pagesWithIssues = pages.filter((p) => {
      const issues = p.issues as Array<{ severity: string }> | null;
      return issues && issues.some((i) => i.severity === 'error' || i.severity === 'warning');
    }).length;

    const avgLoadTime = pages.length > 0
      ? Math.round(pages.reduce((s, p) => s + (p.loadTimeMs ?? 0), 0) / pages.length)
      : 0;

    // E) Schema stats
    const schemaStatsQuery = await db.select({
      total: sql<number>`count(*)::int`,
      withJsonLd: sql<number>`count(*) FILTER (WHERE has_json_ld = true)::int`,
      withOg: sql<number>`count(*) FILTER (WHERE has_open_graph = true)::int`,
      withTwitter: sql<number>`count(*) FILTER (WHERE has_twitter_card = true)::int`,
      withCanonical: sql<number>`count(*) FILTER (WHERE has_canonical = true)::int`,
    }).from(pageAnalysis);

    const schemaStats = schemaStatsQuery[0] ?? { total: 0, withJsonLd: 0, withOg: 0, withTwitter: 0, withCanonical: 0 };

    // F) Health score from real data
    const healthIssues: { type: string; message: string; severity: 'error' | 'warning' | 'info'; path?: string }[] = [];

    for (const page of pages) {
      const pageIssues = page.issues as Array<{ type: string; message: string; severity: string }> | null;
      if (pageIssues) {
        for (const issue of pageIssues) {
          healthIssues.push({
            type: issue.type,
            message: issue.message,
            severity: issue.severity as 'error' | 'warning' | 'info',
            path: page.path,
          });
        }
      }
    }

    let healthScore = 100;
    if (cwvData) {
      const cwvAvg = (cwvData.performanceScore + cwvData.accessibilityScore +
        cwvData.bestPracticesScore + cwvData.seoScore) / 4;
      healthScore = Math.round(cwvAvg * 0.25 +
        (schemaStats.total > 0 ? (Number(schemaStats.withJsonLd) / Number(schemaStats.total)) * 100 : 0) * 0.25 +
        (pages.length > 0 ? (pages.filter((p) => p.metaDescription).length / pages.length) * 100 : 0) * 0.25 +
        (pages.length > 0 ? ((pages.length - pagesWithIssues) / pages.length) * 100 : 0) * 0.25);
    } else if (pages.length > 0) {
      healthScore = Math.round(
        (Number(schemaStats.total) > 0 ? (Number(schemaStats.withJsonLd) / Number(schemaStats.total)) * 100 : 0) * 0.33 +
        (pages.filter((p) => p.metaDescription).length / pages.length) * 100 * 0.33 +
        ((pages.length - pagesWithIssues) / pages.length) * 100 * 0.34);
    } else {
      healthScore = 0;
    }

    // G) Indexing
    const totalPages = countTotalPages();
    const crawledCount = pages.length;
    const lastCrawl = pages[0]?.lastCrawled?.toISOString() ?? null;

    return NextResponse.json({
      cwv: {
        current: cwvData,
        history,
        lastChecked: cwvLastChecked,
      },
      traffic: {
        weeks: trafficWeeks,
        summary: { totalVisitors, organicPct, trend },
      },
      keywords: {
        list: keywords,
        total: keywords.length,
      },
      pages: {
        list: pages,
        stats: { total: pages.length, withIssues: pagesWithIssues, avgLoadTime },
      },
      schemas: {
        total: Number(schemaStats.total) || 0,
        withJsonLd: Number(schemaStats.withJsonLd) || 0,
        withOg: Number(schemaStats.withOg) || 0,
        withTwitter: Number(schemaStats.withTwitter) || 0,
        withCanonical: Number(schemaStats.withCanonical) || 0,
      },
      health: {
        score: healthScore,
        issues: healthIssues,
      },
      indexing: {
        totalPages,
        crawledPages: crawledCount,
        lastCrawl,
      },
    });
  } catch (e) {
    console.error('SEO analytics error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
