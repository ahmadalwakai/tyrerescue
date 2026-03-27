import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/ui/theme';

interface ActionTileProps {
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'danger';
}

/**
 * ActionTile - Quick action button with icon and label
 * Used for common operations like "New Booking", "View Reports", etc.
 */
export function ActionTile({ title, icon, onPress, variant = 'default' }: ActionTileProps) {
  const bgColor =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.error
        : colors.surface;

  const textColor =
    variant === 'primary' || variant === 'danger' ? colors.text : colors.text;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: bgColor, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>{icon}</View>
      <Text style={[styles.title, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: spacing.md,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as any,
    textAlign: 'center',
  },
});
