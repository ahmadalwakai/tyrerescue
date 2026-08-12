import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordCityStockMovement } from '@/lib/stock/city-stock-service';
import {
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

  const result = await recordCityStockMovement({
    cityId: data.cityId,
    tyreProductId: data.tyreProductId,
    movementType: data.movementType,
    quantityDelta: data.quantityDelta,
    actorUserId: user.id,
    shiftId: data.shiftId ?? null,
    bookingId: data.bookingId ?? null,
    saleChannel: data.saleChannel ?? null,
    idempotencyKey: data.idempotencyKey ?? null,
    reason: data.reason ?? null,
    note: data.note ?? null,
    metadata: data.metadata ?? null,
    requireActiveShift: data.movementType === 'SALE',
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
