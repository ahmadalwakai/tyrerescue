import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { colors } from '@/ui/theme';

type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  status: string;
  customerName: string;
  totalAmount: string;
  createdAt: string | null;
};

type InvoiceResponse = {
  items: InvoiceItem[];
};

export default function InvoicesScreen() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery<InvoiceResponse>({
    queryKey: ['invoices'],
    queryFn: () => apiClient.get('/api/mobile/admin/invoices'),
  });

  return (
    <Screen>
      <Text style={styles.title}>Invoices</Text>
      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No invoices"
      />

      {data?.items?.map((item) => (
        <Pressable key={item.id} style={styles.row} onPress={() => router.push(`/(tabs)/finance/invoices/${item.id}`)}>
          <Text style={styles.name}>{item.invoiceNumber}</Text>
          <Text style={styles.meta}>{item.customerName}</Text>
          <Text style={styles.meta}>GBP {item.totalAmount}</Text>
          <StatusPill label={item.status} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  name: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  meta: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 12,
  },
});
