import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  priceNew: z.union([z.string(), z.number()]).nullable().optional(),
  stockNew: z.number().int().min(0).optional(),
  availableNew: z.boolean().optional(),
});

/**
 * PATCH /api/admin/inventory/[id]
 * Update price/stock for an activated product (id = tyreProducts.id)
 */
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
  if (d.priceNew !== undefined) updates.priceNew = d.priceNew != null ? String(d.priceNew) : null;
  if (d.stockNew !== undefined) updates.stockNew = d.stockNew;
  if (d.availableNew !== undefined) updates.availableNew = d.availableNew;

  await db.update(tyreProducts).set(updates).where(eq(tyreProducts.id, id));

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/inventory/[id]
 * Deactivate a product (remove from tyreProducts) — id = tyreProducts.id
 */
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
