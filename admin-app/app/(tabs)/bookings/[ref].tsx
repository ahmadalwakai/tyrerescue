import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { colors } from '@/ui/theme';

type BookingDetailResponse = {
  booking: {
    refNumber: string;
    status: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    addressLine: string;
    bookingType: string;
    serviceType: string;
    totalAmount: string;
    notes: string | null;
    scheduledAt: string | null;
  };
  availableDrivers: Array<{ id: string; name: string; status: string | null; isOnline: boolean | null }>;
  validNextStatuses: string[];
  statusHistory: Array<{ id: string; toStatus: string; note: string | null; createdAt: string | null }>;
};

export default function BookingDetailScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const [nextStatus, setNextStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [driverId, setDriverId] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const queryKey = ['booking-detail', ref];

  const { data, isLoading, error } = useQuery<BookingDetailResponse>({
    queryKey,
    queryFn: () => apiClient.get(`/api/mobile/admin/bookings/${ref}`),
    enabled: Boolean(ref),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const statusMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/mobile/admin/bookings/${ref}`, {
        status: nextStatus,
        note: statusNote,
      }),
    onSuccess: refresh,
  });

  const assignMutation = useMutation({
    mutationFn: () => apiClient.patch(`/api/mobile/admin/bookings/${ref}/assign`, { driverId }),
    onSuccess: refresh,
  });

  const refundMutation = useMutation({
    mutationFn: () => apiClient.post(`/api/mobile/admin/bookings/${ref}/refund`, { reason: refundReason }),
    onSuccess: refresh,
  });

  const suggestedDriver = useQuery<{ rankedDrivers: Array<{ driverId: string; name: string; reason: string }> }>({
    queryKey: ['booking-suggest-driver', ref],
    queryFn: () => apiClient.get(`/api/mobile/admin/bookings/${ref}/suggest-driver`),
    enabled: Boolean(ref),
  });

  const errorMessage = error instanceof Error ? error.message : null;

  const nextStatusOptions = useMemo(() => data?.validNextStatuses?.join(', ') || 'No transitions available', [data]);

  return (
    <Screen>
      <StateView loading={isLoading} error={errorMessage} />

      {data ? (
        <>
          <Card>
            <Text style={styles.ref}>{data.booking.refNumber}</Text>
            <StatusPill label={data.booking.status} />
            <Text style={styles.meta}>{data.booking.customerName}</Text>
            <Text style={styles.meta}>{data.booking.customerPhone}</Text>
            <Text style={styles.meta}>{data.booking.customerEmail}</Text>
            <Text style={styles.meta}>{data.booking.addressLine}</Text>
            <Text style={styles.meta}>{data.booking.serviceType} • {data.booking.bookingType}</Text>
            <Text style={styles.meta}>GBP {data.booking.totalAmount}</Text>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Update status</Text>
            <Text style={styles.hint}>Valid transitions: {nextStatusOptions}</Text>
            <InputField label="Next status" value={nextStatus} onChangeText={setNextStatus} placeholder="driver_assigned" />
            <InputField label="Note" value={statusNote} onChangeText={setStatusNote} placeholder="Optional note" />
            <PrimaryButton
              title={statusMutation.isPending ? 'Updating...' : 'Update status'}
              onPress={() => statusMutation.mutate()}
              disabled={!nextStatus || statusMutation.isPending}
            />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Assign driver</Text>
            <InputField label="Driver ID" value={driverId} onChangeText={setDriverId} placeholder="Paste driver id" />
            <PrimaryButton
              title={assignMutation.isPending ? 'Assigning...' : 'Assign driver'}
              onPress={() => assignMutation.mutate()}
              disabled={!driverId || assignMutation.isPending}
            />
            <Text style={styles.hint}>Top suggestion: {suggestedDriver.data?.rankedDrivers?.[0]?.name || 'None'}</Text>
            <Text style={styles.hint}>{suggestedDriver.data?.rankedDrivers?.[0]?.reason || ''}</Text>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Issue refund</Text>
            <InputField
              label="Reason"
              value={refundReason}
              onChangeText={setRefundReason}
              placeholder="Customer cancellation or service issue"
            />
            <PrimaryButton
              title={refundMutation.isPending ? 'Refunding...' : 'Issue refund'}
              onPress={() => refundMutation.mutate()}
              disabled={!refundReason || refundMutation.isPending}
              tone="danger"
            />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Recent timeline</Text>
            {data.statusHistory.slice(0, 8).map((entry) => (
              <View key={entry.id} style={styles.timelineRow}>
                <StatusPill label={entry.toStatus} />
                <Text style={styles.meta}>{entry.note || 'No note'}</Text>
                <Text style={styles.tiny}>{entry.createdAt || ''}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ref: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  meta: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  timelineRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  tiny: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
});
