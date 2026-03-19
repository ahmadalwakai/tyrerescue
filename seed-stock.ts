/**
 * seed-stock.ts — Bulk upsert budget tyre stock into catalogue + products.
 *
 * Usage:  npx tsx seed-stock.ts
 *
 * For each size in the BUDGET_STOCK list:
 *   1. Ensure a budget-tier catalogue entry exists (skip if already present)
 *   2. Ensure a tyre_products row exists and update stock to the listed quantity
 *
 * Existing products for these sizes are UPDATED (stock only), not duplicated.
 * Products for sizes NOT in this list are left untouched.
 */

import { db } from './lib/db';
import { tyreCatalogue, tyreProducts } from './lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getDefaultPriceString } from './lib/inventory/default-price-map';

/* ─── Budget stock data (owner-provided) ──────────────────── */
interface StockEntry {
  sizeRaw: string;   // e.g. "155/R13", "195/60/R16C"
  width: number;
  aspect: number;    // 0 for sizes like 155/R13
  rim: number;       // numeric only — "C" flag stored in sizeDisplay
  isCommercial: boolean;
  quantity: number;
}

function parseSizeString(raw: string): Omit<StockEntry, 'quantity'> | null {
  const s = raw.trim().toUpperCase();
  // Match patterns like 155/R13, 155/65/R14, 195/75/R16C
  const m = s.match(/^(\d+)\/(?:(\d+)\/)?R(\d+)(C?)$/);
  if (!m) return null;
  return {
    sizeRaw: raw.trim(),
    width: Number(m[1]),
    aspect: m[2] ? Number(m[2]) : 0,
    rim: Number(m[3]),
    isCommercial: m[4] === 'C',
  };
}

function makeSizeDisplay(e: Omit<StockEntry, 'quantity'>): string {
  const rimStr = `R${e.rim}${e.isCommercial ? 'C' : ''}`;
  return e.aspect > 0 ? `${e.width}/${e.aspect}/${rimStr}` : `${e.width}/${rimStr}`;
}

const RAW_DATA: [string, number][] = [
  ['155/R13', 2], ['155/65/R14', 2], ['155/70/R12', 1], ['155/80/R13', 1],
  ['165/60/R14', 3], ['165/60/R15', 2], ['165/65/R14', 3], ['165/65/R15', 2],
  ['165/70/R14', 3], ['175/R13', 3], ['175/R16C', 0], ['175/50/R15', 1],
  ['175/55/R20', 1], ['175/60/R15', 5], ['175/60/R16', 1], ['175/60/R18', 1],
  ['175/65/R14', 2], ['175/65/R15', 3], ['175/65/R17', 1], ['175/70/R13', 1],
  ['175/70/R14', 3], ['175/80/R16', 1], ['185/55/R15', 3], ['185/55/R16', 3],
  ['185/60/R14', 2], ['185/60/R15', 5], ['185/60/R16', 3], ['185/65/R14', 2],
  ['185/65/R15', 3], ['185/70/R14', 3], ['185/75/R16C', 2], ['195/40/R17', 2],
  ['195/45/R16', 6], ['195/50/R15', 3], ['195/50/R16', 2], ['195/55/R10', 2],
  ['195/55/R15', 2], ['195/55/R16', 5], ['195/60/R15', 5], ['195/60/R16', 4],
  ['195/60/R16C', 1], ['195/60/R18', 2], ['195/65/R15', 6], ['195/65/R16C', 3],
  ['195/70/R15C', 1], ['195/75/R16C', 8], ['205/40/R17', 3], ['205/40/R18', 3],
  ['205/45/R16', 3], ['205/45/R17', 0], ['205/50/R16', 1], ['205/50/R17', 4],
  ['205/55/R15', 1], ['205/55/R16', 6], ['205/55/R17', 3], ['205/55/R19', 4],
  ['205/60/R15', 2], ['205/60/R16', 4], ['205/65/R15', 1], ['205/65/R15C', 2],
  ['205/65/R16', 1], ['205/65/R16C', 4], ['205/75/R16C', 2], ['215/40/R16', 1],
  ['215/40/R17', 2], ['215/40/R18', 2], ['215/45/R16', 4], ['215/45/R17', 4],
  ['215/45/R18', 2], ['215/45/R20', 1], ['215/50/R17', 8], ['215/50/R18', 1],
  ['215/50/R18', 4], ['215/55/R16', 2], ['215/55/R17', 6], ['215/55/R18', 4],
  ['215/60/R16', 3], ['215/60/R16C', 3], ['215/60/R17', 4], ['215/60/R17C', 2],
  ['215/65/R15C', 9], ['215/65/R16', 3], ['215/65/R16C', 3], ['215/65/R17', 2],
  ['215/70/R15C', 3], ['215/70/R16', 3], ['215/70/R16C', 2], ['215/75/R16C', 1],
  ['225/30/R20', 1], ['225/35/R17', 1], ['225/35/R18', 2], ['225/35/R19', 4],
  ['225/35/R20', 2], ['225/40/R18', 1], ['225/40/R19', 3], ['225/40/R20', 2],
  ['225/45/R17', 6], ['225/45/R18', 6], ['225/45/R19', 1], ['225/50/R16', 1],
  ['225/50/R17', 4], ['225/50/R18', 3], ['225/55/R16', 1], ['225/55/R17', 4],
  ['225/55/R18', 5], ['225/55/R19', 2], ['225/60/R17', 3], ['225/60/R18', 3],
  ['225/65/R16C', 3], ['225/65/R17', 4], ['225/65/R18', 1], ['225/70/R15C', 2],
  ['225/70/R16', 2], ['225/75/R16C', 1], ['235/35/R19', 4], ['235/35/R20', 0],
  ['235/40/R18', 3], ['235/40/R19', 2], ['235/45/R17', 2], ['235/45/R18', 3],
  ['235/45/R19', 3], ['235/45/R20', 2], ['235/45/R21', 2], ['235/50/R18', 3],
  ['235/50/R19', 3], ['235/50/R20', 2], ['235/55/R17', 2], ['235/55/R18', 1],
  ['235/55/R19', 3], ['235/60/R16', 1], ['235/60/R17', 2], ['235/60/R18', 3],
  ['235/65/R16C', 3], ['235/65/R17', 2], ['235/65/R18', 1], ['245/30/R20', 1],
  ['245/35/R18', 4], ['245/35/R19', 2], ['245/35/R20', 2], ['245/40/R17', 3],
  ['245/40/R18', 3], ['245/40/R19', 4], ['245/40/R20', 1], ['245/40/R21', 1],
  ['245/45/R17', 2], ['245/45/R18', 3], ['245/45/R19', 2], ['245/45/R20', 2],
  ['245/45/R21', 1], ['245/50/R18', 2], ['245/50/R19', 2], ['245/50/R20', 2],
  ['255/30/R19', 2], ['255/30/R20', 3], ['255/35/R18', 2], ['255/35/R19', 3],
  ['255/35/R20', 3], ['255/35/R21', 2], ['255/40/R18', 2], ['255/40/R19', 2],
  ['255/40/R20', 1], ['255/40/R20', 3], ['255/40/R21', 2], ['255/45/R18', 3],
  ['255/45/R19', 4], ['255/45/R20', 2], ['255/50/R19', 2], ['255/50/R20', 2],
  ['255/55/R18', 2], ['255/55/R19', 2], ['255/55/R20', 3], ['255/60/R18', 2],
  ['255/60/R19', 1], ['255/65/R18', 1],
];

/* ─── Helpers (matches import route logic) ────────────────── */
function makeSlug(brand: string, pattern: string, width: number, aspect: number, rim: number, suffix: string): string {
  return `${brand}-${pattern}-${width}-${aspect}-r${rim}-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

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



/* ─── Main ────────────────────────────────────────────────── */
async function main() {
  // Deduplicate sizes (sum quantities for duplicates like 215/50/R18 appearing twice)
  const sizeMap = new Map<string, StockEntry>();
  for (const [raw, qty] of RAW_DATA) {
    const parsed = parseSizeString(raw);
    if (!parsed) {
      console.warn(`  SKIP unparseable: ${raw}`);
      continue;
    }
    const key = makeSizeDisplay(parsed);
    const existing = sizeMap.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      sizeMap.set(key, { ...parsed, quantity: qty });
    }
  }

  console.log(`Seeding ${sizeMap.size} budget tyre sizes…\n`);

  let created = 0;
  let updated = 0;
  let catCreated = 0;

  for (const [sizeDisplay, entry] of sizeMap) {
    const { width, aspect, rim, isCommercial, quantity } = entry;

    // 1. Find existing budget catalogue entry for this exact size (including C suffix)
    let [catRow] = await db
      .select()
      .from(tyreCatalogue)
      .where(
        and(
          eq(tyreCatalogue.width, width),
          eq(tyreCatalogue.aspect, aspect),
          eq(tyreCatalogue.rim, rim),
          eq(tyreCatalogue.tier, 'budget'),
          eq(tyreCatalogue.sizeDisplay, sizeDisplay),
        )
      )
      .limit(1);

    // Fallback: budget tier without sizeDisplay match
    if (!catRow) {
      [catRow] = await db
        .select()
        .from(tyreCatalogue)
        .where(
          and(
            eq(tyreCatalogue.width, width),
            eq(tyreCatalogue.aspect, aspect),
            eq(tyreCatalogue.rim, rim),
            eq(tyreCatalogue.tier, 'budget'),
          )
        )
        .limit(1);
    }

    // Fallback: use any tier catalogue entry for this size
    if (!catRow) {
      [catRow] = await db
        .select()
        .from(tyreCatalogue)
        .where(
          and(
            eq(tyreCatalogue.width, width),
            eq(tyreCatalogue.aspect, aspect),
            eq(tyreCatalogue.rim, rim),
          )
        )
        .limit(1);
    }

    // 2. Create catalogue entry if none exist at all
    if (!catRow) {
      const slug = makeSlug('Budget', 'All-Season', width, aspect, rim, 'budget');
      const [inserted] = await db.insert(tyreCatalogue).values({
        brand: 'Budget',
        pattern: 'All-Season',
        width,
        aspect,
        rim,
        sizeDisplay,
        season: 'allseason',
        speedRating: speedRatingFor(rim),
        loadIndex: loadIndexFor(width, aspect),
        wetGrip: 'C',
        fuelEfficiency: 'C',
        noiseDb: 71,
        runFlat: false,
        tier: 'budget',
        suggestedPriceNew: getDefaultPriceString(rim),
        slug,
      }).onConflictDoNothing().returning();

      if (inserted) {
        catRow = inserted;
        catCreated++;
      } else {
        // Slug conflict — re-fetch any tier
        [catRow] = await db
          .select()
          .from(tyreCatalogue)
          .where(
            and(
              eq(tyreCatalogue.width, width),
              eq(tyreCatalogue.aspect, aspect),
              eq(tyreCatalogue.rim, rim),
            )
          )
          .limit(1);
      }
    }

    if (!catRow) {
      console.warn(`  SKIP ${sizeDisplay} — catalogue row could not be resolved`);
      continue;
    }

    // 3. Find existing product by exact sizeDisplay (avoids C/non-C conflict)
    let [existingProduct] = await db
      .select({ id: tyreProducts.id })
      .from(tyreProducts)
      .where(and(
        eq(tyreProducts.brand, 'Budget'),
        eq(tyreProducts.sizeDisplay, sizeDisplay),
      ))
      .limit(1);

    // Fallback: match by catalogueId
    if (!existingProduct) {
      [existingProduct] = await db
        .select({ id: tyreProducts.id })
        .from(tyreProducts)
        .where(eq(tyreProducts.catalogueId, catRow.id))
        .limit(1);
    }

    if (existingProduct) {
      // Update stock + ensure brand/sizeDisplay are correct
      await db.update(tyreProducts).set({
        brand: 'Budget',
        pattern: 'All-Season',
        sizeDisplay,
        stockNew: quantity,
        isLocalStock: true,
        availableNew: true,
        updatedAt: new Date(),
      }).where(eq(tyreProducts.id, existingProduct.id));
      updated++;
      console.log(`  ✓ ${sizeDisplay.padEnd(14)} stock → ${quantity} (updated)`);
    } else {
      // Create product
      const prodSlug = makeSlug('Budget', 'All-Season', width, aspect, rim, `budget-${Date.now()}`);
      await db.insert(tyreProducts).values({
        catalogueId: catRow.id,
        brand: catRow.brand,
        pattern: catRow.pattern,
        width: catRow.width,
        aspect: catRow.aspect,
        rim: catRow.rim,
        sizeDisplay: catRow.sizeDisplay,
        season: catRow.season,
        speedRating: catRow.speedRating,
        loadIndex: catRow.loadIndex,
        wetGrip: catRow.wetGrip,
        fuelEfficiency: catRow.fuelEfficiency,
        runFlat: catRow.runFlat ?? false,
        priceNew: catRow.suggestedPriceNew,
        stockNew: quantity,
        stockOrdered: 0,
        isLocalStock: true,
        availableNew: true,
        featured: false,
        slug: prodSlug,
      });
      created++;
      console.log(`  + ${sizeDisplay.padEnd(14)} stock → ${quantity} (created)`);
    }
  }

  console.log(`\nDone! ${catCreated} catalogue entries created, ${created} products created, ${updated} products updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
