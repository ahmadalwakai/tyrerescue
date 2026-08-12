import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db, stockMovements, tyreProducts, users } from '@/lib/db';
import {
  getStockApiUser,
  getStockCityAccess,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
} from '../../../_lib';

const movementTypes = new Set([
  'RECEIVED',
  'SALE',
  'SALE_REVERSAL',
  'RETURN',
  'DAMAGED',
  'CORRECTION',
]);

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
  const { page, perPage, offset } = parsePageParams(url);
  const search = url.searchParams.get('search')?.trim() || '';
  const movementType = url.searchParams.get('movementType')?.trim() || '';
  if (movementType && !movementTypes.has(movementType)) {
    return stockJsonResponse(request, { error: 'Invalid movementType filter' }, { status: 400 });
  }

  const searchFilter = search
    ? or(
        ilike(tyreProducts.brand, `%${search}%`),
        ilike(tyreProducts.pattern, `%${search}%`),
        ilike(tyreProducts.sizeDisplay, `%${search}%`),
      )
    : undefined;
  const movementTypeFilter = movementType ? eq(stockMovements.movementType, movementType as never) : undefined;
  const where = and(
    eq(stockMovements.cityId, cityId),
    ...(searchFilter ? [searchFilter] : []),
    ...(movementTypeFilter ? [movementTypeFilter] : []),
  );

  const rows = await db
    .select({
      id: stockMovements.id,
      cityId: stockMovements.cityId,
      tyreProductId: stockMovements.tyreProductId,
      movementType: stockMovements.movementType,
      quantityDelta: stockMovements.quantityDelta,
      previousBalance: stockMovements.previousBalance,
      resultingBalance: stockMovements.resultingBalance,
      actorUserId: stockMovements.actorUserId,
      actorName: users.name,
      shiftId: stockMovements.shiftId,
      bookingId: stockMovements.bookingId,
      saleChannel: stockMovements.saleChannel,
      reversesMovementId: stockMovements.reversesMovementId,
      reason: stockMovements.reason,
      note: stockMovements.note,
      occurredAt: stockMovements.occurredAt,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
    })
    .from(stockMovements)
    .innerJoin(tyreProducts, eq(stockMovements.tyreProductId, tyreProducts.id))
    .leftJoin(users, eq(stockMovements.actorUserId, users.id))
    .where(where)
    .orderBy(desc(stockMovements.occurredAt), desc(stockMovements.id))
    .limit(perPage)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockMovements)
    .innerJoin(tyreProducts, eq(stockMovements.tyreProductId, tyreProducts.id))
    .where(where);

  return stockJsonResponse(request, {
    city: access.city,
    page,
    totalPages: Math.ceil(Number(countResult?.count || 0) / perPage),
    totalCount: Number(countResult?.count || 0),
    items: rows.map((row) => ({
      id: row.id,
      cityId: row.cityId,
      tyreProductId: row.tyreProductId,
      product: {
        brand: row.brand,
        pattern: row.pattern,
        sizeDisplay: row.sizeDisplay,
      },
      movementType: row.movementType,
      quantityDelta: row.quantityDelta,
      previousBalance: row.previousBalance,
      resultingBalance: row.resultingBalance,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
      shiftId: row.shiftId,
      bookingId: row.bookingId,
      saleChannel: row.saleChannel,
      reversesMovementId: row.reversesMovementId,
      reason: row.reason,
      note: row.note,
      occurredAt: row.occurredAt?.toISOString() ?? null,
    })),
  });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
