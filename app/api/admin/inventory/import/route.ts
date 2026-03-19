import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts } from '@/lib/db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { parseStockExcel } from '@/lib/inventory/parse-stock-excel';
import { getDefaultPriceString } from '@/lib/inventory/default-price-map';

function makeSlug(brand: string, pattern: string, width: number, aspect: number, rim: number): string {
  return `${brand}-${pattern}-${width}-${aspect}-r${rim}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ---------- helpers for auto-creating catalogue entries ---------- */
const budgetBrands = [
  { brand: 'Hankook', pattern: 'Kinergy Eco2' },
  { brand: 'Kumho', pattern: 'Ecsta HS52' },
];
const midBrands = [
  { brand: 'Pirelli', pattern: 'Cinturato P7' },
  { brand: 'Goodyear', pattern: 'EfficientGrip Performance 2' },
];
const premiumBrands = [
  { brand: 'Michelin', pattern: 'Primacy 4+' },
  { brand: 'Continental', pattern: 'PremiumContact 7' },
];

function speedRating(rim: number): string {
  if (rim <= 15) return 'H';
  if (rim <= 18) return 'V';
  return 'W';
}
function loadIndex(width: number, aspect: number): number {
  const vol = width * (aspect / 100);
  if (vol < 80) return 82;
  if (vol < 95) return 86;
  if (vol < 110) return 91;
  if (vol < 125) return 94;
  if (vol < 140) return 97;
  return 100;
}

const tiers = [
  { key: 'budget' as const,  pool: budgetBrands,  wetGrip: 'B', fuelEff: 'C' },
  { key: 'mid' as const,     pool: midBrands,     wetGrip: 'A', fuelEff: 'B' },
  { key: 'premium' as const, pool: premiumBrands, wetGrip: 'A', fuelEff: 'A' },
];

async function ensureCatalogueForSize(width: number, aspect: number, rim: number) {
  const sizeDisplay = `${width}/${aspect}/R${rim}`;
  const created = [];
  for (const t of tiers) {
    const b = t.pool[Math.floor(Math.random() * t.pool.length)];
    const slug = `${makeSlug(b.brand, b.pattern, width, aspect, rim)}-${t.key}`;
    const [row] = await db.insert(tyreCatalogue).values({
      brand: b.brand,
      pattern: b.pattern,
      width, aspect, rim,
      sizeDisplay,
      season: 'allseason',
      speedRating: speedRating(rim),
      loadIndex: loadIndex(width, aspect),
      wetGrip: t.wetGrip,
      fuelEfficiency: t.fuelEff,
      noiseDb: 70,
      runFlat: false,
      tier: t.key,
      suggestedPriceNew: getDefaultPriceString(rim, t.key),
      slug,
    }).onConflictDoNothing().returning();
    if (row) created.push(row);
  }
  return created;
}

/**
 * POST /api/admin/inventory/import
 * Upload an Excel stock file → sync tyre_products with actual garage stock.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const items = parseStockExcel(buffer);

  if (items.length === 0) {
    return NextResponse.json({ error: 'No valid items found in file' }, { status: 400 });
  }

  // Deduplicate by size — sum quantities for same width/aspect/rim
  const sizeMap = new Map<string, number>();
  for (const item of items) {
    const key = `${item.width}-${item.aspect}-${item.rim}`;
    sizeMap.set(key, (sizeMap.get(key) || 0) + item.quantity);
  }

  const errors: string[] = [];
  let importedCount = 0;
  const updatedProductIds: string[] = [];

  // Step 1: For each unique size, find catalogue entries and upsert tyre_products
  for (const [key, quantity] of sizeMap) {
    const [width, aspect, rim] = key.split('-').map(Number);

    let catalogueRows = await db
      .select()
      .from(tyreCatalogue)
      .where(
        and(
          eq(tyreCatalogue.width, width),
          eq(tyreCatalogue.aspect, aspect),
          eq(tyreCatalogue.rim, rim),
        )
      );

    if (catalogueRows.length === 0) {
      const created = await ensureCatalogueForSize(width, aspect, rim);
      if (created.length === 0) {
        errors.push(`Failed to create catalogue for ${width}/${aspect}/R${rim}`);
        continue;
      }
      catalogueRows.push(...created);
    }

    importedCount++;

    for (const cat of catalogueRows) {
      // Check if product already exists
      const [existing] = await db
        .select({ id: tyreProducts.id })
        .from(tyreProducts)
        .where(eq(tyreProducts.catalogueId, cat.id))
        .limit(1);

      if (existing) {
        // Update existing product
        await db
          .update(tyreProducts)
          .set({
            stockNew: quantity,
            isLocalStock: true,
            availableNew: true,
            updatedAt: new Date(),
          })
          .where(eq(tyreProducts.id, existing.id));
        updatedProductIds.push(existing.id);
      } else {
        // Insert new product
        const slug = `${makeSlug(cat.brand, cat.pattern, cat.width, cat.aspect, cat.rim)}-${Date.now()}`;
        const [inserted] = await db
          .insert(tyreProducts)
          .values({
            catalogueId: cat.id,
            brand: cat.brand,
            pattern: cat.pattern,
            width: cat.width,
            aspect: cat.aspect,
            rim: cat.rim,
            sizeDisplay: cat.sizeDisplay,
            season: cat.season,
            speedRating: cat.speedRating,
            loadIndex: cat.loadIndex,
            wetGrip: cat.wetGrip,
            fuelEfficiency: cat.fuelEfficiency,
            runFlat: cat.runFlat ?? false,
            priceNew: cat.suggestedPriceNew,
            stockNew: quantity,
            stockOrdered: 0,
            isLocalStock: true,
            availableNew: true,
            featured: false,
            slug,
          })
          .returning({ id: tyreProducts.id });
        updatedProductIds.push(inserted.id);
      }
    }
  }

  // Step 2: Reset stock for all products NOT in the import
  let resetCount = 0;
  if (updatedProductIds.length > 0) {
    const resetResult = await db
      .update(tyreProducts)
      .set({
        stockNew: 0,
        isLocalStock: false,
        availableNew: true,
        updatedAt: new Date(),
      })
      .where(
        sql`${tyreProducts.id} NOT IN (${sql.join(updatedProductIds.map(id => sql`${id}`), sql`, `)})`
      );
    resetCount = resetResult.rowCount ?? 0;
  }

  // Step 3: Auto-activate all remaining catalogue items with no product row
  const unactivated = await db
    .select({
      id: tyreCatalogue.id,
      brand: tyreCatalogue.brand,
      pattern: tyreCatalogue.pattern,
      width: tyreCatalogue.width,
      aspect: tyreCatalogue.aspect,
      rim: tyreCatalogue.rim,
      sizeDisplay: tyreCatalogue.sizeDisplay,
      season: tyreCatalogue.season,
      speedRating: tyreCatalogue.speedRating,
      loadIndex: tyreCatalogue.loadIndex,
      wetGrip: tyreCatalogue.wetGrip,
      fuelEfficiency: tyreCatalogue.fuelEfficiency,
      runFlat: tyreCatalogue.runFlat,
      suggestedPriceNew: tyreCatalogue.suggestedPriceNew,
      slug: tyreCatalogue.slug,
    })
    .from(tyreCatalogue)
    .leftJoin(tyreProducts, eq(tyreProducts.catalogueId, tyreCatalogue.id))
    .where(isNull(tyreProducts.id));

  let activatedCount = 0;
  const BATCH_SIZE = 50;
  for (let i = 0; i < unactivated.length; i += BATCH_SIZE) {
    const batch = unactivated.slice(i, i + BATCH_SIZE);
    const values = batch.map((cat) => ({
      catalogueId: cat.id,
      brand: cat.brand,
      pattern: cat.pattern,
      width: cat.width,
      aspect: cat.aspect,
      rim: cat.rim,
      sizeDisplay: cat.sizeDisplay,
      season: cat.season,
      speedRating: cat.speedRating,
      loadIndex: cat.loadIndex,
      wetGrip: cat.wetGrip,
      fuelEfficiency: cat.fuelEfficiency,
      runFlat: cat.runFlat ?? false,
      priceNew: cat.suggestedPriceNew,
      stockNew: 0,
      stockOrdered: 0,
      isLocalStock: false,
      availableNew: true,
      featured: false,
      slug: `${cat.slug}-p-${Date.now()}-${i}`,
    }));
    await db.insert(tyreProducts).values(values);
    activatedCount += batch.length;
  }

  // Total active count
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tyreProducts)
    .where(eq(tyreProducts.availableNew, true));
  const totalActive = Number(totalResult?.count || 0);

  return NextResponse.json({
    success: true,
    imported: importedCount,
    activated: activatedCount,
    reset: resetCount,
    totalActive,
    errors,
  });
}
