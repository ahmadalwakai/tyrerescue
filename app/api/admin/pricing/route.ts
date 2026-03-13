import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pricingRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const createSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1),
  label: z.string().max(200).optional(),
});

const updateSchema = z.object({ id: z.string().uuid(), value: z.string().min(1) });
const deleteSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.insert(pricingRules).values({
    key: parsed.data.key,
    value: parsed.data.value,
    label: parsed.data.label ?? null,
    updatedBy: session.user.id,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db
    .update(pricingRules)
    .set({ value: parsed.data.value, updatedBy: session.user.id, updatedAt: new Date() })
    .where(eq(pricingRules.id, parsed.data.id));

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.delete(pricingRules).where(eq(pricingRules.id, parsed.data.id));

  return NextResponse.json({ success: true });
}
