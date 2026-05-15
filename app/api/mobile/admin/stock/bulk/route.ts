import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts } from '@/lib/db/schema';
import { eq, and, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { getDefaultPriceString } from '@/lib/inventory/default-price-map';
import { normalizeSeason } from '@/lib/inventory/normalize-season';

// ── Helpers (shared with /stock route) ───────────────────────────────────

function speedRatingFor(rim: number): string {
  if (rim <= 15) return 'H';
  if (rim <= 18) return 'V';
  return 'W';
}

function loadIndexFor(width: number, aspect: number): number {
  const vol = width * ((aspect || 80) / 100);
  if (vol < 80) return 82;
  if (vol < 95) return 86;
  if (vol < 110) return 91;
  if (vol < 125) return 94;
  if (vol < 140) return 97;
  return 100;
}

function makeSlug(...parts: (string | number)[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Validation ────────────────────────────────────────────────────────────

const rowSchema = z.object({
  size: z.string().min(3),
  brand: z.string().optional(),
  pattern: z.string().optional(),
  season: z.string().optional(),
  price: z.union([z.string(), z.number(), z.null()]).optional(),
  stock: z.number().int().min(0).default(0),
});

const bulkSchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
  mode: z.enum(['upsert', 'insert']).default('upsert'),
});

const SIZE_RE = /^(\d{3})\/(\d{2,3})\/[Rr](\d{2})$/;

/**
 * POST /api/mobile/admin/stock/bulk
 *
 * Accepts a JSON body:
 *   { rows: Array<{ size, brand?, pattern?, season?, price?, stock? }>, mode: 'upsert' | 'insert' }
 *
 * - mode='upsert' (default): insert new sizes, update price+stock on existing ones.
 * - mode='insert': skip rows where the size+season already exists.
 *
 * Returns: { imported, updated, errors, total }
 */
export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rows, mode } = parsed.data;
  let imported = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const match = SIZE_RE.exec(row.size.trim().toUpperCase().replace(/\s/g, ''));
    if (!match) {
      errors.push({ row: i + 1, message: `Invalid size format: "${row.size}"` });
      continue;
    }

    const width = parseInt(match[1], 10);
    const aspect = parseInt(match[2], 10);
    const rim = parseInt(match[3], 10);
    const sizeDisplay = `${width}/${aspect}/R${rim}`;
    const season = normalizeSeason(row.season) ?? 'summer';
    const brand = row.brand?.trim() || 'Unbranded';
    const pattern = row.pattern?.trim() || '';
    const priceStr =
      row.price != null && row.price !== ''
        ? String(row.price)
        : getDefaultPriceString(rim);
    const patternStr = pattern || 'Standard';

    try {
      // ── Find or create catalogue entry ───────────────────────────────
      let [catRow] = await db
        .select()
        .from(tyreCatalogue)
        .where(
          and(
            ilike(tyreCatalogue.brand, brand),
            eq(tyreCatalogue.width, width),
            eq(tyreCatalogue.aspect, aspect),
            eq(tyreCatalogue.rim, rim),
            eq(tyreCatalogue.sizeDisplay, sizeDisplay),
          ),
        )
        .limit(1);

      if (!catRow) {
        const catSlug = makeSlug(brand, patternStr, width, aspect, `r${rim}`, Date.now());
        const [inserted] = await db
          .insert(tyreCatalogue)
          .values({
            brand,
            pattern: patternStr,
            width,
            aspect,
            rim,
            sizeDisplay,
            season,
            speedRating: speedRatingFor(rim),
            loadIndex: loadIndexFor(width, aspect),
            wetGrip: 'C',
            fuelEfficiency: 'C',
            noiseDb: 71,
            runFlat: false,
            tier: 'mid',
            suggestedPriceNew: getDefaultPriceString(rim),
            slug: catSlug,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted) catRow = inserted;
      }

      // ── Check if product already exists ──────────────────────────────
      const [existing] = await db
        .select({ id: tyreProducts.id })
        .from(tyreProducts)
        .where(and(eq(tyreProducts.sizeDisplay, sizeDisplay), eq(tyreProducts.season, season)))
        .limit(1);

      if (existing && mode === 'upsert') {
        await db
          .update(tyreProducts)
          .set({
            brand,
            ...(pattern ? { pattern } : {}),
            priceNew: priceStr,
            stockNew: row.stock,
            updatedAt: new Date(),
          })
          .where(eq(tyreProducts.id, existing.id));
        updated++;
      } else if (!existing) {
        const productSlug = makeSlug(brand, sizeDisplay, season, Date.now());
        await db.insert(tyreProducts).values({
          catalogueId: catRow?.id ?? null,
          brand,
          pattern: patternStr,
          width,
          aspect,
          rim,
          sizeDisplay,
          season,
          speedRating: speedRatingFor(rim),
          loadIndex: loadIndexFor(width, aspect),
          wetGrip: 'C',
          fuelEfficiency: 'C',
          noiseDb: 71,
          runFlat: false,
          priceNew: priceStr,
          stockNew: row.stock,
          stockOrdered: 0,
          isLocalStock: false,
          availableNew: true,
          featured: false,
          slug: productSlug,
        });
        imported++;
      } else {
        // Exists but mode='insert' — skip with note
        errors.push({
          row: i + 1,
          message: `"${sizeDisplay}" (${season}) already exists — skipped`,
        });
      }
    } catch (e) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: ${e instanceof Error ? e.message : 'unknown error'}`,
      });
    }
  }

  return NextResponse.json({ imported, updated, errors, total: rows.length });
}
