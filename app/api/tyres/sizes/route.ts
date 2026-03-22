import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { sql, ilike, or, eq, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

    if (q.length < 2) {
      return NextResponse.json({ sizes: [] });
    }

    // Sanitise: only allow digits, slash, R, spaces
    const sanitised = q.replace(/[^0-9/rR\s]/g, '');
    if (!sanitised) return NextResponse.json({ sizes: [] });

    const availableCondition = eq(tyreProducts.availableNew, true);
    const looksLikeFullSize = /[/rR]/.test(sanitised);

    let results;

    if (looksLikeFullSize) {
      const pattern = `%${sanitised.replace(/\s+/g, '')}%`;
      results = await db
        .select({
          size: tyreProducts.sizeDisplay,
          count: sql<number>`coalesce(sum(${tyreProducts.stockNew}), 0)::int`,
        })
        .from(tyreProducts)
        .where(
          and(
            availableCondition,
            or(
              ilike(tyreProducts.sizeDisplay, pattern),
              ilike(tyreProducts.sizeDisplay, pattern.replace(/r/gi, 'R'))
            )
          )
        )
        .groupBy(tyreProducts.sizeDisplay)
        .orderBy(sql`sum(${tyreProducts.stockNew}) desc`)
        .limit(8);
    } else {
      const widthNum = parseInt(sanitised, 10);
      if (isNaN(widthNum)) return NextResponse.json({ sizes: [] });

      results = await db
        .select({
          size: tyreProducts.sizeDisplay,
          count: sql<number>`coalesce(sum(${tyreProducts.stockNew}), 0)::int`,
        })
        .from(tyreProducts)
        .where(and(availableCondition, eq(tyreProducts.width, widthNum)))
        .groupBy(tyreProducts.sizeDisplay)
        .orderBy(sql`sum(${tyreProducts.stockNew}) desc`)
        .limit(8);
    }

    return NextResponse.json({ sizes: results });
  } catch (error) {
    console.error('Error searching tyre sizes:', error);
    return NextResponse.json({ sizes: [] }, { status: 500 });
  }
}
