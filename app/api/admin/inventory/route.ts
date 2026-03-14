import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts } from '@/lib/db/schema';
import { eq, ilike, or, sql, desc } from 'drizzle-orm';

/**
 * GET /api/admin/inventory
 * Returns catalogue items with their activation status (whether a tyreProduct row exists)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = 25;
  const offset = (page - 1) * perPage;

  const where = search
    ? or(
        ilike(tyreCatalogue.brand, `%${search}%`),
        ilike(tyreCatalogue.pattern, `%${search}%`),
        ilike(tyreCatalogue.sizeDisplay, `%${search}%`)
      )
    : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select({
        catalogueId: tyreCatalogue.id,
        brand: tyreCatalogue.brand,
        pattern: tyreCatalogue.pattern,
        sizeDisplay: tyreCatalogue.sizeDisplay,
        season: tyreCatalogue.season,
        speedRating: tyreCatalogue.speedRating,
        loadIndex: tyreCatalogue.loadIndex,
        wetGrip: tyreCatalogue.wetGrip,
        fuelEfficiency: tyreCatalogue.fuelEfficiency,
        runFlat: tyreCatalogue.runFlat,
        slug: tyreCatalogue.slug,
        // Product fields (null if not activated)
        productId: tyreProducts.id,
        priceNew: tyreProducts.priceNew,
        stockNew: tyreProducts.stockNew,
        availableNew: tyreProducts.availableNew,
      })
      .from(tyreCatalogue)
      .leftJoin(tyreProducts, eq(tyreProducts.catalogueId, tyreCatalogue.id))
      .where(where)
      .orderBy(desc(tyreCatalogue.brand), tyreCatalogue.pattern)
      .limit(perPage)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(tyreCatalogue).where(where),
  ]);

  const totalCount = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalCount / perPage);

  return NextResponse.json({ items, page, totalPages, totalCount });
}

/**
 * POST /api/admin/inventory
 * Activate a catalogue item → create a tyreProducts row
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { catalogueId, priceNew, stockNew } = body;

  if (!catalogueId) {
    return NextResponse.json({ error: 'catalogueId required' }, { status: 400 });
  }

  // Check catalogue item exists
  const [cat] = await db
    .select()
    .from(tyreCatalogue)
    .where(eq(tyreCatalogue.id, catalogueId))
    .limit(1);

  if (!cat) {
    return NextResponse.json({ error: 'Catalogue item not found' }, { status: 404 });
  }

  // Check not already activated
  const [existing] = await db
    .select({ id: tyreProducts.id })
    .from(tyreProducts)
    .where(eq(tyreProducts.catalogueId, catalogueId))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: 'Already activated' }, { status: 409 });
  }

  await db.insert(tyreProducts).values({
    catalogueId,
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
    slug: cat.slug,
    priceNew: priceNew != null ? String(priceNew) : null,
    stockNew: stockNew ?? 0,
    availableNew: priceNew != null,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
