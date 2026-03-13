import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq, and, or, gte, lte, ilike, sql, desc, asc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const width = searchParams.get('width');
    const aspect = searchParams.get('aspect');
    const rim = searchParams.get('rim');
    const brand = searchParams.get('brand');
    const season = searchParams.get('season');
    const condition = searchParams.get('condition'); // new, used, both
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '12', 10);
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];

    // Size filters
    if (width) {
      const widthNum = parseInt(width, 10);
      if (!isNaN(widthNum)) {
        conditions.push(eq(tyreProducts.width, widthNum));
      }
    }
    if (aspect) {
      const aspectNum = parseInt(aspect, 10);
      if (!isNaN(aspectNum)) {
        conditions.push(eq(tyreProducts.aspect, aspectNum));
      }
    }
    if (rim) {
      const rimNum = parseInt(rim, 10);
      if (!isNaN(rimNum)) {
        conditions.push(eq(tyreProducts.rim, rimNum));
      }
    }

    // Brand filter
    if (brand && brand !== 'all') {
      conditions.push(ilike(tyreProducts.brand, brand));
    }

    // Season filter
    if (season && season !== 'all') {
      conditions.push(eq(tyreProducts.season, season));
    }

    // Condition filter - affects availability check
    if (condition === 'new') {
      conditions.push(eq(tyreProducts.availableNew, true));
    } else if (condition === 'used') {
      conditions.push(eq(tyreProducts.availableUsed, true));
    } else {
      // Both or unspecified - at least one must be available
      conditions.push(
        or(
          eq(tyreProducts.availableNew, true),
          eq(tyreProducts.availableUsed, true)
        )
      );
    }

    // Price range filter (applies to both new and used)
    if (minPrice) {
      const minPriceNum = parseFloat(minPrice);
      if (!isNaN(minPriceNum)) {
        conditions.push(
          or(
            gte(tyreProducts.priceNew, minPriceNum.toString()),
            gte(tyreProducts.priceUsed, minPriceNum.toString())
          )
        );
      }
    }
    if (maxPrice) {
      const maxPriceNum = parseFloat(maxPrice);
      if (!isNaN(maxPriceNum)) {
        conditions.push(
          or(
            lte(tyreProducts.priceNew, maxPriceNum.toString()),
            lte(tyreProducts.priceUsed, maxPriceNum.toString())
          )
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tyreProducts)
      .where(whereClause);

    const totalCount = Number(countResult?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch tyres with pagination
    const tyres = await db
      .select({
        id: tyreProducts.id,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        width: tyreProducts.width,
        aspect: tyreProducts.aspect,
        rim: tyreProducts.rim,
        sizeDisplay: tyreProducts.sizeDisplay,
        season: tyreProducts.season,
        speedRating: tyreProducts.speedRating,
        loadIndex: tyreProducts.loadIndex,
        wetGrip: tyreProducts.wetGrip,
        fuelEfficiency: tyreProducts.fuelEfficiency,
        noiseDb: tyreProducts.noiseDb,
        runFlat: tyreProducts.runFlat,
        priceNew: tyreProducts.priceNew,
        priceUsed: tyreProducts.priceUsed,
        stockNew: tyreProducts.stockNew,
        stockUsed: tyreProducts.stockUsed,
        availableNew: tyreProducts.availableNew,
        availableUsed: tyreProducts.availableUsed,
        featured: tyreProducts.featured,
        slug: tyreProducts.slug,
      })
      .from(tyreProducts)
      .where(whereClause)
      .orderBy(desc(tyreProducts.featured), asc(tyreProducts.brand), asc(tyreProducts.pattern))
      .limit(limit)
      .offset(offset);

    // Convert decimal prices to numbers
    const tyresWithPrices = tyres.map((tyre) => ({
      ...tyre,
      priceNew: tyre.priceNew ? parseFloat(tyre.priceNew) : null,
      priceUsed: tyre.priceUsed ? parseFloat(tyre.priceUsed) : null,
    }));

    // Get distinct brands for filter dropdown
    const brands = await db
      .selectDistinct({ brand: tyreProducts.brand })
      .from(tyreProducts)
      .orderBy(asc(tyreProducts.brand));

    return NextResponse.json({
      tyres: tyresWithPrices,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
      filters: {
        brands: brands.map((b) => b.brand),
      },
    });
  } catch (error) {
    console.error('Error fetching tyres:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tyres' },
      { status: 500 }
    );
  }
}
