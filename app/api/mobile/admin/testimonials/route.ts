import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, testimonials } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

const createSchema = z.object({
  authorName: z.string().min(1).max(255),
  content: z.string().min(1),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  jobType: z.string().max(100).nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  approved: z.boolean().optional(),
  featured: z.boolean().optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const items = await db.select().from(testimonials).orderBy(desc(testimonials.createdAt));
  return NextResponse.json({ items: items.map((item) => ({ ...item, createdAt: item.createdAt?.toISOString() ?? null })) });
}

export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.insert(testimonials).values({
    authorName: parsed.data.authorName,
    content: parsed.data.content,
    rating: parsed.data.rating ?? null,
    jobType: parsed.data.jobType ?? null,
    approved: true,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (parsed.data.approved !== undefined) updates.approved = parsed.data.approved;
  if (parsed.data.featured !== undefined) updates.featured = parsed.data.featured;

  await db.update(testimonials).set(updates).where(eq(testimonials.id, parsed.data.id));
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.delete(testimonials).where(eq(testimonials.id, parsed.data.id));
  return NextResponse.json({ success: true });
}
