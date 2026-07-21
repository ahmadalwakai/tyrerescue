import React, { type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, radius, space } from '../theme';
import { useFadeSlideIn, usePressScale } from '../motion';

interface AdminModalShellProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardAvoidingEnabled?: boolean;
}

interface AdminModalHeaderProps {
  title: string;
  titleNode?: ReactNode;
  subtitle?: string | null;
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  style?: StyleProp<ViewStyle>;
}

interface AdminHeaderButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}

export function AdminModalShell({
  children,
  style,
  keyboardAvoidingEnabled = true,
}: AdminModalShellProps) {
  const insets = useSafeAreaInsets();
  const entranceStyle = useFadeSlideIn({ distance: 14, duration: 280 });
  const content = (
    <Animated.View style={[styles.content, entranceStyle]}>{children}</Animated.View>
  );
  return (
    <SafeAreaView
      style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 0) }, style]}
      edges={['left', 'right', 'bottom']}
    >
      <AdminChromeBackdrop />
      {keyboardAvoidingEnabled ? (
        <KeyboardAvoidingView
          style={styles.keyboardAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function AdminChromeBackdrop() {
  return (
    <View style={[styles.backdrop, styles.noPointerEvents]}>
      <View style={styles.topBand} />
      <View style={styles.coolBloom} />
      <View style={styles.warmBloom} />
      <View style={styles.midBand} />
      <View style={styles.sideRail} />
      <View style={styles.bottomBand} />
    </View>
  );
}

export function AdminModalHeader({
  title,
  titleNode,
  subtitle,
  actions,
  onClose,
  closeLabel = 'Close',
  style,
}: AdminModalHeaderProps) {
  const insets = useSafeAreaInsets();
  const entranceStyle = useFadeSlideIn({ distance: 8, duration: 240 });
  return (
    <Animated.View style={[styles.header, { paddingTop: Math.max(insets.top, space.md) }, entranceStyle, style]}>
      <View style={[styles.headerAccent, styles.noPointerEvents]} />
      <View style={styles.copy}>
        {titleNode ?? (
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
        )}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
      {onClose ? (
        <AdminHeaderButton
          label={closeLabel}
          onPress={onClose}
          danger={closeLabel.trim().toLowerCase() === 'close'}
        />
      ) : null}
    </Animated.View>
  );
}

export function AdminHeaderButton({ label, onPress, disabled, primary, danger }: AdminHeaderButtonProps) {
  const { pressScaleStyle, pressIn, pressOut } = usePressScale(Boolean(disabled));
  const handlePressIn = (_event: GestureResponderEvent) => {
    pressIn();
  };
  const handlePressOut = (_event: GestureResponderEvent) => {
    pressOut();
  };
  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        danger && styles.buttonDanger,
        pressed && !disabled && styles.pressed,
        pressed && !disabled && danger && styles.buttonDangerPressed,
        disabled && styles.disabled,
      ]}
    >
      <Animated.View style={pressScaleStyle}>
        <Text
          style={[
            styles.buttonText,
            primary && styles.buttonPrimaryText,
            danger && styles.buttonDangerText,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const headerShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 18px 40px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
});

const buttonShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 10px 24px rgba(0,0,0,0.34)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 3,
  },
});

const dangerButtonShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 12px 28px rgba(255,77,99,0.28), inset 0 1px 0 rgba(255,255,255,0.16)' } as ViewStyle,
  default: {
    shadowColor: colors.danger,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
  keyboardAvoider: {
    flex: 1,
    zIndex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 0,
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  topBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 188,
    backgroundColor: colors.surfaceOverlay,
    opacity: 0.92,
    borderBottomWidth: 1,
    borderBottomColor: colors.glowBorder,
  },
  coolBloom: {
    position: 'absolute',
    right: -54,
    top: 42,
    width: 180,
    height: 132,
    borderRadius: 8,
    backgroundColor: colors.blueBg,
    opacity: 0.8,
  },
  warmBloom: {
    position: 'absolute',
    left: -38,
    top: 86,
    width: 146,
    height: 112,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    opacity: 0.72,
  },
  midBand: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 104,
    height: 86,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.glass,
    opacity: 0.88,
  },
  sideRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.accent,
    opacity: 0.58,
  },
  bottomBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 126,
    backgroundColor: colors.bgDeep,
    opacity: 0.68,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.glowBorder,
    backgroundColor: colors.surfaceOverlay,
    overflow: 'hidden',
    position: 'relative',
    ...(headerShadow ?? {}),
  },
  headerAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.95,
  },
  copy: {
    flex: 1,
    minWidth: 184,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.muted,
    fontSize: fontSize.xs,
    marginTop: 2,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: '100%',
  },
  button: {
    minHeight: 46,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    ...(buttonShadow ?? {}),
  },
  buttonPrimary: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  buttonDanger: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    ...(dangerButtonShadow ?? {}),
  },
  buttonDangerPressed: {
    backgroundColor: 'rgba(255,77,99,0.22)',
    borderColor: colors.danger,
    opacity: 0.86,
  },
  buttonText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  buttonPrimaryText: {
    color: colors.accentText,
  },
  buttonDangerText: {
    color: colors.danger,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.5,
  },
});
