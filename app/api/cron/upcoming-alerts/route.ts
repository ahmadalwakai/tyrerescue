import { NextResponse } from 'next/server';
import { db, bookings, driverNotifications } from '@/lib/db';
import { eq, and, isNotNull, gte, lte, notInArray } from 'drizzle-orm';
import { notifyDriverUpcomingJob } from '@/lib/notifications/driver-push';

/**
 * Cron: Upcoming Job Alert v2
 *
 * Runs every 5 minutes. Finds scheduled bookings starting within the next 30 minutes
 * that have an assigned driver who hasn't been reminded yet.
 * Sends an urgent push notification to each affected driver.
 *
 * Dedupe: checks driverNotifications for existing upcoming_v2 entries for this booking ref.
 */

const REMINDER_WINDOW_MINUTES = 30;

export async function GET() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

  try {
    // Find scheduled bookings within the reminder window that have assigned drivers
    const upcomingBookings = await db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        addressLine: bookings.addressLine,
        scheduledAt: bookings.scheduledAt,
        driverId: bookings.driverId,
      })
      .from(bookings)
      .where(
        and(
          isNotNull(bookings.driverId),
          isNotNull(bookings.scheduledAt),
          gte(bookings.scheduledAt, now),
          lte(bookings.scheduledAt, windowEnd),
          notInArray(bookings.status, [
            'completed', 'cancelled', 'refunded', 'refunded_partial',
            'cancelled_refund_pending', 'en_route', 'arrived', 'in_progress',
          ]),
        ),
      );

    let sentCount = 0;

    for (const booking of upcomingBookings) {
      if (!booking.driverId || !booking.scheduledAt) continue;

      // Dedupe: check if we already sent an upcoming_v2 notification for this booking
      const [existing] = await db
        .select({ id: driverNotifications.id })
        .from(driverNotifications)
        .where(
          and(
            eq(driverNotifications.driverId, booking.driverId),
            eq(driverNotifications.type, 'upcoming_v2'),
            eq(driverNotifications.bookingRef, booking.refNumber),
          ),
        )
        .limit(1);

      if (existing) continue;

      const minutesUntil = Math.round(
        (new Date(booking.scheduledAt).getTime() - now.getTime()) / 60_000,
      );

      let sent = await notifyDriverUpcomingJob(
        booking.driverId,
        booking.refNumber,
        booking.addressLine,
        minutesUntil,
      );
      if (!sent) {
        sent = await notifyDriverUpcomingJob(
          booking.driverId,
          booking.refNumber,
          booking.addressLine,
          minutesUntil,
        );
      }
      if (sent) {
        sentCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      checked: upcomingBookings.length,
      sent: sentCount,
    });
  } catch (err) {
    console.error('[cron/upcoming-alerts] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
