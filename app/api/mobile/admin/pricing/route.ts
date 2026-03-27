import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, pricingRules, pricingConfig } from '@/lib/db';
import { getPricingConfig, invalidatePricingConfigCache } from '@/lib/pricing-config';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const [rules, config] = await Promise.all([db.select().from(pricingRules), getPricingConfig()]);

  return NextResponse.json({
    rules,
    config: {
      ...config,
      baseCalloutFee: config.baseCalloutFee?.toString() ?? '0',
      baseFittingFee: config.baseFittingFee?.toString() ?? '0',
      nightSurchargePercent: config.nightSurchargePercent?.toString() ?? '0',
      manualSurchargePercent: config.manualSurchargePercent?.toString() ?? '0',
      demandSurchargePercent: config.demandSurchargePercent?.toString() ?? '0',
      demandIncrementPercent: config.demandIncrementPercent?.toString() ?? '0',
      cookieReturnSurchargePercent: config.cookieReturnSurchargePercent?.toString() ?? '0',
      maxTotalSurchargePercent: config.maxTotalSurchargePercent?.toString() ?? '0',
    },
  });
}

export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const key = String(body?.key || '').trim();
  const value = String(body?.value || '').trim();
  const label = body?.label ? String(body.label).trim() : null;

  if (!key || !value) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
  }

  await db.insert(pricingRules).values({
    key,
    value,
    label,
    updatedBy: user.id,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();

  if (body?.config && typeof body.config === 'object') {
    const config = await getPricingConfig();
    const setPayload: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: user.id,
    };

    for (const [key, value] of Object.entries(body.config as Record<string, unknown>)) {
      if (value === undefined) continue;
      setPayload[key] = typeof value === 'number' ? String(value) : value;
    }

    await db.update(pricingConfig).set(setPayload).where(eq(pricingConfig.id, config.id));
    invalidatePricingConfigCache();
    return NextResponse.json({ success: true });
  }

  const id = String(body?.id || '');
  const value = String(body?.value || '').trim();
  if (!id || !value) {
    return NextResponse.json({ error: 'id and value are required' }, { status: 400 });
  }

  await db
    .update(pricingRules)
    .set({ value, updatedBy: user.id, updatedAt: new Date() })
    .where(eq(pricingRules.id, id));

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const id = String(body?.id || '');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  await db.delete(pricingRules).where(eq(pricingRules.id, id));
  return NextResponse.json({ success: true });
}
