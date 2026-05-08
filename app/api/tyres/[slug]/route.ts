import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts, inventoryReservations } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const [tyre] = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.slug, slug))
      .limit(1);

    if (!tyre) {
      return NextResponse.json({ error: 'Tyre not found' }, { status: 404 });
    }

    // Subtract live reservations so customers see real availability.
    const [reserved] = await db
      .select({
        reserved: sql<number>`coalesce(sum(${inventoryReservations.quantity}), 0)::int`,
      })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.tyreId, tyre.id),
          eq(inventoryReservations.released, false),
          sql`${inventoryReservations.expiresAt} > NOW()`,
        ),
      );

    const physical = tyre.stockNew ?? 0;
    const reservedQty = reserved?.reserved ?? 0;
    const available = Math.max(0, physical - reservedQty);

    return NextResponse.json({
      tyre: {
        id: tyre.id,
        brand: tyre.brand,
        pattern: tyre.pattern,
        width: tyre.width,
        aspect: tyre.aspect,
        rim: tyre.rim,
        sizeDisplay: tyre.sizeDisplay,
        season: tyre.season,
        speedRating: tyre.speedRating,
        loadIndex: tyre.loadIndex,
        wetGrip: tyre.wetGrip,
        fuelEfficiency: tyre.fuelEfficiency,
        noiseDb: tyre.noiseDb,
        runFlat: tyre.runFlat,
        priceNew: tyre.priceNew ? parseFloat(tyre.priceNew) : null,
        // stockNew is the customer-facing available count.
        stockNew: available,
        physicalStock: physical,
        reservedStock: reservedQty,
        availableStock: available,
        availableNew: tyre.availableNew,
        images: tyre.images,
        slug: tyre.slug,
      },
    });
  } catch (error) {
    console.error('Error fetching tyre:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tyre' },
      { status: 500 }
    );
  }
}
