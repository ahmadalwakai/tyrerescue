import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { normalizeDriverSituation } from '@/lib/driverSituation';
import type { DriverSituation } from '@/types/driverSituation';
import {
  AdminShell,
  BookingCard,
  FilterChip,
  SearchBar,
  StatePanel,
  colors,
  spacing,
  typography,
} from '@/ui';

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
  driverSituation?: DriverSituation | null;
};

type BookingsResponse = {
  items: BookingItem[];
  totalCount: number;
};

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
];

const sortOptions = [
  { label: 'Soonest first', value: 'soonest' },
  { label: 'Newest', value: 'newest' },
  { label: 'Highest value', value: 'value' },
];

export default function BookingsListScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('soonest');

  const { data, isLoading, error, refetch, isFetching } = useQuery<BookingsResponse>({
    queryKey: ['bookings', search, status],
    queryFn: () =>
      apiClient.get(
        `/api/mobile/admin/bookings?search=${encodeURIComponent(search.trim())}&status=${encodeURIComponent(status)}`,
      ),
  });

  const sortedItems = useMemo(() => {
    const items = [...(data?.items ?? [])];
    if (sort === 'newest') {
      return items.sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''));
    }
    if (sort === 'value') {
      return items.sort((a, b) => (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0));
    }
    return items.sort((a, b) => {
      const aDate = Date.parse(a.scheduledAt ?? a.createdAt ?? '');
      const bDate = Date.parse(b.scheduledAt ?? b.createdAt ?? '');
      return (Number.isFinite(aDate) ? aDate : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bDate) ? bDate : Number.MAX_SAFE_INTEGER);
    });
  }, [data?.items, sort]);

  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <AdminShell
      title="Bookings"
      subtitle={data?.totalCount ? `${data.totalCount} total bookings` : 'Manage all bookings'}
    >
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search by ref, customer, postcode..."
        onFilterPress={() => refetch()}
      />

      <View style={styles.chipWrap}>
        {statusOptions.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            active={status === option.value}
            onPress={() => setStatus(option.value)}
            accent={option.value === 'all' ? 'orange' : 'blue'}
          />
        ))}
      </View>

      <View style={styles.chipWrap}>
        {sortOptions.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            active={sort === option.value}
            onPress={() => setSort(option.value)}
            accent="orange"
          />
        ))}
      </View>

      <StatePanel
        loading={isLoading || isFetching}
        error={errorMessage}
        empty={!isLoading && !errorMessage && sortedItems.length === 0}
        emptyLabel="No bookings found. Try adjusting the filters."
        onRetry={() => refetch()}
      />

      {sortedItems.length > 0 ? (
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Booking Queue</Text>
          <Text style={styles.countText}>{sortedItems.length} shown</Text>
        </View>
      ) : null}

      {sortedItems.map((booking, index) => {
        const driverSituation = normalizeDriverSituation(booking.driverSituation);
        return (
          <BookingCard
            key={booking.refNumber}
            refNumber={booking.refNumber}
            customerName={booking.customerName}
            serviceType={booking.serviceType || booking.bookingType}
            status={booking.status}
            scheduledAt={booking.scheduledAt || booking.createdAt}
            totalAmount={booking.totalAmount}
            driverLabel={
              booking.driverName
                ? `${booking.driverName} · ${driverSituation.label}`
                : driverSituation.status !== 'unavailable'
                  ? driverSituation.label
                  : null
            }
            onPress={() => router.push(`/(tabs)/bookings/${booking.refNumber}`)}
            animatedIndex={index}
          />
        );
      })}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: typography.weight.bold,
  },
  countText: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
