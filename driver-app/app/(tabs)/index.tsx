import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  AppState,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { driverApi, JobSummary, ApiError, getApiUrl, getToken } from '@/api/client';
import { useAuth } from '@/auth/context';
import { useLocationBroadcast } from '@/hooks/useLocation';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useLivePolling } from '@/hooks/useLivePolling';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { AlertReadinessPill } from '@/components/AlertReadinessPill';
import { lightHaptic } from '@/services/haptics';
import { JobCardSkeleton } from '@/components/SkeletonLoader';
import { useNewJobDetector } from '@/hooks/useNewJobDetector';
import { DriverAlertWatcher } from '@/services/driver-watcher';
import { useI18n } from '@/i18n';

function PulsingDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.8, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, true);
    opacity.value = withRepeat(withTiming(0.2, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, true);
  }, []);

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

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [isOnline, setIsOnline] = useState(false);
  const [activeJobs, setActiveJobs] = useState<JobSummary[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<JobSummary[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncLabel, setSyncLabel] = useState(t('dashboard.syncing'));
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Alert/readiness gates "go online". On Android these must be true before a
  // locked-screen job alert and active-job tracking can reliably work.
  const [, setAlertReady] = useState({
    notifications: true,
    watcher: true,
    fullScreen: true,
    battery: true,
    locationForeground: true,
    locationBackground: true,
  });

  const { bgRunning, requestPermission: requestLocationPermission } = useLocationBroadcast(
    isOnline,
    activeJobs.length > 0,
    activeJobs[0]?.refNumber ?? null,
  );
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

  // Re-check alert readiness. Returns the freshly read flags so callers can
  // act on them immediately without waiting for a state flush.
  const refreshAlertReadiness = useCallback(async () => {
    try {
      const androidNativeReady = Platform.OS === 'android' && DriverAlertWatcher.isAvailable();
      const [fgLocation, bgLocation, notifications, watcher, fullScreen, batteryExempt] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        androidNativeReady ? DriverAlertWatcher.areNotificationsEnabled() : Promise.resolve(true),
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
                onPress: () => { void DriverAlertWatcher.openAppNotificationSettings(); },
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
      {/* Greeting */}
      <Animated.Text entering={FadeInDown.duration(300)} style={styles.greeting}>
        {t('dashboard.greeting', { name: user?.name?.split(' ')[0] ?? 'Driver' })}
      </Animated.Text>

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

      {/* Online Toggle */}
      <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.statusCard}>
        <View>
          <Text style={styles.statusLabel}>
            {isOnline ? t('dashboard.youAreOnline') : t('dashboard.youAreOffline')}
          </Text>
          <Text style={styles.statusHint}>
            {isOnline
              ? t('dashboard.receivingJobs')
              : t('dashboard.toggleOn')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {isOnline ? <PulsingDot /> : <View style={[styles.statusDot, styles.statusDotOffline]} />}
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            disabled={toggling}
            trackColor={{ false: colors.border, true: '#22C55E' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </Animated.View>

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

      {/* Stats */}
      <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activeJobs.length}</Text>
          <Text style={styles.statLabel}>{t('dashboard.active')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{upcomingJobs.length}</Text>
          <Text style={styles.statLabel}>{t('dashboard.upcoming')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>{t('dashboard.done')}</Text>
        </View>
      </Animated.View>

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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  greeting: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 28,
    color: colors.text,
    marginBottom: spacing.lg,
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
