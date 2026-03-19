import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreProducts, bookingTyres, inventoryReservations, inventoryMovements } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { Pool } from '@neondatabase/serverless';
import { parseTyreSize } from '@/lib/inventory/tyre-size';
import { adjustStock } from '@/lib/inventory/stock-service';

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
  if (d.stockOrdered !== undefined) updates.stockOrdered = d.stockOrdered;
  if (d.isLocalStock !== undefined) updates.isLocalStock = d.isLocalStock;
  if (d.availableNew !== undefined) updates.availableNew = d.availableNew;
  if (d.brand !== undefined) updates.brand = d.brand;
  if (d.season !== undefined) updates.season = d.season;
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

  // If stock changed, use the shared stock service (transactional + movement logging)
  if (d.stockNew !== undefined) {
    const result = await adjustStock({
      productId: id,
      newStock: d.stockNew,
      reason: 'manual-edit',
      actor: 'admin',
      actorUserId: session.user.id,
      note: `Admin stock edit`,
    });

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    // Apply remaining non-stock field updates
    const nonStockUpdates = { ...updates };
    delete nonStockUpdates.stockNew;
    if (Object.keys(nonStockUpdates).length > 1) { // > 1 because updatedAt is always there
      await db.update(tyreProducts).set(nonStockUpdates).where(eq(tyreProducts.id, id));
    }

    return NextResponse.json({ success: true });
  }

  await db.update(tyreProducts).set(updates).where(eq(tyreProducts.id, id));

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/inventory/[id]
 * Remove a product — blocks if there are active unreleased reservations.
 * Nullifies FK references in booking_tyres, inventory_reservations,
 * and inventory_movements before deleting.
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

  try {
    // Check for active unreleased reservations
    const [activeRes] = await db
      .select({ id: inventoryReservations.id })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.tyreId, id),
          eq(inventoryReservations.released, false),
        )
      )
      .limit(1);

    if (activeRes) {
      return NextResponse.json(
        { error: 'Cannot delete product with active unreleased reservations. Release or expire them first.' },
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
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err) {
    console.error('[DELETE /api/admin/inventory] failed:', err);
    const msg = err instanceof Error ? err.message : 'Unknown DB error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
