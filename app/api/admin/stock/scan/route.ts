import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod/v4';

const scanSchema = z.object({
  barcode: z.string().min(1).max(100),
});

/** Normalize a raw barcode: trim, strip control/invisible chars, preserve leading zeros */
function normalizeBarcode(raw: string): string {
  return raw
    .trim()
    .replace(/[\x00-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/g, '') // strip invisible chars
    .replace(/\s+/g, '');
}

/**
 * POST /api/admin/stock/scan
 *
 * Accepts { barcode: string } and searches tyreProducts for a match.
 * This is a read-only lookup — it never mutates stock.
 *
 * Matching strategy:
 *   1. Exact barcode match (tyreProducts.barcode column)
 *   2. Fallback: try interpreting the barcode as a tyre-size string and
 *      match against sizeDisplay (case-insensitive). Many budget tyre labels
 *      encode the size in the barcode value, so this is a reasonable heuristic.
 *      Fallback results are clearly marked so the admin knows the match is
 *      by size, not a verified barcode.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const parsed = scanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, barcode: null, found: false, items: [], message: 'Invalid barcode value' },
        { status: 400 },
      );
    }

    const normalized = normalizeBarcode(parsed.data.barcode);
    if (!normalized) {
      return NextResponse.json(
        { success: false, barcode: '', found: false, items: [], message: 'Barcode is empty after normalization' },
        { status: 400 },
      );
    }

    // 1) Exact barcode match
    const exactMatches = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.barcode, normalized));

    if (exactMatches.length > 0) {
      return NextResponse.json({
        success: true,
        barcode: normalized,
        found: true,
        matchType: 'barcode',
        items: exactMatches.map(formatItem),
        message:
          exactMatches.length === 1
            ? 'Exact barcode match found'
            : `${exactMatches.length} products share this barcode`,
      });
    }

    // 2) Fallback: try matching barcode value as a tyre size string
    //    e.g. "2055516" → might match "205/55/R16"
    //    We try both the raw normalized string and a pattern-expanded version.
    const sizePatterns = expandSizePatterns(normalized);
    if (sizePatterns.length > 0) {
      const sizeMatches = await db
        .select()
        .from(tyreProducts)
        .where(
          or(
            ...sizePatterns.map((p) => ilike(tyreProducts.sizeDisplay, p)),
          ),
        );

      if (sizeMatches.length > 0) {
        return NextResponse.json({
          success: true,
          barcode: normalized,
          found: true,
          matchType: 'size-fallback',
          items: sizeMatches.map(formatItem),
          message:
            sizeMatches.length === 1
              ? 'No barcode field set — matched by tyre size (fallback). Consider assigning this barcode to the product.'
              : `${sizeMatches.length} products matched by size (fallback). Assign barcodes for exact matching.`,
        });
      }
    }

    // 3) Not found
    return NextResponse.json({
      success: true,
      barcode: normalized,
      found: false,
      matchType: null,
      items: [],
      message: 'Not found in current stock',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    console.error('POST /api/admin/stock/scan error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

/* ── helpers ─────────────────────────────────────────────── */

function formatItem(r: typeof tyreProducts.$inferSelect) {
  return {
    id: r.id,
    brand: r.brand,
    pattern: r.pattern,
    sizeDisplay: r.sizeDisplay,
    width: r.width,
    aspect: r.aspect,
    rim: r.rim,
    season: r.season,
    barcode: r.barcode,
    priceNew: r.priceNew ? parseFloat(r.priceNew) : null,
    stockNew: r.stockNew ?? 0,
    stockOrdered: r.stockOrdered ?? 0,
    isLocalStock: r.isLocalStock ?? false,
    availableNew: r.availableNew ?? true,
  };
}

/**
 * Attempt to interpret a barcode string as a tyre size.
 * Returns an array of SQL ILIKE patterns to try, or [] if nothing sensible.
 *
 * Common barcode→size mappings:
 *   "2055516"   → "205/55/R16"  (7 digits: www/aa/Rrr)
 *   "20555R16"  → "205/55/R16"
 *   "205/55/R16" → direct
 */
function expandSizePatterns(barcode: string): string[] {
  const patterns: string[] = [];

  // Already looks like a tyre size? Use it directly.
  if (/^\d{3}\/\d{1,3}\/R\d{2}C?$/i.test(barcode)) {
    patterns.push(barcode);
    return patterns;
  }

  // 7-8 digit numeric: try extracting www/aa/rr
  const numOnly = barcode.replace(/[^0-9]/g, '');
  if (numOnly.length >= 6 && numOnly.length <= 8) {
    const w = numOnly.slice(0, 3);
    const a = numOnly.slice(3, 5);
    const r = numOnly.slice(5);
    if (r.length >= 1 && r.length <= 2) {
      patterns.push(`${w}/${a}/R${r}`);
      patterns.push(`${w}/${a}/R${r}C`);
    }
  }

  // Mixed alphanumeric with R: e.g. "20555R16"
  const mixedMatch = barcode.match(/^(\d{3})(\d{2})R(\d{2})(C?)$/i);
  if (mixedMatch) {
    patterns.push(`${mixedMatch[1]}/${mixedMatch[2]}/R${mixedMatch[3]}${mixedMatch[4].toUpperCase()}`);
  }

  return patterns;
}
