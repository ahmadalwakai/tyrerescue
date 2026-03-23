import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { JobCardSkeleton } from './SkeletonLoader';

export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.skeletons}>
        <JobCardSkeleton />
        <JobCardSkeleton />
        <JobCardSkeleton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: spacing.md,
  },
  skeletons: {
    gap: spacing.sm,
  },
});
