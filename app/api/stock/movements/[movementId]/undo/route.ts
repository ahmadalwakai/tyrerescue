import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, stockMovements } from '@/lib/db';
import { reverseCityStockSale } from '@/lib/stock/city-stock-service';
import {
  getStockApiUser,
  getStockCityAccess,
  statusForCityStockError,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../../../_lib';

const undoMovementSchema = z.object({
  shiftId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(200).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ movementId: string }> },
) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const { movementId } = await params;
  const body = await request.json();
  const parsed = undoMovementSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  const [movement] = await db
    .select({
      id: stockMovements.id,
      cityId: stockMovements.cityId,
      movementType: stockMovements.movementType,
    })
    .from(stockMovements)
    .where(eq(stockMovements.id, movementId))
    .limit(1);

  if (!movement) return stockJsonResponse(request, { error: 'Stock movement not found' }, { status: 404 });
  if (movement.movementType !== 'SALE') {
    return stockJsonResponse(request, { error: 'Only SALE movements can be undone' }, { status: 409 });
  }

  const access = await getStockCityAccess(user, movement.cityId, ['operator', 'manager']);
  if (!access) return stockJsonResponse(request, { error: 'No permission to undo this stock sale' }, { status: 403 });

  const result = await reverseCityStockSale({
    movementId,
    actorUserId: user.id,
    shiftId: parsed.data.shiftId,
    idempotencyKey: parsed.data.idempotencyKey ?? null,
    reason: parsed.data.reason ?? 'undo_sale',
    note: parsed.data.note ?? null,
    metadata: parsed.data.metadata ?? null,
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
