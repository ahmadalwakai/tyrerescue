import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db, tyreCatalogue, tyreProducts } from '@/lib/db';
import { isValidSeason, normalizeSeason } from '@/lib/inventory/normalize-season';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const width = url.searchParams.get('width');
  const rim = url.searchParams.get('rim');
  const tier = url.searchParams.get('tier');
  const season = url.searchParams.get('season');
  const status = url.searchParams.get('status');
  const { page, perPage, offset } = parsePageParams(url, { page: 1, perPage: 48, maxPerPage: 100 });

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(tyreCatalogue.brand, `%${search}%`),
        ilike(tyreCatalogue.pattern, `%${search}%`),
        ilike(tyreCatalogue.sizeDisplay, `%${search}%`),
      ),
    );
  }

  if (width) {
    const parsed = Number.parseInt(width, 10);
    if (Number.isFinite(parsed)) conditions.push(eq(tyreCatalogue.width, parsed));
  }

  if (rim) {
    const parsed = Number.parseInt(rim, 10);
    if (Number.isFinite(parsed)) conditions.push(eq(tyreCatalogue.rim, parsed));
  }

  if (tier && tier !== 'all') {
    conditions.push(eq(tyreCatalogue.tier, tier));
  }

  if (season && season !== 'all') {
    if (!isValidSeason(season)) {
      return NextResponse.json({ error: 'Invalid season filter' }, { status: 400 });
    }
    conditions.push(eq(tyreCatalogue.season, normalizeSeason(season)));
  }

  if (status === 'active') conditions.push(sql`${tyreProducts.id} IS NOT NULL`);
  if (status === 'inactive') conditions.push(sql`${tyreProducts.id} IS NULL`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countRows, activeRows] = await Promise.all([
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
        stockOrdered: tyreProducts.stockOrdered,
        isLocalStock: tyreProducts.isLocalStock,
        availableNew: tyreProducts.availableNew,
      })
      .from(tyreCatalogue)
      .leftJoin(tyreProducts, eq(tyreProducts.catalogueId, tyreCatalogue.id))
      .where(whereClause)
      .orderBy(desc(tyreCatalogue.brand), tyreCatalogue.sizeDisplay)
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tyreCatalogue)
      .leftJoin(tyreProducts, eq(tyreProducts.catalogueId, tyreCatalogue.id))
      .where(whereClause),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tyreCatalogue)
      .innerJoin(tyreProducts, eq(tyreProducts.catalogueId, tyreCatalogue.id)),
  ]);

  const totalCount = Number(countRows[0]?.count || 0);

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      suggestedPriceNew: item.suggestedPriceNew?.toString() ?? null,
      priceNew: item.priceNew?.toString() ?? null,
    })),
    page,
    perPage,
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
    activeCount: Number(activeRows[0]?.count || 0),
  });
}

export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const catalogueId = String(body?.catalogueId || '');

  if (!catalogueId) {
    return NextResponse.json({ error: 'catalogueId is required' }, { status: 400 });
  }

  const [catalogueRow] = await db
    .select()
    .from(tyreCatalogue)
    .where(eq(tyreCatalogue.id, catalogueId))
    .limit(1);

  if (!catalogueRow) {
    return NextResponse.json({ error: 'Catalogue row not found' }, { status: 404 });
  }

  const [existing] = await db
    .select({ id: tyreProducts.id })
    .from(tyreProducts)
    .where(eq(tyreProducts.catalogueId, catalogueId))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: 'Catalogue item is already active' }, { status: 409 });
  }

  await db.insert(tyreProducts).values({
    catalogueId,
    brand: catalogueRow.brand,
    pattern: catalogueRow.pattern,
    width: catalogueRow.width,
    aspect: catalogueRow.aspect,
    rim: catalogueRow.rim,
    sizeDisplay: catalogueRow.sizeDisplay,
    season: catalogueRow.season,
    speedRating: catalogueRow.speedRating,
    loadIndex: catalogueRow.loadIndex,
    wetGrip: catalogueRow.wetGrip,
    fuelEfficiency: catalogueRow.fuelEfficiency,
    runFlat: catalogueRow.runFlat ?? false,
    slug: catalogueRow.slug,
    priceNew: body?.priceNew != null ? String(body.priceNew) : null,
    stockNew: body?.stockNew ?? 0,
    stockOrdered: body?.stockOrdered ?? 0,
    isLocalStock: body?.isLocalStock ?? true,
    availableNew: body?.priceNew != null,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
