import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InlineNotice, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  loggingIn: boolean;
  loginError: string | null;
  expiredMessage: string | null;
}

// Plain RN Animated (no extra dep). Subtle fade + soft vertical entrance +
// gentle scale on the brand. Runs once on mount.
export function LoginScreen({
  onLogin,
  loggingIn,
  loginError,
  expiredMessage,
}: Props) {
  // Animated.Value instances are mutable, so a `useState` lazy initializer
  // gives us a stable reference for the lifetime of the component without
  // accessing `ref.current` during render (which the React Compiler /
  // `react-hooks/refs` lint rule disallows).
  const [opacity] = useState(() => new Animated.Value(Platform.OS === 'web' ? 1 : 0));
  const [translateY] = useState(() => new Animated.Value(Platform.OS === 'web' ? 0 : 12));
  const [scale] = useState(() => new Animated.Value(Platform.OS === 'web' ? 1 : 0.96));

  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  // react-native-web has no native animation module, so we must opt out there
  // to avoid the "useNativeDriver is not supported" warning. Native platforms
  // keep the perf benefit.
  const useNative = Platform.OS !== 'web';
  const isWide = width >= 820;

  useEffect(() => {
    if (Platform.OS === 'web') return;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 520,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 520,
        useNativeDriver: useNative,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: useNative,
      }),
    ]).start();
  }, [opacity, translateY, scale, useNative]);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loggingIn;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onLogin(email, password).catch(() => {
      // Failure is surfaced through `loginError` from the parent. Clear the
      // password so the user can re-enter it; keep the email value intact.
      setPassword('');
    });
  };

  const handleWebSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    handleSubmit();
  };

  const formContent = (
    <>
      {expiredMessage ? (
        <View style={styles.noticeWrap}>
          <InlineNotice kind="warn">{expiredMessage}</InlineNotice>
        </View>
      ) : null}

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Email address</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@tyrerescue.uk"
          placeholderTextColor={colors.subtle}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!loggingIn}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField(null)}
          style={[styles.input, focusedField === 'email' && styles.inputFocused]}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.subtle}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          editable={!loggingIn}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
        />
      </View>

      {loginError ? (
        <View style={styles.errorWrap}>
          <StatusBanner kind="err" message={loginError} />
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit, busy: loggingIn }}
        style={({ pressed }) => [
          styles.loginButton,
          pressed && canSubmit && styles.loginButtonPressed,
          !canSubmit && styles.loginButtonDisabled,
        ]}
      >
        {loggingIn ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.loginButtonText}>Sign in</Text>
        )}
      </Pressable>

      <Text style={styles.footer}>Protected admin area</Text>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <LoginBackdrop />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Animated.View
            style={[
              styles.shell,
              isWide ? styles.shellWide : styles.shellNarrow,
              {
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.brandPanel,
                isWide ? styles.brandPanelWide : styles.panelFull,
                { transform: [{ scale }] },
              ]}
            >
              <View style={styles.logoRow}>
                <Image source={require('../../assets/icon.png')} style={styles.logo} />
                <View style={styles.logoCopy}>
                  <Text style={styles.brandTop}>TYRE</Text>
                  <Text style={styles.brandBottom}>RESCUE</Text>
                </View>
              </View>

              <View style={styles.brandCopyBlock}>
                <Text style={styles.brandEyebrow}>Assisted Chat</Text>
                <Text style={styles.brandHeadline}>Operator console</Text>
                <Text style={styles.brandText}>
                  Admin access for active bookings, quotes, payments, and dispatch.
                </Text>
              </View>

              <View style={styles.statusGrid}>
                <View style={styles.statusTile}>
                  <Text style={styles.statusLabel}>Access</Text>
                  <Text style={styles.statusValue}>Admin</Text>
                </View>
                <View style={styles.statusTile}>
                  <Text style={styles.statusLabel}>Workspace</Text>
                  <Text style={styles.statusValue}>Live</Text>
                </View>
              </View>
            </Animated.View>

            <View style={[styles.card, isWide ? styles.cardWide : styles.panelFull]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardKicker}>Secure sign in</Text>
                <Text style={styles.cardTitle}>Welcome back</Text>
                <Text style={styles.cardSubtitle}>Use your Tyre Rescue admin credentials.</Text>
              </View>

              {Platform.OS === 'web' ? (
                <form onSubmit={handleWebSubmit} style={webFormStyle}>
                  {formContent}
                </form>
              ) : (
                <View>{formContent}</View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoginBackdrop() {
  return (
    <View style={[styles.backdrop, styles.noPointerEvents]}>
      <View style={styles.backdropTop} />
      <View style={styles.backdropPanel} />
      <View style={styles.backdropBottom} />
    </View>
  );
}

const webFormStyle = {
  margin: 0,
  padding: 0,
};

const panelShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 10px 18px rgba(0,0,0,0.22)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
});

const cardShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 14px 24px rgba(0,0,0,0.32)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
});

const fieldShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 4px 8px rgba(0,0,0,0.12)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
});

const buttonShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 8px 14px rgba(249,115,22,0.24)' } as ViewStyle,
  default: {
    shadowColor: colors.shadowWarm,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  content: { flex: 1, zIndex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  backdropTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 190,
    backgroundColor: colors.surface,
    opacity: 0.72,
  },
  backdropPanel: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 112,
    bottom: 96,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardMuted,
    opacity: 0.36,
  },
  backdropBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 138,
    backgroundColor: colors.surfaceElevated,
    opacity: 0.24,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shell: {
    gap: 16,
  },
  shellNarrow: {
    width: '82%',
    minWidth: 294,
    maxWidth: 326,
  },
  shellWide: {
    width: 940,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 20,
  },
  brandPanel: {
    padding: 22,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(18,20,28,0.84)',
    ...panelShadow,
  },
  brandPanelWide: {
    width: 500,
    flexShrink: 0,
    justifyContent: 'space-between',
    minHeight: 390,
  },
  panelFull: {
    width: '100%',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
  },
  logoCopy: {
    minWidth: 0,
    flexShrink: 1,
  },
  brandTop: {
    color: colors.accent,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 32,
  },
  brandBottom: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 32,
  },
  brandCopyBlock: {
    marginTop: 34,
  },
  brandEyebrow: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  brandHeadline: {
    marginTop: 8,
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 32,
  },
  brandText: {
    marginTop: 10,
    color: colors.muted,
    fontSize: fontSize.md,
    lineHeight: 21,
    maxWidth: 340,
  },
  statusGrid: {
    marginTop: 28,
    flexDirection: 'row',
    gap: 10,
  },
  statusTile: {
    flex: 1,
    minHeight: 70,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(7,8,12,0.48)',
    justifyContent: 'center',
  },
  statusLabel: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  statusValue: {
    marginTop: 5,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  card: {
    backgroundColor: 'rgba(23,25,34,0.96)',
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 22,
    ...cardShadow,
  },
  cardWide: {
    width: 420,
    flexShrink: 0,
  },
  cardHeader: {
    marginBottom: 18,
  },
  cardKicker: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 6,
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    lineHeight: 19,
    marginTop: 6,
  },
  noticeWrap: {
    marginBottom: 14,
  },
  fieldGroup: {
    gap: 7,
    marginTop: 12,
  },
  label: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  input: {
    minHeight: 50,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
    ...fieldShadow,
  },
  inputFocused: {
    borderColor: colors.accent,
    backgroundColor: '#10131B',
  },
  errorWrap: {
    marginTop: 14,
  },
  loginButton: {
    minHeight: 52,
    marginTop: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...buttonShadow,
  },
  loginButtonPressed: {
    backgroundColor: colors.accentPressed,
    borderColor: colors.accentPressed,
  },
  loginButtonDisabled: {
    opacity: 0.58,
  },
  loginButtonText: {
    color: colors.accentText,
    fontSize: fontSize.md,
    fontWeight: '900',
    letterSpacing: 0,
  },
  footer: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: 14,
    width: '100%',
  },
});
