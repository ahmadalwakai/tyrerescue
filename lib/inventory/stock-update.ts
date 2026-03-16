import { db } from '@/lib/db';
import { tyreProducts, inventoryMovements } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Shared stock mutation helper — used by both PATCH /api/admin/inventory/[id]
 * and POST /api/admin/chat for chatbot-initiated stock updates.
 *
 * Returns the updated product row on success, or throws on failure.
 */
export async function applyStockUpdate(params: {
  productId: string;
  newStock: number;
  actorUserId: string;
  note: string;
}): Promise<{ id: string; stockNew: number }> {
  const { productId, newStock, actorUserId, note } = params;

  // Fetch current product
  const [product] = await db
    .select({ id: tyreProducts.id, stockNew: tyreProducts.stockNew, updatedAt: tyreProducts.updatedAt })
    .from(tyreProducts)
    .where(eq(tyreProducts.id, productId))
    .limit(1);

  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  if (newStock < 0) {
    throw new Error(`Stock cannot be negative (requested: ${newStock})`);
  }

  const currentStock = product.stockNew ?? 0;
  const delta = newStock - currentStock;

  // Update stock
  await db
    .update(tyreProducts)
    .set({ stockNew: newStock, updatedAt: new Date() })
    .where(eq(tyreProducts.id, productId));

  // Log movement
  await db.insert(inventoryMovements).values({
    tyreId: productId,
    movementType: delta < 0 ? 'sale' : 'restock',
    quantityDelta: delta,
    stockAfter: newStock,
    actorUserId,
    note,
  });

  return { id: productId, stockNew: newStock };
}
