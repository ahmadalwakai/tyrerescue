import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '@/ui/theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: string;
  onActionPress?: () => void;
  style?: ViewStyle;
}

/**
 * SectionHeader - Section divider and title with optional action
 */
export function SectionHeader({
  title,
  subtitle,
  action,
  onActionPress,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.titleSection}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {action && (
        <Text style={styles.action} onPress={onActionPress}>
          {action}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  titleSection: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },
  action: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
});
