import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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

type Tab = 'active' | 'completed';

export default function JobsListScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('active');
  const [active, setActive] = useState<JobSummary[]>([]);
  const [completed, setCompleted] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await driverApi.getJobs();
      setActive(res.active);
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

  const jobs = tab === 'active' ? active : completed;

  if (loading) return <LoadingScreen />;

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
            Active ({active.length})
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.tab, tab === 'completed' && styles.tabActive]}
          onPress={() => { lightHaptic(); setTab('completed'); }}
          pressScale={0.95}
        >
          <Text style={[styles.tabText, tab === 'completed' && styles.tabTextActive]}>
            Completed ({completed.length})
          </Text>
        </AnimatedPressable>
      </View>

      {/* List */}
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
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
            icon={tab === 'active' ? 'briefcase-outline' : 'checkmark-done-outline'}
            title={tab === 'active' ? 'No active jobs' : 'No completed jobs'}
            message={tab === 'active' ? 'New jobs will appear here when assigned.' : undefined}
          />
        }
      />
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
});
