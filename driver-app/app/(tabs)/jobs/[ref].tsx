import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { driverApi, JobDetail, ApiError } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingScreen } from '@/components/LoadingScreen';

const DRIVER_ACTIONS: Record<string, { label: string; next: string }> = {
  driver_assigned: { label: 'Start En Route', next: 'en_route' },
  en_route: { label: 'Mark Arrived', next: 'arrived' },
  arrived: { label: 'Start Work', next: 'in_progress' },
  in_progress: { label: 'Mark Complete', next: 'completed' },
};

export default function JobDetailScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState(false);

  const fetchJob = useCallback(async () => {
    if (!ref) return;
    try {
      const data = await driverApi.getJob(ref);
      setJob(data);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [ref]);

  useRefreshOnFocus(fetchJob);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchJob();
    setRefreshing(false);
  }, [fetchJob]);

  const handleStatusAction = async (nextStatus: string) => {
    if (!ref) return;
    const confirmMsg =
      nextStatus === 'completed'
        ? 'Are you sure you want to mark this job as complete?'
        : `Update status to ${nextStatus.replace(/_/g, ' ')}?`;

    Alert.alert('Confirm', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setActioning(true);
          try {
            await driverApi.updateJobStatus(ref, nextStatus);
            await fetchJob();
          } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Failed to update status.';
            Alert.alert('Error', msg);
          }
          setActioning(false);
        },
      },
    ]);
  };

  const handleAccept = async () => {
    if (!ref) return;
    Alert.alert('Accept Job', 'Accept this assignment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          setActioning(true);
          try {
            await driverApi.acceptJob(ref);
            await fetchJob();
          } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Failed to accept job.';
            Alert.alert('Error', msg);
          }
          setActioning(false);
        },
      },
    ]);
  };

  const openNavigation = () => {
    if (!job?.lat || !job?.lng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`;
    Linking.openURL(url);
  };

  if (loading) return <LoadingScreen />;

  if (!job) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Job not found.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const action = DRIVER_ACTIONS[job.status];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.refNumber}>#{job.refNumber}</Text>
        <StatusBadge status={job.status} />
      </View>

      {/* Customer Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer</Text>
        <Text style={styles.cardValue}>{job.customerName}</Text>
        {job.customerPhone && (
          <Pressable onPress={() => Linking.openURL(`tel:${job.customerPhone}`)}>
            <Text style={styles.phoneLink}>{job.customerPhone}</Text>
          </Pressable>
        )}
      </View>

      {/* Location */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location</Text>
        <Text style={styles.cardValue}>{job.addressLine}</Text>
        {job.lat && job.lng && (
          <Pressable style={styles.navButton} onPress={openNavigation}>
            <Ionicons name="navigate-outline" size={18} color="#FFFFFF" />
            <Text style={styles.navButtonText}>Open in Maps</Text>
          </Pressable>
        )}
      </View>

      {/* Schedule */}
      {job.scheduledAt && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scheduled</Text>
          <Text style={styles.cardValue}>
            {format(new Date(job.scheduledAt), 'EEEE, dd MMM yyyy · HH:mm')}
          </Text>
        </View>
      )}

      {/* Vehicle */}
      {(job.vehicleReg || job.vehicleMake) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vehicle</Text>
          <Text style={styles.cardValue}>
            {[job.vehicleReg, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' · ')}
          </Text>
          {job.lockingNutStatus && (
            <Text style={styles.cardMeta}>Locking nut: {job.lockingNutStatus}</Text>
          )}
        </View>
      )}

      {/* Tyres */}
      {job.tyres.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tyres</Text>
          {job.tyres.map((t, i) => (
            <View key={t.id || i} style={styles.tyreRow}>
              <Text style={styles.cardValue}>
                {t.quantity}× {[t.brand, t.pattern].filter(Boolean).join(' ')}
              </Text>
              {(t.width || t.aspect || t.rim) && (
                <Text style={styles.cardMeta}>
                  {t.width}/{t.aspect}R{t.rim}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Notes */}
      {job.notes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notes</Text>
          <Text style={styles.cardValue}>{job.notes}</Text>
        </View>
      )}

      {/* Amount */}
      {job.totalAmount && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total</Text>
          <Text style={styles.amountText}>£{Number(job.totalAmount).toFixed(2)}</Text>
        </View>
      )}

      {/* Actions */}
      {job.status === 'paid' && (
        <Pressable
          style={[styles.actionButton, actioning && styles.buttonDisabled]}
          onPress={handleAccept}
          disabled={actioning}
        >
          <Text style={styles.actionButtonText}>Accept Job</Text>
        </Pressable>
      )}

      {action && (
        <Pressable
          style={[styles.actionButton, actioning && styles.buttonDisabled]}
          onPress={() => handleStatusAction(action.next)}
          disabled={actioning}
        >
          <Text style={styles.actionButtonText}>
            {actioning ? 'Updating…' : action.label}
          </Text>
        </Pressable>
      )}

      {/* Status History */}
      {job.statusHistory.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.cardTitle}>Status History</Text>
          {job.statusHistory.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <View style={styles.dot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyStatus}>
                  {h.toStatus.replace(/_/g, ' ')}
                </Text>
                {h.createdAt && (
                  <Text style={styles.historyTime}>
                    {format(new Date(h.createdAt), 'dd MMM, HH:mm')}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  refNumber: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 28,
    color: colors.accent,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
  },
  phoneLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.base,
    color: colors.accent,
    marginTop: 4,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    gap: 6,
  },
  navButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: '#FFFFFF',
  },
  tyreRow: {
    marginBottom: 6,
  },
  amountText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: colors.accent,
  },
  actionButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: '#FFFFFF',
  },
  historySection: {
    marginTop: spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  historyStatus: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.text,
    textTransform: 'capitalize',
  },
  historyTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  linkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.base,
    color: colors.accent,
  },
});
