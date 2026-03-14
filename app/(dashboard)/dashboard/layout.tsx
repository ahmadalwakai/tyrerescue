import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { DashboardShell } from './DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  if (session.user.role !== 'customer' && session.user.role !== 'admin') {
    redirect('/login');
  }

  return (
    <DashboardShell userName={session.user.name ?? 'Customer'}>
      {children}
    </DashboardShell>
  );
}
