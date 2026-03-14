import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql as sqlFn } from 'drizzle-orm';
import * as schema from '../lib/db/schema';
import { cities } from '../lib/cities';

const sqlConn = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlConn, { schema });

function getRadius(distanceMilesFromGlasgow: number): string {
  if (distanceMilesFromGlasgow <= 20) return '15';
  if (distanceMilesFromGlasgow <= 50) return '20';
  return '25';
}

async function seedServiceAreas() {
  const existing = await db
    .select({ count: sqlFn<number>`count(*)::int` })
    .from(schema.serviceAreas);

  if (existing[0].count > 0) {
    console.log(`Service areas already seeded (${existing[0].count} rows). Skipping.`);
    return;
  }

  console.log('Seeding service areas...');
  let inserted = 0;

  for (const city of cities) {
    const result = await db
      .insert(schema.serviceAreas)
      .values({
        name: city.name,
        centerLat: String(city.lat),
        centerLng: String(city.lng),
        radiusMiles: getRadius(city.distanceMilesFromGlasgow),
        active: true,
      })
      .onConflictDoNothing();
    inserted += result.rowCount ?? 0;
  }

  console.log(`Seed complete! Inserted ${inserted} service areas.`);
}

seedServiceAreas().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
