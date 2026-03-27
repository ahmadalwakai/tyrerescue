import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import {
  Screen,
  SectionHeader,
  InputField,
  StateView,
  StatusChip,
  PrimaryButton,
  ListRow,
  colors,
  radius,
  spacing,
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

  const handleApplyFilters = () => {
    setAppliedSearch(search);
    setAppliedStatus(status || 'all');
  };

  return (
    <Screen>
      {/* Filter Section */}
      <View style={styles.filterPanel}>
        <InputField
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="ref, customer, email, tyre"
          keyboardType="default"
        />
        <InputField
          label="Status"
          value={status}
          onChangeText={setStatus}
          placeholder="all, pending, confirmed, completed"
          keyboardType="default"
        />
        <PrimaryButton
          title={isFetching ? 'Searching...' : 'Apply Filters'}
          onPress={handleApplyFilters}
          disabled={isFetching}
          size="md"
        />
      </View>

      {/* Results Section */}
      <SectionHeader
        title="Bookings"
        subtitle={data?.totalCount ? `${data.totalCount} total` : undefined}
        action="Refresh"
        onActionPress={() => refetch()}
      />

      <StateView
        loading={isLoading}
        error={errorMessage}
        empty={!data?.items?.length}
        emptyLabel="No bookings found. Try adjusting your filters."
      />

      {data?.items && data.items.length > 0 && (
        <View style={styles.bookingsList}>
          {data.items.map((booking, index) => (
            <ListRow
              key={booking.refNumber}
              title={booking.refNumber}
              subtitle={`${booking.customerName} • ${booking.serviceType}`}
              rightContent={<StatusChip status={booking.status} />}
              onPress={() => router.push(`/(tabs)/bookings/${booking.refNumber}`)}
              divider={index < data.items.length - 1}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  bookingsList: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
});
