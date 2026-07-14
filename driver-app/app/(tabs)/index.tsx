import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  AppState,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { driverApi, JobSummary, ApiError, getApiUrl, getToken } from '@/api/client';
import { useAuth } from '@/auth/context';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useLivePolling } from '@/hooks/useLivePolling';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { AlertReadinessPill } from '@/components/AlertReadinessPill';
import { lightHaptic } from '@/services/haptics';
import { useNewJobDetector } from '@/hooks/useNewJobDetector';
import { DriverAlertWatcher } from '@/services/driver-watcher';
import { useI18n } from '@/i18n';
import { getDriverPaymentDisplay } from '@/lib/payment-status';
import {
  requestLocationPermissions,
  startBackgroundLocation,
} from '@/services/background-location';

const DASHBOARD_BACKGROUND = require('../../assets/dashboard-bg.jpg');
type DashboardIconName = keyof typeof Ionicons.glyphMap;
type BriefingIconName = keyof typeof Ionicons.glyphMap;
type Translate = (key: string, vars?: Record<string, string | number>) => string;

const TRACKED_JOB_STATUSES = new Set(['driver_assigned', 'en_route', 'arrived', 'in_progress']);

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

function PulsingDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.8, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, true);
    opacity.value = withRepeat(withTiming(0.2, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, true);
  }, [opacity, scale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={pulseStyles.wrap}>
      <Animated.View style={[pulseStyles.ring, ringStyle]} />
      <View style={pulseStyles.dot} />
    </View>
  );
}

const pulseStyles = StyleSheet.create({
  wrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
});

function formatSyncTime(ms: number | null, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (!ms) return t('dashboard.syncing');
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 5) return t('dashboard.justNow');
  if (diff < 60) return t('dashboard.secondsAgo', { count: diff });
  return t('dashboard.minutesAgo', { count: Math.floor(diff / 60) });
}

function moneyFromPence(pence: number): string {
  return gbpFormatter.format(pence / 100);
}

function formatBriefingTime(value: string | null | undefined, dateLocale: DateFnsLocale | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return format(date, 'EEE HH:mm', { locale: dateLocale });
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function sortByOperationalPriority(a: JobSummary, b: JobSummary): number {
  const activeOrder: Record<string, number> = {
    en_route: 0,
    arrived: 1,
    in_progress: 2,
    driver_assigned: 3,
  };
  const aRank = activeOrder[a.status] ?? 9;
  const bRank = activeOrder[b.status] ?? 9;
  if (aRank !== bRank) return aRank - bRank;
  return toTimestamp(a.scheduledAt ?? a.createdAt) - toTimestamp(b.scheduledAt ?? b.createdAt);
}

function hasUsableAddress(job: JobSummary): boolean {
  return Boolean(job.addressLine?.trim() && job.lat && job.lng);
}

function getAttentionReason(job: JobSummary, t: Translate): { title: string; body: string; icon: BriefingIconName } | null {
  const payment = job.paymentSummary ?? job.payment ?? null;
  const paymentDisplay = payment ? getDriverPaymentDisplay(payment, job.refNumber) : null;

  if (paymentDisplay && ['warning', 'failed', 'unknown', 'pending'].includes(paymentDisplay.tone)) {
    return {
      title: t('dashboard.paymentCheck'),
      body: `#${job.refNumber} · ${t(paymentDisplay.labelKey)}`,
      icon: 'cash-outline',
    };
  }

  if (!job.tyreSizeDisplay?.trim()) {
    return {
      title: t('dashboard.missingTyre'),
      body: `#${job.refNumber} · ${job.customerName}`,
      icon: 'disc-outline',
    };
  }

  if (!hasUsableAddress(job)) {
    return {
      title: t('dashboard.missingAddress'),
      body: `#${job.refNumber} · ${job.customerName}`,
      icon: 'location-outline',
    };
  }

  return null;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t, dateLocale } = useI18n();
  const [isOnline, setIsOnline] = useState(false);
  const [activeJobs, setActiveJobs] = useState<JobSummary[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<JobSummary[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncLabel, setSyncLabel] = useState(t('dashboard.syncing'));
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Alert/readiness gates "go online". Android checks native full-screen
  // alert readiness; iOS checks Apple-compliant notification and background
  // location readiness without promising Android-style lock-screen overlays.
  const [, setAlertReady] = useState({
    notifications: true,
    watcher: true,
    fullScreen: true,
    battery: true,
    locationForeground: true,
    locationBackground: true,
  });

  const trackingJob =
    activeJobs.find((job) => TRACKED_JOB_STATUSES.has(job.status)) ??
    upcomingJobs.find((job) => TRACKED_JOB_STATUSES.has(job.status)) ??
    null;
  const trackingJobRef = trackingJob?.refNumber ?? null;
  const shouldBroadcastLocation = isOnline || trackingJobRef != null;
  const bgRunning = shouldBroadcastLocation;
  const requestLocationPermission = requestLocationPermissions;
  const { checkForNewJobs } = useNewJobDetector();

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, jobsRes] = await Promise.all([
        driverApi.getStatus(),
        driverApi.getJobs(),
      ]);
      setIsOnline(statusRes.isOnline);

      // Detect newly assigned jobs from both active + upcoming
      const allVisibleJobs = [...jobsRes.active, ...(jobsRes.upcoming ?? [])];
      checkForNewJobs(allVisibleJobs);

      setActiveJobs(jobsRes.upcoming ? jobsRes.active.filter((j: JobSummary) => j.status !== 'driver_assigned') : jobsRes.active);
      setUpcomingJobs(jobsRes.upcoming ?? []);
      setCompletedCount(jobsRes.completed.length);
      setLastSync(Date.now());
      setFetchError(null);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.code === 'network'
          ? t('common.networkError')
          : err instanceof Error && err.message
            ? err.message
            : t('common.networkError');
      setFetchError(msg);
    }
  }, [checkForNewJobs, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRefreshOnFocus(fetchData);

  // Live polling while online
  useLivePolling(fetchData, isOnline);

  // Update sync label every 5s
  useEffect(() => {
    const timer = setInterval(() => setSyncLabel(formatSyncTime(lastSync, t)), 5000);
    setSyncLabel(formatSyncTime(lastSync, t));
    return () => clearInterval(timer);
  }, [lastSync, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const primaryJobRef = activeJobs[0]?.refNumber ?? upcomingJobs[0]?.refNumber ?? null;
  const visibleJobs = useMemo(
    () => [...activeJobs, ...upcomingJobs].sort(sortByOperationalPriority),
    [activeJobs, upcomingJobs],
  );
  const nextJob = visibleJobs[0] ?? null;
  const nextJobTime = formatBriefingTime(nextJob?.scheduledAt, dateLocale);
  const collectionJobs = useMemo(
    () => visibleJobs.filter((job) => ((job.paymentSummary ?? job.payment)?.amountToCollectPence ?? 0) > 0),
    [visibleJobs],
  );
  const collectionTotalPence = useMemo(
    () => collectionJobs.reduce(
      (total, job) => total + ((job.paymentSummary ?? job.payment)?.amountToCollectPence ?? 0),
      0,
    ),
    [collectionJobs],
  );
  const attentionJobs = useMemo(
    () => visibleJobs
      .map((job) => ({ job, reason: getAttentionReason(job, t) }))
      .filter((item): item is { job: JobSummary; reason: NonNullable<ReturnType<typeof getAttentionReason>> } => item.reason != null),
    [visibleJobs, t],
  );
  const topAttention = attentionJobs[0] ?? null;
  const cockpitTone = activeJobs.length > 0 ? 'active' : isOnline ? 'online' : 'offline';
  const cockpitAccent =
    cockpitTone === 'active'
      ? colors.accent
      : cockpitTone === 'online'
        ? colors.success
        : colors.muted;
  const cockpitIconBg =
    cockpitTone === 'active'
      ? 'rgba(249,115,22,0.15)'
      : cockpitTone === 'online'
        ? 'rgba(34,197,94,0.15)'
        : 'rgba(161,161,170,0.13)';
  const cockpitIcon: DashboardIconName =
    cockpitTone === 'active'
      ? 'navigate'
      : cockpitTone === 'online'
        ? 'radio'
        : 'power';
  const cockpitStateLabel =
    cockpitTone === 'active'
      ? t('dashboard.activeJobReady')
      : cockpitTone === 'online'
        ? t('dashboard.liveForDispatch')
        : t('dashboard.standbyMode');
  const cockpitStateHint =
    cockpitTone === 'active'
      ? t('dashboard.activeJobHint', { count: activeJobs.length })
      : isOnline
        ? t('dashboard.readyToReceive')
        : t('dashboard.toggleOn');
  const priorityActionLabel = primaryJobRef
    ? t('dashboard.openPriorityJob')
    : t('dashboard.viewJobs');

  const handleOpenPriority = useCallback(() => {
    lightHaptic();
    if (primaryJobRef) {
      router.push(`/(tabs)/jobs/${primaryJobRef}`);
      return;
    }
    router.push('/(tabs)/jobs');
  }, [primaryJobRef, router]);

  const handleManualRefresh = useCallback(() => {
    lightHaptic();
    void onRefresh();
  }, [onRefresh]);

  const handleOpenReadiness = useCallback(() => {
    lightHaptic();
    router.push('/(tabs)/profile');
  }, [router]);

  // Re-check alert readiness. Returns the freshly read flags so callers can
  // act on them immediately without waiting for a state flush.
  const refreshAlertReadiness = useCallback(async () => {
    try {
      const androidNativeReady = Platform.OS === 'android' && DriverAlertWatcher.isAvailable();
      const notificationPermission =
        Platform.OS === 'web'
          ? Promise.resolve({ status: 'granted' as const })
          : Notifications.getPermissionsAsync();
      const [fgLocation, bgLocation, notifications, watcher, fullScreen, batteryExempt] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        androidNativeReady
          ? DriverAlertWatcher.areNotificationsEnabled()
          : notificationPermission.then((result) => result.status === 'granted'),
        androidNativeReady ? DriverAlertWatcher.isArmed() : Promise.resolve(true),
        androidNativeReady ? DriverAlertWatcher.canUseFullScreenIntent() : Promise.resolve(true),
        androidNativeReady ? DriverAlertWatcher.isIgnoringBatteryOptimizations() : Promise.resolve(true),
      ]);
      const next = {
        notifications,
        watcher,
        fullScreen,
        battery: batteryExempt,
        locationForeground: fgLocation.status === 'granted',
        locationBackground: bgLocation.status === 'granted',
      };
      setAlertReady(next);
      return next;
    } catch {
      const fallback = {
        notifications: false,
        watcher: false,
        fullScreen: false,
        battery: false,
        locationForeground: false,
        locationBackground: false,
      };
      setAlertReady(fallback);
      return fallback;
    }
  }, []);

  const ensureWatcherArmed = useCallback(async () => {
    if (Platform.OS !== 'android' || !DriverAlertWatcher.isAvailable()) return true;
    const token = await getToken();
    if (!token) return false;
    const apiBase = await getApiUrl();
    await DriverAlertWatcher.startWatcher(apiBase, token);
    return DriverAlertWatcher.isArmed();
  }, []);

  // Check on mount and whenever the app returns to the foreground, so the gate
  // clears automatically after the driver grants the permission in Settings.
  useEffect(() => {
    refreshAlertReadiness();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAlertReadiness();
    });
    return () => sub.remove();
  }, [refreshAlertReadiness]);

  const handleToggleOnline = async (value: boolean) => {
    lightHaptic();
    setToggling(true);
    try {
      // Going OFF needs no gating. Going ON is hard-gated so the driver can't
      // go online into a state where lock-screen alerts or tracking silently fail.
      if (value) {
        let ready = await refreshAlertReadiness();
        if (!ready.watcher && await ensureWatcherArmed()) {
          ready = await refreshAlertReadiness();
        }

        if (!ready.notifications) {
          Alert.alert(
            t('dashboard.alertPermsRequiredTitle'),
            t('dashboard.notificationsRequired'),
            [
              { text: t('dashboard.cancel'), style: 'cancel' },
              {
                text: t('dashboard.openSettings'),
                onPress: () => {
                  if (Platform.OS === 'android') {
                    void DriverAlertWatcher.openAppNotificationSettings();
                  } else {
                    void Linking.openSettings();
                  }
                },
              },
            ],
          );
          return;
        }
        if (!ready.locationForeground || !ready.locationBackground) {
          Alert.alert(
            t('dashboard.alertPermsRequiredTitle'),
            t('dashboard.locationRequired'),
            [
              { text: t('dashboard.cancel'), style: 'cancel' },
              {
                text: t('common.grant'),
                onPress: () => {
                  void requestLocationPermission().then(() => refreshAlertReadiness());
                },
              },
            ],
          );
          return;
        }
        if (!ready.watcher) {
          Alert.alert(
            t('dashboard.alertPermsRequiredTitle'),
            t('dashboard.watcherRequired'),
            [
              { text: t('dashboard.cancel'), style: 'cancel' },
              {
                text: t('common.retry'),
                onPress: () => {
                  void ensureWatcherArmed().then(() => refreshAlertReadiness());
                },
              },
            ],
          );
          return;
        }
        if (!ready.fullScreen) {
          Alert.alert(
            t('dashboard.alertPermsRequiredTitle'),
            t('dashboard.fullScreenAlertRequired'),
            [
              { text: t('dashboard.cancel'), style: 'cancel' },
              {
                text: t('dashboard.openSettings'),
                onPress: () => { void DriverAlertWatcher.openFullScreenAlertSettings(); },
              },
            ],
          );
          return;
        }
        if (!ready.battery) {
          Alert.alert(
            t('dashboard.alertPermsRequiredTitle'),
            t('dashboard.batteryOptRequired'),
            [
              { text: t('dashboard.cancel'), style: 'cancel' },
              {
                text: t('dashboard.openSettings'),
                onPress: () => { void DriverAlertWatcher.openBatterySettings(); },
              },
            ],
          );
          return;
        }
      }

      const res = await driverApi.setOnline(value);
      setIsOnline(res.isOnline);
      if (res.isOnline) {
        void startBackgroundLocation();
      }
    } catch (err) {
      const serverMsg =
        err instanceof ApiError && err.code === 'network'
          ? t('common.networkError')
          : err instanceof Error && err.message
            ? err.message
            : null;
      Alert.alert(
        t('common.error'),
        serverMsg ?? t('dashboard.failedUpdateStatus'),
      );
    } finally {
      setToggling(false);
    }
  };

  return (
    <ImageBackground
      source={DASHBOARD_BACKGROUND}
      resizeMode="cover"
      style={styles.background}
      imageStyle={styles.backgroundImage}
    >
      <View style={[styles.backgroundOverlay, styles.noPointerEvents]} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <Animated.View entering={FadeInDown.duration(300)} style={styles.cockpitCard}>
          <View style={styles.cockpitTopRow}>
            <View style={styles.cockpitTitleBlock}>
              <Text style={styles.cockpitEyebrow}>{t('dashboard.driverCockpit')}</Text>
              <Text style={styles.greeting} numberOfLines={1}>
                {t('dashboard.greeting', { name: user?.name?.split(' ')[0] ?? 'Driver' })}
              </Text>
            </View>
            <View
              style={[
                styles.onlineBadge,
                {
                  borderColor: isOnline ? 'rgba(34,197,94,0.38)' : 'rgba(161,161,170,0.24)',
                  backgroundColor: isOnline ? 'rgba(34,197,94,0.13)' : 'rgba(39,39,42,0.72)',
                },
              ]}
            >
              {isOnline ? <PulsingDot /> : <View style={[styles.statusDot, styles.statusDotOffline]} />}
              <Text style={[styles.onlineBadgeText, { color: isOnline ? colors.success : colors.muted }]}>
                {isOnline ? t('common.online') : t('common.offline')}
              </Text>
            </View>
          </View>

          <View style={styles.cockpitStatusRow}>
            <View style={[styles.cockpitIconWrap, { backgroundColor: cockpitIconBg }]}>
              <Ionicons name={cockpitIcon} size={24} color={cockpitAccent} />
            </View>
            <View style={styles.cockpitCopy}>
              <Text style={styles.cockpitState} numberOfLines={1}>{cockpitStateLabel}</Text>
              <Text style={styles.cockpitHint} numberOfLines={2}>{cockpitStateHint}</Text>
            </View>
            <Switch
              value={isOnline}
              onValueChange={handleToggleOnline}
              disabled={toggling}
              trackColor={{ false: colors.border, true: '#22C55E' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.cockpitStats}>
            <View style={styles.cockpitStat}>
              <Text style={styles.statNumber}>{activeJobs.length}</Text>
              <Text style={styles.statLabel}>{t('dashboard.active')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.cockpitStat}>
              <Text style={styles.statNumber}>{upcomingJobs.length}</Text>
              <Text style={styles.statLabel}>{t('dashboard.upcoming')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.cockpitStat}>
              <Text style={styles.statNumber}>{completedCount}</Text>
              <Text style={styles.statLabel}>{t('dashboard.done')}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.quickActionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenPriority}
            style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
          >
            <Ionicons name={primaryJobRef ? 'navigate-circle' : 'briefcase-outline'} size={19} color={colors.accent} />
            <Text style={styles.quickActionText} numberOfLines={1}>{priorityActionLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleManualRefresh}
            disabled={refreshing}
            style={({ pressed }) => [
              styles.quickAction,
              (pressed || refreshing) && styles.quickActionPressed,
            ]}
          >
            <Ionicons name="refresh" size={19} color={colors.accent} />
            <Text style={styles.quickActionText} numberOfLines={1}>{t('dashboard.refresh')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenReadiness}
            style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
          >
            <Ionicons name="shield-checkmark-outline" size={19} color={colors.accent} />
            <Text style={styles.quickActionText} numberOfLines={1}>{t('dashboard.readiness')}</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(80)} style={styles.briefingCard}>
          <View style={styles.briefingHeader}>
            <View>
              <Text style={styles.briefingEyebrow}>{t('dashboard.opsBriefing')}</Text>
              <Text style={styles.briefingTitle}>{t('dashboard.todayBriefing')}</Text>
            </View>
            <Ionicons name="clipboard-outline" size={20} color={colors.accent} />
          </View>

          <View style={styles.briefingGrid}>
            <Pressable
              accessibilityRole="button"
              onPress={nextJob ? () => router.push(`/(tabs)/jobs/${nextJob.refNumber}`) : undefined}
              disabled={!nextJob}
              style={({ pressed }) => [styles.briefingTile, pressed && styles.briefingTilePressed]}
            >
              <View style={styles.briefingTileIcon}>
                <Ionicons name="navigate-outline" size={17} color={colors.accent} />
              </View>
              <Text style={styles.briefingTileLabel}>{t('dashboard.nextJob')}</Text>
              <Text style={styles.briefingTileValue} numberOfLines={1}>
                {nextJob ? `#${nextJob.refNumber}` : t('dashboard.noNextJob')}
              </Text>
              <Text style={styles.briefingTileMeta} numberOfLines={1}>
                {nextJob ? (nextJobTime ?? nextJob.customerName) : t('dashboard.clear')}
              </Text>
            </Pressable>

            <View style={styles.briefingTile}>
              <View style={styles.briefingTileIcon}>
                <Ionicons name="wallet-outline" size={17} color={colors.accent} />
              </View>
              <Text style={styles.briefingTileLabel}>{t('dashboard.toCollect')}</Text>
              <Text style={styles.briefingTileValue} numberOfLines={1}>
                {collectionTotalPence > 0 ? moneyFromPence(collectionTotalPence) : t('dashboard.noCollection')}
              </Text>
              <Text style={styles.briefingTileMeta} numberOfLines={1}>
                {t('dashboard.collectionJobs', { count: collectionJobs.length })}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={topAttention ? () => router.push(`/(tabs)/jobs/${topAttention.job.refNumber}`) : undefined}
              disabled={!topAttention}
              style={({ pressed }) => [
                styles.briefingTile,
                topAttention && styles.briefingTileWarning,
                pressed && styles.briefingTilePressed,
              ]}
            >
              <View style={[styles.briefingTileIcon, topAttention && styles.briefingTileIconWarning]}>
                <Ionicons
                  name={topAttention?.reason.icon ?? 'shield-checkmark-outline'}
                  size={17}
                  color={topAttention ? '#FDBA74' : colors.success}
                />
              </View>
              <Text style={styles.briefingTileLabel}>{t('dashboard.needsCheck')}</Text>
              <Text style={styles.briefingTileValue} numberOfLines={1}>
                {attentionJobs.length}
              </Text>
              <Text style={styles.briefingTileMeta} numberOfLines={1}>
                {topAttention ? topAttention.reason.title : t('dashboard.clear')}
              </Text>
            </Pressable>
          </View>

          {topAttention && (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.attentionStrip, pressed && styles.quickActionPressed]}
              onPress={() => router.push(`/(tabs)/jobs/${topAttention.job.refNumber}`)}
            >
              <View style={styles.attentionIcon}>
                <Ionicons name={topAttention.reason.icon} size={18} color="#FDBA74" />
              </View>
              <View style={styles.attentionCopy}>
                <Text style={styles.attentionTitle} numberOfLines={1}>{topAttention.reason.title}</Text>
                <Text style={styles.attentionBody} numberOfLines={1}>{topAttention.reason.body}</Text>
              </View>
              <Text style={styles.attentionAction} numberOfLines={1}>{t('dashboard.openIssue')}</Text>
            </Pressable>
          )}
        </Animated.View>

        {/* Alert readiness pill — surfaces notification, watcher, full-screen,
            battery, and location state before a driver goes online. */}
        <AlertReadinessPill />

        {/* Network / auth error banner — surfaces the *real* server message instead of silent failure */}
        {fetchError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText} numberOfLines={3}>
              {fetchError}
            </Text>
          </View>
        )}

        {/* Live Status Panel — shown when online with no active jobs */}
        {isOnline && activeJobs.length === 0 && (
          <Animated.View entering={FadeInDown.duration(300).delay(90)} style={styles.livePanel}>
            <View style={styles.livePanelHeader}>
              <PulsingDot />
              <Text style={styles.livePanelTitle}>{t('dashboard.searchingForJobs')}</Text>
            </View>
            <Text style={styles.livePanelSubtitle}>{t('dashboard.readyToReceive')}</Text>
            <View style={styles.livePanelInfo}>
              <View style={styles.liveRow}>
                <View style={[styles.liveIndicator, { backgroundColor: colors.success }]} />
                <Text style={styles.liveText}>{t('common.online')}</Text>
              </View>
              <View style={styles.liveRow}>
                <View style={[styles.liveIndicator, { backgroundColor: bgRunning ? colors.success : colors.info }]} />
                <Text style={styles.liveText}>
                  {bgRunning ? t('dashboard.locationSharingActive') : t('dashboard.locationSignalActive')}
                </Text>
              </View>
              <View style={styles.liveRow}>
                <View style={[styles.liveIndicator, { backgroundColor: colors.muted }]} />
                <Text style={styles.liveText}>{t('dashboard.lastSync', { time: syncLabel })}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('dashboard.activeJobs')}</Text>
            {activeJobs.map((job, index) => (
              <Animated.View key={job.id} entering={FadeInDown.duration(300).delay(180 + index * 60)}>
                <JobCard
                  job={job}
                  onPress={() => router.push(`/(tabs)/jobs/${job.refNumber}`)}
                />
              </Animated.View>
            ))}
          </View>
        )}

        {/* Upcoming Jobs */}
        {upcomingJobs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('dashboard.upcomingJobs')}</Text>
            {upcomingJobs.map((job, index) => (
              <Animated.View key={job.id} entering={FadeInDown.duration(300).delay(240 + index * 60)}>
                <JobCard
                  job={job}
                  onPress={() => router.push(`/(tabs)/jobs/${job.refNumber}`)}
                />
              </Animated.View>
            ))}
          </View>
        )}

        {activeJobs.length === 0 && !isOnline && (
          <EmptyState
            icon="cloud-offline-outline"
            title={t('dashboard.youAreOfflineTitle')}
            message={t('dashboard.goOnlineMessage')}
          />
        )}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  backgroundImage: {
    opacity: 0.64,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,14,0.68)',
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  cockpitCard: {
    backgroundColor: 'rgba(16,18,24,0.82)',
    borderRadius: radius.xxl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: spacing.md,
    ...cardShadow,
  },
  cockpitTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  cockpitTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cockpitEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  greeting: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 34,
    color: colors.text,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  onlineBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
  },
  cockpitStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cockpitIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cockpitCopy: {
    flex: 1,
    minWidth: 0,
  },
  cockpitState: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: fontSize.base,
    color: colors.text,
  },
  cockpitHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 2,
  },
  cockpitStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  cockpitStat: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickAction: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(24,24,27,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  quickActionPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  quickActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.text,
    textAlign: 'center',
  },
  briefingCard: {
    backgroundColor: 'rgba(16,18,24,0.88)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: spacing.md,
    ...cardShadow,
  },
  briefingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  briefingEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  briefingTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  briefingGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  briefingTile: {
    flex: 1,
    minHeight: 116,
    minWidth: 0,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(39,39,42,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  briefingTilePressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }],
  },
  briefingTileWarning: {
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderColor: 'rgba(249,115,22,0.4)',
  },
  briefingTileIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,115,22,0.12)',
    marginBottom: spacing.sm,
  },
  briefingTileIconWarning: {
    backgroundColor: 'rgba(249,115,22,0.18)',
  },
  briefingTileLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginBottom: 2,
  },
  briefingTileValue: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: fontSize.base,
    color: colors.text,
    minHeight: 20,
  },
  briefingTileMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 2,
  },
  attentionStrip: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.34)',
  },
  attentionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,115,22,0.18)',
  },
  attentionCopy: {
    flex: 1,
    minWidth: 0,
  },
  attentionTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: fontSize.sm,
    color: '#FDBA74',
  },
  attentionBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 1,
  },
  attentionAction: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.accent,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  errorBanner: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderColor: 'rgba(220, 38, 38, 0.4)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: fontSize.sm,
    color: '#FCA5A5',
  },
  statusLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: colors.text,
  },
  statusHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotOffline: {
    backgroundColor: colors.muted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...cardShadow,
  },
  statNumber: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 36,
    color: colors.accent,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  // Live status panel
  livePanel: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  livePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  livePanelTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: colors.success,
  },
  livePanelSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  livePanelInfo: {
    gap: spacing.sm,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
});
