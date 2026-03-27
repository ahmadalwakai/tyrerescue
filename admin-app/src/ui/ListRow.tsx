import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/ui/theme';

interface ListRowProps {
  title: string;
  subtitle?: string;
  rightContent?: string | React.ReactNode;
  leftContent?: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
}

/**
 * ListRow - Reusable list item row with title, subtitle, and right content
 * Used for bookings, drivers, inventory items, etc.
 */
export function ListRow({
  title,
  subtitle,
  rightContent,
  leftContent,
  onPress,
  divider = true,
}: ListRowProps) {
  const content = (
    <View style={[styles.row, divider && styles.withDivider]}>
      {leftContent && <View style={styles.leftContent}>{leftContent}</View>}
      <View style={styles.titleSection}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightContent && (
        <View style={styles.rightContent}>
          {typeof rightContent === 'string' ? (
            <Text style={styles.rightText}>{rightContent}</Text>
          ) : (
            rightContent
          )}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceLight,
  },
  leftContent: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },
  rightContent: {
    alignItems: 'flex-end',
  },
  rightText: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
});
