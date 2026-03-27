import { StyleSheet, Text } from 'react-native';
import { usePollingQuery } from '@/hooks/usePollingQuery';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { StateView } from '@/ui/StateView';
import { colors } from '@/ui/theme';

type AnalyticsPayload = {
  bookings: { total: number; completed: number; revenue: string };
  visitors: { total: number; live: number; avgSessionSeconds: number };
  demandHistory: Array<{ hourStart: string | null; pageViews: number; callClicks: number; bookingStarts: number }>;
};

export default function AnalyticsScreen() {
  const { data, isLoading, error } = usePollingQuery<AnalyticsPayload>({
    queryKey: ['insights-analytics'],
    queryFn: () => apiClient.get('/api/mobile/admin/analytics'),
    intervalMs: 30000,
  });

  return (
    <Screen>
      <Text style={styles.title}>Analytics</Text>
      <StateView loading={isLoading} error={error instanceof Error ? error.message : null} />

      {data ? (
        <>
          <Card>
            <Text style={styles.section}>Bookings (30d)</Text>
            <Text style={styles.value}>Total: {data.bookings.total}</Text>
            <Text style={styles.value}>Completed: {data.bookings.completed}</Text>
            <Text style={styles.value}>Revenue: GBP {data.bookings.revenue}</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Visitors (30d)</Text>
            <Text style={styles.value}>Total: {data.visitors.total}</Text>
            <Text style={styles.value}>Live: {data.visitors.live}</Text>
            <Text style={styles.value}>Avg session: {data.visitors.avgSessionSeconds}s</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Demand snapshots</Text>
            {data.demandHistory.slice(0, 10).map((row, idx) => (
              <Text key={`${row.hourStart || idx}`} style={styles.value}>
                {row.hourStart || '-'} • views {row.pageViews} • calls {row.callClicks} • starts {row.bookingStarts}
              </Text>
            ))}
          </Card>
        </>
      ) : null}
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
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  value: {
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 12,
  },
});
