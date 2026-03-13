import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  brand: z.string().min(1).max(100).optional(),
  pattern: z.string().min(1).max(200).optional(),
  width: z.number().int().positive().optional(),
  aspect: z.number().int().positive().optional(),
  rim: z.number().int().positive().optional(),
  season: z.string().min(1).optional(),
  speedRating: z.string().max(5).nullable().optional(),
  loadIndex: z.number().int().nullable().optional(),
  priceNew: z.union([z.string(), z.number()]).nullable().optional(),
  priceUsed: z.union([z.string(), z.number()]).nullable().optional(),
  stockNew: z.number().int().min(0).optional(),
  stockUsed: z.number().int().min(0).optional(),
  runFlat: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await props.params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.brand !== undefined) updates.brand = d.brand;
  if (d.pattern !== undefined) updates.pattern = d.pattern;
  if (d.width !== undefined) updates.width = d.width;
  if (d.aspect !== undefined) updates.aspect = d.aspect;
  if (d.rim !== undefined) updates.rim = d.rim;
  if (d.season !== undefined) updates.season = d.season;
  if (d.speedRating !== undefined) updates.speedRating = d.speedRating;
  if (d.loadIndex !== undefined) updates.loadIndex = d.loadIndex;
  if (d.priceNew !== undefined) updates.priceNew = d.priceNew != null ? String(d.priceNew) : null;
  if (d.priceUsed !== undefined) updates.priceUsed = d.priceUsed != null ? String(d.priceUsed) : null;
  if (d.stockNew !== undefined) updates.stockNew = d.stockNew;
  if (d.stockUsed !== undefined) updates.stockUsed = d.stockUsed;
  if (d.runFlat !== undefined) updates.runFlat = d.runFlat;

  // Recalculate sizeDisplay and slug if dimensions changed
  if (d.width || d.aspect || d.rim) {
    const [current] = await db
      .select({ width: tyreProducts.width, aspect: tyreProducts.aspect, rim: tyreProducts.rim, brand: tyreProducts.brand, pattern: tyreProducts.pattern })
      .from(tyreProducts)
      .where(eq(tyreProducts.id, id))
      .limit(1);
    if (current) {
      const w = d.width ?? current.width;
      const a = d.aspect ?? current.aspect;
      const r = d.rim ?? current.rim;
      const b = d.brand ?? current.brand;
      const p = d.pattern ?? current.pattern;
      updates.sizeDisplay = `${w}/${a}R${r}`;
      updates.slug = `${b}-${p}-${updates.sizeDisplay}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
  }

  await db.update(tyreProducts).set(updates).where(eq(tyreProducts.id, id));

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await props.params;
  await db.delete(tyreProducts).where(eq(tyreProducts.id, id));

  return NextResponse.json({ success: true });
}
