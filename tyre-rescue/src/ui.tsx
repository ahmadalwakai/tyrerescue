import { Feather } from '@expo/vector-icons';
import { type ComponentProps, type PropsWithChildren, type ReactNode, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
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
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing, typography, typeScale } from './theme';
import { useCustomerReducedMotion } from './use-customer-reduced-motion';

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

// The animated prop remains accepted for existing screens; the brand stays still.
export function Logo({ compact = false }: { compact?: boolean; animated?: boolean }) {
  return (
    <View accessible accessibilityLabel="Tyre Rescue" style={styles.logoRow}>
      <Image accessible={false} source={require('@/assets/images/icon.png')} style={compact ? styles.logoIconSmall : styles.logoIcon} />
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
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
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

function usePressFeedback(disabled = false) {
  const reducedMotion = useCustomerReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => { if (reducedMotion || disabled) scale.value = 1; }, [disabled, reducedMotion, scale]);
  const motionStyle = useAnimatedStyle(() => ({ transform: [{ scale: reducedMotion || disabled ? 1 : scale.value }] }));
  return {
    motionStyle,
    pressIn: () => { if (!reducedMotion && !disabled) scale.value = withTiming(0.985, { duration: 80 }); },
    pressOut: () => { if (!reducedMotion && !disabled) scale.value = withTiming(1, { duration: 100 }); },
  };
}

export function PrimaryButton({
  children,
  icon,
  loading,
  disabled,
  variant = 'primary',
  shine: _shine,
  style,
  onPressIn,
  onPressOut,
  accessibilityLabel,
  accessibilityState,
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
  const isDisabled = Boolean(disabled || loading);
  const { motionStyle, pressIn, pressOut } = usePressFeedback(isDisabled);
  const buttonStyle =
    variant === 'secondary'
      ? styles.buttonSecondary
      : variant === 'danger'
        ? styles.buttonDanger
        : variant === 'ghost'
          ? styles.buttonGhost
          : styles.buttonPrimary;
  const textStyle =
    variant === 'primary' ? styles.buttonTextDark : styles.buttonTextLight;
  const label = accessibilityLabel ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : undefined);
  const iconColor = variant === 'primary' ? colors.bg : colors.text;

  return (
    <Animated.View style={[styles.buttonMotion, style, motionStyle]}>
      <Pressable
        {...props}
        accessibilityRole={props.accessibilityRole ?? 'button'}
        accessibilityLabel={label}
        accessibilityState={{ ...accessibilityState, disabled: isDisabled, busy: Boolean(loading || accessibilityState?.busy) }}
        disabled={isDisabled}
        onPressIn={(event) => {
          pressIn();
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          pressOut();
          onPressOut?.(event);
        }}
        style={({ pressed }) => [
          styles.button,
          buttonStyle,
          isDisabled ? styles.buttonDisabled : null,
          pressed && !isDisabled ? styles.buttonPressed : null,
        ]}
      >
        {loading ? <ActivityIndicator accessible={false} color={iconColor} /> : icon ? <Feather accessible={false} name={icon} size={18} color={iconColor} /> : null}
        <Text style={[styles.buttonText, textStyle]}>{children}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function TextField({
  label,
  error,
  style,
  inputStyle,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
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
        {...props}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={[accessibilityHint, error].filter(Boolean).join('. ') || undefined}
        accessibilityState={{ ...accessibilityState, disabled: props.editable === false || accessibilityState?.disabled === true }}
        placeholderTextColor={props.placeholderTextColor ?? colors.muted}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        autoCorrect={props.autoCorrect ?? false}
        style={[styles.input, error ? styles.inputError : null, inputStyle]}
      />
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityLabel={`${label}: ${error}`} style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function OptionCard({
  title,
  detail,
  meta,
  metaTone,
  icon,
  iconShimmer: _iconShimmer,
  selected,
  disabled,
  onPress,
  accessibilityLabel,
  accessibilityHint,
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
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const { motionStyle, pressIn, pressOut } = usePressFeedback(disabled);

  return (
    <Animated.View style={[styles.optionMotion, motionStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? [title, meta, detail].filter(Boolean).join('. ')}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={({ pressed }) => [
          styles.option,
          selected ? styles.optionSelected : null,
          disabled ? styles.optionDisabled : null,
          pressed && !disabled ? styles.optionPressed : null,
        ]}
      >
        <View style={styles.optionTop}>
          {icon ? (
            <View style={[styles.optionIconShell, selected ? styles.optionIconShellSelected : null]}>
              <Feather accessible={false} name={icon} size={20} color={selected ? colors.accent : colors.text} />
            </View>
          ) : null}
          {meta ? <Pill tone={selected ? 'accent' : metaTone ?? 'neutral'}>{meta}</Pill> : null}
          {selected ? <Feather accessible={false} name="check-circle" size={20} color={colors.accent} /> : null}
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
      <Text accessibilityRole={tone === 'danger' ? 'alert' : undefined} accessibilityLiveRegion={tone === 'danger' ? 'polite' : undefined} style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }} style={styles.loading}>
      <ActivityIndicator accessible={false} size="large" color={colors.accent} />
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
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueStyle]}>{value}</Text>
    </View>
  );
}

export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
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
    flexWrap: 'wrap',
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
    fontFamily: typography.brand,
    fontSize: 24,
    letterSpacing: 0,
    lineHeight: 24,
  },
  logoRescue: {
    color: colors.accent,
    fontFamily: typography.brand,
    fontSize: 24,
    letterSpacing: 0,
    lineHeight: 24,
  },
  header: {
    alignSelf: 'stretch',
    gap: 6,
    marginBottom: 8,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.heading,
    fontSize: typeScale.title,
    lineHeight: typeScale.titleLine,
    maxWidth: '100%',
  },
  detail: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: typography.body,
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
    maxWidth: '100%',
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.gap,
    padding: spacing.card,
  },
  pill: {
    flexShrink: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    fontSize: 12,
    lineHeight: 18,
  },
  buttonMotion: {
    alignSelf: 'stretch',
    minWidth: 0,
  },
  button: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonDanger: {
    backgroundColor: colors.dangerButton,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: typography.bodyBold,
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
    flexShrink: 1,
    textAlign: 'center',
  },
  buttonTextDark: {
    color: colors.bg,
  },
  buttonTextLight: {
    color: colors.text,
  },
  field: {
    alignSelf: 'stretch',
    gap: 8,
    minWidth: 0,
  },
  label: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: typeScale.label,
    lineHeight: typeScale.labelLine,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 0,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: typeScale.label,
    lineHeight: typeScale.labelLine,
  },
  optionMotion: {
    alignSelf: 'stretch',
    minWidth: 0,
  },
  option: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 12,
    minHeight: 112,
    padding: spacing.card,
  },
  optionSelected: {
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderColor: 'rgba(249,115,22,0.72)',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionPressed: {
    opacity: 0.86,
  },
  optionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  optionIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(249,115,22,0.08)',
    borderColor: 'rgba(249,115,22,0.22)',
    borderRadius: radii.md,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  optionIconShellSelected: {
    backgroundColor: 'rgba(249,115,22,0.16)',
    borderColor: 'rgba(249,115,22,0.42)',
  },
  optionTitle: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.heading,
    fontSize: typeScale.section,
    lineHeight: typeScale.sectionLine,
    maxWidth: '100%',
  },
  optionTitleSelected: {
    color: colors.accent,
  },
  optionDetail: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: typography.body,
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
    maxWidth: '100%',
  },
  notice: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 14,
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
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
  },
  loading: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 44,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
  },
  row: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLabel: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: typeScale.label,
    lineHeight: typeScale.labelLine,
    flexShrink: 1,
    flexBasis: 96,
  },
  rowValue: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.bodyMedium,
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
    flexBasis: 140,
    flexGrow: 1,
    textAlign: 'right',
  },
  section: {
    gap: spacing.gap,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.heading,
    fontSize: typeScale.section,
    lineHeight: typeScale.sectionLine,
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
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
    textAlign: 'center',
  },
});
