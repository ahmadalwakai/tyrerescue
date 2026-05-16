import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, fontSize, radius } from '../theme';

export type ActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ActionButtonSize = 'sm' | 'md' | 'lg';

export interface ActionButtonProps
  extends Omit<PressableProps, 'style' | 'children' | 'onPress' | 'disabled'> {
  label: string;
  onPress: () => void;
  loading?: boolean;
  /** Label shown while `loading` is true. Falls back to the original label. */
  loadingLabel?: string;
  disabled?: boolean;
  /** Helper text rendered below the button when disabled. */
  disabledReason?: string;
  icon?: ReactNode;
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  fullWidth?: boolean;
  testID?: string;
}

interface VariantPalette {
  base: ViewStyle;
  pressed: ViewStyle;
  textColor: string;
}

const VARIANTS: Record<ActionButtonVariant, VariantPalette> = {
  primary: {
    base: { backgroundColor: colors.accent, borderColor: colors.accent },
    pressed: { backgroundColor: colors.accentHover, borderColor: colors.accentHover },
    textColor: colors.accentText,
  },
  secondary: {
    base: { backgroundColor: colors.card, borderColor: colors.border },
    pressed: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
    textColor: colors.text,
  },
  ghost: {
    base: { backgroundColor: 'transparent', borderColor: colors.border },
    pressed: { backgroundColor: colors.card, borderColor: colors.borderStrong },
    textColor: colors.muted,
  },
  danger: {
    base: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
    pressed: { backgroundColor: '#5A1517', borderColor: colors.dangerBorder },
    textColor: colors.danger,
  },
  success: {
    base: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
    pressed: { backgroundColor: '#15402A', borderColor: colors.successBorder },
    textColor: colors.success,
  },
};

const SIZE_STYLES: Record<ActionButtonSize, { container: ViewStyle; label: TextStyle }> = {
  sm: {
    container: { minHeight: 40, paddingHorizontal: 12 },
    label: { fontSize: fontSize.sm },
  },
  md: {
    container: { minHeight: 48, paddingHorizontal: 14 },
    label: { fontSize: fontSize.md },
  },
  lg: {
    container: { minHeight: 56, paddingHorizontal: 18 },
    label: { fontSize: fontSize.lg },
  },
};

/**
 * Touch-friendly Android-first button with consistent loading/disabled states.
 *
 * - `loading` shows a spinner and blocks taps so an inflight backend call
 *   can never be triggered twice. The label is replaced with `loadingLabel`
 *   when provided, otherwise the original label stays so the operator
 *   keeps their context.
 * - `disabledReason` renders a small helper line below the button so the
 *   operator can see *why* an action is locked, instead of a silent grey
 *   pill.
 */
export function ActionButton({
  label,
  onPress,
  loading = false,
  loadingLabel,
  disabled = false,
  disabledReason,
  icon,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  testID,
  ...rest
}: ActionButtonProps) {
  const palette = VARIANTS[variant];
  const sizeStyle = SIZE_STYLES[size];
  const isDisabled = disabled || loading;
  const showReason = isDisabled && Boolean(disabledReason);
  const displayLabel = loading && loadingLabel ? loadingLabel : label;

  return (
    <View style={fullWidth ? styles.fullWidthWrap : undefined}>
      <Pressable
        {...rest}
        testID={testID}
        onPress={isDisabled ? undefined : onPress}
        android_ripple={isDisabled ? undefined : { color: colors.ripple, borderless: false }}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        accessibilityLabel={
          showReason ? `${label}. Disabled. ${disabledReason ?? ''}` : label
        }
        style={({ pressed }) => [
          styles.base,
          sizeStyle.container,
          palette.base,
          pressed && !isDisabled && palette.pressed,
          isDisabled && styles.disabled,
          fullWidth && styles.fullWidth,
        ]}
      >
        {loading ? (
          <View style={styles.row}>
            <ActivityIndicator color={palette.textColor} />
            {displayLabel ? (
              <Text
                style={[styles.label, sizeStyle.label, { color: palette.textColor }]}
                numberOfLines={1}
              >
                {displayLabel}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.row}>
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <Text
              style={[styles.label, sizeStyle.label, { color: palette.textColor }]}
              numberOfLines={1}
            >
              {displayLabel}
            </Text>
          </View>
        )}
      </Pressable>
      {showReason ? <Text style={styles.reason}>{disabledReason}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidthWrap: {
    alignSelf: 'stretch',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.55,
  },
  reason: {
    marginTop: 4,
    fontSize: fontSize.xs,
    color: colors.subtle,
    fontWeight: '500',
  },
});
