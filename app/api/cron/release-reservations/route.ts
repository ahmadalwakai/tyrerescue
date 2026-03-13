import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { inventoryReservations, tyreProducts } from '@/lib/db/schema';
import { eq, and, lte, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find expired, unreleased reservations
  const expired = await db
    .select()
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.released, false),
        lte(inventoryReservations.expiresAt, new Date())
      )
    );

  let releasedCount = 0;

  for (const reservation of expired) {
    // Restore stock
    const stockCol =
      reservation.condition === 'new' ? tyreProducts.stockNew : tyreProducts.stockUsed;

    await db
      .update(tyreProducts)
      .set({ [reservation.condition === 'new' ? 'stockNew' : 'stockUsed']: sql`${stockCol} + ${reservation.quantity}` })
      .where(eq(tyreProducts.id, reservation.tyreId!));

    // Mark as released
    await db
      .update(inventoryReservations)
      .set({ released: true })
      .where(eq(inventoryReservations.id, reservation.id));

    releasedCount++;
  }

  return NextResponse.json({ released: releasedCount });
}
