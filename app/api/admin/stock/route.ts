import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts } from '@/lib/db/schema';
import { eq, ilike, or, and, sql, asc, desc } from 'drizzle-orm';
import { z } from 'zod';
import { getDefaultPriceString } from '@/lib/inventory/default-price-map';
import { isValidSeason, normalizeSeason } from '@/lib/inventory/normalize-season';

/* ─── Helpers ──────────────────────────────────────────── */

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
 * GET /api/admin/stock
 * Returns Budget-brand tyre_products rows.
 * Supports: search, width, rim, sort, available filter, pagination.
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
  const available = url.searchParams.get('available'); // 'true' | 'false'
  const sort = url.searchParams.get('sort') || 'size'; // 'size' | 'stock' | 'price'
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = 50;
  const offset = (page - 1) * perPage;

  const conditions: ReturnType<typeof eq>[] = [];

  if (search) {
    conditions.push(
      or(
        ilike(tyreProducts.brand, `%${search}%`),
        ilike(tyreProducts.pattern, `%${search}%`),
        ilike(tyreProducts.sizeDisplay, `%${search}%`)
      )!
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
  if (available === 'true') {
    conditions.push(eq(tyreProducts.availableNew, true));
  } else if (available === 'false') {
    conditions.push(eq(tyreProducts.availableNew, false));
  }

  const where = and(...conditions);

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

  const budgetScope = sql`1=1`; // all brands

  const [rows, countResult, statsResult] = await Promise.all([
    db
      .select()
      .from(tyreProducts)
      .where(where)
      .orderBy(...ordering)
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(tyreProducts)
      .where(where),
    db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where available_new = true)`,
        inactive: sql<number>`count(*) filter (where available_new = false)`,
        totalStock: sql<number>`coalesce(sum(stock_new), 0)`,
      })
      .from(tyreProducts)
      .where(budgetScope),
  ]);

  const totalCount = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalCount / perPage);

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
    totalPages,
    totalCount,
    stats: {
      total: Number(statsResult[0]?.total || 0),
      active: Number(statsResult[0]?.active || 0),
      inactive: Number(statsResult[0]?.inactive || 0),
      totalStock: Number(statsResult[0]?.totalStock || 0),
    },
  });
}

/* ─── POST /api/admin/stock — Manual add ───────────────── */

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

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  // Check for duplicate — same sizeDisplay + same brand
  const [existing] = await db
    .select({ id: tyreProducts.id })
    .from(tyreProducts)
    .where(
      and(
        ilike(tyreProducts.brand, brand),
        eq(tyreProducts.sizeDisplay, sizeDisplay),
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: `Size ${sizeDisplay} already exists in stock` },
      { status: 409 },
    );
  }

  const tier = brand.toLowerCase() === 'budget' ? 'budget' : 'mid';

  // Find or create catalogue entry
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
      )
    )
    .limit(1);

  if (!catRow) {
    const slug = makeSlug(brand, pattern, width, aspect, `r${rim}`, Date.now());
    const [inserted] = await db.insert(tyreCatalogue).values({
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
    }).onConflictDoNothing().returning();

    if (inserted) catRow = inserted;
  }

  if (!catRow) {
    return NextResponse.json({ error: 'Failed to resolve catalogue entry' }, { status: 500 });
  }

  const price = priceNew != null ? String(priceNew) : getDefaultPriceString(rim);
  const prodSlug = makeSlug(brand, pattern, width, aspect, `r${rim}`, Date.now());

  const [product] = await db.insert(tyreProducts).values({
    catalogueId: catRow.id,
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
    priceNew: price,
    stockNew,
    stockOrdered: 0,
    isLocalStock: true,
    availableNew: true,
    featured: false,
    slug: prodSlug,
  }).returning();

  return NextResponse.json({ success: true, product }, { status: 201 });
}
