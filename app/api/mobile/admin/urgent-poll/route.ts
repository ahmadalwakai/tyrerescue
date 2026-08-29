import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gt, ne, or } from 'drizzle-orm';
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
 * Returns the most recent direct emergency booking OR integrated-project
 * booking created after `since` so the native service can raise the
 * full-screen alert if FCM did not fire.
 *
 * Auth: Authorization: Bearer <mobile admin JWT>
 *
 * Response shape:
 *   { booking: { id, title, body, customerPhone, createdAt } | null }
 *
 * Notes:
 *   - Direct Tyre Rescue emergency bookings are considered.
 *   - Every integrated external project booking is considered.
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
        customerPhone: bookings.customerPhone,
        customerName: bookings.customerName,
        addressLine: bookings.addressLine,
        sourceApp: bookings.sourceApp,
        sourceLabel: bookings.sourceLabel,
        externalReference: bookings.externalReference,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          or(
            eq(bookings.bookingType, 'emergency'),
            ne(bookings.sourceApp, 'tyre_rescue'),
          ),
          ne(bookings.status, 'draft'),
          gt(bookings.createdAt, since),
        ),
      )
      .orderBy(desc(bookings.createdAt))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ booking: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const sourceDisplay =
      row.sourceApp !== 'tyre_rescue' && row.sourceLabel && row.externalReference
        ? `${row.sourceLabel} reference ${row.externalReference}`
        : null;

    return NextResponse.json(
      {
        booking: {
          id: row.id,
          title: sourceDisplay ? 'New project booking received' : 'Emergency booking received',
          body: sourceDisplay
            ? `${sourceDisplay} — ${row.customerName ?? 'Customer'}`
            : `${row.customerName ?? 'Customer'} — ${row.addressLine ?? 'unknown location'}`,
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
