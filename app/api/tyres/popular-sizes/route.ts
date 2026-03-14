import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { sql, eq } from 'drizzle-orm';

export async function GET() {
  try {
    const results = await db
      .select({
        size: tyreProducts.sizeDisplay,
        count: sql<number>`count(*)::int`,
      })
      .from(tyreProducts)
      .where(eq(tyreProducts.availableNew, true))
      .groupBy(tyreProducts.sizeDisplay)
      .orderBy(sql`sum(${tyreProducts.stockNew}) desc`)
      .limit(8);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching popular sizes:', error);
    return NextResponse.json([], { status: 500 });
  }
}
