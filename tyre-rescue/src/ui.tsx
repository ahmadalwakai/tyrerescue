import { Feather } from '@expo/vector-icons';
import { type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
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

import { colors, radii, typography } from './theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.logoRow}>
      <Image source={require('@/assets/images/icon.png')} style={compact ? styles.logoIconSmall : styles.logoIcon} />
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
  style,
  ...props
}: PropsWithChildren<
  PressableProps & {
    icon?: FeatherName;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    style?: StyleProp<ViewStyle>;
  }
>) {
  const isDisabled = disabled || loading;
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
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        buttonStyle,
        isDisabled ? styles.buttonDisabled : null,
        pressed && !isDisabled ? styles.buttonPressed : null,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.bg : colors.text} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={18} color={variant === 'primary' ? colors.bg : colors.text} /> : null}
          <Text style={[styles.buttonText, textStyle]}>{children}</Text>
        </>
      )}
    </Pressable>
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
  icon,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  detail?: string;
  meta?: string;
  icon?: FeatherName;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected ? styles.optionSelected : null,
        disabled ? styles.optionDisabled : null,
        pressed && !disabled ? styles.optionPressed : null,
      ]}
    >
      <View style={styles.optionTop}>
        {icon ? <Feather name={icon} size={19} color={selected ? colors.accent : colors.text} /> : null}
        {meta ? <Pill tone={selected ? 'accent' : 'neutral'}>{meta}</Pill> : null}
      </View>
      <Text style={[styles.optionTitle, selected ? styles.optionTitleSelected : null]}>{title}</Text>
      {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
    </Pressable>
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
  button: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
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
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.45,
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
  option: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 8,
    minHeight: 118,
    padding: 16,
  },
  optionSelected: {
    backgroundColor: '#1C1917',
    borderColor: colors.accent,
    borderWidth: 2,
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
