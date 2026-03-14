import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { sql, ilike, or, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

    if (q.length < 2) {
      return NextResponse.json([]);
    }

    // Sanitise: only allow digits, slash, R, spaces
    const sanitised = q.replace(/[^0-9/rR\s]/g, '');
    if (!sanitised) return NextResponse.json([]);

    const looksLikeFullSize = /[/rR]/.test(sanitised);

    let results;

    if (looksLikeFullSize) {
      // Partial or exact match on size_display  e.g. "205/55" or "205/55/R16"
      const pattern = `%${sanitised.replace(/\s+/g, '')}%`;
      results = await db
        .select({
          size: tyreProducts.sizeDisplay,
          count: sql<number>`count(*)::int`,
        })
        .from(tyreProducts)
        .where(
          or(
            ilike(tyreProducts.sizeDisplay, pattern),
            ilike(tyreProducts.sizeDisplay, pattern.replace(/r/gi, 'R'))
          )
        )
        .groupBy(tyreProducts.sizeDisplay)
        .orderBy(sql`sum(${tyreProducts.stockNew}) desc`)
        .limit(8);
    } else {
      // Just digits — treat as width prefix
      const widthNum = parseInt(sanitised, 10);
      if (isNaN(widthNum)) return NextResponse.json([]);

      results = await db
        .select({
          size: tyreProducts.sizeDisplay,
          count: sql<number>`count(*)::int`,
        })
        .from(tyreProducts)
        .where(eq(tyreProducts.width, widthNum))
        .groupBy(tyreProducts.sizeDisplay)
        .orderBy(sql`sum(${tyreProducts.stockNew}) desc`)
        .limit(8);
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error searching tyre sizes:', error);
    return NextResponse.json([], { status: 500 });
  }
}
