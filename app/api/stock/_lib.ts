import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { authMobile } from '@/lib/auth';
import { expoDevCorsPreflight, jsonWithExpoDevCors, withExpoDevCors } from '@/lib/api/dev-cors';
import { db, stockCities, stockUserCityAccess } from '@/lib/db';
import type { CityStockErrorCode } from '@/lib/stock/city-stock-service';

export type StockApiRole = 'driver' | 'admin';
export const SHARED_STOCK_ADMIN_EMAIL = 'ahmad33wakaa@gmail.com';

export interface StockApiUser {
  id: string;
  email: string;
  name: string;
  role: StockApiRole;
}

export type StockCityAccessRole = 'viewer' | 'operator' | 'manager';

export interface StockCityAccess {
  city: {
    id: string;
    slug: string;
    name: string;
  };
  roleInCity: StockCityAccessRole;
}

export async function getStockApiUser(request: Request): Promise<StockApiUser | null> {
  const session = await authMobile(request);
  const user = session?.user;
  if (!user) return null;
  if (user.role !== 'driver' && user.role !== 'admin') return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export function canUseSharedStockWorkerMode(user: StockApiUser): boolean {
  return user.role === 'admin' && user.email.toLowerCase() === SHARED_STOCK_ADMIN_EMAIL;
}

export async function getStockCityAccess(
  user: StockApiUser,
  cityId: string,
  allowedRoles: StockCityAccessRole[],
): Promise<StockCityAccess | null> {
  const [row] = await db
    .select({
      cityId: stockCities.id,
      citySlug: stockCities.slug,
      cityName: stockCities.name,
      roleInCity: stockUserCityAccess.roleInCity,
    })
    .from(stockUserCityAccess)
    .innerJoin(stockCities, eq(stockUserCityAccess.cityId, stockCities.id))
    .where(
      and(
        eq(stockUserCityAccess.userId, user.id),
        eq(stockUserCityAccess.cityId, cityId),
        eq(stockUserCityAccess.isActive, true),
        eq(stockCities.isActive, true),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (!allowedRoles.includes(row.roleInCity)) return null;

  return {
    city: {
      id: row.cityId,
      slug: row.citySlug,
      name: row.cityName,
    },
    roleInCity: row.roleInCity,
  };
}

export function stockJsonResponse(request: Request, body: unknown, init?: ResponseInit) {
  return jsonWithExpoDevCors(request, body, init);
}

export function stockCorsPreflight(request: Request) {
  return expoDevCorsPreflight(request);
}

export function unauthorizedResponse(request?: Request) {
  const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return request ? withExpoDevCors(request, response) : response;
}

export function forbiddenResponse(message = 'Forbidden', request?: Request) {
  const response = NextResponse.json({ error: message }, { status: 403 });
  return request ? withExpoDevCors(request, response) : response;
}

export function validationErrorResponse(error: unknown, request?: Request) {
  const response = NextResponse.json({ error }, { status: 400 });
  return request ? withExpoDevCors(request, response) : response;
}

export function statusForCityStockError(code: CityStockErrorCode): number {
  switch (code) {
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
    case 'NO_ACTIVE_SHIFT':
      return 404;
    case 'ACTIVE_SHIFT_EXISTS':
    case 'INSUFFICIENT_STOCK':
    case 'SHIFT_CITY_MISMATCH':
    case 'INVALID_MOVEMENT':
      return 409;
    case 'INVALID_INPUT':
      return 400;
    case 'DB_ERROR':
    default:
      return 500;
  }
}
