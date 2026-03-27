import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '@/api/client';
import { usePollingQuery } from '@/hooks/usePollingQuery';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { colors } from '@/ui/theme';

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
      <Text style={styles.title}>Control Room</Text>
      <Text style={styles.subtitle}>Live operational signal every 20 seconds</Text>

      <StateView loading={isLoading} error={errorMessage} />

      {data ? (
        <>
          <View style={styles.grid}>
            {Object.entries(data.stats).map(([key, value]) => (
              <Card key={key}>
                <Text style={styles.metricLabel}>{key.replace(/([A-Z])/g, ' $1')}</Text>
                <Text style={styles.metricValue}>{value}</Text>
              </Card>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Latest bookings</Text>
          {data.latestBookings.map((booking) => (
            <Pressable
              key={booking.refNumber}
              style={styles.row}
              onPress={() => router.push(`/(tabs)/bookings/${booking.refNumber}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ref}>{booking.refNumber}</Text>
                <Text style={styles.customer}>{booking.customerName}</Text>
                <Text style={styles.muted}>GBP {booking.totalAmount}</Text>
              </View>
              <StatusPill label={booking.status} />
            </Pressable>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: colors.muted,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'capitalize',
  },
  metricValue: {
    fontSize: 24,
    color: colors.text,
    fontWeight: '800',
    marginTop: 6,
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ref: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  customer: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 13,
  },
  muted: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
  },
});
