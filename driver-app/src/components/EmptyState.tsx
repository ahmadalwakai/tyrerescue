import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '@/constants/theme';

interface EmptyStateProps {
  title: string;
  message?: string;
}

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  message: {
    color: colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
