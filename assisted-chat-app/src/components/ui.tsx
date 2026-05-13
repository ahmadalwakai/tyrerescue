import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, fontSize } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface AppButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

// Buttons keep readable colours in pressed/focused/disabled/loading states —
// no white flash, no transparent text. This matches the explicit hover/active
// styles used in the web AssistedChatPage.
export function AppButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  fullWidth,
  ...rest
}: AppButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...rest}
      onPress={isDisabled ? undefined : onPress}
      android_ripple={{ color: colors.ripple, borderless: false }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant].base,
        pressed && !isDisabled && variantStyles[variant].pressed,
        isDisabled && styles.disabled,
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].textColor} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: variantStyles[variant].textColor },
            isDisabled && styles.disabledLabel,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

interface SectionCardProps {
  title: string;
  children: ReactNode;
  helperText?: string;
}

export function SectionCard({ title, children, helperText }: SectionCardProps) {
  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.title}>{title.toUpperCase()}</Text>
      {helperText ? <Text style={cardStyles.helper}>{helperText}</Text> : null}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

// Compact dark inline notice — used for missing-token warnings so they don't
// dominate the layout like a browser banner. No icons, no emojis.
interface InlineNoticeProps {
  kind?: 'warn' | 'info' | 'err';
  children: ReactNode;
}

export function InlineNotice({ kind = 'warn', children }: InlineNoticeProps) {
  const palette =
    kind === 'err'
      ? { bg: colors.dangerBg, fg: colors.danger, border: colors.dangerBorder }
      : kind === 'info'
      ? { bg: colors.infoBg, fg: colors.info, border: colors.infoBorder }
      : { bg: colors.warningBg, fg: colors.warning, border: colors.warningBorder };
  return (
    <View
      style={{
        borderWidth: 1,
        borderRadius: radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: palette.bg,
        borderColor: palette.border,
      }}
    >
      <Text style={{ color: palette.fg, fontSize: fontSize.xs, fontWeight: '500' }}>
        {children}
      </Text>
    </View>
  );
}

interface FieldLabelProps {
  children: ReactNode;
}

export function FieldLabel({ children }: FieldLabelProps) {
  return <Text style={cardStyles.label}>{children}</Text>;
}

interface StatusBannerProps {
  kind: 'ok' | 'err' | 'info' | 'warn';
  message: string;
}

export function StatusBanner({ kind, message }: StatusBannerProps) {
  const palette =
    kind === 'ok'
      ? { bg: colors.successBg, fg: colors.success, border: colors.successBorder }
      : kind === 'err'
      ? { bg: colors.dangerBg, fg: colors.danger, border: colors.dangerBorder }
      : kind === 'warn'
      ? { bg: colors.warningBg, fg: colors.warning, border: colors.warningBorder }
      : { bg: colors.infoBg, fg: colors.info, border: colors.infoBorder };
  return (
    <View
      style={[
        bannerStyles.banner,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[bannerStyles.text, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  disabledLabel: {
    // keep colour from variant; only opacity dims
  },
});

const variantStyles = {
  // Orange primary — black-ish text stays readable when pressed.
  primary: {
    base: { backgroundColor: colors.accent, borderColor: colors.accent } as ViewStyle,
    pressed: { backgroundColor: colors.accentHover, borderColor: colors.accentHover } as ViewStyle,
    textColor: colors.accentText,
  },
  // Dark outlined — never goes white on press.
  secondary: {
    base: { backgroundColor: colors.card, borderColor: colors.border } as ViewStyle,
    pressed: { backgroundColor: colors.surface, borderColor: colors.borderStrong } as ViewStyle,
    textColor: colors.text,
  },
  // Quiet outlined for muted actions (e.g. Clear draft).
  ghost: {
    base: { backgroundColor: 'transparent', borderColor: colors.border } as ViewStyle,
    pressed: { backgroundColor: colors.card, borderColor: colors.borderStrong } as ViewStyle,
    textColor: colors.muted,
  },
  danger: {
    base: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder } as ViewStyle,
    pressed: { backgroundColor: '#5A1517', borderColor: colors.dangerBorder } as ViewStyle,
    textColor: colors.danger,
  },
};

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: colors.muted,
  },
  helper: {
    marginTop: 4,
    fontSize: fontSize.xs,
    color: colors.subtle,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.muted,
    marginBottom: 6,
  },
});

const bannerStyles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
