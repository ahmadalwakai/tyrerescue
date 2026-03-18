import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { driverApi, JobSummary } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { JobCard } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';

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
        <Pressable
          style={[styles.tab, tab === 'active' && styles.tabActive]}
          onPress={() => setTab('active')}
        >
          <Text style={[styles.tabText, tab === 'active' && styles.tabTextActive]}>
            Active ({active.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'completed' && styles.tabActive]}
          onPress={() => setTab('completed')}
        >
          <Text style={[styles.tabText, tab === 'completed' && styles.tabTextActive]}>
            Completed ({completed.length})
          </Text>
        </Pressable>
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
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onPress={() => router.push(`/(tabs)/jobs/${item.refNumber}`)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
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
