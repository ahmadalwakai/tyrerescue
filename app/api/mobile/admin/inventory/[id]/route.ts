import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, tyreProducts, inventoryReservations, bookingTyres, inventoryMovements } from '@/lib/db';
import { adjustStock } from '@/lib/inventory/stock-service';
import { parseTyreSize } from '@/lib/inventory/tyre-size';
import { isValidSeason, normalizeSeason } from '@/lib/inventory/normalize-season';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

interface Props {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  priceNew: z.union([z.string(), z.number()]).nullable().optional(),
  stockNew: z.number().int().min(0).optional(),
  stockOrdered: z.number().int().min(0).optional(),
  isLocalStock: z.boolean().optional(),
  availableNew: z.boolean().optional(),
  brand: z.string().min(1).max(100).optional(),
  sizeDisplay: z.string().min(3).max(20).optional(),
  season: z.unknown().optional(),
});

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (data.priceNew !== undefined) updates.priceNew = data.priceNew != null ? String(data.priceNew) : null;
  if (data.stockOrdered !== undefined) updates.stockOrdered = data.stockOrdered;
  if (data.isLocalStock !== undefined) updates.isLocalStock = data.isLocalStock;
  if (data.availableNew !== undefined) updates.availableNew = data.availableNew;
  if (data.brand !== undefined) updates.brand = data.brand;

  if (data.season !== undefined) {
    if (!isValidSeason(data.season)) {
      return NextResponse.json({ error: 'Invalid season. Use allseason, summer, or winter.' }, { status: 400 });
    }
    updates.season = normalizeSeason(data.season);
  }

  if (data.sizeDisplay !== undefined) {
    const size = parseTyreSize(data.sizeDisplay);
    if (!size.valid) {
      return NextResponse.json({ error: size.error }, { status: 400 });
    }
    updates.sizeDisplay = size.size.sizeDisplay;
    updates.width = size.size.width;
    updates.aspect = size.size.aspect;
    updates.rim = size.size.rim;
  }

  if (data.stockNew !== undefined) {
    const result = await adjustStock({
      productId: id,
      newStock: data.stockNew,
      reason: 'manual-edit',
      actor: 'admin',
      actorUserId: user.id,
      note: 'Admin mobile stock edit',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.code === 'NOT_FOUND' ? 404 : 400 });
    }

    const nonStockUpdates = { ...updates };
    delete nonStockUpdates.stockNew;
    if (Object.keys(nonStockUpdates).length > 1) {
      await db.update(tyreProducts).set(nonStockUpdates).where(eq(tyreProducts.id, id));
    }

    return NextResponse.json({ success: true });
  }

  await db.update(tyreProducts).set(updates).where(eq(tyreProducts.id, id));
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;

  const [activeReservation] = await db
    .select({ id: inventoryReservations.id })
    .from(inventoryReservations)
    .where(and(eq(inventoryReservations.tyreId, id), eq(inventoryReservations.released, false)))
    .limit(1);

  if (activeReservation) {
    return NextResponse.json(
      { error: 'Cannot delete product with active unreleased reservations' },
      { status: 409 },
    );
  }

  await db.update(bookingTyres).set({ tyreId: null }).where(eq(bookingTyres.tyreId, id));
  await db.update(inventoryReservations).set({ tyreId: null }).where(eq(inventoryReservations.tyreId, id));
  await db.update(inventoryMovements).set({ tyreId: null }).where(eq(inventoryMovements.tyreId, id));
  await db.delete(tyreProducts).where(eq(tyreProducts.id, id));

  return NextResponse.json({ success: true });
}
