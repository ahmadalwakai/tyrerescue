import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from "@/ui/StatusPill";
import { colors } from '@/ui/theme';

type InvoiceDetail = {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    customerName: string;
    customerEmail: string;
    totalAmount: string;
  };
  items: Array<{ id: string; description: string; quantity: number; totalPrice: string }>;
};

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading, error } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', id],
    queryFn: () => apiClient.get(`/api/mobile/admin/invoices/${id}`),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: () => apiClient.patch(`/api/mobile/admin/invoices/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/mobile/admin/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      router.back();
    },
  });

  return (
    <Screen>
      <StateView loading={isLoading} error={error instanceof Error ? error.message : null} />

      {data ? (
        <>
          <Card>
            <Text style={styles.title}>{data.invoice.invoiceNumber}</Text>
            <StatusChip status={data.invoice.status} />
            <Text style={styles.meta}>{data.invoice.customerName}</Text>
            <Text style={styles.meta}>{data.invoice.customerEmail}</Text>
            <Text style={styles.meta}>GBP {data.invoice.totalAmount}</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Line items</Text>
            {data.items.map((item) => (
              <Text key={item.id} style={styles.meta}>{item.quantity}x {item.description} • GBP {item.totalPrice}</Text>
            ))}
          </Card>

          <Card>
            <Text style={styles.section}>Update status</Text>
            <InputField label="Status" value={status} onChangeText={setStatus} placeholder="issued | sent | paid | cancelled" />
            <PrimaryButton
              title={updateMutation.isPending ? 'Updating...' : 'Save status'}
              onPress={() => updateMutation.mutate()}
              disabled={!status || updateMutation.isPending}
            />
            <PrimaryButton
              title={deleteMutation.isPending ? 'Deleting...' : 'Delete invoice'}
              variant="danger"
              disabled={deleteMutation.isPending}
              onPress={() =>
                Alert.alert('Delete invoice', 'This performs a soft delete.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
                ])
              }
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  meta: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 12,
  },
});
