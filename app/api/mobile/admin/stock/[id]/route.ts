import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  tyreProducts,
  bookingTyres,
  inventoryReservations,
  inventoryMovements,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { Pool } from '@neondatabase/serverless';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { parseTyreSize } from '@/lib/inventory/tyre-size';
import { adjustStock } from '@/lib/inventory/stock-service';
import { isValidSeason, normalizeSeason } from '@/lib/inventory/normalize-season';

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

/**
 * PATCH /api/mobile/admin/stock/[id]
 * Update price, stock, brand, size, availability for a tyre product.
 */
export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await props.params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (d.priceNew !== undefined) updates.priceNew = d.priceNew != null ? String(d.priceNew) : null;
  if (d.stockOrdered !== undefined) updates.stockOrdered = d.stockOrdered;
  if (d.isLocalStock !== undefined) updates.isLocalStock = d.isLocalStock;
  if (d.availableNew !== undefined) updates.availableNew = d.availableNew;
  if (d.brand !== undefined) updates.brand = d.brand;
  if (d.season !== undefined) {
    if (!isValidSeason(d.season)) {
      return NextResponse.json({ error: 'Invalid season. Use allseason, summer, or winter.' }, { status: 400 });
    }
    updates.season = normalizeSeason(d.season);
  }
  if (d.sizeDisplay !== undefined) {
    const sizeResult = parseTyreSize(d.sizeDisplay);
    if (!sizeResult.valid) {
      return NextResponse.json({ error: sizeResult.error }, { status: 400 });
    }
    updates.sizeDisplay = sizeResult.size.sizeDisplay;
    updates.width = sizeResult.size.width;
    updates.aspect = sizeResult.size.aspect;
    updates.rim = sizeResult.size.rim;
  }

  if (d.stockNew !== undefined) {
    const result = await adjustStock({
      productId: id,
      newStock: d.stockNew,
      reason: 'manual-edit',
      actor: 'admin',
      actorUserId: user.id,
      note: 'Admin stock edit (mobile)',
    });

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
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

/**
 * DELETE /api/mobile/admin/stock/[id]
 * Remove a tyre product. Blocks if active unreleased reservations exist.
 */
export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const user = await getMobileAdminUser(_request);
  if (!user) return unauthorizedResponse();

  const { id } = await props.params;

  const [activeRes] = await db
    .select({ id: inventoryReservations.id })
    .from(inventoryReservations)
    .where(and(eq(inventoryReservations.tyreId, id), eq(inventoryReservations.released, false)))
    .limit(1);

  if (activeRes) {
    return NextResponse.json(
      { error: 'Cannot delete: active unreleased reservations exist. Release them first.' },
      { status: 409 },
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE booking_tyres SET tyre_id = NULL WHERE tyre_id = $1', [id]);
    await client.query('UPDATE inventory_reservations SET tyre_id = NULL WHERE tyre_id = $1', [id]);
    await client.query('UPDATE inventory_movements SET tyre_id = NULL WHERE tyre_id = $1', [id]);
    await client.query('DELETE FROM tyre_products WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : 'DB error';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }

  return NextResponse.json({ success: true });
}
