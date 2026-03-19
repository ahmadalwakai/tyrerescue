import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, sql as sqlFn, isNull } from 'drizzle-orm';
import * as schema from '../lib/db/schema';
import { parseStockExcel } from '../lib/inventory/parse-stock-excel';
import { getDefaultPriceString } from '../lib/inventory/default-price-map';

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient, { schema });

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
    const [row] = await db.insert(schema.tyreCatalogue).values({
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

async function seedFromExcel() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx scripts/seed-from-excel.ts <path-to-excel-file>');
    process.exit(1);
  }

  console.log(`Reading stock file: ${filePath}`);
  const buffer = readFileSync(filePath);
  const items = parseStockExcel(buffer);
  console.log(`Parsed ${items.length} items from Excel file`);

  if (items.length === 0) {
    console.error('No valid items found in file');
    process.exit(1);
  }

  // Deduplicate by size — sum quantities for same width/aspect/rim
  const sizeMap = new Map<string, number>();
  for (const item of items) {
    const key = `${item.width}-${item.aspect}-${item.rim}`;
    sizeMap.set(key, (sizeMap.get(key) || 0) + item.quantity);
  }

  console.log(`Unique sizes: ${sizeMap.size}`);

  let importedCount = 0;
  const updatedProductIds: string[] = [];
  const errors: string[] = [];

  // Step 1: Match each size to catalogue and upsert products
  for (const [key, quantity] of sizeMap) {
    const [width, aspect, rim] = key.split('-').map(Number);

    let catalogueRows = await db
      .select()
      .from(schema.tyreCatalogue)
      .where(
        and(
          eq(schema.tyreCatalogue.width, width),
          eq(schema.tyreCatalogue.aspect, aspect),
          eq(schema.tyreCatalogue.rim, rim),
        )
      );

    if (catalogueRows.length === 0) {
      const created = await ensureCatalogueForSize(width, aspect, rim);
      if (created.length === 0) {
        errors.push(`Failed to create catalogue for ${width}/${aspect}/R${rim}`);
        continue;
      }
      catalogueRows = created;
      console.log(`  Auto-created catalogue entries for ${width}/${aspect}/R${rim}`);
    }

    importedCount++;
    console.log(`  ${width}/${aspect}/R${rim}: qty=${quantity}, ${catalogueRows.length} catalogue entries`);

    for (const cat of catalogueRows) {
      const [existing] = await db
        .select({ id: schema.tyreProducts.id })
        .from(schema.tyreProducts)
        .where(eq(schema.tyreProducts.catalogueId, cat.id))
        .limit(1);

      if (existing) {
        await db
          .update(schema.tyreProducts)
          .set({
            stockNew: quantity,
            isLocalStock: true,
            availableNew: true,
            updatedAt: new Date(),
          })
          .where(eq(schema.tyreProducts.id, existing.id));
        updatedProductIds.push(existing.id);
      } else {
        const slug = `${makeSlug(cat.brand, cat.pattern, cat.width, cat.aspect, cat.rim)}-${Date.now()}`;
        const [inserted] = await db
          .insert(schema.tyreProducts)
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
          .returning({ id: schema.tyreProducts.id });
        updatedProductIds.push(inserted.id);
      }
    }
  }

  // Step 2: Reset stock for all products NOT in the import
  let resetCount = 0;
  if (updatedProductIds.length > 0) {
    const resetResult = await db
      .update(schema.tyreProducts)
      .set({
        stockNew: 0,
        isLocalStock: false,
        availableNew: true,
        updatedAt: new Date(),
      })
      .where(
        sqlFn`${schema.tyreProducts.id} NOT IN (${sqlFn.join(updatedProductIds.map(id => sqlFn`${id}`), sqlFn`, `)})`
      );
    resetCount = resetResult.rowCount ?? 0;
  }

  // Step 3: Auto-activate all remaining catalogue items with no product row
  const unactivated = await db
    .select({
      id: schema.tyreCatalogue.id,
      brand: schema.tyreCatalogue.brand,
      pattern: schema.tyreCatalogue.pattern,
      width: schema.tyreCatalogue.width,
      aspect: schema.tyreCatalogue.aspect,
      rim: schema.tyreCatalogue.rim,
      sizeDisplay: schema.tyreCatalogue.sizeDisplay,
      season: schema.tyreCatalogue.season,
      speedRating: schema.tyreCatalogue.speedRating,
      loadIndex: schema.tyreCatalogue.loadIndex,
      wetGrip: schema.tyreCatalogue.wetGrip,
      fuelEfficiency: schema.tyreCatalogue.fuelEfficiency,
      runFlat: schema.tyreCatalogue.runFlat,
      suggestedPriceNew: schema.tyreCatalogue.suggestedPriceNew,
      slug: schema.tyreCatalogue.slug,
    })
    .from(schema.tyreCatalogue)
    .leftJoin(schema.tyreProducts, eq(schema.tyreProducts.catalogueId, schema.tyreCatalogue.id))
    .where(isNull(schema.tyreProducts.id));

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
    await db.insert(schema.tyreProducts).values(values);
    activatedCount += batch.length;
  }

  console.log('\n--- Seed from Excel complete ---');
  console.log(`  Sizes imported: ${importedCount}`);
  console.log(`  Products reset to pre-order: ${resetCount}`);
  console.log(`  Catalogue items auto-activated: ${activatedCount}`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.join(', ')}`);
  }
}

seedFromExcel()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
