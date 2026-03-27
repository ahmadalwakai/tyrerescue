import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { InputField } from '@/ui/InputField';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { colors } from '@/ui/theme';

type BookingItem = {
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  customerName: string;
  customerPhone: string;
  totalAmount: string;
  scheduledAt: string | null;
  createdAt: string | null;
  driverName: string | null;
};

type BookingsResponse = {
  items: BookingItem[];
  totalCount: number;
};

export default function BookingsListScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('all');

  const { data, isLoading, error, refetch, isFetching } = useQuery<BookingsResponse>({
    queryKey: ['bookings', appliedSearch, appliedStatus],
    queryFn: () =>
      apiClient.get(
        `/api/mobile/admin/bookings?search=${encodeURIComponent(appliedSearch)}&status=${encodeURIComponent(
          appliedStatus,
        )}`,
      ),
  });

  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <Screen>
      <Text style={styles.title}>Bookings</Text>
      <Text style={styles.subtitle}>Search by ref, customer, email, or tyre size</Text>

      <View style={styles.filters}>
        <InputField label="Search" value={search} onChangeText={setSearch} placeholder="TR-12345 or customer name" />
        <InputField
          label="Status"
          value={status}
          onChangeText={setStatus}
          placeholder="all | paid | driver_assigned | completed"
        />
        <PrimaryButton
          title={isFetching ? 'Refreshing...' : 'Apply filters'}
          onPress={() => {
            setAppliedSearch(search);
            setAppliedStatus(status || 'all');
          }}
          disabled={isFetching}
        />
      </View>

      <StateView loading={isLoading} error={errorMessage} empty={!data?.items?.length} emptyLabel="No bookings found." />

      {data?.items?.map((booking) => (
        <Pressable key={booking.refNumber} style={styles.row} onPress={() => router.push(`/(tabs)/bookings/${booking.refNumber}`)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ref}>{booking.refNumber}</Text>
            <Text style={styles.meta}>{booking.customerName} • {booking.serviceType}</Text>
            <Text style={styles.meta}>Driver: {booking.driverName || 'Unassigned'}</Text>
            <Text style={styles.meta}>GBP {booking.totalAmount}</Text>
          </View>
          <StatusPill label={booking.status} />
        </Pressable>
      ))}

      <View style={styles.footer}>
        <Text style={styles.meta}>Total {data?.totalCount ?? 0} bookings</Text>
        <PrimaryButton title="Manual refresh" onPress={() => refetch()} tone="neutral" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    color: colors.muted,
    fontSize: 13,
  },
  filters: {
    marginBottom: 12,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ref: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },
  footer: {
    marginTop: 6,
    marginBottom: 18,
  },
});
