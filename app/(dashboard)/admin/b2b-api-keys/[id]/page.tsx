import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { B2BKeyDetailClient } from './B2BKeyDetailClient';

type Props = { params: Promise<{ id: string }> };

export default async function B2BKeyDetailPage({ params }: Props) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    redirect('/login');
  }

  const { id } = await params;
  return <B2BKeyDetailClient clientId={id} />;
}
