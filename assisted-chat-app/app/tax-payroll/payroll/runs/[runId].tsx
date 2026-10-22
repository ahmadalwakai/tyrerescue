import { useLocalSearchParams } from 'expo-router';
import { PayrollWorkspaceScreen } from '@/components/payroll/PayrollWorkspaceScreen';

export default function PayrollRunDetailScreen() {
  const { companyId = '', runId = '' } = useLocalSearchParams<{ companyId: string; runId: string }>();
  return <PayrollWorkspaceScreen companyId={companyId} runId={runId} />;
}
