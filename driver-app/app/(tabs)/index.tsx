import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Image,
  Pressable,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { driverApi, JobSummary } from '@/api/client';
import { useAuth } from '@/auth/context';
import { useLocationBroadcast } from '@/hooks/useLocation';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useLivePolling } from '@/hooks/useLivePolling';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { lightHaptic } from '@/services/haptics';
import { JobCardSkeleton } from '@/components/SkeletonLoader';
import { playSound } from '@/services/sound';

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

function formatSyncTime(ms: number | null): string {
  if (!ms) return 'Syncing…';
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 5) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [activeJobs, setActiveJobs] = useState<JobSummary[]>([]);
  const [upcomingJobs, setUpcomingJobs] = useState<JobSummary[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncLabel, setSyncLabel] = useState('Syncing…');

  const { bgRunning } = useLocationBroadcast(isOnline, activeJobs.length > 0);
  const knownJobRefs = useRef<Set<string>>(new Set());
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);

  const updateDriverPosition = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDriverLat(loc.coords.latitude);
      setDriverLng(loc.coords.longitude);
    } catch {
      // ignore
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, jobsRes] = await Promise.all([
        driverApi.getStatus(),
        driverApi.getJobs(),
      ]);
      setIsOnline(statusRes.isOnline);

      // Detect newly assigned jobs and play alert
      const newRefs = jobsRes.active.map((j: JobSummary) => j.ref);
      if (knownJobRefs.current.size > 0) {
        const hasNew = newRefs.some((r: string) => !knownJobRefs.current.has(r));
        if (hasNew) {
          playSound('new_job');
          lightHaptic();
        }
      }
      knownJobRefs.current = new Set(newRefs);

      setActiveJobs(jobsRes.active);
      setUpcomingJobs(jobsRes.upcoming ?? []);
      setCompletedCount(jobsRes.completed.length);
      setLastSync(Date.now());
    } catch {
      // Silently ignore
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update driver position every 15s while online
  useEffect(() => {
    if (!isOnline) return;
    updateDriverPosition();
    const iv = setInterval(updateDriverPosition, 15_000);
    return () => clearInterval(iv);
  }, [isOnline, updateDriverPosition]);

  useRefreshOnFocus(fetchData);

  // Live polling while online
  useLivePolling(fetchData, isOnline);

  // Update sync label every 5s
  useEffect(() => {
    const t = setInterval(() => setSyncLabel(formatSyncTime(lastSync)), 5000);
    setSyncLabel(formatSyncTime(lastSync));
    return () => clearInterval(t);
  }, [lastSync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleToggleOnline = async (value: boolean) => {
    lightHaptic();
    setToggling(true);
    try {
      const res = await driverApi.setOnline(value);
      setIsOnline(res.isOnline);
    } catch {
      Alert.alert('Error', 'Failed to update status.');
    }
    setToggling(false);
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
        Hello, {user?.name?.split(' ')[0] ?? 'Driver'}
      </Animated.Text>

      {/* Online Toggle */}
      <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.statusCard}>
        <View>
          <Text style={styles.statusLabel}>
            {isOnline ? 'You are Online' : 'You are Offline'}
          </Text>
          <Text style={styles.statusHint}>
            {isOnline
              ? 'Receiving new job assignments'
              : 'Toggle on to receive jobs'}
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
            <Text style={styles.livePanelTitle}>Searching for jobs…</Text>
          </View>
          <Text style={styles.livePanelSubtitle}>Ready to receive tyre rescue assignments</Text>
          <View style={styles.livePanelInfo}>
            <View style={styles.liveRow}>
              <View style={[styles.liveIndicator, { backgroundColor: colors.success }]} />
              <Text style={styles.liveText}>Online</Text>
            </View>
            <View style={styles.liveRow}>
              <View style={[styles.liveIndicator, { backgroundColor: bgRunning ? colors.success : colors.info }]} />
              <Text style={styles.liveText}>
                {bgRunning ? 'Location sharing active (background)' : 'Location signal active'}
              </Text>
            </View>
            <View style={styles.liveRow}>
              <View style={[styles.liveIndicator, { backgroundColor: colors.muted }]} />
              <Text style={styles.liveText}>Last sync: {syncLabel}</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Stats */}
      <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activeJobs.length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{upcomingJobs.length}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
      </Animated.View>

      {/* Live Map Card */}
      {isOnline && driverLat != null && driverLng != null && (
        <Animated.View entering={FadeInDown.duration(300).delay(140)}>
          <View style={styles.mapCard}>
            <View style={styles.mapCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
                <Text style={styles.mapCardTitle}>Your Live Location</Text>
              </View>
              <Text style={styles.mapCardSync}>{syncLabel}</Text>
            </View>
            <Pressable
              onPress={() => {
                if (activeJobs.length > 0) {
                  router.push(`/(tabs)/jobs/${activeJobs[0].refNumber}/map`);
                } else {
                  const url = `https://www.google.com/maps/search/?api=1&query=${driverLat},${driverLng}`;
                  Linking.openURL(url);
                }
              }}
            >
              <Image
                source={{
                  uri: (() => {
                    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
                    const dPin = `pin-l-d+3B82F6(${driverLng},${driverLat})`;
                    const firstJob = activeJobs[0];
                    if (firstJob?.lat && firstJob?.lng) {
                      const cPin = `pin-l-c+ef4444(${firstJob.lng},${firstJob.lat})`;
                      return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${dPin},${cPin}/auto/600x300@2x?padding=60&access_token=${token}`;
                    }
                    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${dPin}/${driverLng},${driverLat},14,0/600x300@2x?access_token=${token}`;
                  })(),
                }}
                style={styles.mapImage}
                resizeMode="cover"
              />
            </Pressable>
            <View style={styles.mapCardFooter}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' }} />
                  <Text style={styles.mapLegendText}>You</Text>
                </View>
                {activeJobs.length > 0 && activeJobs[0]?.lat && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
                    <Text style={styles.mapLegendText}>Customer</Text>
                  </View>
                )}
              </View>
              {activeJobs.length > 0 && (
                <Text style={styles.mapJobHint}>
                  Tap to view job map
                </Text>
              )}
            </View>
          </View>
        </Animated.View>
      )}

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Jobs</Text>
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
          <Text style={styles.sectionTitle}>Upcoming Jobs</Text>
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
          title="You are offline"
          message="Go online to start receiving job assignments."
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
  // Map card
  mapCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...cardShadow,
  },
  mapCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  mapCardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  mapCardSync: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  mapImage: {
    width: '100%',
    height: 200,
  },
  mapCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  mapLegendText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  mapJobHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.accent,
  },
});
