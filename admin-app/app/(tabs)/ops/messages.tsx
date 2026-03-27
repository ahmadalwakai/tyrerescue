import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { colors } from '@/ui/theme';

type MessageItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: string;
  createdAt: string | null;
};

type MessagesResponse = {
  items: MessageItem[];
  unreadCount: number;
};

export default function MessagesScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<MessagesResponse>({
    queryKey: ['messages'],
    queryFn: () => apiClient.get('/api/mobile/admin/messages?status=all'),
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiClient.patch(`/api/mobile/admin/messages/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }),
  });

  return (
    <Screen>
      <Text style={styles.title}>Messages</Text>
      <Text style={styles.subtitle}>Unread: {data?.unreadCount ?? 0}</Text>

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No messages"
      />

      {data?.items?.map((item) => (
        <Card key={item.id}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.email}</Text>
              <Text style={styles.meta}>{item.message}</Text>
            </View>
            <StatusPill label={item.status} />
          </View>
          <PrimaryButton
            title="Mark read"
            onPress={() => mutation.mutate({ id: item.id, status: 'read' })}
            disabled={item.status === 'read' || mutation.isPending}
          />
          <PrimaryButton
            title="Mark replied"
            tone="neutral"
            onPress={() => mutation.mutate({ id: item.id, status: 'replied' })}
            disabled={item.status === 'replied' || mutation.isPending}
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
    color: colors.muted,
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
    color: colors.muted,
  },
});
