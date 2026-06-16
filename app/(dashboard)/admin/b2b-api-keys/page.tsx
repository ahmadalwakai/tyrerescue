import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { B2BApiKeysClient } from './B2BApiKeysClient';

export default async function B2BApiKeysPage() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    redirect('/login');
  }

  return <B2BApiKeysClient />;
}
