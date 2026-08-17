import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db, drivers, stockShifts, users } from '@/lib/db';
import { recordCityStockMovement } from '@/lib/stock/city-stock-service';
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

const movementSchema = z.object({
  cityId: z.string().uuid(),
  tyreProductId: z.string().uuid(),
  movementType: z.enum(['RECEIVED', 'SALE', 'RETURN', 'DAMAGED', 'CORRECTION']),
  quantityDelta: z.number().int(),
  workerUserId: z.string().uuid().nullable().optional(),
  shiftId: z.string().uuid().nullable().optional(),
  bookingId: z.string().uuid().nullable().optional(),
  saleChannel: z.enum(['GARAGE', 'EMERGENCY_CALL_OUT']).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const body = await request.json();
  const parsed = movementSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  const data = parsed.data;
  const accessRoles = data.movementType === 'SALE' ? ['operator', 'manager'] as const : ['manager'] as const;
  const access = await getStockCityAccess(user, data.cityId, [...accessRoles]);
  if (!access) {
    return stockJsonResponse(request, { error: 'No permission for this stock city movement' }, { status: 403 });
  }
  if (data.movementType === 'SALE' && !data.shiftId) {
    return stockJsonResponse(request, { error: 'An active stock shift is required for SALE movements' }, { status: 400 });
  }
  if (data.movementType === 'SALE' && data.saleChannel === 'EMERGENCY_CALL_OUT' && !data.bookingId) {
    return stockJsonResponse(request, { error: 'bookingId is required for emergency call-out sales' }, { status: 400 });
  }

  let actorUserId = user.id;
  let metadata = data.metadata ?? null;
  if (data.workerUserId) {
    if (!canUseSharedStockWorkerMode(user)) {
      return stockJsonResponse(request, { error: 'Worker selection is not enabled for this account' }, { status: 403 });
    }
    if (access.roleInCity !== 'manager') {
      return stockJsonResponse(request, { error: 'Manager access required to record stock for another worker' }, { status: 403 });
    }
    if (!data.shiftId) {
      return stockJsonResponse(request, { error: 'A worker shift is required before changing stock' }, { status: 400 });
    }

    const [worker] = await db
      .select({ userId: users.id })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(users.id, data.workerUserId))
      .limit(1);
    if (!worker) return stockJsonResponse(request, { error: 'Driver not found' }, { status: 404 });

    const [shift] = await db
      .select({ id: stockShifts.id })
      .from(stockShifts)
      .where(
        and(
          eq(stockShifts.id, data.shiftId),
          eq(stockShifts.userId, data.workerUserId),
          eq(stockShifts.cityId, data.cityId),
          eq(stockShifts.status, 'active'),
          isNull(stockShifts.endedAt),
        ),
      )
      .limit(1);
    if (!shift) return stockJsonResponse(request, { error: 'Worker shift is not active for this city' }, { status: 409 });

    actorUserId = data.workerUserId;
    metadata = {
      ...(metadata ?? {}),
      sharedStockAdminUserId: user.id,
      sharedStockAdminEmail: user.email,
    };
  }

  const result = await recordCityStockMovement({
    cityId: data.cityId,
    tyreProductId: data.tyreProductId,
    movementType: data.movementType,
    quantityDelta: data.quantityDelta,
    actorUserId,
    shiftId: data.shiftId ?? null,
    bookingId: data.bookingId ?? null,
    saleChannel: data.saleChannel ?? null,
    idempotencyKey: data.idempotencyKey ?? null,
    reason: data.reason ?? null,
    note: data.note ?? null,
    metadata,
    requireActiveShift: data.movementType === 'SALE' || Boolean(data.workerUserId),
  });

  if (!result.success) {
    return stockJsonResponse(
      request,
      { error: result.error, code: result.code },
      { status: statusForCityStockError(result.code) },
    );
  }

  return stockJsonResponse(request, {
    city: access.city,
    movement: result.movement,
  }, { status: result.movement.alreadyApplied ? 200 : 201 });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
