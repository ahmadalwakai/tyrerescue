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
      {onClose ? <AdminHeaderButton label={closeLabel} onPress={onClose} /> : null}
    </Animated.View>
  );
}

export function AdminHeaderButton({ label, onPress, disabled, primary }: AdminHeaderButtonProps) {
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
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Animated.View style={pressScaleStyle}>
        <Text style={[styles.buttonText, primary && styles.buttonPrimaryText]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const headerShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 10px 18px rgba(0,0,0,0.30)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
});

const buttonShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 6px 10px rgba(0,0,0,0.22)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
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
    height: 156,
    backgroundColor: colors.surfaceElevated,
    opacity: 0.78,
    borderBottomWidth: 1,
    borderBottomColor: colors.glowBorder,
  },
  midBand: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 96,
    height: 76,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.accentMuted,
    opacity: 0.72,
  },
  sideRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.accent,
    opacity: 0.78,
  },
  bottomBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
    backgroundColor: colors.surfaceElevated,
    opacity: 0.3,
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
    minWidth: 160,
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
    backgroundColor: colors.surfaceElevated,
    ...(buttonShadow ?? {}),
  },
  buttonPrimary: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  buttonPrimaryText: {
    color: colors.accentText,
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.5,
  },
});
