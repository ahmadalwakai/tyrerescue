import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pricingConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getPricingConfig, invalidatePricingConfigCache } from '@/lib/pricing-config';

const updateSchema = z.object({
  nightSurchargePercent: z.number().min(0).max(100).optional(),
  nightStartHour: z.number().int().min(0).max(23).optional(),
  nightEndHour: z.number().int().min(0).max(23).optional(),
  manualSurchargePercent: z.number().min(0).max(100).optional(),
  manualSurchargeActive: z.boolean().optional(),
  demandSurchargePercent: z.number().min(0).max(100).optional(),
  demandThresholdClicks: z.number().int().min(1).optional(),
  demandIncrementPercent: z.number().min(0).max(50).optional(),
  cookieReturnSurchargePercent: z.number().min(0).max(50).optional(),
  maxTotalSurchargePercent: z.number().min(0).max(100).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = await getPricingConfig();
  return NextResponse.json(config);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = await getPricingConfig();

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: session.user.id,
  };

  // Build update object from parsed fields
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      if (typeof value === 'number') {
        updateData[key] = String(value);
      } else {
        updateData[key] = value;
      }
    }
  }

  await db
    .update(pricingConfig)
    .set(updateData)
    .where(eq(pricingConfig.id, config.id));

  invalidatePricingConfigCache();

  return NextResponse.json({ success: true });
}
