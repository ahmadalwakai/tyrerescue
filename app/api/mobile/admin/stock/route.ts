import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts } from '@/lib/db/schema';
import { eq, ilike, or, and, sql, asc, desc } from 'drizzle-orm';
import { z } from 'zod';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { getDefaultPriceString } from '@/lib/inventory/default-price-map';
import { isValidSeason, normalizeSeason } from '@/lib/inventory/normalize-season';

function speedRatingFor(rim: number): string {
  if (rim <= 15) return 'H';
  if (rim <= 18) return 'V';
  return 'W';
}
function loadIndexFor(width: number, aspect: number): number {
  const vol = width * ((aspect || 80) / 100);
  if (vol < 80) return 82;
  if (vol < 95) return 86;
  if (vol < 110) return 91;
  if (vol < 125) return 94;
  if (vol < 140) return 97;
  return 100;
}
function makeSlug(...parts: (string | number)[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * GET /api/mobile/admin/stock
 * List tyre products with search, filters, pagination, stats.
 */
export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const width = url.searchParams.get('width');
  const rim = url.searchParams.get('rim');
  const available = url.searchParams.get('available');
  const sort = url.searchParams.get('sort') || 'size';
  const { page, perPage, offset } = parsePageParams(url, { page: 1, perPage: 50, maxPerPage: 100 });

  const conditions: ReturnType<typeof eq>[] = [];

  if (search) {
    conditions.push(
      or(
        ilike(tyreProducts.brand, `%${search}%`),
        ilike(tyreProducts.pattern, `%${search}%`),
        ilike(tyreProducts.sizeDisplay, `%${search}%`),
      )!,
    );
  }
  if (width) {
    const w = parseInt(width, 10);
    if (!isNaN(w)) conditions.push(eq(tyreProducts.width, w));
  }
  if (rim) {
    const r = parseInt(rim, 10);
    if (!isNaN(r)) conditions.push(eq(tyreProducts.rim, r));
  }
  if (available === 'true') conditions.push(eq(tyreProducts.availableNew, true));
  else if (available === 'false') conditions.push(eq(tyreProducts.availableNew, false));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const tierOrder = sql`COALESCE((SELECT CASE tier WHEN 'premium' THEN 1 WHEN 'mid' THEN 2 WHEN 'budget' THEN 3 ELSE 4 END FROM tyre_catalogue WHERE id = ${tyreProducts.catalogueId}), 4)`;
  const seasonOrder = sql`CASE ${tyreProducts.season} WHEN 'allseason' THEN 1 WHEN 'summer' THEN 2 WHEN 'winter' THEN 3 ELSE 4 END`;

  const orderMap = {
    size: [asc(tyreProducts.width), asc(tyreProducts.aspect), asc(tyreProducts.rim)],
    stock: [desc(tyreProducts.stockNew), asc(tyreProducts.sizeDisplay)],
    price: [asc(tyreProducts.priceNew), asc(tyreProducts.sizeDisplay)],
    type: [tierOrder, asc(tyreProducts.brand), asc(tyreProducts.sizeDisplay)],
    season_type: [seasonOrder, tierOrder, asc(tyreProducts.sizeDisplay)],
  } as const;
  const ordering = orderMap[sort as keyof typeof orderMap] ?? orderMap.size;

  const [rows, countResult, statsResult] = await Promise.all([
    db
      .select()
      .from(tyreProducts)
      .where(where)
      .orderBy(...ordering)
      .limit(perPage)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(tyreProducts).where(where),
    db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where available_new = true)`,
        inactive: sql<number>`count(*) filter (where available_new = false)`,
        totalStock: sql<number>`coalesce(sum(stock_new), 0)`,
      })
      .from(tyreProducts),
  ]);

  const totalCount = Number(countResult[0]?.count || 0);

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      catalogueId: r.catalogueId,
      brand: r.brand,
      pattern: r.pattern,
      width: r.width,
      aspect: r.aspect,
      rim: r.rim,
      sizeDisplay: r.sizeDisplay,
      season: normalizeSeason(r.season),
      priceNew: r.priceNew ? parseFloat(r.priceNew) : null,
      stockNew: r.stockNew ?? 0,
      stockOrdered: r.stockOrdered ?? 0,
      isLocalStock: r.isLocalStock ?? false,
      availableNew: r.availableNew ?? true,
      featured: r.featured ?? false,
      slug: r.slug,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    page,
    totalPages: Math.ceil(totalCount / perPage),
    totalCount,
    stats: {
      total: Number(statsResult[0]?.total || 0),
      active: Number(statsResult[0]?.active || 0),
      inactive: Number(statsResult[0]?.inactive || 0),
      totalStock: Number(statsResult[0]?.totalStock || 0),
    },
  });
}

const addSchema = z.object({
  sizeDisplay: z.string().min(3).max(20),
  width: z.number().int().min(100).max(400),
  aspect: z.number().int().min(0).max(100),
  rim: z.number().int().min(10).max(26),
  stockNew: z.number().int().min(0).default(0),
  priceNew: z.union([z.string(), z.number()]).nullable().optional(),
  isCommercial: z.boolean().default(false),
  brand: z.string().min(1).max(100).optional(),
  pattern: z.string().max(200).optional(),
  season: z.unknown().optional(),
});

/**
 * POST /api/mobile/admin/stock
 * Add a new tyre product.
 */
export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sizeDisplay, width, aspect, rim, stockNew, priceNew } = parsed.data;
  const brand = parsed.data.brand || 'Budget';
  const pattern = parsed.data.pattern || 'All-Season';

  if (parsed.data.season !== undefined && !isValidSeason(parsed.data.season)) {
    return NextResponse.json({ error: 'Invalid season. Use allseason, summer, or winter.' }, { status: 400 });
  }
  const season = normalizeSeason(parsed.data.season);

  const [existing] = await db
    .select({ id: tyreProducts.id })
    .from(tyreProducts)
    .where(and(ilike(tyreProducts.brand, brand), eq(tyreProducts.sizeDisplay, sizeDisplay)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: `${sizeDisplay} already exists in stock` }, { status: 409 });
  }

  const tier = brand.toLowerCase() === 'budget' ? 'budget' : 'mid';

  let [catRow] = await db
    .select()
    .from(tyreCatalogue)
    .where(
      and(
        ilike(tyreCatalogue.brand, brand),
        eq(tyreCatalogue.width, width),
        eq(tyreCatalogue.aspect, aspect),
        eq(tyreCatalogue.rim, rim),
        eq(tyreCatalogue.sizeDisplay, sizeDisplay),
      ),
    )
    .limit(1);

  if (!catRow) {
    const slug = makeSlug(brand, pattern, width, aspect, `r${rim}`, Date.now());
    const [inserted] = await db
      .insert(tyreCatalogue)
      .values({
        brand,
        pattern,
        width,
        aspect,
        rim,
        sizeDisplay,
        season,
        speedRating: speedRatingFor(rim),
        loadIndex: loadIndexFor(width, aspect),
        wetGrip: 'C',
        fuelEfficiency: 'C',
        noiseDb: 71,
        runFlat: false,
        tier,
        suggestedPriceNew: getDefaultPriceString(rim),
        slug,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) catRow = inserted;
  }

  const productSlug = makeSlug(brand, sizeDisplay, season, Date.now());
  const resolvedPrice =
    priceNew != null ? String(priceNew) : getDefaultPriceString(rim);

  const [product] = await db
    .insert(tyreProducts)
    .values({
      catalogueId: catRow?.id ?? null,
      brand,
      pattern,
      width,
      aspect,
      rim,
      sizeDisplay,
      season,
      speedRating: speedRatingFor(rim),
      loadIndex: loadIndexFor(width, aspect),
      wetGrip: 'C',
      fuelEfficiency: 'C',
      noiseDb: 71,
      runFlat: false,
      priceNew: resolvedPrice,
      stockNew,
      stockOrdered: 0,
      isLocalStock: false,
      availableNew: true,
      featured: false,
      slug: productSlug,
    })
    .returning({ id: tyreProducts.id, sizeDisplay: tyreProducts.sizeDisplay });

  return NextResponse.json({ success: true, id: product.id, sizeDisplay: product.sizeDisplay });
}
