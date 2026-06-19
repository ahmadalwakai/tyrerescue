import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  Modal,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { driverApi, JobDetail, ApiError, chatApi, PaymentSummary } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingScreen } from '@/components/LoadingScreen';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { mediumHaptic, heavyHaptic, errorHaptic } from '@/services/haptics';
import { playSound, stopAlertSound } from '@/services/sound';
import { clearAlertedRef } from '@/services/job-alert';
import { ACTIVE_BOOKING_REF_KEY } from '@/services/background-location';
import * as secureStorage from '@/services/secure-storage';
import { useI18n } from '@/i18n';
import { getDriverPaymentDisplay, paymentToneColors } from '@/lib/payment-status';

const ACTIVE_JOB_STATUSES = new Set([
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
]);
type JobDetailIconName = keyof typeof Ionicons.glyphMap;

interface CustomerQuickMessage {
  key: string;
  label: string;
  body: string;
  statuses: string[];
  requiresCollection?: boolean;
}

interface AdminIssueMessage {
  key: string;
  label: string;
  body: string;
  icon: JobDetailIconName;
  urgent?: boolean;
}

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

function formatGbpFromPence(pence: number | null | undefined): string | null {
  if (pence == null || !Number.isFinite(pence)) return null;
  return gbpFormatter.format(pence / 100);
}

function PaymentCard({
  payment,
  refNumber,
  t,
}: {
  payment: PaymentSummary | null;
  refNumber: string;
  t: (key: string) => string;
}) {
  if (!payment) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('jobDetail.payment')}</Text>
        <Text style={styles.cardMeta}>{t('jobDetail.notAvailable')}</Text>
      </View>
    );
  }

  const display = getDriverPaymentDisplay(payment, refNumber);
  const statusLabel = t(display.labelKey);
  const methodLabel = payment.methodLabel || t('jobDetail.paymentMethodUnknown');

  const amountLabel =
    display.tone === 'paid'
      ? t('jobDetail.nothingToCollect')
      : display.amountLabel ?? t(display.descriptionKey);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('jobDetail.payment')}</Text>
      {(() => {
        const tone = paymentToneColors(display.tone);
        return (
          <View
            style={[
              styles.payToneBadge,
              { backgroundColor: tone.bg, borderColor: tone.border },
            ]}
          >
            <Ionicons
              name={
                display.tone === 'paid'
                  ? 'checkmark-circle'
                  : display.tone === 'action'
                    ? 'cash-outline'
                    : display.tone === 'warning' || display.tone === 'failed'
                      ? 'alert-circle-outline'
                      : 'time-outline'
              }
              size={18}
              color={tone.text}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.payToneLabel, { color: tone.text }]}>
                {t(display.labelKey)}
                {display.amountLabel != null ? ` · ${display.amountLabel}` : ''}
              </Text>
              <Text style={[styles.payToneDesc, { color: tone.text }]}>
                {t(display.descriptionKey)}
              </Text>
            </View>
          </View>
        );
      })()}
      {payment.totalPence != null && payment.totalPence > 0 && (
        <>
          <Text style={styles.cardMeta}>{t('jobDetail.jobPrice')}</Text>
          <Text style={[styles.cardValue, { fontSize: fontSize.lg, fontWeight: '700' }]}>
            {formatGbpFromPence(payment.totalPence)}
          </Text>
        </>
      )}
      <Text style={[styles.cardMeta, { marginTop: 8 }]}>{t('jobDetail.paymentMethod')}</Text>
      <Text style={styles.cardValue}>{methodLabel}</Text>
      <Text style={[styles.cardMeta, { marginTop: 8 }]}>{t('jobDetail.paymentStatus')}</Text>
      <Text style={styles.cardValue}>{statusLabel}</Text>
      <Text style={[styles.cardMeta, { marginTop: 8 }]}>{t('jobDetail.amountToCollect')}</Text>
      <Text style={[styles.cardValue, { fontSize: fontSize.lg, fontWeight: '700' }]}>
        {amountLabel}
      </Text>
    </View>
  );
}

function getDriverActions(t: (key: string) => string): Record<string, { label: string; next: string }> {
  return {
    driver_assigned: { label: t('jobDetail.startEnRoute'), next: 'en_route' },
    en_route: { label: t('jobDetail.markArrived'), next: 'arrived' },
    arrived: { label: t('jobDetail.startWork'), next: 'in_progress' },
    in_progress: { label: t('jobDetail.markComplete'), next: 'completed' },
  };
}

export default function JobDetailScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const { t, dateLocale } = useI18n();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState(false);
  const actionLockRef = useRef(false);

  // Reset the action lock when navigating between different jobs
  useEffect(() => {
    actionLockRef.current = false;
  }, [ref]);

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
  const jobStatus = job?.status ?? null;

  // Track active booking ref so the location bridge knows which booking's
  // tracking session to update. Do not clear on unmount: the driver may move
  // to the route screen or lock the phone while this job is still active.
  useEffect(() => {
    if (!ref) return;
    if (!jobStatus) return;
    if (ACTIVE_JOB_STATUSES.has(jobStatus)) {
      secureStorage.setItemAsync(ACTIVE_BOOKING_REF_KEY, ref).catch(() => {});
    } else {
      // Job loaded but no longer active.
      secureStorage.getItemAsync(ACTIVE_BOOKING_REF_KEY)
        .then((stored) => {
          if (stored === ref) {
            return secureStorage.deleteItemAsync(ACTIVE_BOOKING_REF_KEY);
          }
          return undefined;
        })
        .catch(() => {});
    }
  }, [ref, jobStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchJob();
    setRefreshing(false);
  }, [fetchJob]);

  const handleStatusAction = async (nextStatus: string) => {
    if (!ref || actionLockRef.current) return;
    actionLockRef.current = true;
    const confirmMsg =
      nextStatus === 'completed'
        ? t('jobDetail.confirmComplete')
        : t('jobDetail.confirmStatusUpdate', { status: nextStatus.replace(/_/g, ' ') });

    Alert.alert(t('common.confirm'), confirmMsg, [
      { text: t('common.cancel'), style: 'cancel', onPress: () => { actionLockRef.current = false; } },
      {
        text: t('common.confirm'),
        onPress: async () => {
          setActioning(true);
          try {
            await driverApi.updateJobStatus(ref, nextStatus);
            if (nextStatus === 'en_route') {
              await stopAlertSound();
            }
            if (nextStatus === 'completed') {
              heavyHaptic();
              playSound('job_completed');
            } else {
              mediumHaptic();
            }
            await fetchJob();
          } catch (err) {
            const msg =
              err instanceof ApiError && err.code === 'network'
                ? t('common.networkError')
                : err instanceof ApiError
                  ? err.message
                  : t('jobDetail.failedUpdate');
            Alert.alert(t('common.error'), msg);
          }
          setActioning(false);
          actionLockRef.current = false;
        },
      },
    ], { onDismiss: () => { actionLockRef.current = false; } });
  };

  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [sendingQuickMsg, setSendingQuickMsg] = useState<string | null>(null);
  const [sendingAdminIssue, setSendingAdminIssue] = useState<string | null>(null);
  const quickMsgLockRef = useRef(false);
  const adminIssueLockRef = useRef(false);
  // Controls the "confirm tyre size" modal shown before the in-app route opens.
  const [showTyreConfirm, setShowTyreConfirm] = useState(false);
  // Single-flight guard for opening the in-app route map so a double-tap
  // cannot push the route screen twice onto the navigation stack.
  const navLockRef = useRef(false);
  // Separate guard for launching the external maps app.
  const extNavLockRef = useRef(false);

  const checklistItems = useMemo(() => {
    if (!job) return [];
    if (jobStatus === 'en_route') return [
      { key: 'location', label: t('jobDetail.correctLocation') },
      { key: 'tools', label: t('jobDetail.toolsLoaded') },
    ];
    if (jobStatus === 'arrived') return [
      { key: 'parked', label: t('jobDetail.vehicleParked') },
      { key: 'customer', label: t('jobDetail.customerAware') },
      { key: 'tools', label: t('jobDetail.toolsReady') },
    ];
    return [];
  }, [job, jobStatus, t]);

  const toggleCheck = (key: string) =>
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));

  // Tyre summary built straight from the real job payload (never fabricated).
  // Mirrors the "{count} × {size}" format used on the route cockpit.
  const tyreCount =
    job?.tyres?.reduce((sum, ty) => sum + (ty.quantity ?? 0), 0) ?? 0;
  const tyreSizeSummary =
    job?.tyreSizeDisplay != null && job.tyreSizeDisplay.length > 0
      ? `${tyreCount > 0 ? tyreCount : 1} × ${job.tyreSizeDisplay}`
      : null;

  const paymentForJob = job?.paymentSummary ?? job?.payment ?? null;
  const amountToCollectPence = paymentForJob?.amountToCollectPence ?? 0;
  const hasCollection = amountToCollectPence > 0;
  const amountToCollectLabel = formatGbpFromPence(amountToCollectPence) ?? t('jobDetail.notAvailable');
  const readableStatus = job?.status?.replace(/_/g, ' ') ?? t('jobs.unknown');

  const QUICK_MESSAGES: CustomerQuickMessage[] = [
    { key: 'omw', label: t('jobDetail.imOnTheWay'), body: t('jobDetail.msgOnTheWay'), statuses: ['driver_assigned', 'en_route'] },
    { key: 'nearby', label: t('jobDetail.imNearby'), body: t('jobDetail.msgNearby'), statuses: ['en_route'] },
    { key: 'arrived', label: t('jobDetail.iveArrived'), body: t('jobDetail.msgArrived'), statuses: ['en_route', 'arrived'] },
    { key: '5min', label: t('jobDetail.fiveMoreMinutes'), body: t('jobDetail.msgFiveMin'), statuses: ['in_progress'] },
    { key: 'traffic', label: t('jobDetail.trafficDelay'), body: t('jobDetail.msgTrafficDelay'), statuses: ['en_route'] },
    { key: 'location', label: t('jobDetail.needExactLocation'), body: t('jobDetail.msgNeedExactLocation'), statuses: ['en_route', 'arrived'] },
    {
      key: 'payment',
      label: t('jobDetail.paymentReminder'),
      body: t('jobDetail.msgPaymentReminder', { amount: amountToCollectLabel }),
      statuses: ['arrived', 'in_progress'],
      requiresCollection: true,
    },
  ];

  const ADMIN_ISSUES: AdminIssueMessage[] = [
    {
      key: 'late',
      label: t('jobDetail.runningLate'),
      icon: 'time-outline',
      body: t('jobDetail.msgAdminRunningLate', {
        ref: job?.refNumber ?? '',
        status: readableStatus,
        customer: job?.customerName ?? '',
      }),
    },
    {
      key: 'unreachable',
      label: t('jobDetail.customerUnreachable'),
      icon: 'call-outline',
      body: t('jobDetail.msgAdminCustomerUnreachable', {
        ref: job?.refNumber ?? '',
        customer: job?.customerName ?? '',
        phone: job?.customerPhone ?? t('jobDetail.noPhoneNumber'),
      }),
    },
    {
      key: 'tyre',
      label: t('jobDetail.tyreIssue'),
      icon: 'disc-outline',
      urgent: true,
      body: t('jobDetail.msgAdminTyreIssue', {
        ref: job?.refNumber ?? '',
        tyre: tyreSizeSummary ?? t('jobDetail.notAvailable'),
        vehicle: [job?.vehicleReg, job?.vehicleMake, job?.vehicleModel].filter(Boolean).join(' · ') || t('jobs.noVehicle'),
      }),
    },
    {
      key: 'payment',
      label: t('jobDetail.paymentIssue'),
      icon: 'cash-outline',
      urgent: hasCollection,
      body: t('jobDetail.msgAdminPaymentIssue', {
        ref: job?.refNumber ?? '',
        amount: amountToCollectLabel,
        status: paymentForJob?.label ?? readableStatus,
      }),
    },
    {
      key: 'support',
      label: t('jobDetail.needSupport'),
      icon: 'help-buoy-outline',
      body: t('jobDetail.msgAdminNeedSupport', {
        ref: job?.refNumber ?? '',
        status: readableStatus,
        address: job?.addressLine ?? t('jobDetail.notAvailable'),
      }),
    },
  ];

  const sendQuickMessage = async (msg: CustomerQuickMessage) => {
    if (!job || quickMsgLockRef.current) return;
    quickMsgLockRef.current = true;
    setSendingQuickMsg(msg.key);
    try {
      const res = await chatApi.createConversation(job.id, 'customer_driver');
      await chatApi.sendMessage(res.conversationId, msg.body);
      Alert.alert(t('common.sent'), t('jobDetail.messageSent'));
    } catch {
      Alert.alert(t('common.error'), t('jobDetail.couldNotSend'));
    }
    setSendingQuickMsg(null);
    quickMsgLockRef.current = false;
  };

  const sendAdminIssue = async (issue: AdminIssueMessage) => {
    if (!job || adminIssueLockRef.current) return;
    adminIssueLockRef.current = true;
    setSendingAdminIssue(issue.key);
    try {
      const res = await chatApi.createConversation(job.id, 'admin_driver');
      await chatApi.sendMessage(res.conversationId, issue.body);
      mediumHaptic();
      Alert.alert(t('common.sent'), t('jobDetail.adminIssueSent'));
    } catch {
      Alert.alert(t('common.error'), t('jobDetail.couldNotReport'));
    }
    setSendingAdminIssue(null);
    adminIssueLockRef.current = false;
  };

  const { isRunning: openingChat, run: openAdminChat } = useSingleFlight(async () => {
    if (!job) return;
    try {
      const res = await chatApi.createConversation(job.id, 'admin_driver');
      router.push(`/(tabs)/chat/${res.conversationId}`);
    } catch {
      Alert.alert(t('common.error'), t('jobDetail.couldNotOpenChat'));
    }
  });

  const openRoute = () => {
    if (!ref || navLockRef.current) return;
    navLockRef.current = true;
    router.push(`/(tabs)/jobs/${ref}/route`);
    // Release shortly after so the screen can be re-opened later, but not
    // within the double-tap window that would stack two route screens.
    setTimeout(() => {
      navLockRef.current = false;
    }, 800);
  };

  // "Start in-app route" must confirm the correct tyre size first. Viewing job
  // details is never blocked — only starting the in-app route.
  const requestStartRoute = () => {
    if (navLockRef.current) return;
    if (tyreSizeSummary == null) {
      errorHaptic();
      Alert.alert(t('jobDetail.tyreSizeMissingTitle'), t('jobDetail.tyreSizeMissing'));
      return;
    }
    setShowTyreConfirm(true);
  };

  const confirmStartRoute = () => {
    setShowTyreConfirm(false);
    openRoute();
  };

  const openNavigation = () => {
    if (!job?.lat || !job?.lng || extNavLockRef.current) return;
    extNavLockRef.current = true;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`;
    Linking.openURL(url).finally(() => {
      setTimeout(() => {
        extNavLockRef.current = false;
      }, 800);
    });
  };

  const handleReject = async () => {
    if (!ref || actionLockRef.current) return;
    actionLockRef.current = true;
    Alert.alert(t('jobDetail.rejectJob'), t('jobDetail.confirmReject'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => { actionLockRef.current = false; } },
      {
        text: t('jobDetail.reject'),
        style: 'destructive',
        onPress: async () => {
          setActioning(true);
          try {
            errorHaptic();
            await driverApi.rejectJob(ref);
            await stopAlertSound();
            clearAlertedRef(ref);
            router.back();
          } catch (err) {
            const msg =
              err instanceof ApiError && err.code === 'network'
                ? t('common.networkError')
                : err instanceof ApiError
                  ? err.message
                  : t('jobDetail.failedReject');
            Alert.alert(t('common.error'), msg);
          }
          setActioning(false);
          actionLockRef.current = false;
        },
      },
    ], { onDismiss: () => { actionLockRef.current = false; } });
  };

  // Header title must always show the real booking ref — never the literal
  // route-segment name "[ref]". The `ref` param IS the booking ref (URL
  // segment value), so it is available even before the job payload loads;
  // once loaded we prefer the canonical `job.refNumber`.
  const headerTitle = job?.refNumber ?? (typeof ref === 'string' ? ref : '');

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: headerTitle }} />
        <LoadingScreen />
      </>
    );
  }

  if (!job) {
    return (
      <>
        <Stack.Screen options={{ title: headerTitle }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('jobs.jobNotFound')}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.linkText}>{t('common.goBack')}</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const DRIVER_ACTIONS = getDriverActions(t);
  const action = DRIVER_ACTIONS[job.status];

  return (
    <>
    <Stack.Screen options={{ title: headerTitle }} />
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
          <Text style={styles.contextChipText}>{job.serviceType?.replace(/_/g, ' ') || t('jobs.service')}</Text>
        </View>
        <View style={styles.contextChip}>
          <Ionicons name="car-outline" size={14} color={colors.accent} />
          <Text style={styles.contextChipText}>
            {[job.vehicleReg, job.vehicleMake].filter(Boolean).join(' · ') || t('jobs.noVehicle')}
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
        <Text style={styles.cardTitle}>{t('jobDetail.customer')}</Text>
        <Text style={styles.cardValue}>{job.customerName}</Text>
        {job.customerPhone ? (
          <Pressable onPress={() => Linking.openURL(`tel:${job.customerPhone}`)}>
            <Text style={styles.phoneLink}>{job.customerPhone}</Text>
          </Pressable>
        ) : (
          <Text style={styles.phoneEmpty}>{t('jobDetail.noPhoneNumber')}</Text>
        )}
      </View>

      {/* Payment */}
      <PaymentCard payment={job.paymentSummary ?? job.payment ?? null} refNumber={job.refNumber} t={t} />

      {/* Quick Status Messages */}
      {['driver_assigned', 'en_route', 'arrived', 'in_progress'].includes(job.status) && (
        <View style={styles.quickMsgSection}>
          <Text style={styles.quickMsgTitle}>{t('jobDetail.quickMessage')}</Text>
          <Text style={styles.quickMsgSubtitle}>{t('jobDetail.quickMessageSubtitle')}</Text>
          <View style={styles.quickMsgRow}>
            {QUICK_MESSAGES
              .filter((m) => m.statuses.includes(job.status) && (!m.requiresCollection || hasCollection))
              .map((m) => (
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

      {['driver_assigned', 'en_route', 'arrived', 'in_progress'].includes(job.status) && (
        <View style={styles.opsToolsSection}>
          <View style={styles.opsToolsHeader}>
            <View style={styles.opsToolsIcon}>
              <Ionicons name="radio-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.opsToolsCopy}>
              <Text style={styles.quickMsgTitle}>{t('jobDetail.adminTools')}</Text>
              <Text style={styles.quickMsgSubtitle}>{t('jobDetail.adminToolsSubtitle')}</Text>
            </View>
          </View>
          <View style={styles.opsToolGrid}>
            {ADMIN_ISSUES.map((issue) => {
              const sending = sendingAdminIssue === issue.key;
              return (
                <Pressable
                  key={issue.key}
                  style={[
                    styles.opsToolButton,
                    issue.urgent && styles.opsToolButtonUrgent,
                    sending && styles.buttonDisabled,
                  ]}
                  onPress={() => sendAdminIssue(issue)}
                  disabled={!!sendingAdminIssue}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons
                      name={issue.icon}
                      size={18}
                      color={issue.urgent ? '#FDBA74' : colors.accent}
                    />
                  )}
                  <Text style={styles.opsToolButtonText} numberOfLines={2}>
                    {issue.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Location */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('jobDetail.location')}</Text>
        <Text style={styles.cardValue}>{job.addressLine}</Text>
        {job.lat && job.lng && (
          <View style={styles.locationButtons}>
            <Pressable
              style={styles.navButton}
              onPress={requestStartRoute}
            >
              <Ionicons name="navigate-outline" size={18} color="#FFFFFF" />
              <Text style={styles.navButtonText}>{t('jobDetail.startInAppRoute')}</Text>
            </Pressable>
            <Pressable
              style={[styles.navButton, styles.mapViewButton]}
              onPress={openNavigation}
            >
              <Ionicons name="open-outline" size={18} color="#FFFFFF" />
              <Text style={styles.navButtonText}>{t('jobDetail.openInMaps')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Schedule */}
      {job.scheduledAt && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('jobDetail.scheduled')}</Text>
          <Text style={styles.cardValue}>
            {format(new Date(job.scheduledAt), 'EEEE, dd MMM yyyy · HH:mm', { locale: dateLocale })}
          </Text>
        </View>
      )}

      {/* Vehicle */}
      {(job.vehicleReg || job.vehicleMake) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('jobDetail.vehicle')}</Text>
          <Text style={styles.cardValue}>
            {[job.vehicleReg, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' · ')}
          </Text>
          {job.lockingNutStatus && (
            <Text style={styles.cardMeta}>{t('jobDetail.lockingNut', { status: job.lockingNutStatus })}</Text>
          )}
        </View>
      )}

      {/* Tyres */}
      {job.tyres.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('jobDetail.tyres')}</Text>
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
          <Text style={styles.cardTitle}>{t('jobDetail.notes')}</Text>
          <Text style={styles.cardValue}>{job.notes}</Text>
        </View>
      )}

      {/* Arrival Readiness Checklist */}
      {checklistItems.length > 0 && (
        <View style={styles.checklistCard}>
          <Text style={styles.cardTitle}>
            {job.status === 'en_route' ? t('jobDetail.beforeArriving') : t('jobDetail.beforeStarting')}
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
          <Text style={styles.callAdminText}>{t('jobDetail.callAdmin')}</Text>
        </Pressable>
        <Pressable
          style={[styles.chatAdminButton, openingChat && styles.buttonDisabled]}
          disabled={openingChat}
          onPress={() => void openAdminChat()}
        >
          <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
          <Text style={styles.chatAdminText}>{t('jobDetail.chatWithAdmin')}</Text>
        </Pressable>
      </View>

      {/* Actions */}
      {job.status === 'driver_assigned' && (
        <Animated.View entering={FadeInDown.duration(300)} style={styles.actionRow}>
          <AnimatedPressable
            style={[styles.actionButton, styles.acceptButton, actioning && styles.buttonDisabled]}
            onPress={() => handleStatusAction(DRIVER_ACTIONS.driver_assigned.next)}
            disabled={actioning}
            pressScale={0.95}
          >
            <Text style={styles.actionButtonText}>
              {actioning ? t('common.updating') : DRIVER_ACTIONS.driver_assigned.label}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.actionButton, styles.rejectButton, actioning && styles.buttonDisabled]}
            onPress={handleReject}
            disabled={actioning}
            pressScale={0.95}
          >
            <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>{t('jobDetail.reject')}</Text>
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
            {actioning ? t('common.updating') : action.label}
          </Text>
        </AnimatedPressable>
      )}

      {/* Status History */}
      {job.statusHistory.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.cardTitle}>{t('jobDetail.statusHistory')}</Text>
          {job.statusHistory.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <View style={styles.dot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyStatus}>
                  {h.toStatus.replace(/_/g, ' ')}
                </Text>
                {h.createdAt && (
                  <Text style={styles.historyTime}>
                    {format(new Date(h.createdAt), 'dd MMM, HH:mm', { locale: dateLocale })}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>

      {/* Confirm tyre size before starting the in-app route. */}
      <Modal
        visible={showTyreConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTyreConfirm(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('jobDetail.confirmTyreTitle')}</Text>
            <Text style={styles.modalMessage}>{t('jobDetail.confirmTyreMessage')}</Text>
            <View style={styles.modalTyreRow}>
              <Ionicons name="disc-outline" size={18} color={colors.accent} />
              <Text style={styles.modalTyreText}>
                {t('jobDetail.confirmTyreRequired', { summary: tyreSizeSummary ?? '' })}
              </Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowTyreConfirm(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>
                  {t('jobDetail.confirmTyreGoBack')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={confirmStartRoute}
              >
                <Text style={styles.modalButtonPrimaryText}>
                  {t('jobDetail.confirmTyreStart')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
  },
  modalMessage: {
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  modalTyreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  modalTyreText: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  modalButtonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonSecondaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  modalButtonPrimary: {
    backgroundColor: colors.accent,
  },
  modalButtonPrimaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: '#0B0F1A',
    fontWeight: '800',
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
  phoneEmpty: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 4,
  },
  payToneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  payToneLabel: {
    fontSize: fontSize.base,
    fontWeight: '800',
  },
  payToneDesc: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    opacity: 0.85,
    marginTop: 1,
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
  quickMsgSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginBottom: spacing.sm,
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
  opsToolsSection: {
    marginBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  opsToolsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  opsToolsIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.28)',
  },
  opsToolsCopy: {
    flex: 1,
    minWidth: 0,
  },
  opsToolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  opsToolButton: {
    minHeight: 48,
    minWidth: '31%',
    flexGrow: 1,
    flexBasis: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  opsToolButtonUrgent: {
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderColor: 'rgba(249,115,22,0.45)',
  },
  opsToolButtonText: {
    flexShrink: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.text,
    textAlign: 'center',
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
