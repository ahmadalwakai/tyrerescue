import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreProducts, bookingTyres, inventoryReservations, inventoryMovements } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const SIZE_RE = /^(\d+)\/(\d+)\/R(\d+)(c?)$/i;

const updateSchema = z.object({
  priceNew: z.union([z.string(), z.number()]).nullable().optional(),
  stockNew: z.number().int().min(0).optional(),
  stockOrdered: z.number().int().min(0).optional(),
  isLocalStock: z.boolean().optional(),
  availableNew: z.boolean().optional(),
  brand: z.string().min(1).max(100).optional(),
  sizeDisplay: z.string().min(3).max(20).optional(),
  season: z.enum(['summer', 'winter', 'allseason']).optional(),
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
  if (d.stockOrdered !== undefined) updates.stockOrdered = d.stockOrdered;
  if (d.isLocalStock !== undefined) updates.isLocalStock = d.isLocalStock;
  if (d.availableNew !== undefined) updates.availableNew = d.availableNew;
  if (d.brand !== undefined) updates.brand = d.brand;
  if (d.season !== undefined) updates.season = d.season;
  if (d.sizeDisplay !== undefined) {
    const m = d.sizeDisplay.match(SIZE_RE);
    if (!m) {
      return NextResponse.json({ error: 'Invalid size format. Use e.g. 205/55/R16' }, { status: 400 });
    }
    updates.sizeDisplay = d.sizeDisplay;
    updates.width = Number(m[1]);
    updates.aspect = Number(m[2]);
    updates.rim = Number(m[3]);
  }

  await db.update(tyreProducts).set(updates).where(eq(tyreProducts.id, id));

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/inventory/[id]
 * Remove a product — nullifies FK references in booking_tyres,
 * inventory_reservations, and inventory_movements first.
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

  await db.transaction(async (tx) => {
    await tx.update(bookingTyres).set({ tyreId: null }).where(eq(bookingTyres.tyreId, id));
    await tx.update(inventoryReservations).set({ tyreId: null }).where(eq(inventoryReservations.tyreId, id));
    await tx.update(inventoryMovements).set({ tyreId: null }).where(eq(inventoryMovements.tyreId, id));
    await tx.delete(tyreProducts).where(eq(tyreProducts.id, id));
  });

  return NextResponse.json({ success: true });
}
