import { Feather } from '@expo/vector-icons';
import { type ComponentProps, type PropsWithChildren, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing, typography } from './theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

export function useScreenContentInsets() {
  const insets = useSafeAreaInsets();

  return useMemo<ViewStyle>(
    () => ({
      paddingTop: Math.max(spacing.page, insets.top + 14),
      paddingBottom: Math.max(42, insets.bottom + 24),
    }),
    [insets.bottom, insets.top],
  );
}

export function Logo({ compact = false, animated = true }: { compact?: boolean; animated?: boolean }) {
  const wheelX = useSharedValue(animated ? -16 : 0);
  const wheelRotation = useSharedValue(animated ? -72 : 0);
  const wheelScale = useSharedValue(1);

  useEffect(() => {
    if (!animated) return;

    const settle = { duration: 620, easing: Easing.out(Easing.cubic) };
    const idle = { duration: 980, easing: Easing.inOut(Easing.quad) };

    wheelX.value = withSequence(
      withTiming(0, settle),
      withDelay(
        1800,
        withRepeat(
          withSequence(
            withTiming(2, idle),
            withTiming(-1, idle),
            withTiming(0, { duration: 720, easing: Easing.out(Easing.quad) }),
          ),
          -1,
          false,
        ),
      ),
    );
    wheelRotation.value = withSequence(
      withTiming(0, settle),
      withDelay(
        1800,
        withRepeat(
          withSequence(
            withTiming(5, idle),
            withTiming(-3, idle),
            withTiming(0, { duration: 720, easing: Easing.out(Easing.quad) }),
          ),
          -1,
          false,
        ),
      ),
    );
    wheelScale.value = withSequence(
      withTiming(1.05, { duration: 260, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
    );
  }, [animated, wheelRotation, wheelScale, wheelX]);

  const wheelMotionStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: wheelX.value },
      { rotate: `${wheelRotation.value}deg` },
      { scale: wheelScale.value },
    ],
  }));

  return (
    <View style={styles.logoRow}>
      <Animated.Image source={require('@/assets/images/icon.png')} style={[compact ? styles.logoIconSmall : styles.logoIcon, wheelMotionStyle]} />
      {!compact ? (
        <View>
          <Text style={styles.logoTyre}>TYRE</Text>
          <Text style={styles.logoRescue}>RESCUE</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ScreenHeader({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'accent' | 'success' | 'danger' }>) {
  const toneStyle =
    tone === 'accent'
      ? styles.pillAccent
      : tone === 'success'
        ? styles.pillSuccess
        : tone === 'danger'
          ? styles.pillDanger
          : styles.pillNeutral;
  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

export function PrimaryButton({
  children,
  icon,
  loading,
  disabled,
  variant = 'primary',
  shine,
  style,
  onPressIn,
  onPressOut,
  ...props
}: PropsWithChildren<
  PressableProps & {
    icon?: FeatherName;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    shine?: boolean;
    style?: StyleProp<ViewStyle>;
  }
>) {
  const isDisabled = disabled || loading;
  const [buttonFrame, setButtonFrame] = useState({ width: 0, height: 0 });
  const pressScale = useSharedValue(1);
  const shineProgress = useSharedValue(0);
  const rippleProgress = useSharedValue(1);
  const rippleX = useSharedValue(0);
  const rippleY = useSharedValue(0);
  const buttonStyle =
    variant === 'secondary'
      ? styles.buttonSecondary
      : variant === 'danger'
        ? styles.buttonDanger
        : variant === 'ghost'
          ? styles.buttonGhost
          : styles.buttonPrimary;
  const textStyle =
    variant === 'secondary' || variant === 'ghost'
      ? styles.buttonTextLight
      : styles.buttonTextDark;

  useEffect(() => {
    if (!shine || isDisabled || variant !== 'primary') return;

    shineProgress.value = withDelay(
      520,
      withTiming(1, { duration: 920, easing: Easing.inOut(Easing.cubic) }),
    );
  }, [isDisabled, shine, shineProgress, variant]);

  const buttonMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const shineStyle = useAnimatedStyle(() => {
    const width = buttonFrame.width || 280;
    const travel = width * 1.65;
    const peak = 1 - Math.abs(shineProgress.value - 0.5) * 2;

    return {
      opacity: shine && variant === 'primary' && !isDisabled ? Math.max(0, peak) * 0.3 : 0,
      transform: [
        { translateX: -width * 0.38 + shineProgress.value * travel },
        { rotate: '18deg' },
      ],
    };
  });

  const rippleSize = Math.max(buttonFrame.width, buttonFrame.height, 84) * 1.7;
  const rippleStyle = useAnimatedStyle(() => ({
    height: rippleSize,
    left: rippleX.value - rippleSize / 2,
    opacity: (1 - rippleProgress.value) * 0.22,
    top: rippleY.value - rippleSize / 2,
    transform: [{ scale: 0.08 + rippleProgress.value * 1.04 }],
    width: rippleSize,
  }));

  return (
    <Animated.View style={[styles.buttonMotion, style, buttonMotionStyle]}>
      <Pressable
        accessibilityRole="button"
        disabled={isDisabled}
        onLayout={(event) => setButtonFrame(event.nativeEvent.layout)}
        onPressIn={(event) => {
          if (!isDisabled) {
            pressScale.value = withTiming(0.97, { duration: 90, easing: Easing.out(Easing.quad) });
            rippleX.value = event.nativeEvent.locationX;
            rippleY.value = event.nativeEvent.locationY;
            rippleProgress.value = 0;
            rippleProgress.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
          }
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          if (!isDisabled) {
            pressScale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.back(1.8)) });
          }
          onPressOut?.(event);
        }}
        style={({ pressed }) => [
          styles.button,
          buttonStyle,
          isDisabled ? styles.buttonDisabled : null,
          pressed && !isDisabled ? styles.buttonPressed : null,
        ]}
        {...props}
      >
        {variant === 'primary' ? (
          <>
            <Animated.View pointerEvents="none" style={[styles.buttonShine, shineStyle]} />
            <Animated.View pointerEvents="none" style={[styles.buttonRipple, rippleStyle]} />
          </>
        ) : null}
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? colors.bg : colors.text} />
        ) : (
          <>
            {icon ? <Feather name={icon} size={18} color={variant === 'primary' ? colors.bg : colors.text} /> : null}
            <Text style={[styles.buttonText, textStyle]}>{children}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function TextField({
  label,
  error,
  style,
  inputStyle,
  ...props
}: TextInputProps & {
  label: string;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, error ? styles.inputError : null, inputStyle]}
        {...props}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function OptionCard({
  title,
  detail,
  meta,
  metaTone,
  icon,
  iconShimmer,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  detail?: string;
  meta?: string;
  metaTone?: 'neutral' | 'accent' | 'success' | 'danger';
  icon?: FeatherName;
  iconShimmer?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const shimmerProgress = useSharedValue(0);
  const selectedProgress = useSharedValue(selected ? 1 : 0);
  const pressedProgress = useSharedValue(0);
  const iconReveal = useSharedValue(0);

  useEffect(() => {
    iconReveal.value = withDelay(
      80,
      withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) }),
    );
  }, [iconReveal]);

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [selected, selectedProgress]);

  useEffect(() => {
    if (!iconShimmer) return;

    shimmerProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withDelay(950, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [iconShimmer, shimmerProgress]);

  const optionMotionStyle = useAnimatedStyle(() => ({
    elevation: selectedProgress.value * 8,
    shadowOpacity: selectedProgress.value * 0.28,
    shadowRadius: 10 + selectedProgress.value * 8,
    transform: [{ scale: 1 + selectedProgress.value * 0.02 - pressedProgress.value * 0.012 }],
  }));

  const stripeStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
    transform: [{ scaleY: 0.35 + selectedProgress.value * 0.65 }],
  }));

  const iconMotionStyle = useAnimatedStyle(() => ({
    opacity: iconReveal.value,
    transform: [
      { rotate: `${-20 + iconReveal.value * 20 + selectedProgress.value * 8}deg` },
      { scale: 0.9 + iconReveal.value * 0.1 },
    ],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: iconShimmer ? 0.42 : 0,
    transform: [{ translateY: -24 + shimmerProgress.value * 48 }],
  }));

  return (
    <Animated.View style={[styles.optionMotion, optionMotionStyle]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          if (!disabled) pressedProgress.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
        }}
        onPressOut={() => {
          if (!disabled) pressedProgress.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) });
        }}
        style={({ pressed }) => [
          styles.option,
          selected ? styles.optionSelected : null,
          disabled ? styles.optionDisabled : null,
          pressed && !disabled ? styles.optionPressed : null,
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.optionAccentStripe, stripeStyle]} />
        <View style={styles.optionTop}>
          {icon ? (
            <Animated.View style={[styles.optionIconShell, selected ? styles.optionIconShellSelected : null, iconMotionStyle]}>
              {iconShimmer ? <Animated.View pointerEvents="none" style={[styles.optionIconShimmer, shimmerStyle]} /> : null}
              <Feather name={icon} size={20} color={selected ? colors.accent : colors.text} />
            </Animated.View>
          ) : null}
          {meta ? <Pill tone={selected ? 'accent' : metaTone ?? 'neutral'}>{meta}</Pill> : null}
        </View>
        <Text style={[styles.optionTitle, selected ? styles.optionTitleSelected : null]}>{title}</Text>
        {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

export function InlineNotice({
  tone = 'neutral',
  children,
}: PropsWithChildren<{ tone?: 'neutral' | 'danger' | 'success' | 'accent' }>) {
  const toneStyle =
    tone === 'danger'
      ? styles.noticeDanger
      : tone === 'success'
        ? styles.noticeSuccess
        : tone === 'accent'
          ? styles.noticeAccent
          : styles.noticeNeutral;
  return (
    <View style={[styles.notice, toneStyle]}>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function Row({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueStyle]}>{value}</Text>
    </View>
  );
}

export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  logoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logoIcon: {
    height: 42,
    width: 42,
  },
  logoIconSmall: {
    height: 30,
    width: 30,
  },
  logoTyre: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 24,
    letterSpacing: 0,
    lineHeight: 24,
  },
  logoRescue: {
    color: colors.accent,
    fontFamily: typography.display,
    fontSize: 24,
    letterSpacing: 0,
    lineHeight: 24,
  },
  header: {
    alignSelf: 'stretch',
    gap: 6,
    marginBottom: 18,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.display,
    fontSize: 44,
    lineHeight: 44,
    maxWidth: '100%',
  },
  detail: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: '100%',
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
  },
  pill: {
    flexShrink: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillNeutral: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: colors.border,
  },
  pillAccent: {
    backgroundColor: 'rgba(249,115,22,0.13)',
    borderColor: 'rgba(249,115,22,0.36)',
  },
  pillSuccess: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.34)',
  },
  pillDanger: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.34)',
  },
  pillText: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
  buttonMotion: {
    alignSelf: 'stretch',
  },
  button: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    overflow: 'hidden',
    paddingHorizontal: 14,
    position: 'relative',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonShine: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    bottom: -24,
    position: 'absolute',
    top: -24,
    width: 42,
  },
  buttonRipple: {
    backgroundColor: 'rgba(255,255,255,0.44)',
    borderRadius: 999,
    position: 'absolute',
  },
  buttonText: {
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  buttonTextDark: {
    color: colors.bg,
  },
  buttonTextLight: {
    color: colors.text,
  },
  field: {
    gap: 7,
  },
  label: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 12,
  },
  optionMotion: {
    alignSelf: 'stretch',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
  },
  option: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 8,
    minHeight: 118,
    overflow: 'hidden',
    padding: 16,
    paddingLeft: 18,
    position: 'relative',
  },
  optionSelected: {
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderColor: 'rgba(249,115,22,0.72)',
  },
  optionDisabled: {
    opacity: 0.48,
  },
  optionPressed: {
    opacity: 0.86,
  },
  optionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  optionAccentStripe: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    bottom: 14,
    left: 0,
    position: 'absolute',
    top: 14,
    width: 4,
  },
  optionIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(249,115,22,0.08)',
    borderColor: 'rgba(249,115,22,0.22)',
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  optionIconShellSelected: {
    backgroundColor: 'rgba(249,115,22,0.16)',
    borderColor: 'rgba(249,115,22,0.42)',
  },
  optionIconShimmer: {
    backgroundColor: 'rgba(249,115,22,0.55)',
    height: 18,
    position: 'absolute',
    width: 54,
  },
  optionTitle: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.display,
    fontSize: 30,
    lineHeight: 31,
    maxWidth: '100%',
  },
  optionTitleSelected: {
    color: colors.accent,
  },
  optionDetail: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: '100%',
  },
  notice: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 12,
  },
  noticeNeutral: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  noticeDanger: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.35)',
  },
  noticeSuccess: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  noticeAccent: {
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderColor: 'rgba(249,115,22,0.35)',
  },
  noticeText: {
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  loading: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 44,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  rowValue: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    textAlign: 'right',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 17,
  },
  emptyBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 18,
  },
  emptyText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
