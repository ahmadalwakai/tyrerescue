import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/api/client';
import { useAuth } from '@/auth/context';
import { usePollingQuery } from '@/hooks/usePollingQuery';
import { normalizeDriverSituation } from '@/lib/driverSituation';
import type { DriverSituation } from '@/types/driverSituation';
import {
  AdminShell,
  BookingCard,
  FilterChip,
  GlassCard,
  MetricCard,
  MiniChart,
  ProgressRing,
  QuickActionCard,
  SearchBar,
  StatePanel,
  StatusBadge,
  colors,
  spacing,
  typography,
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
  };
  latestBookings: Array<{
    id: string;
    refNumber: string;
    status: string;
    bookingType: string;
    customerName: string;
    totalAmount: string;
    createdAt: string | null;
    driverSituation?: DriverSituation | null;
  }>;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = usePollingQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get('/api/mobile/admin/dashboard'),
    intervalMs: 20_000,
  });

  const errorMessage = error instanceof Error ? error.message : null;
  const activeShare = data?.stats.totalBookings
    ? Math.round((data.stats.activeBookings / data.stats.totalBookings) * 100)
    : 0;

  const filteredBookings = useMemo(() => {
    const items = data?.latestBookings ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.refNumber, item.customerName, item.status, item.bookingType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data?.latestBookings, search]);

  const chartData = useMemo(
    () => (data?.latestBookings ?? []).slice(0, 8).map((item) => Number(item.totalAmount) || 0).reverse(),
    [data?.latestBookings],
  );

  return (
    <AdminShell
      title="Dashboard"
      subtitle="Operations overview"
      notificationCount={data?.stats.unreadAdminAlerts}
    >
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.greeting}>Good morning,</Text>
          <Text style={styles.name} numberOfLines={1}>
            {user?.name || 'Admin'}
          </Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Online</Text>
          </View>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="shield-checkmark" size={28} color={colors.success} />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search bookings, customers, status..." />

      <View style={styles.metricsGrid}>
        <MetricCard
          label="Bookings"
          value={data?.stats.totalBookings ?? 0}
          helper={`${data?.stats.activeBookings ?? 0} active`}
          icon="calendar-outline"
          accent="blue"
          animatedIndex={0}
        />
        <MetricCard
          label="Active Jobs"
          value={data?.stats.activeBookings ?? 0}
          helper="On the road"
          icon="briefcase-outline"
          accent="orange"
          animatedIndex={1}
        />
        <MetricCard
          label="Alerts"
          value={data?.stats.unreadAdminAlerts ?? 0}
          helper="Needs action"
          icon="alert-circle-outline"
          accent={(data?.stats.unreadAdminAlerts ?? 0) > 0 ? 'red' : 'green'}
          animatedIndex={2}
        />
        <MetricCard
          label="Drivers"
          value={data?.stats.onlineDrivers ?? 0}
          helper="Online now"
          icon="people-outline"
          accent="green"
          animatedIndex={3}
        />
      </View>

      <StatePanel
        loading={isLoading}
        error={errorMessage}
        empty={!isLoading && !errorMessage && !data}
        emptyLabel="Dashboard data is not available."
        onRetry={() => refetch()}
      />

      {data ? (
        <>
          <GlassCard animatedIndex={4} style={styles.overviewCard} accent="green">
            <View style={styles.sectionTop}>
              <View>
                <Text style={styles.sectionTitle}>Live Overview</Text>
                <Text style={styles.sectionSubtitle}>Current operating load</Text>
              </View>
              <FilterChip label="Today" active accent="blue" />
            </View>
            <View style={styles.overviewBody}>
              <ProgressRing value={activeShare} label="Active" accent="green" />
              <View style={styles.overviewStats}>
                <View style={styles.overviewRow}>
                  <Text style={styles.overviewLabel}>Total Bookings</Text>
                  <Text style={styles.overviewValue}>{data.stats.totalBookings}</Text>
                </View>
                <View style={styles.overviewRow}>
                  <Text style={styles.overviewLabel}>Active Bookings</Text>
                  <Text style={styles.overviewValue}>{data.stats.activeBookings}</Text>
                </View>
                <View style={styles.overviewRow}>
                  <Text style={styles.overviewLabel}>Unread Messages</Text>
                  <Text style={styles.overviewValue}>{data.stats.unreadMessages}</Text>
                </View>
                <View style={styles.overviewRow}>
                  <Text style={styles.overviewLabel}>Low Stock</Text>
                  <Text style={styles.overviewValue}>{data.stats.lowStockProducts}</Text>
                </View>
              </View>
            </View>
            <MiniChart data={chartData} accent="blue" />
          </GlassCard>

          <View style={styles.sectionTop}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <Text style={styles.linkText}>Customize</Text>
          </View>
          <View style={styles.actionsGrid}>
            <QuickActionCard
              title="New Booking"
              subtitle="Open bookings"
              icon="add"
              accent="green"
              onPress={() => router.push('/(tabs)/bookings')}
              animatedIndex={5}
            />
            <QuickActionCard
              title="Dispatch"
              subtitle="Live jobs"
              icon="car"
              accent="blue"
              onPress={() => router.push('/(tabs)/ops')}
              animatedIndex={6}
            />
            <QuickActionCard
              title="Map View"
              subtitle="Driver tracking"
              icon="map-outline"
              accent="purple"
              onPress={() => router.push('/(tabs)/drivers/tracking')}
              animatedIndex={7}
            />
            <QuickActionCard
              title="Messages"
              subtitle={`${data.stats.unreadMessages} unread`}
              icon="chatbubble-ellipses"
              accent="orange"
              onPress={() => router.push('/(tabs)/ops/messages')}
              animatedIndex={8}
            />
          </View>

          <View style={styles.sectionTop}>
            <Text style={styles.sectionTitle}>Recent Jobs</Text>
            <Text style={styles.linkText} onPress={() => router.push('/(tabs)/bookings')}>
              View all
            </Text>
          </View>
          {filteredBookings.length === 0 ? (
            <StatePanel empty emptyLabel="No matching bookings." />
          ) : (
            filteredBookings.slice(0, 4).map((booking, index) => {
              const situation = normalizeDriverSituation(booking.driverSituation);
              return (
                <BookingCard
                  key={booking.refNumber}
                  refNumber={booking.refNumber}
                  customerName={booking.customerName}
                  serviceType={booking.bookingType}
                  status={booking.status}
                  scheduledAt={booking.createdAt}
                  totalAmount={booking.totalAmount}
                  driverLabel={situation.status !== 'unavailable' ? situation.label : null}
                  onPress={() => router.push(`/(tabs)/bookings/${booking.refNumber}`)}
                  animatedIndex={index + 9}
                />
              );
            })
          )}
        </>
      ) : null}

      <View style={styles.footerStatus}>
        <StatusBadge status={(data?.stats.openChatConversations ?? 0) > 0 ? 'open' : 'read'} label={`${data?.stats.openChatConversations ?? 0} open chats`} />
        <StatusBadge status={(data?.stats.pendingCallbacks ?? 0) > 0 ? 'pending' : 'completed'} label={`${data?.stats.pendingCallbacks ?? 0} callbacks`} />
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    color: colors.textMuted,
    fontSize: 12,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: typography.weight.bold,
    marginTop: 2,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  onlineText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
  },
  heroBadge: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: 'rgba(45, 219, 117, 0.35)',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  overviewCard: {
    paddingBottom: spacing.lg,
  },
  sectionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: typography.weight.bold,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  linkText: {
    color: colors.active,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
  },
  overviewBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  overviewStats: {
    flex: 1,
    gap: spacing.sm,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  overviewLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  overviewValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: typography.weight.bold,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  footerStatus: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
