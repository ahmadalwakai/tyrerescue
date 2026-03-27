import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from "@/ui/StatusPill";
import { colors } from '@/ui/theme';

type CallbackItem = {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  status: string;
  createdAt: string | null;
};

type CallbacksResponse = {
  items: CallbackItem[];
  pendingCount: number;
};

export default function CallbacksScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<CallbacksResponse>({
    queryKey: ['callbacks'],
    queryFn: () => apiClient.get('/api/mobile/admin/callbacks?status=all'),
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiClient.patch(`/api/mobile/admin/callbacks/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['callbacks'] }),
  });

  return (
    <Screen>
      <Text style={styles.title}>Callbacks</Text>
      <Text style={styles.subtitle}>Pending now: {data?.pendingCount ?? 0}</Text>

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No callback requests"
      />

      {data?.items?.map((item) => (
        <Card key={item.id}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.phone}</Text>
              <Text style={styles.meta}>{item.notes || 'No notes'}</Text>
            </View>
            <StatusChip status={item.status} />
          </View>
          <PrimaryButton
            title="Mark resolved"
            onPress={() => mutation.mutate({ id: item.id, status: 'resolved' })}
            disabled={item.status === 'resolved' || mutation.isPending}
          />
          <PrimaryButton
            title="Dismiss"
            variant="neutral"
            onPress={() => mutation.mutate({ id: item.id, status: 'dismissed' })}
            disabled={item.status === 'dismissed' || mutation.isPending}
          />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 3,
    marginBottom: 10,
    color: colors.textMuted,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
});
