import { Stack } from 'expo-router';
import { useCustomerAccount } from '@/src/customer-account';
import { CustomerInvoices } from '@/src/customer-invoices';

export default function InvoicesScreen() {
  const account = useCustomerAccount();
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <CustomerInvoices key={`${account.profile?.id ?? 'guest'}-${account.sessionRevision}`} account={account} />
  </>;
}
