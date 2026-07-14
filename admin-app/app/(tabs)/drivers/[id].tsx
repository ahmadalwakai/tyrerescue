import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { normalizeDriverSituation } from '@/lib/driverSituation';
import type { DriverSituation } from '@/types/driverSituation';
import {
  AdminShell,
  FilterChip,
  GlassCard,
  MetricCard,
  PressScale,
  StatePanel,
  StatusBadge,
  colors,
  spacing,
  typography,
} from '@/ui';

type DriverDetail = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  isOnline?: boolean | null;
  totalJobs: number;
  completedJobs: number;
  activeJobs: number;
  activeJobRef: string | null;
  driverSituation: DriverSituation | null;
};

const statusOptions = ['offline', 'available', 'en_route', 'arrived', 'in_progress'];

export default function DriverDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading, error, refetch } = useQuery<DriverDetail>({
    queryKey: ['driver', id],
    queryFn: () => apiClient.get(`/api/mobile/admin/drivers/${id}`),
    enabled: Boolean(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['driver', id] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  };

  const updateMutation = useMutation({
    mutationFn: () => apiClient.put(`/api/mobile/admin/drivers/${id}`, { status }),
    onSuccess: () => {
      setStatus('');
      refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/mobile/admin/drivers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      router.back();
    },
  });

  const onDelete = () => {
    Alert.alert('Delete driver', 'This permanently deletes the driver account if there are no active bookings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const situation = normalizeDriverSituation(data?.driverSituation);
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <AdminShell title="Driver Details" subtitle={data?.name || 'Driver profile'}>
      <StatePanel
        loading={isLoading}
        error={errorMessage}
        empty={!isLoading && !errorMessage && !data}
        emptyLabel="Driver details are not available."
        onRetry={() => refetch()}
      />

      {data ? (
        <>
          <GlassCard accent={data.isOnline ? 'green' : 'muted'} animatedIndex={0}>
            <View style={styles.profileTop}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={28} color={colors.text} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.name}>{data.name}</Text>
                <Text style={styles.meta}>{data.email}</Text>
                <Text style={styles.meta}>{data.phone || 'No phone'}</Text>
              </View>
              <StatusBadge status={data.isOnline ? data.status || 'online' : 'offline'} />
            </View>
            <View style={styles.actionRow}>
              <ActionButton icon="call" label="Call" onPress={() => data.phone && Linking.openURL(`tel:${data.phone}`).catch(() => undefined)} />
              <ActionButton icon="map" label="Map" onPress={() => router.push('/(tabs)/drivers/tracking')} />
              <ActionButton icon="briefcase" label="Job" onPress={() => data.activeJobRef && router.push(`/(tabs)/bookings/${data.activeJobRef}`)} disabled={!data.activeJobRef} />
            </View>
          </GlassCard>

          <View style={styles.metricsGrid}>
            <MetricCard label="Total Jobs" value={data.totalJobs} icon="briefcase-outline" accent="blue" animatedIndex={1} />
            <MetricCard label="Completed" value={data.completedJobs} icon="checkmark-done-outline" accent="green" animatedIndex={2} />
            <MetricCard label="Active" value={data.activeJobs} icon="flash-outline" accent="orange" animatedIndex={3} />
            <MetricCard label="Situation" value={situation.status === 'unavailable' ? 'N/A' : situation.delayMinutes} helper={situation.label} icon="radio-outline" accent="purple" animatedIndex={4} />
          </View>

          <GlassCard accent="blue" animatedIndex={5}>
            <Text style={styles.sectionTitle}>Current Job</Text>
            <Text style={styles.bigValue}>{data.activeJobRef || 'No active job'}</Text>
            <Text style={styles.meta}>{situation.status !== 'unavailable' ? situation.label : 'No active route data'}</Text>
            {situation.reasonLabels.map((reason) => (
              <Text key={reason} style={styles.meta}>
                {reason}
              </Text>
            ))}
          </GlassCard>

          <GlassCard accent="orange" animatedIndex={6}>
            <Text style={styles.sectionTitle}>Update Status</Text>
            <View style={styles.chipWrap}>
              {statusOptions.map((item) => (
                <FilterChip
                  key={item}
                  label={item.replace(/_/g, ' ')}
                  active={status === item}
                  onPress={() => setStatus(item)}
                  accent={item === 'offline' ? 'red' : 'blue'}
                />
              ))}
            </View>
            <PressScale
              style={styles.saveButton}
              onPress={() => updateMutation.mutate()}
              disabled={!status || updateMutation.isPending}
            >
              <Ionicons name="save" size={18} color={colors.text} />
              <Text style={styles.saveText}>{updateMutation.isPending ? 'Saving...' : 'Save status'}</Text>
            </PressScale>
          </GlassCard>

          <GlassCard accent="red" urgent animatedIndex={7}>
            <Text style={styles.sectionTitle}>Danger Zone</Text>
            <Text style={styles.meta}>Deleting is blocked by the API when the driver has active bookings.</Text>
            <PressScale style={styles.deleteButton} onPress={onDelete} disabled={deleteMutation.isPending}>
              <Ionicons name="trash" size={18} color={colors.text} />
              <Text style={styles.saveText}>{deleteMutation.isPending ? 'Deleting...' : 'Delete driver'}</Text>
            </PressScale>
          </GlassCard>
        </>
      ) : null}
    </AdminShell>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PressScale style={styles.actionButton} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.actionText}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: typography.weight.bold,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  actionText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: typography.weight.bold,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  bigValue: {
    color: colors.text,
    fontSize: 19,
    fontWeight: typography.weight.bold,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  deleteButton: {
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  saveText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
});
