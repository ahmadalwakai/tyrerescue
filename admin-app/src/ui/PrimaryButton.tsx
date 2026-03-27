import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, typography } from '@/ui/theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'neutral' | 'success';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * PrimaryButton - Call-to-action button with design system styling
 */
export function PrimaryButton({
  title,
  onPress,
  disabled,
  variant = 'primary',
  size = 'md',
}: PrimaryButtonProps) {
  const bgColor =
    variant === 'danger'
      ? colors.error
      : variant === 'success'
        ? colors.success
        : variant === 'neutral'
          ? colors.border
          : colors.primary;

  const height = size === 'sm' ? 36 : size === 'lg' ? 52 : 44;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bgColor, height, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.label, { fontSize: typography.size[size === 'sm' ? 'xs' : size === 'lg' ? 'base' : 'sm'] }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  label: {
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
});
