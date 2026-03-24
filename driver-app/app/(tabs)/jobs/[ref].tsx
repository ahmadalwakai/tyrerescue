import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { driverApi, JobDetail, ApiError, chatApi } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingScreen } from '@/components/LoadingScreen';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { mediumHaptic, heavyHaptic, errorHaptic } from '@/services/haptics';
import { playSound } from '@/services/sound';

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
            if (nextStatus === 'completed') {
              heavyHaptic();
              playSound('job_completed');
            } else {
              mediumHaptic();
            }
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
            mediumHaptic();
            playSound('job_accepted');
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

  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [sendingQuickMsg, setSendingQuickMsg] = useState<string | null>(null);

  const checklistItems = useMemo(() => {
    if (!job) return [];
    if (job.status === 'en_route') return [
      { key: 'location', label: 'Correct customer location confirmed' },
      { key: 'tools', label: 'Required tools & tyres loaded' },
    ];
    if (job.status === 'arrived') return [
      { key: 'parked', label: 'Vehicle safely parked' },
      { key: 'customer', label: 'Customer aware of arrival' },
      { key: 'tools', label: 'Tools ready to begin' },
    ];
    return [];
  }, [job?.status]);

  const toggleCheck = (key: string) =>
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));

  const QUICK_MESSAGES: { key: string; label: string; body: string; statuses: string[] }[] = [
    { key: 'omw', label: "I'm on the way", body: "Hi, your Tyre Rescue driver is on the way to you now.", statuses: ['driver_assigned', 'en_route'] },
    { key: 'nearby', label: "I'm nearby", body: "Hi, your driver is nearly with you — please be ready.", statuses: ['en_route'] },
    { key: 'arrived', label: "I've arrived", body: "Hi, your Tyre Rescue driver has arrived at the location.", statuses: ['en_route', 'arrived'] },
    { key: '5min', label: '5 more minutes', body: "Hi, your driver needs about 5 more minutes to finish — nearly done.", statuses: ['in_progress'] },
  ];

  const sendQuickMessage = async (msg: typeof QUICK_MESSAGES[0]) => {
    if (!job) return;
    setSendingQuickMsg(msg.key);
    try {
      const res = await chatApi.createConversation(job.id, 'customer_driver');
      await chatApi.sendMessage(res.conversationId, msg.body);
      Alert.alert('Sent', `Message sent to customer.`);
    } catch {
      Alert.alert('Error', 'Could not send message.');
    }
    setSendingQuickMsg(null);
  };

  const openNavigation = () => {
    if (!job?.lat || !job?.lng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`;
    Linking.openURL(url);
  };

  const handleReject = async () => {
    if (!ref) return;
    Alert.alert('Reject Job', 'Are you sure you want to reject this job?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setActioning(true);
          try {
            errorHaptic();
            await driverApi.rejectJob(ref);
            router.back();
          } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Failed to reject job.';
            Alert.alert('Error', msg);
          }
          setActioning(false);
        },
      },
    ]);
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

      {/* Job Context */}
      <View style={styles.contextRow}>
        <View style={styles.contextChip}>
          <Ionicons name="construct-outline" size={14} color={colors.accent} />
          <Text style={styles.contextChipText}>{job.serviceType?.replace(/_/g, ' ') || 'Service'}</Text>
        </View>
        <View style={styles.contextChip}>
          <Ionicons name="car-outline" size={14} color={colors.accent} />
          <Text style={styles.contextChipText}>
            {[job.vehicleReg, job.vehicleMake].filter(Boolean).join(' · ') || 'No vehicle'}
          </Text>
        </View>
        {job.tyres.length > 0 && (
          <View style={styles.contextChip}>
            <Ionicons name="disc-outline" size={14} color={colors.accent} />
            <Text style={styles.contextChipText}>
              {job.tyres.reduce((s, t) => s + t.quantity, 0)} tyre{job.tyres.reduce((s, t) => s + t.quantity, 0) !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
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

      {/* Quick Status Messages */}
      {['driver_assigned', 'en_route', 'arrived', 'in_progress'].includes(job.status) && (
        <View style={styles.quickMsgSection}>
          <Text style={styles.quickMsgTitle}>Quick Message to Customer</Text>
          <View style={styles.quickMsgRow}>
            {QUICK_MESSAGES.filter((m) => m.statuses.includes(job.status)).map((m) => (
              <Pressable
                key={m.key}
                style={[styles.quickMsgBtn, sendingQuickMsg === m.key && styles.buttonDisabled]}
                onPress={() => sendQuickMessage(m)}
                disabled={!!sendingQuickMsg}
              >
                {sendingQuickMsg === m.key ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.quickMsgBtnText}>{m.label}</Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Location */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location</Text>
        <Text style={styles.cardValue}>{job.addressLine}</Text>
        {job.lat && job.lng && (
          <View style={styles.locationButtons}>
            <Pressable style={styles.navButton} onPress={openNavigation}>
              <Ionicons name="navigate-outline" size={18} color="#FFFFFF" />
              <Text style={styles.navButtonText}>Open in Maps</Text>
            </Pressable>
            <Pressable
              style={[styles.navButton, styles.mapViewButton]}
              onPress={() => router.push(`/(tabs)/jobs/${ref}/map`)}
            >
              <Ionicons name="map-outline" size={18} color="#FFFFFF" />
              <Text style={styles.navButtonText}>Live Map</Text>
            </Pressable>
          </View>
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

      {/* Arrival Readiness Checklist */}
      {checklistItems.length > 0 && (
        <View style={styles.checklistCard}>
          <Text style={styles.cardTitle}>
            {job.status === 'en_route' ? 'Before Arriving' : 'Before Starting'}
          </Text>
          {checklistItems.map((item) => (
            <Pressable
              key={item.key}
              style={styles.checklistRow}
              onPress={() => toggleCheck(item.key)}
            >
              <Ionicons
                name={checklist[item.key] ? 'checkbox' : 'square-outline'}
                size={22}
                color={checklist[item.key] ? colors.success : colors.muted}
              />
              <Text
                style={[
                  styles.checklistLabel,
                  checklist[item.key] && styles.checklistLabelDone,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Call Admin */}
      <View style={styles.adminContactRow}>
        <Pressable
          style={styles.callAdminButton}
          onPress={() => Linking.openURL('tel:01412660690')}
        >
          <Ionicons name="call-outline" size={20} color="#FFFFFF" />
          <Text style={styles.callAdminText}>Call Admin</Text>
        </Pressable>
        <Pressable
          style={styles.chatAdminButton}
          onPress={async () => {
            try {
              const res = await chatApi.createConversation(job.id, 'admin_driver');
              router.push(`/(tabs)/chat/${res.conversationId}`);
            } catch {
              Alert.alert('Error', 'Could not open chat.');
            }
          }}
        >
          <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
          <Text style={styles.chatAdminText}>Chat with Admin</Text>
        </Pressable>
      </View>

      {/* Actions */}
      {job.status === 'paid' && (
        <Animated.View entering={FadeInDown.duration(300)} style={styles.actionRow}>
          <AnimatedPressable
            style={[styles.actionButton, styles.acceptButton, actioning && styles.buttonDisabled]}
            onPress={handleAccept}
            disabled={actioning}
            pressScale={0.95}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Accept Job</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.actionButton, styles.rejectButton, actioning && styles.buttonDisabled]}
            onPress={handleReject}
            disabled={actioning}
            pressScale={0.95}
          >
            <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Reject</Text>
          </AnimatedPressable>
        </Animated.View>
      )}

      {job.status === 'driver_assigned' && (
        <Animated.View entering={FadeInDown.duration(300)} style={styles.actionRow}>
          <AnimatedPressable
            style={[styles.actionButton, styles.acceptButton, actioning && styles.buttonDisabled]}
            onPress={() => handleStatusAction(DRIVER_ACTIONS.driver_assigned.next)}
            disabled={actioning}
            pressScale={0.95}
          >
            <Text style={styles.actionButtonText}>
              {actioning ? 'Updating…' : DRIVER_ACTIONS.driver_assigned.label}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.actionButton, styles.rejectButton, actioning && styles.buttonDisabled]}
            onPress={handleReject}
            disabled={actioning}
            pressScale={0.95}
          >
            <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Reject</Text>
          </AnimatedPressable>
        </Animated.View>
      )}

      {action && job.status !== 'driver_assigned' && (
        <AnimatedPressable
          style={[styles.actionButton, actioning && styles.buttonDisabled]}
          onPress={() => handleStatusAction(action.next)}
          disabled={actioning}
          pressScale={0.95}
        >
          <Text style={styles.actionButtonText}>
            {actioning ? 'Updating…' : action.label}
          </Text>
        </AnimatedPressable>
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
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...cardShadow,
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
  locationButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  mapViewButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  navButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: '#FFFFFF',
  },
  tyreRow: {
    marginBottom: 6,
  },
  callAdminButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 8,
  },
  callAdminText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: '#FFFFFF',
  },
  adminContactRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chatAdminButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    gap: 8,
  },
  chatAdminText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: 6,
  },
  acceptButton: {
    flex: 2,
    backgroundColor: colors.accent,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#7f1d1d',
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
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderRadius: radius.md,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  contextChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.accent,
    textTransform: 'capitalize',
  },
  quickMsgSection: {
    marginBottom: spacing.sm,
  },
  quickMsgTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  quickMsgRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickMsgBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickMsgBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  checklistCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...cardShadow,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  checklistLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    color: colors.text,
    flex: 1,
  },
  checklistLabelDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
});
