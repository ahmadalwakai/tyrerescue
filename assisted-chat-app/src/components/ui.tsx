import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, fontSize, space } from './theme';
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
  elevated?: boolean;
}

export function SectionCard({ title, children, helperText, elevated }: SectionCardProps) {
  const entranceStyle = useFadeSlideIn({ distance: 8, duration: 240 });
  return (
    <Animated.View style={[cardStyles.card, elevated && cardStyles.cardElevated, entranceStyle]}>
      <View style={cardStyles.header}>
        <View style={cardStyles.titleIcon}>
          <View style={cardStyles.titleIconDot} />
        </View>
        <View style={cardStyles.titleBlock}>
          <Text style={cardStyles.title}>{title}</Text>
          {helperText ? <Text style={cardStyles.helper}>{helperText}</Text> : null}
        </View>
      </View>
      <View style={cardStyles.content}>{children}</View>
    </Animated.View>
  );
}

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function GlassCard({ children, style }: GlassCardProps) {
  const entranceStyle = useFadeSlideIn({ distance: 8, duration: 240 });
  return (
    <Animated.View style={[cardStyles.glassCard, entranceStyle, style]}>
      {children}
    </Animated.View>
  );
}

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

export function SectionHeader({ eyebrow, title, subtitle }: SectionHeaderProps) {
  return (
    <View style={cardStyles.sectionHeader}>
      {eyebrow ? <Text style={cardStyles.sectionEyebrow}>{eyebrow}</Text> : null}
      <Text style={cardStyles.sectionTitle} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={cardStyles.sectionSubtitle} numberOfLines={3}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'accent' | 'success' | 'warn' | 'danger' | 'info';
}

export function MetricCard({ label, value, detail, tone = 'default' }: MetricCardProps) {
  const palette = tonePalette(tone);
  return (
    <View style={[cardStyles.metricCard, { borderColor: palette.border, backgroundColor: palette.bg }]}>
      <View style={[cardStyles.metricIcon, { backgroundColor: palette.soft }]}>
        <Text style={[cardStyles.metricIconText, { color: palette.fg }]}>{label.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={cardStyles.metricCopy}>
        <Text style={cardStyles.metricLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[cardStyles.metricValue, { color: palette.fg }]} numberOfLines={1}>
          {value}
        </Text>
        {detail ? (
          <Text style={cardStyles.metricDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface InputProps extends TextInputProps {
  focused?: boolean;
}

export function Input({ style, focused, placeholderTextColor = colors.subtle, ...props }: InputProps) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={placeholderTextColor}
      style={[cardStyles.input, focused && cardStyles.inputFocused, style]}
    />
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
  const palette = tonePalette(kind === 'ok' ? 'success' : kind === 'err' ? 'danger' : kind === 'warn' ? 'warn' : 'info');
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

function tonePalette(tone: 'default' | 'accent' | 'success' | 'warn' | 'danger' | 'info') {
  if (tone === 'accent') {
    return { bg: colors.accentMuted, soft: colors.accentSoft, fg: colors.accent, border: colors.glowBorder };
  }
  if (tone === 'success') {
    return { bg: colors.successBg, soft: 'rgba(56,240,109,0.22)', fg: colors.success, border: colors.successBorder };
  }
  if (tone === 'warn') {
    return { bg: colors.warningBg, soft: 'rgba(255,209,102,0.22)', fg: colors.warning, border: colors.warningBorder };
  }
  if (tone === 'danger') {
    return { bg: colors.dangerBg, soft: 'rgba(255,77,94,0.20)', fg: colors.danger, border: colors.dangerBorder };
  }
  if (tone === 'info') {
    return { bg: colors.infoBg, soft: colors.blueBg, fg: colors.info, border: colors.infoBorder };
  }
  return { bg: colors.glass, soft: colors.panelSoft, fg: colors.text, border: colors.border };
}

const buttonShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 12px 28px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.32,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      }
) as ViewStyle;

const primaryButtonShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 12px 30px rgba(255,122,24,0.34), 0 0 26px rgba(255,122,24,0.22)' }
    : {
        shadowColor: colors.shadowWarm,
        shadowOpacity: 0.34,
      }
) as ViewStyle;

const cardShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 18px 42px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.36,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 5,
      }
) as ViewStyle;

const bannerShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 12px 26px rgba(0,0,0,0.32)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.24,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
      }
) as ViewStyle;

const titleIconDotShadow = (
  Platform.OS === 'web'
    ? { boxShadow: `0 0 12px ${colors.shadowWarm}` }
    : {
        shadowColor: colors.shadowWarm,
        shadowOpacity: 0.8,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
      }
) as ViewStyle;

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
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
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
    backgroundColor: 'rgba(255,255,255,0.24)',
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
    base: { backgroundColor: colors.glassStrong, borderColor: colors.borderStrong } as ViewStyle,
    pressed: { backgroundColor: colors.panel, borderColor: colors.infoBorder } as ViewStyle,
    textColor: colors.text,
  },
  // Quiet outlined for muted actions (e.g. Clear draft).
  ghost: {
    base: { backgroundColor: colors.glass, borderColor: colors.border } as ViewStyle,
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
    backgroundColor: colors.glass,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: 'hidden',
    position: 'relative',
    ...(cardShadow ?? {}),
  },
  cardElevated: {
    borderColor: colors.glowBorder,
    backgroundColor: colors.surfaceOverlay,
  },
  glassCard: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: 'hidden',
    position: 'relative',
    ...(cardShadow ?? {}),
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleIconDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
    ...titleIconDotShadow,
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
    fontWeight: '800',
    color: colors.muted,
    marginBottom: 6,
  },
  sectionHeader: {
    gap: 5,
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 26,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  metricCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 13,
    overflow: 'hidden',
  },
  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconText: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  metricCopy: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  metricValue: {
    marginTop: 3,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  metricDetail: {
    marginTop: 3,
    color: colors.subtle,
    fontSize: fontSize.xs,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.panelSoft,
  },
});

const noticeStyles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
