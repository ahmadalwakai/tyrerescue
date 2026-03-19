import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreProducts, tyreCatalogue, inventoryReservations, inventoryMovements } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import { runDiagnostics, type StockRecord, type ReservationRecord } from '@/lib/inventory/stock-domain';

/**
 * GET /api/admin/diagnostics
 * Returns a full stock diagnostics summary.
 */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [products, reservations, catalogueRows, recentMovements] = await Promise.all([
    db.select({
      id: tyreProducts.id,
      catalogueId: tyreProducts.catalogueId,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      season: tyreProducts.season,
      width: tyreProducts.width,
      aspect: tyreProducts.aspect,
      rim: tyreProducts.rim,
      priceNew: tyreProducts.priceNew,
      stockNew: tyreProducts.stockNew,
      stockOrdered: tyreProducts.stockOrdered,
      isLocalStock: tyreProducts.isLocalStock,
      availableNew: tyreProducts.availableNew,
      slug: tyreProducts.slug,
      barcode: tyreProducts.barcode,
      updatedAt: tyreProducts.updatedAt,
    }).from(tyreProducts),

    db.select({
      id: inventoryReservations.id,
      tyreId: inventoryReservations.tyreId,
      bookingId: inventoryReservations.bookingId,
      quantity: inventoryReservations.quantity,
      expiresAt: inventoryReservations.expiresAt,
      released: inventoryReservations.released,
    }).from(inventoryReservations),

    db.select({ id: tyreCatalogue.id }).from(tyreCatalogue),

    db.select({
      id: inventoryMovements.id,
      tyreId: inventoryMovements.tyreId,
      movementType: inventoryMovements.movementType,
      quantityDelta: inventoryMovements.quantityDelta,
      stockAfter: inventoryMovements.stockAfter,
      note: inventoryMovements.note,
      createdAt: inventoryMovements.createdAt,
    })
      .from(inventoryMovements)
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(50),
  ]);

  const catalogueIds = new Set(catalogueRows.map(r => r.id));

  const summary = runDiagnostics(
    products as StockRecord[],
    reservations as ReservationRecord[],
    catalogueIds,
  );

  return NextResponse.json({
    ...summary,
    recentMovements,
    counts: {
      products: products.length,
      reservations: reservations.length,
      catalogueItems: catalogueRows.length,
    },
  });
}
