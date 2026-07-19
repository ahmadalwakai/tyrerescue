import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, fontSize } from './theme';
import { useFadeSlideIn, usePressScale } from './motion';

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
  onPressIn,
  onPressOut,
  ...rest
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const { pressScaleStyle, pressIn, pressOut } = usePressScale(Boolean(isDisabled));
  const handlePressIn = (event: GestureResponderEvent) => {
    pressIn();
    onPressIn?.(event);
  };
  const handlePressOut = (event: GestureResponderEvent) => {
    pressOut();
    onPressOut?.(event);
  };

  return (
    <Pressable
      {...rest}
      onPress={isDisabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
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
      {variant === 'primary' ? <View style={[styles.buttonHighlight, styles.noPointerEvents]} /> : null}
      <Animated.View style={[styles.buttonContent, pressScaleStyle]}>
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
      </Animated.View>
    </Pressable>
  );
}

interface SectionCardProps {
  title: string;
  children: ReactNode;
  helperText?: string;
}

export function SectionCard({ title, children, helperText }: SectionCardProps) {
  const entranceStyle = useFadeSlideIn({ distance: 8, duration: 240 });
  return (
    <Animated.View style={[cardStyles.card, entranceStyle]}>
      <View style={[cardStyles.accentLine, cardStyles.noPointerEvents]} />
      <View style={cardStyles.header}>
        <View style={cardStyles.titleRail} />
        <View style={cardStyles.titleBlock}>
          <Text style={cardStyles.title}>{title}</Text>
          {helperText ? <Text style={cardStyles.helper}>{helperText}</Text> : null}
        </View>
      </View>
      <View style={cardStyles.content}>{children}</View>
    </Animated.View>
  );
}

// Compact dark inline notice — used for missing-token warnings so they don't
// dominate the layout like a browser banner. No icons, no emojis.
interface InlineNoticeProps {
  kind?: 'warn' | 'info' | 'err';
  children: ReactNode;
}

export function InlineNotice({ kind = 'warn', children }: InlineNoticeProps) {
  const entranceStyle = useFadeSlideIn({ distance: 6, duration: 220 });
  const palette =
    kind === 'err'
      ? { bg: colors.dangerBg, fg: colors.danger, border: colors.dangerBorder }
      : kind === 'info'
      ? { bg: colors.infoBg, fg: colors.info, border: colors.infoBorder }
      : { bg: colors.warningBg, fg: colors.warning, border: colors.warningBorder };
  return (
    <Animated.View
      style={[
        noticeStyles.notice,
        { backgroundColor: palette.bg, borderColor: palette.border },
        entranceStyle,
      ]}
    >
      <View style={[noticeStyles.noticeRail, { backgroundColor: palette.fg }]} />
      <Text style={{ color: palette.fg, fontSize: fontSize.xs, fontWeight: '500' }}>
        {children}
      </Text>
    </Animated.View>
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
  const entranceStyle = useFadeSlideIn({ distance: 6, duration: 220 });
  const palette =
    kind === 'ok'
      ? { bg: colors.successBg, fg: colors.success, border: colors.successBorder }
      : kind === 'err'
      ? { bg: colors.dangerBg, fg: colors.danger, border: colors.dangerBorder }
      : kind === 'warn'
      ? { bg: colors.warningBg, fg: colors.warning, border: colors.warningBorder }
      : { bg: colors.infoBg, fg: colors.info, border: colors.infoBorder };
  return (
    <Animated.View
      style={[
        bannerStyles.banner,
        { backgroundColor: palette.bg, borderColor: palette.border },
        entranceStyle,
      ]}
    >
      <View style={[bannerStyles.rail, { backgroundColor: palette.fg }]} />
      <Text style={[bannerStyles.text, { color: palette.fg }]}>{message}</Text>
    </Animated.View>
  );
}

const buttonShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 7px 12px rgba(0,0,0,0.24)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
});

const primaryButtonShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 7px 12px rgba(249,115,22,0.22)' } as ViewStyle,
  default: {
    shadowColor: colors.shadowWarm,
    shadowOpacity: 0.22,
  },
});

const cardShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 10px 18px rgba(0,0,0,0.28)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
});

const bannerShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 5px 10px rgba(0,0,0,0.18)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    ...(buttonShadow ?? {}),
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
  buttonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
  },
  buttonHighlight: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    height: 16,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
});

const variantStyles = {
  // Orange primary with stable readable text across press states.
  primary: {
    base: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      ...(primaryButtonShadow ?? {}),
    } as ViewStyle,
    pressed: { backgroundColor: colors.accentPressed, borderColor: colors.accentPressed } as ViewStyle,
    textColor: colors.accentText,
  },
  // Dark outlined — never goes white on press.
  secondary: {
    base: { backgroundColor: colors.surfaceElevated, borderColor: colors.borderStrong } as ViewStyle,
    pressed: { backgroundColor: colors.panel, borderColor: colors.glowBorder } as ViewStyle,
    textColor: colors.text,
  },
  // Quiet outlined for muted actions (e.g. Clear draft).
  ghost: {
    base: { backgroundColor: colors.cardMuted, borderColor: colors.border } as ViewStyle,
    pressed: { backgroundColor: colors.surfaceElevated, borderColor: colors.borderStrong } as ViewStyle,
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
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    overflow: 'hidden',
    position: 'relative',
    ...(cardShadow ?? {}),
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.9,
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleRail: {
    width: 4,
    minHeight: 32,
    borderRadius: 3,
    backgroundColor: colors.accent,
    opacity: 0.95,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    letterSpacing: 0,
    color: colors.text,
  },
  helper: {
    marginTop: 4,
    fontSize: fontSize.xs,
    color: colors.subtle,
    lineHeight: 16,
  },
  content: {
    marginTop: 12,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.muted,
    marginBottom: 6,
  },
});

const noticeStyles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  noticeRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    opacity: 0.9,
  },
});

const bannerStyles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
    position: 'relative',
    ...(bannerShadow ?? {}),
  },
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    opacity: 0.95,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
