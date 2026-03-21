import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { VisitorsDashboard } from '@/components/admin/VisitorsDashboard';

export default async function VisitorsPage() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') redirect('/login');

  return <VisitorsDashboard />;
}
