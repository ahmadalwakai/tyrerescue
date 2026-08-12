import { NextResponse } from 'next/server';
import { z } from 'zod';
import { endStockShift } from '@/lib/stock/city-stock-service';
import {
  forbiddenResponse,
  getStockApiUser,
  statusForCityStockError,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../../_lib';

const endShiftSchema = z.object({
  shiftId: z.string().uuid(),
  adminOverrideReason: z.string().trim().min(3).max(500).optional(),
});

export async function POST(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const body = await request.json();
  const parsed = endShiftSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  if (parsed.data.adminOverrideReason && user.role !== 'admin') {
    return forbiddenResponse('Only admins can end another user shift with an override', request);
  }

  const result = await endStockShift({
    shiftId: parsed.data.shiftId,
    requesterUserId: user.id,
    adminOverrideReason: user.role === 'admin' ? parsed.data.adminOverrideReason ?? null : null,
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
