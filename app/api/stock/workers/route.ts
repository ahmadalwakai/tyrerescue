import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, drivers, stockShifts, users } from '@/lib/db';
import { endStockShift, startStockShift } from '@/lib/stock/city-stock-service';
import {
  canUseSharedStockWorkerMode,
  getStockApiUser,
  getStockCityAccess,
  statusForCityStockError,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../_lib';

const shiftActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    cityId: z.string().uuid(),
    workerUserId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal('end'),
    shiftId: z.string().uuid(),
  }),
]);

function shiftPayload(row: {
  workerUserId: string;
  activeShiftId: string | null;
  activeShiftCityId: string | null;
  activeShiftStartedAt: Date | null;
  activeShiftEndedAt: Date | null;
  activeShiftStatus: string | null;
}) {
  if (!row.activeShiftId) return null;
  return {
    id: row.activeShiftId,
    userId: row.workerUserId,
    cityId: row.activeShiftCityId,
    startedAt: row.activeShiftStartedAt?.toISOString() ?? null,
    endedAt: row.activeShiftEndedAt?.toISOString() ?? null,
    status: row.activeShiftStatus,
  };
}

export async function GET(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);
  if (!canUseSharedStockWorkerMode(user)) {
    return stockJsonResponse(request, { error: 'Shared stock worker mode is not enabled for this account' }, { status: 403 });
  }

  const url = new URL(request.url);
  const cityId = url.searchParams.get('cityId');
  if (cityId) {
    const access = await getStockCityAccess(user, cityId, ['manager']);
    if (!access) return stockJsonResponse(request, { error: 'Manager access required for this stock city' }, { status: 403 });
  }

  const rows = await db
    .select({
      driverId: drivers.id,
      workerUserId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      isOnline: drivers.isOnline,
      status: drivers.status,
      activeShiftId: stockShifts.id,
      activeShiftCityId: stockShifts.cityId,
      activeShiftStartedAt: stockShifts.startedAt,
      activeShiftEndedAt: stockShifts.endedAt,
      activeShiftStatus: stockShifts.status,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .leftJoin(
      stockShifts,
      and(
        eq(stockShifts.userId, users.id),
        eq(stockShifts.status, 'active'),
        isNull(stockShifts.endedAt),
        ...(cityId ? [eq(stockShifts.cityId, cityId)] : []),
      ),
    )
    .orderBy(asc(users.name));

  return stockJsonResponse(request, {
    items: rows.map((row) => ({
      driverId: row.driverId,
      userId: row.workerUserId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      isOnline: row.isOnline ?? false,
      status: row.status ?? 'offline',
      activeShift: shiftPayload(row),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);
  if (!canUseSharedStockWorkerMode(user)) {
    return stockJsonResponse(request, { error: 'Shared stock worker mode is not enabled for this account' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = shiftActionSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  if (parsed.data.action === 'start') {
    const access = await getStockCityAccess(user, parsed.data.cityId, ['manager']);
    if (!access) return stockJsonResponse(request, { error: 'Manager access required for this stock city' }, { status: 403 });

    const [worker] = await db
      .select({ userId: users.id })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(users.id, parsed.data.workerUserId))
      .limit(1);
    if (!worker) return stockJsonResponse(request, { error: 'Driver not found' }, { status: 404 });

    const result = await startStockShift({
      userId: parsed.data.workerUserId,
      cityId: parsed.data.cityId,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
      skipCityAccessCheck: true,
    });
    if (!result.success) {
      return stockJsonResponse(
        request,
        { error: result.error, code: result.code },
        { status: statusForCityStockError(result.code) },
      );
    }
    return stockJsonResponse(request, {
      shift: result.shift,
      alreadyStarted: result.alreadyStarted,
    }, { status: result.alreadyStarted ? 200 : 201 });
  }

  const result = await endStockShift({
    shiftId: parsed.data.shiftId,
    requesterUserId: user.id,
    adminOverrideReason: 'Shared stock iPad manager ended worker shift',
  });
  if (!result.success) {
    return stockJsonResponse(
      request,
      { error: result.error, code: result.code },
      { status: statusForCityStockError(result.code) },
    );
  }
  return stockJsonResponse(request, {
    shift: result.shift,
    alreadyEnded: result.alreadyEnded,
  });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
