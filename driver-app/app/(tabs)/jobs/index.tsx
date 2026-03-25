import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { driverApi, JobSummary } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useLivePolling } from '@/hooks/useLivePolling';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { lightHaptic } from '@/services/haptics';
import { useNewJobDetector } from '@/hooks/useNewJobDetector';
import { useI18n } from '@/i18n';

type Tab = 'active' | 'upcoming' | 'completed';

function getDayLabel(dateStr: string | null, t: (key: string) => string): string {
  if (!dateStr) return t('jobs.unknown');
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return t('jobs.today');
  if (diffDays === 1) return t('jobs.yesterday');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function groupByDay(jobs: JobSummary[], t: (key: string) => string): { title: string; data: JobSummary[] }[] {
  const map = new Map<string, JobSummary[]>();
  for (const job of jobs) {
    const label = getDayLabel(job.completedAt ?? job.scheduledAt ?? job.createdAt, t);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(job);
  }
  return Array.from(map, ([title, data]) => ({ title, data }));
}

export default function JobsListScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('active');
  const [active, setActive] = useState<JobSummary[]>([]);
  const [upcoming, setUpcoming] = useState<JobSummary[]>([]);
  const [completed, setCompleted] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { checkForNewJobs } = useNewJobDetector();

  const fetchJobs = useCallback(async () => {
    try {
      const res = await driverApi.getJobs();
      // Detect new jobs from active + upcoming
      const allVisibleJobs = [...res.active, ...(res.upcoming ?? [])];
      checkForNewJobs(allVisibleJobs);

      // active array may include driver_assigned for backward compat; filter them out
      setActive(res.upcoming ? res.active.filter(j => j.status !== 'driver_assigned') : res.active);
      setUpcoming(res.upcoming ?? []);
      setCompleted(res.completed);
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useRefreshOnFocus(fetchJobs);

  // Live polling every 12s while screen focused
  useLivePolling(fetchJobs, true);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }, [fetchJobs]);

  const completedSections = useMemo(() => groupByDay(completed, t), [completed, t]);

  if (loading) return <LoadingScreen />;

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accent}
    />
  );

  const emptyComponent = (
    <EmptyState
      icon={tab === 'active' ? 'briefcase-outline' : 'checkmark-done-outline'}
      title={tab === 'active' ? t('jobs.noActiveJobs') : t('jobs.noCompletedJobs')}
      message={tab === 'active' ? t('jobs.newJobsAppear') : undefined}
    />
  );

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <AnimatedPressable
          style={[styles.tab, tab === 'active' && styles.tabActive]}
          onPress={() => { lightHaptic(); setTab('active'); }}
          pressScale={0.95}
        >
          <Text style={[styles.tabText, tab === 'active' && styles.tabTextActive]}>
            {t('jobs.active')} ({active.length})
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.tab, tab === 'upcoming' && styles.tabActive]}
          onPress={() => { lightHaptic(); setTab('upcoming'); }}
          pressScale={0.95}
        >
          <Text style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}>
            {t('jobs.upcoming')} ({upcoming.length})
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.tab, tab === 'completed' && styles.tabActive]}
          onPress={() => { lightHaptic(); setTab('completed'); }}
          pressScale={0.95}
        >
          <Text style={[styles.tabText, tab === 'completed' && styles.tabTextActive]}>
            {t('jobs.completed')} ({completed.length})
          </Text>
        </AnimatedPressable>
      </View>

      {/* Active: flat list */}
      {tab === 'active' && (
        <FlatList
          data={active}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(250).delay(index * 50)}>
              <JobCard
                job={item}
                onPress={() => router.push(`/(tabs)/jobs/${item.refNumber}`)}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title={t('jobs.noActiveJobs')}
              message={t('jobs.activeJobsEmpty')}
            />
          }
        />
      )}

      {/* Upcoming: flat list */}
      {tab === 'upcoming' && (
        <FlatList
          data={upcoming}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(250).delay(index * 50)}>
              <JobCard
                job={item}
                onPress={() => router.push(`/(tabs)/jobs/${item.refNumber}`)}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="time-outline"
              title={t('jobs.noUpcomingJobs')}
              message={t('jobs.upcomingJobsEmpty')}
            />
          }
        />
      )}

      {/* Completed: section list grouped by day */}
      {tab === 'completed' && (
        <SectionList
          sections={completedSections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeader}>{title}</Text>
          )}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(250).delay(index * 50)}>
              <JobCard
                job={item}
                onPress={() => router.push(`/(tabs)/jobs/${item.refNumber}`)}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title={t('jobs.noCompletedJobs')}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabs: {
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.card,
  },
  tabText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.accent,
  },
  list: {
    padding: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  sectionHeader: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: colors.muted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
});
