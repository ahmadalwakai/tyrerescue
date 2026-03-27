import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '@/api/client';
import { usePollingQuery } from '@/hooks/usePollingQuery';
import {
  Screen,
  SectionHeader,
  ActionTile,
  KPICard,
  ListRow,
  StateView,
  StatusChip,
  colors,
  radius,
  spacing,
} from '@/ui';

type DashboardResponse = {
  stats: {
    totalBookings: number;
    activeBookings: number;
    onlineDrivers: number;
    lowStockProducts: number;
    unreadMessages: number;
    pendingCallbacks: number;
    unreadAdminAlerts: number;
    openChatConversations: number;
    totalRevenue?: number;
    pendingPayments?: number;
  };
  latestBookings: Array<{
    refNumber: string;
    status: string;
    customerName: string;
    totalAmount: string;
    createdAt: string | null;
  }>;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { data, isLoading, error } = usePollingQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get('/api/mobile/admin/dashboard'),
    intervalMs: 20_000,
  });

  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <Screen>
      {/* KPI Strip */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCell}>
          <KPICard
            label="Active Bookings"
            value={data?.stats.activeBookings ?? 0}
            size="sm"
            trend="up"
            trendValue="+5 today"
          />
        </View>
        <View style={styles.kpiCell}>
          <KPICard
            label="Online Drivers"
            value={data?.stats.onlineDrivers ?? 0}
            size="sm"
            trend="neutral"
          />
        </View>
        <View style={styles.kpiCell}>
          <KPICard
            label="Revenue"
            value={data?.stats.totalRevenue ? `£${data.stats.totalRevenue}` : '—'}
            size="sm"
          />
        </View>
        <View style={styles.kpiCell}>
          <KPICard
            label="Pending"
            value={data?.stats.pendingPayments ?? 0}
            size="sm"
            trend="down"
            trendValue="2 overdue"
          />
        </View>
      </View>

      {/* Quick Actions */}
      <SectionHeader title="Quick Actions" />
      <View style={styles.actionGrid}>
        <View style={styles.actionCell}>
          <ActionTile
            title="Bookings"
            onPress={() => router.push('/(tabs)/bookings')}
            variant="primary"
          />
        </View>
        <View style={styles.actionCell}>
          <ActionTile
            title="Drivers"
            onPress={() => router.push('/(tabs)/drivers')}
          />
        </View>
        <View style={styles.actionCell}>
          <ActionTile
            title="Inventory"
            onPress={() => router.push('/(tabs)/inventory')}
          />
        </View>
        <View style={styles.actionCell}>
          <ActionTile
            title="Analytics"
            onPress={() => router.push('/(tabs)/insights')}
          />
        </View>
      </View>

      {/* Recent Bookings Section */}
      <SectionHeader title="Recent Bookings" action="View All" onActionPress={() => router.push('/(tabs)/bookings')} />

      <StateView loading={isLoading} error={errorMessage} empty={!data?.latestBookings?.length} />

      {data?.latestBookings && data.latestBookings.length > 0 && (
        <View style={styles.bookingsList}>
          {data.latestBookings.slice(0, 5).map((booking) => (
            <ListRow
              key={booking.refNumber}
              title={booking.refNumber}
              subtitle={booking.totalAmount ? `${booking.customerName} · £${booking.totalAmount}` : booking.customerName}
              rightContent={<StatusChip status={booking.status} />}
              onPress={() => router.push(`/(tabs)/bookings/${booking.refNumber}`)}
              divider
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  kpiCell: {
    width: '48%',
    flexGrow: 1,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  actionCell: {
    width: '48%',
  },
  bookingsList: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
