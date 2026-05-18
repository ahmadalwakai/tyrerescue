import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { getMobileAdminUser, unauthorizedResponse } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/admin/urgent-poll?since=<unixMs>
 *
 * Fallback path for the native UrgentAlertWatcherService when FCM delivery
 * is delayed or dropped (Samsung One UI aggressive battery management).
 * Returns the most recent emergency booking created after `since` so the
 * native service can raise the full-screen alert if FCM did not fire.
 *
 * Auth: Authorization: Bearer <mobile admin JWT>
 *
 * Response shape:
 *   { booking: { id, title, body, customerPhone, createdAt } | null }
 *
 * Notes:
 *   - Only emergency bookings are considered (booking_type = 'emergency').
 *   - Drafts are excluded.
 *   - The native service dedupes against the last alerted id so we always
 *     return the latest match; we do not track acknowledgement here.
 */
export async function GET(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since');
  const sinceMs = sinceRaw ? Number.parseInt(sinceRaw, 10) : 0;
  const since = Number.isFinite(sinceMs) && sinceMs > 0 ? new Date(sinceMs) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const rows = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        customerPhone: bookings.customerPhone,
        customerName: bookings.customerName,
        addressLine: bookings.addressLine,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingType, 'emergency'),
          gt(bookings.createdAt, since),
        ),
      )
      .orderBy(desc(bookings.createdAt))
      .limit(1);

    const row = rows[0];
    if (!row || row.status === 'draft') {
      return NextResponse.json({ booking: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json(
      {
        booking: {
          id: row.id,
          title: 'Emergency booking received',
          body: `${row.customerName ?? 'Customer'} — ${row.addressLine ?? 'unknown location'}`,
          customerPhone: row.customerPhone ?? null,
          createdAt: row.createdAt?.toISOString?.() ?? null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[urgent-poll] query failed', err);
    return NextResponse.json({ error: 'Failed to poll' }, { status: 500 });
  }
}
