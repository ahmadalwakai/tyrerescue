import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/api/client';
import {
  AdminShell,
  AlertCard,
  GlassCard,
  MetricCard,
  PressScale,
  StatePanel,
  colors,
  formatShortDate,
  spacing,
  typography,
} from '@/ui';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  severity: string;
  isRead: boolean;
  createdAt: string | null;
};

type FailedNotification = {
  id: string;
  type: string;
  lastError: string | null;
  bookingRef: string | null;
  createdAt: string | null;
};

type NotificationResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
  failedNotifications: FailedNotification[];
};

function isToday(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isThisWeek(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000 && !isToday(value);
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<NotificationResponse>({
    queryKey: ['ops-notifications'],
    queryFn: () => apiClient.get('/api/mobile/admin/notifications?limit=30'),
    refetchInterval: 15000,
  });

  const markAll = useMutation({
    mutationFn: () => apiClient.patch('/api/mobile/admin/notifications', { markAllRead: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops-notifications'] }),
  });

  const grouped = useMemo(() => {
    const items = data?.notifications ?? [];
    return {
      today: items.filter((item) => isToday(item.createdAt)),
      week: items.filter((item) => isThisWeek(item.createdAt)),
      older: items.filter((item) => !isToday(item.createdAt) && !isThisWeek(item.createdAt)),
    };
  }, [data?.notifications]);

  const readCount = (data?.notifications ?? []).filter((item) => item.isRead).length;
  const totalVisible = (data?.notifications?.length ?? 0) + (data?.failedNotifications?.length ?? 0);
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <AdminShell
      title="Alerts & Notifications"
      subtitle="Stay updated"
      notificationCount={data?.unreadCount}
    >
      <View style={styles.metricsGrid}>
        <MetricCard label="Unread" value={data?.unreadCount ?? 0} helper="Needs action" icon="alert-circle-outline" accent="red" animatedIndex={0} />
        <MetricCard label="Read" value={readCount} helper="Visible page" icon="checkmark-done-outline" accent="blue" animatedIndex={1} />
        <MetricCard label="Total" value={totalVisible} helper="Loaded alerts" icon="notifications-outline" accent="muted" animatedIndex={2} />
      </View>

      <PressScale
        style={styles.markButton}
        onPress={() => markAll.mutate()}
        disabled={markAll.isPending || (data?.unreadCount ?? 0) === 0}
      >
        <Ionicons name="checkmark-circle" size={18} color={colors.text} />
        <Text style={styles.markButtonText}>{markAll.isPending ? 'Marking...' : 'Mark all read'}</Text>
      </PressScale>

      <StatePanel
        loading={isLoading}
        error={errorMessage}
        empty={!isLoading && !errorMessage && totalVisible === 0}
        emptyLabel="No alerts or notification failures."
        onRetry={() => refetch()}
      />

      <AlertGroup title="Today" items={grouped.today} startIndex={3} />
      <AlertGroup title="This Week" items={grouped.week} startIndex={grouped.today.length + 3} />
      <AlertGroup title="Older" items={grouped.older} startIndex={grouped.today.length + grouped.week.length + 3} />

      {data?.failedNotifications?.length ? (
        <>
          <Text style={styles.groupTitle}>Failed Outbound Notifications</Text>
          {data.failedNotifications.map((item, index) => (
            <GlassCard key={item.id} accent="red" urgent animatedIndex={index}>
              <View style={styles.failedTop}>
                <Ionicons name="warning" size={19} color={colors.error} />
                <Text style={styles.failedTitle}>{item.type}</Text>
                <Text style={styles.failedTime}>{formatShortDate(item.createdAt)}</Text>
              </View>
              <Text style={styles.failedBody}>Booking: {item.bookingRef || 'N/A'}</Text>
              <Text style={styles.failedBody}>{item.lastError || 'Unknown error'}</Text>
            </GlassCard>
          ))}
        </>
      ) : null}
    </AdminShell>
  );
}

function AlertGroup({
  title,
  items,
  startIndex,
}: {
  title: string;
  items: NotificationItem[];
  startIndex: number;
}) {
  if (!items.length) return null;
  return (
    <>
      <Text style={styles.groupTitle}>{title}</Text>
      {items.map((item, index) => (
        <AlertCard
          key={item.id}
          title={item.title}
          body={item.body}
          severity={item.severity}
          isRead={item.isRead}
          createdAt={item.createdAt}
          animatedIndex={startIndex + index}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  markButton: {
    minHeight: 48,
    borderRadius: 17,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  markButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: typography.weight.bold,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  failedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  failedTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
  failedTime: {
    color: colors.textMuted,
    fontSize: 10,
  },
  failedBody: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
});
