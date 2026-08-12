import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, missingTyreRequests, stockShifts, users } from '@/lib/db';
import { normalizeMissingTyreSize } from '@/lib/stock/city-stock-domain';
import {
  getStockApiUser,
  getStockCityAccess,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../_lib';

const missingTyreSchema = z.object({
  cityId: z.string().uuid(),
  size: z.string().trim().min(3).max(32),
  shiftId: z.string().uuid().nullable().optional(),
  bookingId: z.string().uuid().nullable().optional(),
  saleChannel: z.enum(['GARAGE', 'EMERGENCY_CALL_OUT']).nullable().optional(),
  context: z.record(z.string(), z.unknown()).nullable().optional(),
});

function parsePageParams(url: URL) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10));
  const rawPerPage = Number.parseInt(url.searchParams.get('perPage') || '50', 10);
  const perPage = Math.max(1, Math.min(100, Number.isFinite(rawPerPage) ? rawPerPage : 50));
  return { page, perPage, offset: (page - 1) * perPage };
}

async function validateShiftForCity(shiftId: string, cityId: string): Promise<boolean> {
  const [shift] = await db
    .select({ id: stockShifts.id })
    .from(stockShifts)
    .where(
      and(
        eq(stockShifts.id, shiftId),
        eq(stockShifts.cityId, cityId),
        eq(stockShifts.status, 'active'),
      ),
    )
    .limit(1);

  return Boolean(shift);
}

export async function GET(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const url = new URL(request.url);
  const cityId = url.searchParams.get('cityId');
  if (!cityId) return stockJsonResponse(request, { error: 'cityId is required' }, { status: 400 });
  const cityIdCheck = z.string().uuid().safeParse(cityId);
  if (!cityIdCheck.success) return validationErrorResponse(cityIdCheck.error.flatten(), request);

  const access = await getStockCityAccess(user, cityIdCheck.data, ['viewer', 'operator', 'manager']);
  if (!access) return stockJsonResponse(request, { error: 'No access to this stock city' }, { status: 403 });

  const { page, perPage, offset } = parsePageParams(url);

  const recent = await db
    .select({
      id: missingTyreRequests.id,
      cityId: missingTyreRequests.cityId,
      normalizedSize: missingTyreRequests.normalizedSize,
      requesterUserId: missingTyreRequests.requesterUserId,
      requesterName: users.name,
      shiftId: missingTyreRequests.shiftId,
      bookingId: missingTyreRequests.bookingId,
      saleChannel: missingTyreRequests.saleChannel,
      context: missingTyreRequests.context,
      createdAt: missingTyreRequests.createdAt,
    })
    .from(missingTyreRequests)
    .leftJoin(users, eq(missingTyreRequests.requesterUserId, users.id))
    .where(eq(missingTyreRequests.cityId, cityIdCheck.data))
    .orderBy(desc(missingTyreRequests.createdAt))
    .limit(perPage)
    .offset(offset);

  const aggregate = await db
    .select({
      normalizedSize: missingTyreRequests.normalizedSize,
      count: sql<number>`count(*)::int`,
      lastRequestedAt: sql<Date>`max(${missingTyreRequests.createdAt})`,
    })
    .from(missingTyreRequests)
    .where(eq(missingTyreRequests.cityId, cityIdCheck.data))
    .groupBy(missingTyreRequests.normalizedSize)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${missingTyreRequests.createdAt})`))
    .limit(25);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(missingTyreRequests)
    .where(eq(missingTyreRequests.cityId, cityIdCheck.data));

  return stockJsonResponse(request, {
    city: access.city,
    page,
    totalPages: Math.ceil(Number(countResult?.count || 0) / perPage),
    totalCount: Number(countResult?.count || 0),
    aggregate: aggregate.map((row) => ({
      normalizedSize: row.normalizedSize,
      count: Number(row.count || 0),
      lastRequestedAt: row.lastRequestedAt instanceof Date
        ? row.lastRequestedAt.toISOString()
        : row.lastRequestedAt,
    })),
    items: recent.map((row) => ({
      id: row.id,
      cityId: row.cityId,
      normalizedSize: row.normalizedSize,
      requesterUserId: row.requesterUserId,
      requesterName: row.requesterName,
      shiftId: row.shiftId,
      bookingId: row.bookingId,
      saleChannel: row.saleChannel,
      context: row.context,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const body = await request.json();
  const parsed = missingTyreSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  const data = parsed.data;
  const access = await getStockCityAccess(user, data.cityId, ['operator', 'manager']);
  if (!access) return stockJsonResponse(request, { error: 'No permission to record missing tyres for this city' }, { status: 403 });

  if (data.shiftId && !(await validateShiftForCity(data.shiftId, data.cityId))) {
    return stockJsonResponse(request, { error: 'Shift is not active for this stock city' }, { status: 409 });
  }

  const [created] = await db
    .insert(missingTyreRequests)
    .values({
      cityId: data.cityId,
      normalizedSize: normalizeMissingTyreSize(data.size),
      requesterUserId: user.id,
      shiftId: data.shiftId ?? null,
      bookingId: data.bookingId ?? null,
      saleChannel: data.saleChannel ?? null,
      context: data.context ?? {},
    })
    .returning({
      id: missingTyreRequests.id,
      cityId: missingTyreRequests.cityId,
      normalizedSize: missingTyreRequests.normalizedSize,
      requesterUserId: missingTyreRequests.requesterUserId,
      shiftId: missingTyreRequests.shiftId,
      bookingId: missingTyreRequests.bookingId,
      saleChannel: missingTyreRequests.saleChannel,
      context: missingTyreRequests.context,
      createdAt: missingTyreRequests.createdAt,
    });

  return stockJsonResponse(request, {
    city: access.city,
    item: {
      id: created.id,
      cityId: created.cityId,
      normalizedSize: created.normalizedSize,
      requesterUserId: created.requesterUserId,
      shiftId: created.shiftId,
      bookingId: created.bookingId,
      saleChannel: created.saleChannel,
      context: created.context,
      createdAt: created.createdAt?.toISOString() ?? null,
    },
  }, { status: 201 });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
