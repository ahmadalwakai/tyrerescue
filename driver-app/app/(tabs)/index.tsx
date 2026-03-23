import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { driverApi, JobSummary } from '@/api/client';
import { useAuth } from '@/auth/context';
import { useLocationBroadcast } from '@/hooks/useLocation';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { lightHaptic } from '@/services/haptics';
import { JobCardSkeleton } from '@/components/SkeletonLoader';

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [activeJobs, setActiveJobs] = useState<JobSummary[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);

  useLocationBroadcast(isOnline, activeJobs.length > 0);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, jobsRes] = await Promise.all([
        driverApi.getStatus(),
        driverApi.getJobs(),
      ]);
      setIsOnline(statusRes.isOnline);
      setActiveJobs(jobsRes.active);
      setCompletedCount(jobsRes.completed.length);
    } catch {
      // Silently ignore
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRefreshOnFocus(fetchData);

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
          <View style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]} />
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            disabled={toggling}
            trackColor={{ false: colors.border, true: '#22C55E' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </Animated.View>

      {/* Stats */}
      <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activeJobs.length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
      </Animated.View>

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

      {activeJobs.length === 0 && isOnline && (
        <EmptyState
          icon="briefcase-outline"
          title="No active jobs right now"
          message="Stay online to receive new assignments."
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
  statusDotOnline: {
    backgroundColor: colors.success,
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
});
