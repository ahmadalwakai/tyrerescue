import { requireAdmin } from '@/lib/auth';
import { SmsClient } from './SmsClient';

export default async function SmsPage() {
  const session = await requireAdmin();
  return <SmsClient />;
}
