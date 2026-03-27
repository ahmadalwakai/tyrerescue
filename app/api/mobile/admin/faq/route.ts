import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, faqs } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

const createSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  displayOrder: z.number().int().nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean().optional(),
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  displayOrder: z.number().int().nullable().optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const items = await db.select().from(faqs).orderBy(asc(faqs.displayOrder));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.insert(faqs).values({
    question: parsed.data.question,
    answer: parsed.data.answer,
    displayOrder: parsed.data.displayOrder ?? null,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  if (parsed.data.question !== undefined) updates.question = parsed.data.question;
  if (parsed.data.answer !== undefined) updates.answer = parsed.data.answer;
  if (parsed.data.displayOrder !== undefined) updates.displayOrder = parsed.data.displayOrder;

  await db.update(faqs).set(updates).where(eq(faqs.id, parsed.data.id));
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.delete(faqs).where(eq(faqs.id, parsed.data.id));
  return NextResponse.json({ success: true });
}
