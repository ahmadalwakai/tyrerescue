import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from "@/ui/StatusPill";
import { colors } from '@/ui/theme';

type NotificationResponse = {
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    severity: string;
    isRead: boolean;
    createdAt: string | null;
  }>;
  unreadCount: number;
  failedNotifications: Array<{
    id: string;
    type: string;
    lastError: string | null;
    bookingRef: string | null;
    createdAt: string | null;
  }>;
};

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<NotificationResponse>({
    queryKey: ['ops-notifications'],
    queryFn: () => apiClient.get('/api/mobile/admin/notifications?limit=30'),
    refetchInterval: 15000,
  });

  const markAll = useMutation({
    mutationFn: () => apiClient.patch('/api/mobile/admin/notifications', { markAllRead: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops-notifications'] }),
  });

  return (
    <Screen>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>Unread admin alerts: {data?.unreadCount ?? 0}</Text>
      <PrimaryButton
        title={markAll.isPending ? 'Marking...' : 'Mark all read'}
        onPress={() => markAll.mutate()}
        disabled={markAll.isPending}
      />

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.notifications?.length && !data?.failedNotifications?.length}
        emptyLabel="No notifications"
      />

      {data?.notifications?.map((item) => (
        <Card key={item.id}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.title}</Text>
              <Text style={styles.meta}>{item.body}</Text>
            </View>
            <StatusChip status={item.severity} />
          </View>
          <Text style={styles.meta}>{item.createdAt || ''}</Text>
        </Card>
      ))}

      <Text style={styles.section}>Failed outbound notifications</Text>
      {data?.failedNotifications?.map((item) => (
        <Card key={item.id}>
          <Text style={styles.name}>{item.type}</Text>
          <Text style={styles.meta}>Booking: {item.bookingRef || 'N/A'}</Text>
          <Text style={styles.meta}>{item.lastError || 'Unknown error'}</Text>
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
    marginTop: 2,
    marginBottom: 8,
    color: colors.textMuted,
  },
  section: {
    marginTop: 8,
    marginBottom: 6,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  rowTop: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  name: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
});
