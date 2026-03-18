import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { driverApi, JobSummary } from '@/api/client';
import { useAuth } from '@/auth/context';
import { useLocationBroadcast } from '@/hooks/useLocation';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { StatusBadge } from '@/components/StatusBadge';
import { JobCard } from '@/components/JobCard';

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
      <Text style={styles.greeting}>
        Hello, {user?.name?.split(' ')[0] ?? 'Driver'}
      </Text>

      {/* Online Toggle */}
      <View style={styles.statusCard}>
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
        <Switch
          value={isOnline}
          onValueChange={handleToggleOnline}
          disabled={toggling}
          trackColor={{ false: colors.border, true: '#22C55E' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activeJobs.length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
      </View>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Jobs</Text>
          {activeJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onPress={() => router.push(`/(tabs)/jobs/${job.refNumber}`)}
            />
          ))}
        </View>
      )}

      {activeJobs.length === 0 && isOnline && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No active jobs right now.</Text>
          <Text style={styles.emptyHint}>
            Stay online to receive new assignments.
          </Text>
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
  greeting: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 28,
    color: colors.text,
    marginBottom: spacing.md,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
  emptyBox: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.base,
    color: colors.text,
  },
  emptyHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 4,
  },
});
