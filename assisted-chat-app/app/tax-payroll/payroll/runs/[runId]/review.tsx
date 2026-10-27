import { useLocalSearchParams } from 'expo-router';
import { PayrollWorkspaceScreen } from '@/components/payroll/PayrollWorkspaceScreen';

/** Keep review links on the same verified figures and confirmation flow. */
export default function PayRunReviewScreen() {
  const { companyId = '', runId = '' } = useLocalSearchParams<{ companyId: string; runId: string }>();
  return <PayrollWorkspaceScreen companyId={companyId} runId={runId} />;
}