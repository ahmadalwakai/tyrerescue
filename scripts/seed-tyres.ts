import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql as sql_fn } from 'drizzle-orm';
import * as schema from '../lib/db/schema';
import { v4 as uuidv4 } from 'uuid';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// ---------- tyre sizes ----------
const sizeMap: Record<number, Record<number, number[]>> = {
  155: { 65: [13, 14], 70: [13] },
  165: { 60: [14], 65: [13, 14, 15], 70: [13, 14] },
  175: { 55: [15], 60: [14, 15], 65: [14, 15], 70: [13, 14] },
  185: { 55: [14, 15, 16], 60: [14, 15], 65: [14, 15], 70: [14] },
  195: { 45: [16], 50: [15, 16], 55: [15, 16], 60: [15, 16], 65: [15], 70: [14] },
  205: { 40: [17], 45: [16, 17], 50: [16, 17], 55: [16, 17], 60: [15, 16], 65: [15] },
  215: { 35: [18], 40: [17, 18], 45: [16, 17], 50: [17], 55: [16, 17, 18], 60: [16], 65: [16] },
  225: { 35: [18, 19], 40: [18, 19], 45: [17, 18, 19], 50: [17, 18], 55: [16, 17, 18], 60: [17] },
  235: { 35: [19, 20], 40: [18, 19], 45: [17, 18, 19], 50: [18, 19], 55: [17, 18, 19], 60: [18] },
  245: { 30: [20, 21], 35: [18, 19, 20, 21], 40: [17, 18, 19, 20], 45: [17, 18, 19, 20], 50: [18, 19, 20] },
  255: { 30: [19, 20, 21], 35: [18, 19, 20], 40: [17, 18, 19], 45: [18, 19, 20], 50: [19, 20], 55: [18, 19] },
  265: { 30: [19, 20, 21], 35: [18, 19, 20, 21], 40: [18, 19, 20, 21], 45: [20, 21], 50: [19, 20] },
  275: { 30: [19, 20, 21], 35: [19, 20, 21], 40: [18, 19, 20, 21], 45: [19, 20, 21] },
  285: { 30: [19, 20, 21], 35: [19, 20, 21], 40: [19, 20, 21], 45: [19, 20, 21] },
};

const VALID_SIZES: [number, number, number][] = [];
for (const [w, aspectMap] of Object.entries(sizeMap)) {
  for (const [a, rimList] of Object.entries(aspectMap)) {
    for (const r of rimList) {
      VALID_SIZES.push([Number(w), Number(a), r]);
    }
  }
}
console.log(`Total valid size combinations: ${VALID_SIZES.length}`);

// ---------- brand pools ----------
interface BrandDef { brand: string; pattern: string }

const budgetBrands: BrandDef[] = [
  { brand: 'Hankook', pattern: 'Kinergy Eco2' },
  { brand: 'Kumho', pattern: 'Ecsta HS52' },
  { brand: 'Nankang', pattern: 'AS-1' },
  { brand: 'Falken', pattern: 'ZE914' },
];

const midBrands: BrandDef[] = [
  { brand: 'Pirelli', pattern: 'Cinturato P7' },
  { brand: 'Goodyear', pattern: 'EfficientGrip Performance 2' },
  { brand: 'Bridgestone', pattern: 'Turanza T005' },
  { brand: 'Firestone', pattern: 'Roadhawk 2' },
];

const premiumBrands: BrandDef[] = [
  { brand: 'Michelin', pattern: 'Primacy 4+' },
  { brand: 'Continental', pattern: 'PremiumContact 7' },
  { brand: 'Dunlop', pattern: 'Sport Maxx RT2' },
  { brand: 'Yokohama', pattern: 'Advan Sport V107' },
];

// ---------- helpers ----------
function speedRating(rim: number): string {
  if (rim <= 15) return 'H';
  if (rim <= 18) return 'V';
  return 'W';
}

function loadIndex(width: number, aspect: number): number {
  const volume = width * (aspect / 100);
  if (volume < 80) return 82;
  if (volume < 95) return 86;
  if (volume < 110) return 91;
  if (volume < 125) return 94;
  if (volume < 140) return 97;
  return 100;
}

function makeSlug(brand: string, pattern: string, width: number, aspect: number, rim: number): string {
  return `${brand}-${pattern}-${width}-${aspect}-r${rim}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function pickBrand(pool: BrandDef[], index: number): BrandDef {
  return pool[index % pool.length];
}

function suggestedPrice(rim: number, tier: 'budget' | 'mid' | 'premium'): string {
  const prices: Record<string, Record<string, number>> = {
    budget:  { '13': 48, '14': 48, '15': 58, '16': 58, '17': 72, '18': 72, '19': 92, '20': 92, '21': 115 },
    mid:     { '13': 72, '14': 72, '15': 85, '16': 85, '17': 105, '18': 105, '19': 135, '20': 135, '21': 160 },
    premium: { '13': 95, '14': 95, '15': 115, '16': 115, '17': 145, '18': 145, '19': 175, '20': 175, '21': 210 },
  };
  return String(prices[tier][String(rim)] ?? 85);
}

// ---------- main ----------
async function seedCatalogue() {
  console.log('Seeding tyre catalogue...');

  let insertedCount = 0;
  let skippedCount = 0;

  const tiers: { key: 'budget' | 'mid' | 'premium'; pool: BrandDef[]; wetGrip: string; fuelEff: string }[] = [
    { key: 'budget',  pool: budgetBrands,  wetGrip: 'B', fuelEff: 'C' },
    { key: 'mid',     pool: midBrands,     wetGrip: 'A', fuelEff: 'B' },
    { key: 'premium', pool: premiumBrands, wetGrip: 'A', fuelEff: 'A' },
  ];

  const BATCH_SIZE = 50;
  let batch: (typeof schema.tyreCatalogue.$inferInsert)[] = [];

  for (let sIdx = 0; sIdx < VALID_SIZES.length; sIdx++) {
    const [w, a, r] = VALID_SIZES[sIdx];

    for (const tier of tiers) {
      const b = pickBrand(tier.pool, sIdx);

      batch.push({
        id: uuidv4(),
        brand: b.brand,
        pattern: b.pattern,
        width: w,
        aspect: a,
        rim: r,
        sizeDisplay: `${w}/${a}/R${r}`,
        season: 'allseason',
        speedRating: speedRating(r),
        loadIndex: loadIndex(w, a),
        wetGrip: tier.wetGrip,
        fuelEfficiency: tier.fuelEff,
        noiseDb: 70,
        runFlat: false,
        tier: tier.key,
        suggestedPriceNew: suggestedPrice(r, tier.key),
        slug: makeSlug(b.brand, b.pattern, w, a, r),
      });

      if (batch.length >= BATCH_SIZE) {
        const result = await db
          .insert(schema.tyreCatalogue)
          .values(batch)
          .onConflictDoUpdate({
            target: schema.tyreCatalogue.slug,
            set: {
              tier: sql_fn`excluded.tier`,
              suggestedPriceNew: sql_fn`excluded.suggested_price_new`,
            },
          });
        insertedCount += result.rowCount ?? 0;
        skippedCount += batch.length - (result.rowCount ?? 0);
        batch = [];
      }
    }
  }

  // Insert remaining
  if (batch.length > 0) {
    const result = await db
      .insert(schema.tyreCatalogue)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.tyreCatalogue.slug,
        set: {
          tier: sql_fn`excluded.tier`,
          suggestedPriceNew: sql_fn`excluded.suggested_price_new`,
        },
      });
    insertedCount += result.rowCount ?? 0;
    skippedCount += batch.length - (result.rowCount ?? 0);
  }

  console.log(`\nSeed complete!`);
  console.log(`  Inserted: ${insertedCount}`);
  console.log(`  Skipped (already exist): ${skippedCount}`);
  console.log(`  Total catalogue entries: ${insertedCount + skippedCount}`);
}

seedCatalogue()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
