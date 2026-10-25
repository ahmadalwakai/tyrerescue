import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth';
import { db } from '@/lib/db';
import { inventoryReservations } from '@/lib/db/schema';
import { eq, and, lte } from 'drizzle-orm';
import { releaseReservations } from '@/lib/inventory/stock-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find expired, unreleased reservation IDs
  const expired = await db
    .select({ id: inventoryReservations.id })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.released, false),
        lte(inventoryReservations.expiresAt, new Date())
      )
    );

  if (expired.length === 0) {
    return NextResponse.json({ released: 0 });
  }

  const result = await releaseReservations({
    reservationIds: expired.map(r => r.id),
    // Quote and B2B reservations are soft holds that never deducted physical
    // stock, so expiring them does not restore any stock — it just removes
    // the hold so the tyre is available again.
    restoreStock: false,
    reason: 'quote-release',
    actor: 'cron',
    note: 'Cron: expired reservation release',
  });

  if (!result.success) {
    console.error('[cron/release-reservations] failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    released: result.releasedCount,
    restored: result.restoredProducts.length,
  });
}
