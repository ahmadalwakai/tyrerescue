import { NextResponse } from 'next/server';
import { z } from 'zod';
import { startStockShift } from '@/lib/stock/city-stock-service';
import {
  getStockApiUser,
  statusForCityStockError,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../../_lib';

const startShiftSchema = z.object({
  cityId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const body = await request.json();
  const parsed = startShiftSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  const result = await startStockShift({
    userId: user.id,
    cityId: parsed.data.cityId,
    idempotencyKey: parsed.data.idempotencyKey ?? null,
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

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
