import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { sql, eq, and } from 'drizzle-orm';

function normalizeTyreSizeSearchKey(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/[^0-9RC]/g, '');
  const standardDigits = cleaned.match(/^(\d{3})(\d{2,3})(\d{2})(C?)$/);
  if (standardDigits) {
    return `${standardDigits[1]}${standardDigits[2]}R${standardDigits[3]}${standardDigits[4]}`;
  }

  const compactDigits = cleaned.match(/^(\d{3})(\d{2})(C?)$/);
  if (compactDigits) {
    const rim = Number(compactDigits[2]);
    if (rim >= 10 && rim <= 26) {
      return `${compactDigits[1]}R${compactDigits[2]}${compactDigits[3]}`;
    }
  }

  return cleaned;
}

function isTyreSizeLikeSearch(key: string): boolean {
  return key.includes('R') || /^\d{3}\d{2,3}\d{2}C?$/.test(key) || /^\d{5,6}$/.test(key);
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

    if (q.length < 2) {
      return NextResponse.json({ sizes: [] });
    }

    const searchKey = normalizeTyreSizeSearchKey(q);
    if (!searchKey) return NextResponse.json({ sizes: [] });

    const availableCondition = eq(tyreProducts.availableNew, true);
    const sizeKeyExpr = sql<string>`regexp_replace(upper(${tyreProducts.sizeDisplay}), '[^0-9RC]', '', 'g')`;

    let results;

    if (isTyreSizeLikeSearch(searchKey)) {
      const pattern = `%${searchKey}%`;
      results = await db
        .select({
          size: tyreProducts.sizeDisplay,
          count: sql<number>`coalesce(sum(${tyreProducts.stockNew}), 0)::int`,
        })
        .from(tyreProducts)
        .where(
          and(
            availableCondition,
            sql`${sizeKeyExpr} LIKE ${pattern}`,
          ),
        )
        .groupBy(tyreProducts.sizeDisplay)
        .orderBy(sql`sum(${tyreProducts.stockNew}) desc`)
        .limit(8);
    } else {
      const widthNum = parseInt(searchKey, 10);
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
