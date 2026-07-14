import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { usePollingQuery } from '@/hooks/usePollingQuery';
import {
  AdminShell,
  GlassCard,
  MetricCard,
  MiniChart,
  StatePanel,
  colors,
  formatMoney,
  spacing,
  typography,
} from '@/ui';

type AnalyticsPayload = {
  bookings: { total: number; completed: number; revenue: string };
  visitors: { total: number; live: number; avgSessionSeconds: number };
  demandHistory: Array<{ hourStart: string | null; pageViews: number; callClicks: number; bookingStarts: number }>;
};

type DriverRow = {
  id: string;
  name: string;
  status: string;
};

type DriversResponse = {
  items: DriverRow[];
};

type DriverDetail = {
  id: string;
  name: string;
  completedJobs: number;
  totalJobs: number;
};

export default function AnalyticsScreen() {
  const analytics = usePollingQuery<AnalyticsPayload>({
    queryKey: ['insights-analytics'],
    queryFn: () => apiClient.get('/api/mobile/admin/analytics'),
    intervalMs: 30000,
  });

  const drivers = useQuery<DriversResponse>({
    queryKey: ['analytics-drivers'],
    queryFn: () => apiClient.get('/api/mobile/admin/drivers?perPage=10'),
  });

  const driverDetails = useQueries({
    queries: (drivers.data?.items ?? []).slice(0, 5).map((driver) => ({
      queryKey: ['analytics-driver-detail', driver.id],
      queryFn: () => apiClient.get<DriverDetail>(`/api/mobile/admin/drivers/${driver.id}`),
      enabled: Boolean(driver.id),
    })),
  });

  const topDrivers = useMemo(() => {
    return driverDetails
      .map((query) => query.data)
      .filter((item): item is DriverDetail => Boolean(item))
      .sort((a, b) => b.completedJobs - a.completedJobs)
      .slice(0, 3);
  }, [driverDetails]);

  const chartData = useMemo(
    () => (analytics.data?.demandHistory ?? []).slice(0, 12).map((item) => item.bookingStarts).reverse(),
    [analytics.data?.demandHistory],
  );

  const errorMessage = analytics.error instanceof Error ? analytics.error.message : null;

  return (
    <AdminShell title="Analytics" subtitle="Insights & performance">
      <View style={styles.metricsGrid}>
        <MetricCard
          label="Revenue"
          value={formatMoney(analytics.data?.bookings.revenue) || 'N/A'}
          helper="30 days"
          icon="cash-outline"
          accent="green"
          animatedIndex={0}
        />
        <MetricCard
          label="Bookings"
          value={analytics.data?.bookings.total ?? 0}
          helper="30 days"
          icon="calendar-outline"
          accent="blue"
          animatedIndex={1}
        />
        <MetricCard
          label="Completed"
          value={analytics.data?.bookings.completed ?? 0}
          helper="Closed jobs"
          icon="checkmark-done-outline"
          accent="orange"
          animatedIndex={2}
        />
        <MetricCard
          label="Live Visitors"
          value={analytics.data?.visitors.live ?? 0}
          helper={`${analytics.data?.visitors.total ?? 0} total`}
          icon="pulse-outline"
          accent="purple"
          animatedIndex={3}
        />
      </View>

      <StatePanel
        loading={analytics.isLoading}
        error={errorMessage}
        empty={!analytics.isLoading && !errorMessage && !analytics.data}
        emptyLabel="Analytics are not available."
        onRetry={() => analytics.refetch()}
      />

      {analytics.data ? (
        <GlassCard accent="blue" animatedIndex={4}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Bookings Overview</Text>
              <Text style={styles.mutedText}>Booking starts from demand snapshots</Text>
            </View>
            <Ionicons name="analytics" size={22} color={colors.active} />
          </View>
          <MiniChart data={chartData} accent="blue" />
        </GlassCard>
      ) : null}

      <GlassCard accent="green" animatedIndex={5}>
        <Text style={styles.sectionTitle}>Top Performing Drivers</Text>
        <StatePanel
          loading={drivers.isLoading || driverDetails.some((query) => query.isLoading)}
          error={drivers.error instanceof Error ? drivers.error.message : null}
          empty={!topDrivers.length}
          emptyLabel="No driver performance data returned yet."
        />
        {topDrivers.map((driver, index) => (
          <View key={driver.id} style={styles.driverRow}>
            <View style={styles.rank}>
              <Text style={styles.rankText}>{index + 1}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.driverName}>{driver.name}</Text>
              <Text style={styles.mutedText}>{driver.totalJobs} total jobs</Text>
            </View>
            <Text style={styles.driverScore}>{driver.completedJobs}</Text>
          </View>
        ))}
      </GlassCard>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: typography.weight.bold,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  driverRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: typography.weight.bold,
  },
  driverName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
  driverScore: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
});
