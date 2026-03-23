import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db, drivers, bookings } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { DriverShell } from './DriverShell';
import { getDriverPresenceState, PRESENCE_LABELS, type DriverPresenceState } from '@/lib/driver-presence';

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  if (session.user.role !== 'driver') {
    redirect('/login');
  }

  const [driver] = await db
    .select({
      id: drivers.id,
      isOnline: drivers.isOnline,
      locationAt: drivers.locationAt,
      status: drivers.status,
    })
    .from(drivers)
    .where(eq(drivers.userId, session.user.id))
    .limit(1);

  const isOnline = driver?.isOnline ?? false;

  // Compute presence state for the shell header badge
  let presenceState: DriverPresenceState = 'offline';
  if (driver) {
    const [activeBooking] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driver.id),
          inArray(bookings.status, ['driver_assigned', 'en_route', 'arrived', 'in_progress']),
        ),
      )
      .limit(1);

    presenceState = getDriverPresenceState(
      { isOnline: driver.isOnline ?? false, locationAt: driver.locationAt, status: driver.status },
      activeBooking ?? null,
    );
  }

  return (
    <DriverShell userName={session.user.name ?? 'Driver'} isOnline={isOnline} presenceState={presenceState}>
      {children}
    </DriverShell>
  );
}
