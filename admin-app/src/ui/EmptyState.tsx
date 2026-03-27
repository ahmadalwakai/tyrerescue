import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/ui/theme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

/**
 * EmptyState - Display empty state with icon, title, and optional action
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {action && (
        <Text style={styles.action} onPress={action.onPress}>
          {action.label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  icon: {
    marginBottom: spacing.lg,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  description: {
    color: colors.textMuted,
    fontSize: typography.size.base,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  action: {
    color: colors.primary,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
});
