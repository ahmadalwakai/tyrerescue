import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/ui/theme';

interface Props {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
}

export function StateView({ loading, error, empty, emptyLabel = 'No results found.' }: Props) {
  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.primary} />
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
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
});
