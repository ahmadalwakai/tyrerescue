import { Stack, useLocalSearchParams } from 'expo-router';

import { useCustomerAccount } from '@/src/customer-account';
import { CustomerServiceReport } from '@/src/customer-service-report';
import { LoadingState } from '@/src/ui';

export default function ServiceReportScreen() {
  const params = useLocalSearchParams<{ ref?: string | string[] }>();
  const { token, loading, sessionRevision } = useCustomerAccount();
  const refNumber = (Array.isArray(params.ref) ? params.ref[0] : params.ref)?.trim().toUpperCase() ?? '';

  return <>
    <Stack.Screen options={{ headerShown: false }} />
    {loading ? <LoadingState label="Loading your account…" /> : <CustomerServiceReport
      key={JSON.stringify([refNumber, token, sessionRevision])} refNumber={refNumber} token={token} />}
  </>;
}
