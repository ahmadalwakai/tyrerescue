import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, notifications } from '@/lib/db/schema';
import { eq, and, gte, lte, isNull } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find bookings scheduled in the next 24 hours that are paid
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcoming = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      scheduledAt: bookings.scheduledAt,
      serviceType: bookings.serviceType,
      addressLine: bookings.addressLine,
      userId: bookings.userId,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'paid'),
        gte(bookings.scheduledAt, now),
        lte(bookings.scheduledAt, in24h)
      )
    );

  let sent = 0;

  for (const booking of upcoming) {
    // Create notification record
    const [notification] = await db
      .insert(notifications)
      .values({
        userId: booking.userId,
        bookingId: booking.id,
        type: 'booking_reminder',
        channel: 'email',
        status: 'pending',
      })
      .returning({ id: notifications.id });

    const scheduledTime = booking.scheduledAt
      ? new Date(booking.scheduledAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })
      : 'your scheduled time';

    await sendEmail({
      to: booking.customerEmail,
      subject: `Reminder: Your Tyre Rescue booking ${booking.refNumber}`,
      html: `
        <h2>Booking Reminder</h2>
        <p>Hi ${booking.customerName},</p>
        <p>This is a reminder that your <strong>${booking.serviceType}</strong> booking is scheduled for <strong>${scheduledTime}</strong>.</p>
        <p><strong>Location:</strong> ${booking.addressLine}</p>
        <p><strong>Reference:</strong> ${booking.refNumber}</p>
        <p>You can track your driver on the day at: ${process.env.NEXT_PUBLIC_APP_URL}/tracking/${booking.refNumber}</p>
        <p>Thanks,<br/>Tyre Rescue</p>
      `,
      notificationId: notification.id,
    });

    sent++;
  }

  return NextResponse.json({ reminders: sent });
}
