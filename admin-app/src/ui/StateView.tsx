import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/ui/theme';

interface StateViewProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
}

/**
 * StateView - Displays loading, error, or empty states with consistent styling
 */
export function StateView({ loading, error, empty, emptyLabel = 'No results found.' }: StateViewProps) {
  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.empty}>{emptyLabel}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: colors.error,
    fontSize: typography.size.base,
    textAlign: 'center',
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.size.base,
    textAlign: 'center',
  },
});
