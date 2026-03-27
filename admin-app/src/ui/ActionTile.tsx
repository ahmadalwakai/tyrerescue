import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/ui/theme';

interface ActionTileProps {
  title: string;
  icon?: React.ReactNode;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'danger';
}

/**
 * ActionTile - Quick action button with optional icon and label
 * Used for common operations like "New Booking", "Assign Driver", etc.
 */
export function ActionTile({ title, icon, onPress, variant = 'default' }: ActionTileProps) {
  const bgColor =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.error
        : colors.surfaceLight;

  const textColor =
    variant === 'primary' || variant === 'danger' ? colors.text : colors.text;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? (variant === 'default' ? colors.borderStrong : bgColor) : bgColor },
      ]}
      onPress={onPress}
    >
      {icon !== undefined && icon !== null && (
        <View style={styles.iconContainer}>{icon}</View>
      )}
      <Text style={[styles.title, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 72,
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
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
});
