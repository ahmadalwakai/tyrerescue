import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, pricingRules } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const items = await db.select().from(pricingRules);
  return NextResponse.json({ items });
}

export async function PUT(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const items = Array.isArray(body?.items) ? body.items : [];

  for (const item of items) {
    const key = String(item?.key || '').trim();
    if (!key) continue;

    const [existing] = await db.select({ id: pricingRules.id }).from(pricingRules).where(eq(pricingRules.key, key)).limit(1);

    if (existing) {
      await db
        .update(pricingRules)
        .set({
          value: String(item?.value ?? ''),
          label: item?.label ? String(item.label) : null,
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(pricingRules.id, existing.id));
    } else {
      await db.insert(pricingRules).values({
        key,
        value: String(item?.value ?? ''),
        label: item?.label ? String(item.label) : null,
        updatedBy: user.id,
      });
    }
  }

  return NextResponse.json({ success: true });
}
