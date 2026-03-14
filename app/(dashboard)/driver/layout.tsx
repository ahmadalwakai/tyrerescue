import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db, drivers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { DriverShell } from './DriverShell';

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
    .select({ isOnline: drivers.isOnline })
    .from(drivers)
    .where(eq(drivers.userId, session.user.id))
    .limit(1);

  const isOnline = driver?.isOnline ?? false;

  return (
    <DriverShell userName={session.user.name ?? 'Driver'} isOnline={isOnline}>
      {children}
    </DriverShell>
  );
}
