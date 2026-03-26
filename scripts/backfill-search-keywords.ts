import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { siteVisitors } from '../lib/db/schema';
import { parseSearchReferrer } from '../lib/analytics/parse-search-referrer';

type VisitorRow = {
  id: string;
  referrer: string | null;
  searchEngine: string | null;
  searchKeyword: string | null;
};

function normalizeOptionalText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeKeyword(value: string | null, maxLength: number): string | null {
  if (!value) return null;

  let decoded = value;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // keep original value when decode fails
  }

  const compact = decoded.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.slice(0, maxLength);
}

async function run() {
  const rows = await db
    .select({
      id: siteVisitors.id,
      referrer: siteVisitors.referrer,
      searchEngine: siteVisitors.searchEngine,
      searchKeyword: siteVisitors.searchKeyword,
    })
    .from(siteVisitors)
    .where(
      and(
        sql`${siteVisitors.referrer} IS NOT NULL`,
        or(
          sql`${siteVisitors.searchKeyword} IS NULL`,
          eq(sql`btrim(${siteVisitors.searchKeyword})`, ''),
        ),
      ),
    );

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows as VisitorRow[]) {
    scanned += 1;

    const referrer = normalizeOptionalText(row.referrer, 255);
    if (!referrer) {
      skipped += 1;
      continue;
    }

    const parsed = parseSearchReferrer(referrer);
    const parsedEngine = normalizeOptionalText(parsed.searchEngine, 50);
    const parsedKeyword = normalizeKeyword(parsed.searchKeyword, 500);

    if (!parsedEngine && !parsedKeyword) {
      skipped += 1;
      continue;
    }

    const currentEngine = normalizeOptionalText(row.searchEngine, 50);
    const currentKeyword = normalizeKeyword(row.searchKeyword, 500);

    const updates: {
      updatedAt: Date;
      searchEngine?: string;
      searchKeyword?: string;
    } = {
      updatedAt: new Date(),
    };

    if (parsedEngine && (!currentEngine || currentEngine !== parsedEngine)) {
      updates.searchEngine = parsedEngine;
    }

    if (parsedKeyword && (!currentKeyword || currentKeyword !== parsedKeyword)) {
      updates.searchKeyword = parsedKeyword;
    }

    if (updates.searchEngine || updates.searchKeyword) {
      await db
        .update(siteVisitors)
        .set(updates)
        .where(eq(siteVisitors.id, row.id));
      updated += 1;
    } else {
      skipped += 1;
     }
   }

  console.log('[backfill-search-keywords] done');
  console.log(`[backfill-search-keywords] scanned=${scanned}`);
  console.log(`[backfill-search-keywords] updated=${updated}`);
  console.log(`[backfill-search-keywords] skipped=${skipped}`);
}

run().catch((error) => {
  console.error('[backfill-search-keywords] failed', error);
  process.exitCode = 1;
});
