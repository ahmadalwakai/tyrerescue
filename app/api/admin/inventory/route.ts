import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts, bookingTyres } from '@/lib/db/schema';
import { eq, ilike, or, and, sql, desc } from 'drizzle-orm';

/**
 * GET /api/admin/inventory
 * Returns catalogue items with their activation status.
 * Supports filters: width, rim, tier, season, status (active/inactive), search
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const width = url.searchParams.get('width');
  const rim = url.searchParams.get('rim');
  const tier = url.searchParams.get('tier');
  const season = url.searchParams.get('season');
  const status = url.searchParams.get('status'); // 'active' | 'inactive'
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = 48;
  const offset = (page - 1) * perPage;

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(tyreCatalogue.brand, `%${search}%`),
        ilike(tyreCatalogue.pattern, `%${search}%`),
        ilike(tyreCatalogue.sizeDisplay, `%${search}%`)
      )
    );
  }
  if (width) {
    const w = parseInt(width, 10);
    if (!isNaN(w)) conditions.push(eq(tyreCatalogue.width, w));
  }
  if (rim) {
    const r = parseInt(rim, 10);
    if (!isNaN(r)) conditions.push(eq(tyreCatalogue.rim, r));
  }
  if (tier && tier !== 'all') {
    conditions.push(eq(tyreCatalogue.tier, tier));
  }
  if (season && season !== 'all') {
    conditions.push(eq(tyreCatalogue.season, season));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult, activeCountResult] = await Promise.all([
    db
      .select({
        catalogueId: tyreCatalogue.id,
        brand: tyreCatalogue.brand,
        pattern: tyreCatalogue.pattern,
        width: tyreCatalogue.width,
        rim: tyreCatalogue.rim,
        sizeDisplay: tyreCatalogue.sizeDisplay,
        season: tyreCatalogue.season,
        speedRating: tyreCatalogue.speedRating,
        loadIndex: tyreCatalogue.loadIndex,
        wetGrip: tyreCatalogue.wetGrip,
        fuelEfficiency: tyreCatalogue.fuelEfficiency,
        runFlat: tyreCatalogue.runFlat,
        tier: tyreCatalogue.tier,
        suggestedPriceNew: tyreCatalogue.suggestedPriceNew,
        slug: tyreCatalogue.slug,
        productId: tyreProducts.id,
        priceNew: tyreProducts.priceNew,
        stockNew: tyreProducts.stockNew,
        availableNew: tyreProducts.availableNew,
      })
      .from(tyreCatalogue)
      .leftJoin(tyreProducts, eq(tyreProducts.catalogueId, tyreCatalogue.id))
      .where(where)
      .orderBy(desc(tyreCatalogue.brand), tyreCatalogue.sizeDisplay)
      .limit(perPage)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(tyreCatalogue).where(where),
    db.select({ count: sql<number>`count(*)` })
      .from(tyreCatalogue)
      .innerJoin(tyreProducts, eq(tyreProducts.catalogueId, tyreCatalogue.id)),
  ]);

  // Post-filter by status (active/inactive) if specified
  let filtered = items;
  if (status === 'active') {
    filtered = items.filter((i) => i.productId !== null);
  } else if (status === 'inactive') {
    filtered = items.filter((i) => i.productId === null);
  }

  const totalCount = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalCount / perPage);
  const activeCount = Number(activeCountResult[0]?.count || 0);

  return NextResponse.json({ items: filtered, page, totalPages, totalCount, activeCount });
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
