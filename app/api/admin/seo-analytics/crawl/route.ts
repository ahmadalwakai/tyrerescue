import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import * as cheerio from 'cheerio';

const PAGES_TO_CRAWL = [
  '/', '/emergency', '/book', '/tyres', '/tracking', '/contact',
  '/blog', '/faq', '/privacy-policy', '/terms-of-service',
  '/mobile-tyre-fitting/glasgow', '/mobile-tyre-fitting/edinburgh',
  '/emergency-tyre-fitting/glasgow', '/tyre-repair/glasgow',
  '/services/glasgow', '/services/edinburgh',
];

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { path: string; status: number; issues: number; loadTimeMs: number; error?: string }[] = [];

  for (const path of PAGES_TO_CRAWL) {
    try {
      const url = `https://www.tyrerescue.uk${path}`;
      const start = Date.now();
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TyreRescue-SEO-Crawler/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      const loadTimeMs = Date.now() - start;
      const html = await res.text();
      const $ = cheerio.load(html);

      const issues: { type: string; message: string; severity: string }[] = [];

      const title = $('title').text().trim();
      const metaDesc = $('meta[name="description"]').attr('content')?.trim() || null;
      const h1 = $('h1').first().text().trim();
      const h1Count = $('h1').length;
      const h2Count = $('h2').length;
      const imgWithoutAlt = $('img:not([alt]), img[alt=""]').length;
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      const wordCount = bodyText.split(/\s+/).length;
      const hasCanonical = $('link[rel="canonical"]').length > 0;
      const hasOpenGraph = $('meta[property="og:title"]').length > 0;
      const hasTwitterCard = $('meta[name="twitter:card"]').length > 0;
      const hasJsonLd = $('script[type="application/ld+json"]').length > 0;

      // Generate issues
      if (!title) issues.push({ type: 'missing_title', message: 'Page has no <title> tag', severity: 'error' });
      else if (title.length > 60) issues.push({ type: 'title_too_long', message: `Title is ${title.length} chars (max 60)`, severity: 'warning' });
      else if (title.length < 30) issues.push({ type: 'title_too_short', message: `Title is ${title.length} chars (min 30)`, severity: 'warning' });

      if (!metaDesc) issues.push({ type: 'missing_meta_desc', message: 'No meta description', severity: 'error' });
      else if (metaDesc.length > 160) issues.push({ type: 'meta_desc_long', message: `Meta description is ${metaDesc.length} chars (max 160)`, severity: 'warning' });

      if (h1Count === 0) issues.push({ type: 'missing_h1', message: 'No H1 tag found', severity: 'error' });
      if (h1Count > 1) issues.push({ type: 'multiple_h1', message: `${h1Count} H1 tags found (should be 1)`, severity: 'warning' });

      if (imgWithoutAlt > 0) issues.push({ type: 'img_no_alt', message: `${imgWithoutAlt} images missing alt text`, severity: 'warning' });

      if (!hasCanonical) issues.push({ type: 'no_canonical', message: 'No canonical URL set', severity: 'warning' });
      if (!hasOpenGraph) issues.push({ type: 'no_og', message: 'No Open Graph tags', severity: 'warning' });
      if (!hasJsonLd) issues.push({ type: 'no_jsonld', message: 'No JSON-LD structured data', severity: 'warning' });

      if (wordCount < 300 && path !== '/') issues.push({ type: 'thin_content', message: `Only ${wordCount} words (min 300 recommended)`, severity: 'info' });

      await db.execute(sql`
        INSERT INTO page_analysis (path, title, meta_description, h1, h1_count, h2_count,
          img_without_alt, word_count, has_canonical, has_open_graph, has_twitter_card,
          has_json_ld, status_code, load_time_ms, issues, last_crawled)
        VALUES (${path}, ${title}, ${metaDesc}, ${h1}, ${h1Count}, ${h2Count},
          ${imgWithoutAlt}, ${wordCount}, ${hasCanonical}, ${hasOpenGraph}, ${hasTwitterCard},
          ${hasJsonLd}, ${res.status}, ${loadTimeMs}, ${JSON.stringify(issues)}::jsonb, NOW())
        ON CONFLICT (path) DO UPDATE SET
          title = EXCLUDED.title, meta_description = EXCLUDED.meta_description,
          h1 = EXCLUDED.h1, h1_count = EXCLUDED.h1_count, h2_count = EXCLUDED.h2_count,
          img_without_alt = EXCLUDED.img_without_alt, word_count = EXCLUDED.word_count,
          has_canonical = EXCLUDED.has_canonical, has_open_graph = EXCLUDED.has_open_graph,
          has_twitter_card = EXCLUDED.has_twitter_card, has_json_ld = EXCLUDED.has_json_ld,
          status_code = EXCLUDED.status_code, load_time_ms = EXCLUDED.load_time_ms,
          issues = EXCLUDED.issues, last_crawled = NOW()
      `);

      results.push({ path, status: res.status, issues: issues.length, loadTimeMs });
    } catch (e) {
      results.push({ path, status: 0, issues: -1, loadTimeMs: 0, error: String(e) });
    }
  }

  return NextResponse.json({ crawled: results.length, results });
}
