import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  RefreshControl,
  TextInput,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
import { useI18n } from '@/i18n';
import { getDriverPaymentDisplay } from '@/lib/payment-status';

type Tab = 'active' | 'upcoming' | 'completed';
type TabIconName = keyof typeof Ionicons.glyphMap;

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

function jobNeedsAttention(job: JobSummary): boolean {
  const payment = job.paymentSummary ?? job.payment ?? null;
  const paymentDisplay = payment ? getDriverPaymentDisplay(payment, job.refNumber) : null;
  const paymentNeedsAttention =
    paymentDisplay != null && ['warning', 'failed', 'pending', 'unknown'].includes(paymentDisplay.tone);
  const missingTyre = !job.tyreSizeDisplay?.trim();
  const missingLocation = !job.addressLine?.trim() || !job.lat || !job.lng;
  return paymentNeedsAttention || missingTyre || missingLocation;
}

function matchesSearch(job: JobSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    job.refNumber,
    job.customerName,
    job.customerPhone,
    job.addressLine,
    job.tyreSizeDisplay,
    job.status,
    job.serviceType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function filterJobs(jobs: JobSummary[], query: string, attentionOnly: boolean): JobSummary[] {
  return jobs.filter((job) => matchesSearch(job, query) && (!attentionOnly || jobNeedsAttention(job)));
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
  const [searchQuery, setSearchQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await driverApi.getJobs();

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

  const filteredActive = useMemo(
    () => filterJobs(active, searchQuery, attentionOnly),
    [active, attentionOnly, searchQuery],
  );
  const filteredUpcoming = useMemo(
    () => filterJobs(upcoming, searchQuery, attentionOnly),
    [upcoming, attentionOnly, searchQuery],
  );
  const filteredCompleted = useMemo(
    () => filterJobs(completed, searchQuery, attentionOnly),
    [completed, attentionOnly, searchQuery],
  );
  const attentionCount = useMemo(
    () => [...active, ...upcoming].filter(jobNeedsAttention).length,
    [active, upcoming],
  );
  const completedSections = useMemo(() => groupByDay(filteredCompleted, t), [filteredCompleted, t]);
  const hasFilters = searchQuery.trim().length > 0 || attentionOnly;
  const tabItems: { key: Tab; label: string; count: number; icon: TabIconName }[] = [
    { key: 'active', label: t('jobs.active'), count: filteredActive.length, icon: 'flash-outline' },
    { key: 'upcoming', label: t('jobs.upcoming'), count: filteredUpcoming.length, icon: 'calendar-outline' },
    { key: 'completed', label: t('jobs.completed'), count: filteredCompleted.length, icon: 'checkmark-done-outline' },
  ];

  if (loading) return <LoadingScreen />;

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accent}
    />
  );

  const renderEmptyState = (icon: TabIconName, defaultTitle: string, defaultMessage?: string) => (
    <EmptyState
      icon={icon}
      title={hasFilters ? t('jobs.noMatchingJobs') : defaultTitle}
      message={hasFilters ? t('jobs.adjustFilters') : defaultMessage}
    />
  );

  const clearFilters = () => {
    lightHaptic();
    setSearchQuery('');
    setAttentionOnly(false);
  };

  const toggleAttentionOnly = () => {
    lightHaptic();
    setAttentionOnly((value) => !value);
  };

  return (
    <View style={styles.container}>
      <View style={styles.queueHeader}>
        <Text style={styles.queueEyebrow}>{t('jobs.workQueue')}</Text>
        <Text style={styles.queueTitle}>{t('tabs.jobs')}</Text>
        <Text style={styles.queueSubtitle}>{t('jobs.queueSubtitle')}</Text>
      </View>

      <View style={styles.filterPanel}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('jobs.searchPlaceholder')}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <AnimatedPressable
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchButton}
              pressScale={0.9}
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </AnimatedPressable>
          )}
        </View>
        <View style={styles.filterActions}>
          <AnimatedPressable
            style={[
              styles.filterChip,
              attentionOnly && styles.filterChipActive,
            ] as ViewStyle[]}
            onPress={toggleAttentionOnly}
            pressScale={0.96}
          >
            <Ionicons
              name="warning-outline"
              size={16}
              color={attentionOnly ? '#0B0F1A' : colors.accent}
            />
            <Text style={[styles.filterChipText, attentionOnly && styles.filterChipTextActive]} numberOfLines={1}>
              {t('jobs.needsAttention')}
            </Text>
            <View style={[styles.attentionCount, attentionOnly && styles.attentionCountActive]}>
              <Text style={[styles.attentionCountText, attentionOnly && styles.attentionCountTextActive]}>
                {attentionCount}
              </Text>
            </View>
          </AnimatedPressable>
          {hasFilters && (
            <AnimatedPressable
              style={styles.clearFiltersChip}
              onPress={clearFilters}
              pressScale={0.96}
            >
              <Text style={styles.clearFiltersText}>{t('jobs.clearFilters')}</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabItems.map((item) => {
          const activeTab = tab === item.key;
          return (
            <AnimatedPressable
              key={item.key}
              style={[styles.tab, activeTab && styles.tabActive]}
              onPress={() => { lightHaptic(); setTab(item.key); }}
              pressScale={0.95}
            >
              <Ionicons
                name={item.icon}
                size={17}
                color={activeTab ? colors.accent : colors.muted}
              />
              <Text style={[styles.tabText, activeTab && styles.tabTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
              <View style={[styles.tabCount, activeTab && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, activeTab && styles.tabCountTextActive]}>
                  {item.count}
                </Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>

      {/* Active: flat list */}
      {tab === 'active' && (
        <FlatList
          data={filteredActive}
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
            renderEmptyState('briefcase-outline', t('jobs.noActiveJobs'), t('jobs.activeJobsEmpty'))
          }
        />
      )}

      {/* Upcoming: flat list */}
      {tab === 'upcoming' && (
        <FlatList
          data={filteredUpcoming}
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
            renderEmptyState('time-outline', t('jobs.noUpcomingJobs'), t('jobs.upcomingJobsEmpty'))
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
            renderEmptyState('checkmark-done-outline', t('jobs.noCompletedJobs'))
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
  queueHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
  },
  queueEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  queueTitle: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 34,
    color: colors.text,
  },
  queueSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
  },
  filterPanel: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  searchBox: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(24,24,27,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 0,
    fontFamily: 'Inter_500Medium',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  clearSearchButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterChip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.32)',
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.text,
  },
  filterChipTextActive: {
    color: '#0B0F1A',
  },
  attentionCount: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,115,22,0.18)',
  },
  attentionCountActive: {
    backgroundColor: 'rgba(11,15,26,0.18)',
  },
  attentionCountText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: fontSize.xs,
    color: colors.accent,
  },
  attentionCountTextActive: {
    color: '#0B0F1A',
  },
  clearFiltersChip: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  clearFiltersText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tab: {
    flex: 1,
    minHeight: 68,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: 'rgba(24,24,27,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  tabActive: {
    backgroundColor: 'rgba(249,115,22,0.13)',
    borderColor: 'rgba(249,115,22,0.42)',
  },
  tabText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: 'center',
  },
  tabTextActive: {
    color: colors.accent,
  },
  tabCount: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabCountActive: {
    backgroundColor: colors.accent,
  },
  tabCountText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  tabCountTextActive: {
    color: '#0B0F1A',
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
