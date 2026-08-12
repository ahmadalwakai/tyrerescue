import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, stockCities, stockShifts } from '@/lib/db';
import { getStockApiUser, stockCorsPreflight, stockJsonResponse, unauthorizedResponse } from '../../_lib';

export async function GET(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const [row] = await db
    .select({
      id: stockShifts.id,
      userId: stockShifts.userId,
      cityId: stockShifts.cityId,
      citySlug: stockCities.slug,
      cityName: stockCities.name,
      startedAt: stockShifts.startedAt,
      endedAt: stockShifts.endedAt,
      status: stockShifts.status,
    })
    .from(stockShifts)
    .innerJoin(stockCities, eq(stockShifts.cityId, stockCities.id))
    .where(
      and(
        eq(stockShifts.userId, user.id),
        eq(stockShifts.status, 'active'),
        isNull(stockShifts.endedAt),
      ),
    )
    .limit(1);

  return stockJsonResponse(request, {
    shift: row
      ? {
          id: row.id,
          userId: row.userId,
          cityId: row.cityId,
          citySlug: row.citySlug,
          cityName: row.cityName,
          startedAt: row.startedAt?.toISOString() ?? null,
          endedAt: row.endedAt?.toISOString() ?? null,
          status: row.status,
        }
      : null,
  });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
