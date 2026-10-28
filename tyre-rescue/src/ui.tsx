import { Feather } from '@expo/vector-icons';
import { type ComponentProps, type PropsWithChildren, type ReactNode, useEffect, useMemo, useState } from 'react';
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

// Forward-pointing icons read as "next", so they follow the label instead of leading it.
const TRAILING_ICONS = new Set<FeatherName>(['arrow-right', 'chevron-right']);

export function useScreenContentInsets() {
  const insets = useSafeAreaInsets();

  return useMemo<ViewStyle>(
    () => ({
      paddingTop: Math.max(spacing.page, insets.top + 10),
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
      <Text style={styles.logoText}>
        TYRE <Text style={styles.logoAccent}>RESCUE</Text>
      </Text>
    </View>
  );
}

/** One brand bar for every tab: optional back action on the leading edge, optional action on the trailing edge. */
export function AppHeader({ onBack, backDisabled, backLabel = 'Back', trailing }: {
  onBack?: () => void;
  backDisabled?: boolean;
  backLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.appHeader}>
      {onBack ? (
        <IconButton icon="chevron-left" accessibilityLabel={backLabel} disabled={backDisabled} onPress={onBack} />
      ) : null}
      <View style={styles.appHeaderBrand}>
        <Logo compact />
      </View>
      {trailing ? <View style={styles.appHeaderTrailing}>{trailing}</View> : null}
    </View>
  );
}

export function IconButton({ icon, accessibilityLabel, disabled, onPress }: {
  icon: FeatherName;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, disabled ? styles.buttonDisabled : null, pressed && !disabled ? styles.buttonPressed : null]}
    >
      <Feather accessible={false} name={icon} size={20} color={colors.text} />
    </Pressable>
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
  const textTone =
    tone === 'accent' ? styles.pillTextAccent : tone === 'success' ? styles.pillTextSuccess : tone === 'danger' ? styles.pillTextDanger : null;
  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={[styles.pillText, textTone]}>{children}</Text>
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
    variant === 'primary' ? styles.buttonTextDark : variant === 'ghost' ? styles.buttonTextGhost : styles.buttonTextLight;
  const label = accessibilityLabel ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : undefined);
  const iconColor = variant === 'primary' ? colors.onAccent : variant === 'ghost' ? colors.accent : colors.text;
  const trailing = Boolean(icon && TRAILING_ICONS.has(icon));
  const iconNode = loading ? <ActivityIndicator accessible={false} color={iconColor} /> : icon ? <Feather accessible={false} name={icon} size={18} color={iconColor} /> : null;

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
        {trailing && !loading ? null : iconNode}
        <Text style={[styles.buttonText, textStyle]}>{children}</Text>
        {trailing && !loading ? iconNode : null}
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
        placeholderTextColor={props.placeholderTextColor ?? colors.subtle}
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
        {icon ? (
          <View style={[styles.optionIconShell, selected ? styles.optionIconShellSelected : null]}>
            <Feather accessible={false} name={icon} size={20} color={selected ? colors.accent : colors.muted} />
          </View>
        ) : null}
        <View style={styles.optionCopy}>
          <Text style={styles.optionTitle}>{title}</Text>
          {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
          {meta ? <Text style={[styles.optionMeta, metaTone === 'success' ? styles.optionMetaSuccess : metaTone === 'accent' || selected ? styles.optionMetaAccent : null]}>{meta}</Text> : null}
        </View>
        <Feather accessible={false} name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? colors.accent : colors.borderStrong} />
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
  const icon: FeatherName = tone === 'danger' ? 'alert-circle' : tone === 'success' ? 'check-circle' : 'info';
  const iconColor = tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : tone === 'accent' ? colors.accent : colors.muted;
  return (
    <View style={[styles.notice, toneStyle]}>
      <Feather accessible={false} name={icon} size={18} color={iconColor} style={styles.noticeIcon} />
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

/** A grouped summary line with an optional edit action, used on review screens. */
export function SummaryItem({ icon, title, detail, editLabel, onEdit, disabled }: {
  icon: FeatherName;
  title: string;
  detail?: string | null;
  editLabel?: string;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryIcon}>
        <Feather accessible={false} name={icon} size={18} color={colors.accent} />
      </View>
      <View accessible accessibilityLabel={[title, detail].filter(Boolean).join('. ')} style={styles.summaryCopy}>
        <Text style={styles.summaryTitle}>{title}</Text>
        {detail ? <Text style={styles.summaryDetail}>{detail}</Text> : null}
      </View>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editLabel ?? `Edit ${title}`}
          accessibilityState={{ disabled: Boolean(disabled) }}
          disabled={disabled}
          hitSlop={8}
          onPress={onEdit}
          style={({ pressed }) => [styles.summaryEdit, pressed ? styles.buttonPressed : null, disabled ? styles.buttonDisabled : null]}
        >
          <Text style={styles.summaryEditText}>Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Collapsed-by-default group for optional inputs so a step leads with its one required question. */
export function Disclosure({ title, summary, initiallyOpen = false, children }: PropsWithChildren<{
  title: string;
  summary?: string;
  initiallyOpen?: boolean;
}>) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, summary].filter(Boolean).join('. ')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(value => !value)}
        style={({ pressed }) => [styles.disclosureHeader, pressed ? styles.buttonPressed : null]}
      >
        <View style={styles.summaryCopy}>
          <Text style={styles.disclosureTitle}>{title}</Text>
          {summary ? <Text style={styles.summaryDetail}>{summary}</Text> : null}
        </View>
        <Feather accessible={false} name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, accessibilityLabel }: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, pressed ? styles.buttonPressed : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

/** Equal-width single choice, e.g. quantity or wheel nut type. */
export function Segmented<T extends string | number>({ options, value, onChange, accessibilityLabel }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.segmented}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityLabel={`${accessibilityLabel}: ${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <Text style={[styles.segmentText, selected ? styles.segmentTextSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function QuantityStepper({ value, min = 0, max, label, onChange }: {
  value: number;
  min?: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${label}`} accessibilityState={{ disabled: value <= min }} disabled={value <= min}
        hitSlop={6} onPress={() => onChange(value - 1)} style={[styles.stepperButton, value <= min ? styles.buttonDisabled : null]}>
        <Feather accessible={false} name={value <= 1 ? 'trash-2' : 'minus'} size={18} color={colors.text} />
      </Pressable>
      <Text accessibilityLabel={`${value} ${label}`} style={styles.stepperValue}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${label}`} accessibilityState={{ disabled: value >= max }} disabled={value >= max}
        hitSlop={6} onPress={() => onChange(value + 1)} style={[styles.stepperButton, value >= max ? styles.buttonDisabled : null]}>
        <Feather accessible={false} name="plus" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** Small square shortcut, used for the help row (call, chat, callback). */
export function ActionTile({ icon, label, onPress, accessibilityLabel }: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed ? styles.buttonPressed : null]}
    >
      <Feather accessible={false} name={icon} size={20} color={colors.accent} />
      <Text style={styles.tileText}>{label}</Text>
    </Pressable>
  );
}

/** Tappable list row with a leading icon and trailing chevron. */
export function ListRow({ icon, title, detail, onPress, accessibilityLabel, last }: {
  icon: FeatherName;
  title: string;
  detail?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, detail].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, last ? null : styles.listRowDivider, pressed ? styles.listRowPressed : null]}
    >
      <View style={styles.summaryIcon}>
        <Feather accessible={false} name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryTitle}>{title}</Text>
        {detail ? <Text style={styles.summaryDetail}>{detail}</Text> : null}
      </View>
      <Feather accessible={false} name="chevron-right" size={18} color={colors.subtle} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  logoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logoIcon: {
    borderRadius: 11,
    height: 40,
    width: 40,
  },
  logoIconSmall: {
    borderRadius: 8,
    height: 30,
    width: 30,
  },
  logoText: {
    color: colors.text,
    fontFamily: typography.brand,
    fontSize: 22,
    letterSpacing: 1,
    lineHeight: 26,
  },
  logoAccent: {
    color: colors.accent,
  },
  appHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 44,
  },
  appHeaderBrand: {
    flex: 1,
    flexShrink: 1,
  },
  appHeaderTrailing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  header: {
    alignSelf: 'stretch',
    gap: 6,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
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
    gap: spacing.gap,
    padding: spacing.card,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexShrink: 1,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillNeutral: {
    backgroundColor: colors.surfaceRaised,
  },
  pillAccent: {
    backgroundColor: colors.accentSoft,
  },
  pillSuccess: {
    backgroundColor: colors.successSoft,
  },
  pillDanger: {
    backgroundColor: colors.dangerSoft,
  },
  pillText: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  pillTextAccent: {
    color: '#FDBA74',
  },
  pillTextSuccess: {
    color: '#86EFAC',
  },
  pillTextDanger: {
    color: '#FCA5A5',
  },
  buttonMotion: {
    alignSelf: 'stretch',
    minWidth: 0,
  },
  button: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceRaised,
  },
  buttonDanger: {
    backgroundColor: colors.dangerButton,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    minHeight: 44,
    paddingVertical: 10,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: typography.bodyBold,
    fontSize: typeScale.body,
    lineHeight: typeScale.bodyLine,
    flexShrink: 1,
    textAlign: 'center',
  },
  buttonTextDark: {
    color: colors.onAccent,
  },
  buttonTextLight: {
    color: colors.text,
  },
  buttonTextGhost: {
    color: colors.accent,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
  },
  field: {
    alignSelf: 'stretch',
    gap: 6,
    minWidth: 0,
  },
  label: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: typeScale.caption,
    lineHeight: typeScale.captionLine,
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
    minHeight: 50,
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
    fontSize: typeScale.caption,
    lineHeight: typeScale.captionLine,
  },
  optionMotion: {
    alignSelf: 'stretch',
    minWidth: 0,
  },
  option: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  optionSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionPressed: {
    opacity: 0.86,
  },
  optionIconShell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  optionIconShellSelected: {
    backgroundColor: colors.accentSoft,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  optionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22,
  },
  optionDetail: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
  },
  optionMeta: {
    color: colors.subtle,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  optionMetaAccent: {
    color: '#FDBA74',
  },
  optionMetaSuccess: {
    color: '#86EFAC',
  },
  notice: {
    alignItems: 'flex-start',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeNeutral: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  noticeDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  noticeSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  noticeAccent: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  noticeText: {
    color: colors.text,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
  },
  loading: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 44,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  // The label takes the free width; the value keeps its natural width up to two thirds of the row.
  rowLabel: {
    color: colors.muted,
    flex: 1,
    fontFamily: typography.body,
    fontSize: typeScale.label,
    lineHeight: typeScale.labelLine,
    minWidth: 0,
  },
  rowValue: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.bodyMedium,
    fontSize: typeScale.label,
    lineHeight: typeScale.labelLine,
    maxWidth: '66%',
    textAlign: 'right',
  },
  section: {
    gap: 10,
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
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  summaryItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  summaryCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  summaryTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
  },
  summaryDetail: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  summaryEdit: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  summaryEditText: {
    color: colors.accent,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  disclosure: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  disclosureHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: spacing.card,
    paddingVertical: 12,
  },
  disclosureTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
  },
  disclosureBody: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
    padding: spacing.card,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  chipText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  chipTextSelected: {
    color: colors.accent,
  },
  segmented: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 6,
  },
  segmentSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  segmentText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
  },
  segmentTextSelected: {
    color: colors.text,
    fontFamily: typography.bodyBold,
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 3,
  },
  stepperButton: {
    alignItems: 'center',
    borderRadius: 9,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  stepperValue: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    minWidth: 24,
    textAlign: 'center',
  },
  tile: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 72,
    padding: 10,
  },
  tileText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
  },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: spacing.card,
    paddingVertical: 10,
  },
  listRowDivider: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listRowPressed: {
    backgroundColor: colors.surfaceRaised,
  },
});
