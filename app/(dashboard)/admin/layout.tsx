import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AdminShell } from './AdminShell';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  if (session.user.role !== 'admin') {
    redirect('/login');
  }

  return (
    <AdminShell userName={session.user.name ?? 'Admin'}>
      {children}
    </AdminShell>
  );
}
