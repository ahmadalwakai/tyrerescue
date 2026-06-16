import { NextResponse } from 'next/server';
import { validateB2BApiKey } from '@/lib/b2b/auth';
import { db } from '@/lib/db';
import { tyreProducts, inventoryReservations } from '@/lib/db/schema';
import { eq, and, gt, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().max(100).optional(),
  width: z.coerce.number().int().optional(),
  rim: z.coerce.number().int().optional(),
  season: z.enum(['allseason', 'summer', 'winter']).optional(),
});

export async function GET(request: Request) {
  const auth = await validateB2BApiKey(request, 'stock:read');
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: { code: auth.code, message: auth.message } },
      { status: auth.status },
    );
  }

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parseResult.success) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_params', message: 'Invalid query parameters' } },
      { status: 400 },
    );
  }

  const { page, perPage, search, width, rim, season } = parseResult.data;
  const offset = (page - 1) * perPage;
  const includePrice = auth.scopes.includes('stock:prices:read');

  try {
    // Conditions: only available, active products
    const conditions = [eq(tyreProducts.availableNew, true)];

    if (search) {
      conditions.push(
        or(
          ilike(tyreProducts.brand, `%${search}%`),
          ilike(tyreProducts.pattern, `%${search}%`),
          ilike(tyreProducts.sizeDisplay, `%${search}%`),
        )!,
      );
    }
    if (width) conditions.push(eq(tyreProducts.width, width));
    if (rim) conditions.push(eq(tyreProducts.rim, rim));
    if (season) conditions.push(eq(tyreProducts.season, season));

    // Fetch products
    const products = await db
      .select({
        id: tyreProducts.id,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
        width: tyreProducts.width,
        aspect: tyreProducts.aspect,
        rim: tyreProducts.rim,
        season: tyreProducts.season,
        speedRating: tyreProducts.speedRating,
        loadIndex: tyreProducts.loadIndex,
        runFlat: tyreProducts.runFlat,
        isLocalStock: tyreProducts.isLocalStock,
        stockNew: tyreProducts.stockNew,
        priceNew: includePrice ? tyreProducts.priceNew : sql<null>`NULL`,
        updatedAt: tyreProducts.updatedAt,
      })
      .from(tyreProducts)
      .where(and(...conditions))
      .orderBy(tyreProducts.sizeDisplay)
      .limit(perPage)
      .offset(offset);

    // Compute available stock (physical - active reservations)
    const now = new Date();
    const productIds = products.map((p) => p.id);

    let reservedMap: Map<string, number> = new Map();
    if (productIds.length > 0) {
      const reservations = await db
        .select({
          tyreId: inventoryReservations.tyreId,
          total: sql<number>`SUM(${inventoryReservations.quantity})::int`,
        })
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.released, false),
            gt(inventoryReservations.expiresAt, now),
          ),
        )
        .groupBy(inventoryReservations.tyreId);

      for (const r of reservations) {
        if (r.tyreId) reservedMap.set(r.tyreId, r.total);
      }
    }

    // Count total
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(tyreProducts)
      .where(and(...conditions));

    const items = products.map((p) => {
      const reserved = reservedMap.get(p.id) ?? 0;
      const availableQty = Math.max(0, (p.stockNew ?? 0) - reserved);

      return {
        id: p.id,
        brand: p.brand,
        pattern: p.pattern,
        sizeDisplay: p.sizeDisplay,
        width: p.width,
        aspect: p.aspect,
        rim: p.rim,
        season: p.season,
        speedRating: p.speedRating,
        loadIndex: p.loadIndex,
        runFlat: p.runFlat,
        isLocalStock: p.isLocalStock,
        availableQty,
        ...(includePrice ? { priceNew: p.priceNew } : {}),
        updatedAt: p.updatedAt,
      };
    });

    return NextResponse.json({
      ok: true,
      data: items,
      page,
      perPage,
      totalCount: total,
      totalPages: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error('[GET /api/b2b/stock]', err);
    return NextResponse.json(
      { ok: false, error: { code: 'internal_error', message: 'Internal server error.' } },
      { status: 500 },
    );
  }
}
