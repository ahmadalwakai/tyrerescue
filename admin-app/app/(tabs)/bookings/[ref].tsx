import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from '@/ui/StatusPill';
import { colors, radius, spacing, typography } from '@/ui/theme';
import { formatNextStatuses } from '@/ui/labels';

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

  const nextStatusOptions = useMemo(
    () => formatNextStatuses(data?.validNextStatuses ?? []),
    [data],
  );

  return (
    <Screen>
      <StateView loading={isLoading} error={errorMessage} />

      {data ? (
        <>
          <Card>
            <View style={styles.summaryHeader}>
              <Text style={styles.ref}>{data.booking.refNumber}</Text>
              <StatusChip status={data.booking.status} />
            </View>
            <View style={styles.metaTable}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Customer</Text>
                <Text style={styles.metaValue}>{data.booking.customerName}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Phone</Text>
                <Text style={styles.metaValue}>{data.booking.customerPhone}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Email</Text>
                <Text style={styles.metaValue}>{data.booking.customerEmail}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Address</Text>
                <Text style={styles.metaValue}>{data.booking.addressLine}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Service</Text>
                <Text style={styles.metaValue}>{data.booking.serviceType} · {data.booking.bookingType}</Text>
              </View>
              <View style={[styles.metaRow, styles.metaRowLast]}>
                <Text style={styles.metaLabel}>Amount</Text>
                <Text style={[styles.metaValue, styles.metaValueStrong]}>£{data.booking.totalAmount}</Text>
              </View>
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Update status</Text>
            <Text style={styles.hint}>Available: {nextStatusOptions}</Text>
            <InputField label="Next status" value={nextStatus} onChangeText={setNextStatus} placeholder="e.g. confirmed" />
            <InputField label="Note" value={statusNote} onChangeText={setStatusNote} placeholder="Optional note" />
            <PrimaryButton
              title={statusMutation.isPending ? 'Updating...' : 'Update status'}
              onPress={() => statusMutation.mutate()}
              disabled={!nextStatus || statusMutation.isPending}
            />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Assign driver</Text>
            {suggestedDriver.data?.rankedDrivers?.[0] && (
              <Pressable
                style={styles.suggestionBox}
                onPress={() => setDriverId(suggestedDriver.data!.rankedDrivers[0].driverId)}
              >
                <Text style={styles.suggestionLabel}>Top suggestion · tap to select</Text>
                <Text style={styles.suggestionName}>{suggestedDriver.data.rankedDrivers[0].name}</Text>
                <Text style={styles.hint}>{suggestedDriver.data.rankedDrivers[0].reason}</Text>
              </Pressable>
            )}

            {data.availableDrivers.length > 0 ? (
              <View style={styles.driverList}>
                <Text style={styles.hint}>Available drivers</Text>
                {data.availableDrivers.map((d) => {
                  const selected = d.id === driverId;
                  return (
                    <Pressable
                      key={d.id}
                      style={[styles.driverRow, selected && styles.driverRowSelected]}
                      onPress={() => setDriverId(d.id)}
                    >
                      <View style={styles.driverRowText}>
                        <Text style={[styles.driverName, selected && styles.driverNameSelected]}>{d.name}</Text>
                        <Text style={styles.tiny}>
                          {d.isOnline ? 'Online' : 'Offline'}
                          {d.status ? ` · ${d.status}` : ''}
                        </Text>
                      </View>
                      {selected ? <Text style={styles.driverCheck}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.hint}>No available drivers right now.</Text>
            )}

            {/* Manual fallback — paste a driver id directly if needed. */}
            <InputField label="Driver ID" value={driverId} onChangeText={setDriverId} placeholder="Or paste driver id" />
            <PrimaryButton
              title={assignMutation.isPending ? 'Assigning...' : 'Assign driver'}
              onPress={() => assignMutation.mutate()}
              disabled={!driverId || assignMutation.isPending}
            />
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
              variant="danger"
            />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Recent timeline</Text>
            {data.statusHistory.slice(0, 8).map((entry) => (
              <View key={entry.id} style={styles.timelineRow}>
                <StatusChip status={entry.toStatus} />
                <View style={styles.timelineText}>
                  <Text style={styles.timelineNote}>{entry.note ?? 'No note'}</Text>
                  <Text style={styles.tiny}>{entry.createdAt ?? ''}</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  ref: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  metaTable: {
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  metaRowLast: {
    borderBottomWidth: 0,
  },
  metaLabel: {
    width: 72,
    color: colors.textMuted,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  metaValue: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
  },
  metaValueStrong: {
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
    marginBottom: spacing.sm,
  },
  suggestionBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  suggestionLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  suggestionName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  driverList: {
    marginBottom: spacing.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  driverRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceLight,
  },
  driverRowText: {
    flex: 1,
  },
  driverName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  driverNameSelected: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  driverCheck: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timelineText: {
    flex: 1,
  },
  timelineNote: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  tiny: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
