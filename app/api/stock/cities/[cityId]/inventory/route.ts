import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, stockInventoryBalances, tyreProducts } from '@/lib/db';
import { isValidSeason, normalizeSeason } from '@/lib/inventory/normalize-season';
import { computeCityStockSnapshot } from '@/lib/stock/city-stock-domain';
import {
  getStockApiUser,
  getStockCityAccess,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../../../_lib';

const upsertInventorySettingsSchema = z.object({
  tyreProductId: z.string().uuid(),
  minStock: z.number().int().min(0).optional(),
  targetStock: z.number().int().min(0).optional(),
  orderedStock: z.number().int().min(0).optional(),
});

const updateInventoryProductSchema = z.object({
  tyreProductId: z.string().uuid(),
  season: z.unknown().optional(),
});

function parsePageParams(url: URL) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10));
  const rawPerPage = Number.parseInt(url.searchParams.get('perPage') || '50', 10);
  const perPage = Math.max(1, Math.min(100, Number.isFinite(rawPerPage) ? rawPerPage : 50));
  return { page, perPage, offset: (page - 1) * perPage };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cityId: string }> },
) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const { cityId } = await params;
  const access = await getStockCityAccess(user, cityId, ['viewer', 'operator', 'manager']);
  if (!access) return stockJsonResponse(request, { error: 'No access to this stock city' }, { status: 403 });

  const url = new URL(request.url);
  const search = url.searchParams.get('search')?.trim() || '';
  const season = url.searchParams.get('season')?.trim() || 'all';
  const sort = url.searchParams.get('sort')?.trim() || 'size';
  if (season !== 'all' && !isValidSeason(season)) {
    return stockJsonResponse(request, { error: 'Invalid season filter' }, { status: 400 });
  }
  const { page, perPage, offset } = parsePageParams(url);

  const searchFilter = search
    ? or(
        ilike(tyreProducts.brand, `%${search}%`),
        ilike(tyreProducts.pattern, `%${search}%`),
        ilike(tyreProducts.sizeDisplay, `%${search}%`),
      )
    : undefined;
  const where = and(
    eq(stockInventoryBalances.cityId, cityId),
    ...(searchFilter ? [searchFilter] : []),
    ...(season !== 'all' ? [eq(tyreProducts.season, normalizeSeason(season))] : []),
  );

  const seasonOrder = sql`CASE ${tyreProducts.season} WHEN 'summer' THEN 1 WHEN 'winter' THEN 2 WHEN 'allseason' THEN 3 ELSE 4 END`;
  const orderBy =
    sort === 'stock'
      ? [desc(stockInventoryBalances.currentStock), asc(tyreProducts.sizeDisplay), asc(tyreProducts.brand)]
      : sort === 'season'
        ? [seasonOrder, asc(tyreProducts.sizeDisplay), asc(tyreProducts.brand)]
        : sort === 'brand'
          ? [asc(tyreProducts.brand), asc(tyreProducts.pattern), asc(tyreProducts.sizeDisplay)]
          : [asc(tyreProducts.sizeDisplay), asc(tyreProducts.brand), asc(tyreProducts.pattern)];

  const rows = await db
    .select({
      balanceId: stockInventoryBalances.id,
      cityId: stockInventoryBalances.cityId,
      tyreProductId: stockInventoryBalances.tyreProductId,
      currentStock: stockInventoryBalances.currentStock,
      reservedStock: stockInventoryBalances.reservedStock,
      orderedStock: stockInventoryBalances.orderedStock,
      minStock: stockInventoryBalances.minStock,
      targetStock: stockInventoryBalances.targetStock,
      updatedAt: stockInventoryBalances.updatedAt,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      season: tyreProducts.season,
      priceNew: tyreProducts.priceNew,
      availableNew: tyreProducts.availableNew,
    })
    .from(stockInventoryBalances)
    .innerJoin(tyreProducts, eq(stockInventoryBalances.tyreProductId, tyreProducts.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(perPage)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockInventoryBalances)
    .innerJoin(tyreProducts, eq(stockInventoryBalances.tyreProductId, tyreProducts.id))
    .where(where);

  return stockJsonResponse(request, {
    city: access.city,
    page,
    totalPages: Math.ceil(Number(countResult?.count || 0) / perPage),
    totalCount: Number(countResult?.count || 0),
    items: rows.map((row) => {
      const snapshot = computeCityStockSnapshot(row);
      return {
        balanceId: row.balanceId,
        cityId: row.cityId,
        tyreProductId: row.tyreProductId,
        product: {
          brand: row.brand,
          pattern: row.pattern,
          sizeDisplay: row.sizeDisplay,
          season: row.season,
          priceNew: row.priceNew ? Number(row.priceNew) : null,
          availableNew: row.availableNew ?? false,
        },
        ...snapshot,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      };
    }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cityId: string }> },
) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const { cityId } = await params;
  const access = await getStockCityAccess(user, cityId, ['manager']);
  if (!access) return stockJsonResponse(request, { error: 'Manager access required for this stock city' }, { status: 403 });

  const body = await request.json();
  const parsed = upsertInventorySettingsSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  const [product] = await db
    .select({
      id: tyreProducts.id,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      season: tyreProducts.season,
      priceNew: tyreProducts.priceNew,
      availableNew: tyreProducts.availableNew,
    })
    .from(tyreProducts)
    .where(eq(tyreProducts.id, parsed.data.tyreProductId))
    .limit(1);

  if (!product) return stockJsonResponse(request, { error: 'Tyre product not found' }, { status: 404 });

  const [balance] = await db
    .insert(stockInventoryBalances)
    .values({
      cityId,
      tyreProductId: parsed.data.tyreProductId,
      minStock: parsed.data.minStock ?? 0,
      targetStock: parsed.data.targetStock ?? 0,
      orderedStock: parsed.data.orderedStock ?? 0,
    })
    .onConflictDoUpdate({
      target: [stockInventoryBalances.cityId, stockInventoryBalances.tyreProductId],
      set: {
        minStock: parsed.data.minStock ?? sql`${stockInventoryBalances.minStock}`,
        targetStock: parsed.data.targetStock ?? sql`${stockInventoryBalances.targetStock}`,
        orderedStock: parsed.data.orderedStock ?? sql`${stockInventoryBalances.orderedStock}`,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: stockInventoryBalances.id,
      cityId: stockInventoryBalances.cityId,
      tyreProductId: stockInventoryBalances.tyreProductId,
      currentStock: stockInventoryBalances.currentStock,
      reservedStock: stockInventoryBalances.reservedStock,
      orderedStock: stockInventoryBalances.orderedStock,
      minStock: stockInventoryBalances.minStock,
      targetStock: stockInventoryBalances.targetStock,
      updatedAt: stockInventoryBalances.updatedAt,
    });

  return stockJsonResponse(request, {
    city: access.city,
    item: {
      balanceId: balance.id,
      cityId: balance.cityId,
      tyreProductId: balance.tyreProductId,
      product: {
        brand: product.brand,
        pattern: product.pattern,
        sizeDisplay: product.sizeDisplay,
        season: product.season,
        priceNew: product.priceNew ? Number(product.priceNew) : null,
        availableNew: product.availableNew ?? false,
      },
      ...computeCityStockSnapshot(balance),
      updatedAt: balance.updatedAt?.toISOString() ?? null,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ cityId: string }> },
) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const { cityId } = await params;
  const access = await getStockCityAccess(user, cityId, ['manager']);
  if (!access) return stockJsonResponse(request, { error: 'Manager access required for this stock city' }, { status: 403 });

  const body = await request.json();
  const parsed = updateInventoryProductSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  if (parsed.data.season !== undefined && !isValidSeason(parsed.data.season)) {
    return stockJsonResponse(request, { error: 'Invalid season. Use allseason, summer, or winter.' }, { status: 400 });
  }

  const [balance] = await db
    .select({ id: stockInventoryBalances.id })
    .from(stockInventoryBalances)
    .where(and(
      eq(stockInventoryBalances.cityId, cityId),
      eq(stockInventoryBalances.tyreProductId, parsed.data.tyreProductId),
    ))
    .limit(1);
  if (!balance) return stockJsonResponse(request, { error: 'Tyre product is not in this city stock' }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.season !== undefined) updates.season = normalizeSeason(parsed.data.season);

  const [product] = await db
    .update(tyreProducts)
    .set(updates)
    .where(eq(tyreProducts.id, parsed.data.tyreProductId))
    .returning({
      id: tyreProducts.id,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      season: tyreProducts.season,
      priceNew: tyreProducts.priceNew,
      availableNew: tyreProducts.availableNew,
    });

  if (!product) return stockJsonResponse(request, { error: 'Tyre product not found' }, { status: 404 });

  return stockJsonResponse(request, {
    city: access.city,
    product: {
      id: product.id,
      brand: product.brand,
      pattern: product.pattern,
      sizeDisplay: product.sizeDisplay,
      season: product.season,
      priceNew: product.priceNew ? Number(product.priceNew) : null,
      availableNew: product.availableNew ?? false,
    },
  });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
