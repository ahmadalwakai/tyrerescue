import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pricingRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const putSchema = z.object({
  items: z.array(
    z.object({
      key: z.string().min(1).max(100),
      value: z.string(),
      label: z.string().max(200).optional(),
    })
  ),
});

export async function PUT(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  for (const item of parsed.data.items) {
    const [existing] = await db
      .select({ id: pricingRules.id })
      .from(pricingRules)
      .where(eq(pricingRules.key, item.key))
      .limit(1);

    if (existing) {
      await db
        .update(pricingRules)
        .set({ value: item.value, label: item.label ?? null, updatedBy: session.user.id, updatedAt: new Date() })
        .where(eq(pricingRules.id, existing.id));
    } else {
      await db.insert(pricingRules).values({
        key: item.key,
        value: item.value,
        label: item.label ?? null,
        updatedBy: session.user.id,
      });
    }
  }

  return NextResponse.json({ success: true });
}
