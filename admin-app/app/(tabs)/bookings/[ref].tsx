import { useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { normalizeDriverSituation } from '@/lib/driverSituation';
import { formatNextStatuses } from '@/ui/labels';
import type { DriverSituation } from '@/types/driverSituation';
import {
  AdminShell,
  FilterChip,
  GlassCard,
  PressScale,
  StatePanel,
  StatusBadge,
  colors,
  formatMoney,
  formatShortDate,
  humanLabel,
  spacing,
  typography,
} from '@/ui';

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
    createdAt?: string | null;
    lat?: string | null;
    lng?: string | null;
    paymentType?: string | null;
  };
  assignedDriver?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string | null;
    isOnline: boolean | null;
  } | null;
  availableDrivers: Array<{ id: string; name: string; status: string | null; isOnline: boolean | null }>;
  validNextStatuses: string[];
  statusHistory: Array<{ id: string; toStatus: string; note: string | null; createdAt: string | null }>;
  driverSituation?: DriverSituation | null;
};

function openPhone(phone?: string | null) {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() => undefined);
}

function openMessage(phone?: string | null) {
  if (!phone) return;
  Linking.openURL(`sms:${phone}`).catch(() => undefined);
}

function openNavigation(booking: BookingDetailResponse['booking']) {
  const lat = Number(booking.lat);
  const lng = Number(booking.lng);
  const query = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : booking.addressLine;
  if (!query) return;
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`).catch(() => undefined);
}

export default function BookingDetailScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [nextStatus, setNextStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [driverId, setDriverId] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const queryKey = ['booking-detail', ref];
  const { data, isLoading, error, refetch } = useQuery<BookingDetailResponse>({
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
    onSuccess: () => {
      setNextStatus('');
      setStatusNote('');
      refresh();
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => apiClient.patch(`/api/mobile/admin/bookings/${ref}/assign`, { driverId }),
    onSuccess: () => {
      setDriverId('');
      refresh();
    },
  });

  const refundMutation = useMutation({
    mutationFn: () => apiClient.post(`/api/mobile/admin/bookings/${ref}/refund`, { reason: refundReason }),
    onSuccess: () => {
      setRefundReason('');
      refresh();
    },
  });

  const driverSituation = normalizeDriverSituation(data?.driverSituation);
  const nextStatusOptions = useMemo(() => formatNextStatuses(data?.validNextStatuses ?? []), [data?.validNextStatuses]);
  const errorMessage = error instanceof Error ? error.message : null;

  const confirmRefund = () => {
    Alert.alert('Issue refund', 'This action sends a refund request for this booking.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm refund', style: 'destructive', onPress: () => refundMutation.mutate() },
    ]);
  };

  return (
    <AdminShell title="Job Details" subtitle={ref ? `Ref ${ref}` : 'Full overview and actions'}>
      <StatePanel
        loading={isLoading}
        error={errorMessage}
        empty={!isLoading && !errorMessage && !data}
        emptyLabel="Job details are not available."
        onRetry={() => refetch()}
      />

      {data ? (
        <>
          <GlassCard accent="blue" animatedIndex={0}>
            <View style={styles.summaryTop}>
              <View style={styles.jobIcon}>
                <Ionicons name="briefcase" size={22} color={colors.text} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.refText} numberOfLines={1}>
                  {data.booking.refNumber}
                </Text>
                <Text style={styles.mutedText} numberOfLines={1}>
                  {data.booking.serviceType || data.booking.bookingType || 'Service not set'}
                </Text>
              </View>
              <StatusBadge status={data.booking.status} />
            </View>

            <View style={styles.routeLine}>
              <Text style={styles.addressText} numberOfLines={2}>
                {data.booking.addressLine || 'Address not set'}
              </Text>
              <Text style={styles.moneyText}>{formatMoney(data.booking.totalAmount)}</Text>
            </View>

            <View style={styles.actionRow}>
              <ActionButton icon="call" label="Call" accent="green" onPress={() => openPhone(data.booking.customerPhone)} />
              <ActionButton icon="chatbubble" label="Message" accent="blue" onPress={() => openMessage(data.booking.customerPhone)} />
              <ActionButton icon="navigate" label="Navigate" accent="orange" onPress={() => openNavigation(data.booking)} />
              <ActionButton icon="ellipsis-horizontal" label="More" accent="purple" onPress={() => router.push('/(tabs)/more')} />
            </View>
          </GlassCard>

          <GlassCard accent="orange" animatedIndex={1}>
            <Text style={styles.sectionTitle}>Job Information</Text>
            <InfoRow icon="time-outline" label="Date & time" value={formatShortDate(data.booking.scheduledAt) || 'Not scheduled'} />
            <InfoRow icon="card-outline" label="Payment" value={data.booking.paymentType ? humanLabel(data.booking.paymentType) : 'Not set'} />
            <InfoRow icon="construct-outline" label="Job type" value={data.booking.bookingType || 'Not set'} />
            <InfoRow
              icon="car-outline"
              label="Driver state"
              value={driverSituation.status !== 'unavailable' ? driverSituation.label : 'No driver data'}
            />
            <InfoRow icon="document-text-outline" label="Special notes" value={data.booking.notes || 'No notes'} last />
          </GlassCard>

          <GlassCard accent="green" animatedIndex={2}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <View style={styles.customerRow}>
              <View style={styles.customerIcon}>
                <Ionicons name="person" size={20} color={colors.text} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{data.booking.customerName || 'Customer not set'}</Text>
                <Text style={styles.mutedText}>{data.booking.customerPhone || 'No phone'}</Text>
                <Text style={styles.mutedText}>{data.booking.customerEmail || 'No email'}</Text>
              </View>
              <PressScale style={styles.callButton} onPress={() => openPhone(data.booking.customerPhone)}>
                <Ionicons name="call" size={18} color={colors.text} />
              </PressScale>
            </View>
          </GlassCard>

          <GlassCard accent="blue" animatedIndex={3}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Progress Timeline</Text>
              <StatusBadge status={driverSituation.status} label={driverSituation.label} />
            </View>
            {data.statusHistory.length === 0 ? (
              <Text style={styles.mutedText}>No timeline events yet.</Text>
            ) : (
              data.statusHistory.slice(0, 8).map((entry, index) => (
                <View key={entry.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, index === 0 && styles.timelineDotActive]} />
                    {index < data.statusHistory.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.timelineTop}>
                      <Text style={styles.cardTitle}>{humanLabel(entry.toStatus)}</Text>
                      <Text style={styles.tinyText}>{formatShortDate(entry.createdAt)}</Text>
                    </View>
                    <Text style={styles.mutedText}>{entry.note || 'No note'}</Text>
                  </View>
                </View>
              ))
            )}
          </GlassCard>

          <GlassCard accent="purple" animatedIndex={4}>
            <Text style={styles.sectionTitle}>Update Status</Text>
            <Text style={styles.mutedText}>Available: {nextStatusOptions || 'No transitions available'}</Text>
            <View style={styles.chipWrap}>
              {(data.validNextStatuses ?? []).map((status) => (
                <FilterChip
                  key={status}
                  label={humanLabel(status)}
                  active={nextStatus === status}
                  onPress={() => setNextStatus(status)}
                  accent="blue"
                />
              ))}
            </View>
            <TextInput
              value={statusNote}
              onChangeText={setStatusNote}
              placeholder="Optional note"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
            />
            <ActionButton
              icon="checkmark-circle"
              label={statusMutation.isPending ? 'Updating...' : 'Update status'}
              accent="blue"
              disabled={!nextStatus || statusMutation.isPending}
              onPress={() => statusMutation.mutate()}
              wide
            />
          </GlassCard>

          <GlassCard accent="green" animatedIndex={5}>
            <Text style={styles.sectionTitle}>Assign Driver</Text>
            {data.assignedDriver ? (
              <Text style={styles.mutedText}>
                Assigned: {data.assignedDriver.name} · {data.assignedDriver.isOnline ? 'Online' : 'Offline'}
              </Text>
            ) : null}
            <View style={styles.chipWrap}>
              {data.availableDrivers.map((driver) => (
                <FilterChip
                  key={driver.id}
                  label={driver.name}
                  active={driverId === driver.id}
                  onPress={() => setDriverId(driver.id)}
                  accent={driver.isOnline ? 'green' : 'muted'}
                />
              ))}
            </View>
            <ActionButton
              icon="person-add"
              label={assignMutation.isPending ? 'Assigning...' : 'Assign selected driver'}
              accent="green"
              disabled={!driverId || assignMutation.isPending}
              onPress={() => assignMutation.mutate()}
              wide
            />
          </GlassCard>

          <GlassCard accent="red" animatedIndex={6} urgent>
            <Text style={styles.sectionTitle}>Refund Control</Text>
            <TextInput
              value={refundReason}
              onChangeText={setRefundReason}
              placeholder="Refund reason"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
            />
            <ActionButton
              icon="return-down-back"
              label={refundMutation.isPending ? 'Refunding...' : 'Issue refund'}
              accent="red"
              disabled={!refundReason || refundMutation.isPending}
              onPress={confirmRefund}
              wide
            />
          </GlassCard>
        </>
      ) : null}
    </AdminShell>
  );
}

function ActionButton({
  icon,
  label,
  accent,
  onPress,
  disabled,
  wide,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accent: 'orange' | 'blue' | 'green' | 'purple' | 'red';
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  const accentColor =
    accent === 'green'
      ? colors.success
      : accent === 'blue'
        ? colors.active
        : accent === 'purple'
          ? colors.tools
          : accent === 'red'
            ? colors.error
            : colors.primary;

  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionButton, wide && styles.actionButtonWide, { borderColor: `${accentColor}66` }]}
    >
      <Ionicons name={icon} size={18} color={accentColor} />
      <Text style={[styles.actionLabel, { color: accentColor }]} numberOfLines={1}>
        {label}
      </Text>
    </PressScale>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  jobIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.activeSoft,
  },
  refText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: typography.weight.bold,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  routeLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  addressText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  moneyText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    gap: 3,
  },
  actionButtonWide: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
  },
  sectionHeader: {
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
    marginBottom: spacing.sm,
  },
  infoRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    width: 86,
    color: colors.textMuted,
    fontSize: 11,
  },
  infoValue: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'right',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  customerIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successBg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 54,
  },
  timelineRail: {
    width: 18,
    alignItems: 'center',
  },
  timelineDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.textSubtle,
    marginTop: 3,
  },
  timelineDotActive: {
    backgroundColor: colors.primary,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  timelineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tinyText: {
    color: colors.textSubtle,
    fontSize: 10,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    fontSize: 12,
  },
});
