import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, bookingStatusHistory, drivers, users } from '@/lib/db/schema';
import { eq, and, inArray, lte } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/resend';
import { adminStaleAssignment, type StaleBooking } from '@/lib/email/templates/admin-stale-assignment';

export const dynamic = 'force-dynamic';

const STALE_THRESHOLD_MINUTES = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

  // Find bookings stuck in driver_assigned that were updated before the cutoff
  const staleRows = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      addressLine: bookings.addressLine,
      driverId: bookings.driverId,
      updatedAt: bookings.updatedAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'driver_assigned'),
        lte(bookings.updatedAt, cutoff)
      )
    );

  if (staleRows.length === 0) {
    return NextResponse.json({ stale: 0 });
  }

  // Get driver info for each stale booking
  const driverIds = [...new Set(staleRows.map((r) => r.driverId).filter(Boolean))] as string[];

  const driverRows = driverIds.length > 0
    ? await db
        .select({
          id: drivers.id,
          userId: drivers.userId,
          isOnline: drivers.isOnline,
        })
        .from(drivers)
        .where(inArray(drivers.id, driverIds))
    : [];

  const driverUserIds = driverRows.map((d) => d.userId).filter(Boolean) as string[];
  const userRows = driverUserIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, driverUserIds))
    : [];

  const userMap = new Map(userRows.map((u) => [u.id, u.name ?? 'Unknown']));
  const driverMap = new Map(
    driverRows.map((d) => [d.id, { name: userMap.get(d.userId!) ?? 'Unknown', isOnline: d.isOnline ?? false }])
  );

  const staleBookings: StaleBooking[] = staleRows.map((b) => {
    const driverInfo = b.driverId ? driverMap.get(b.driverId) : undefined;
    const minutesAgo = Math.round((Date.now() - new Date(b.updatedAt!).getTime()) / 60000);
    return {
      refNumber: b.refNumber,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      address: b.addressLine,
      assignedMinutesAgo: minutesAgo,
      driverName: driverInfo?.name ?? 'Unlinked',
      driverOnline: driverInfo?.isOnline ?? false,
    };
  });

  const adminUrl = process.env.NEXTAUTH_URL || 'https://www.tyrerescue.uk';
  const { subject, html } = adminStaleAssignment({ staleBookings, adminUrl });
  const adminEmail = process.env.ADMIN_EMAIL || process.env.RESEND_FROM_EMAIL || 'support@tyrerescue.uk';

  await sendEmail({ to: adminEmail, subject, html });

  return NextResponse.json({ stale: staleBookings.length, notified: true });
}
