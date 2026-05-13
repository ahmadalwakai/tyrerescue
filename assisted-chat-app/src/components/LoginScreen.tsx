import { useEffect, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, InlineNotice, StatusBanner } from './ui';
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
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(12));
  const [scale] = useState(() => new Animated.Value(0.96));
  // Subtle continuous pulse on the orange "TYRE" word only. Slow,
  // low-amplitude, native-driven — no measurable perf cost.
  const [pulse] = useState(() => new Animated.Value(0));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // react-native-web has no native animation module, so we must opt out there
  // to avoid the "useNativeDriver is not supported" warning. Native platforms
  // keep the perf benefit.
  const useNative = Platform.OS !== 'web';

  useEffect(() => {
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

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: useNative,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: useNative,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity, translateY, scale, pulse, useNative]);

  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loggingIn;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onLogin(email, password).catch(() => {
      // Failure is surfaced through `loginError` from the parent. Clear the
      // password so the user can re-enter it; keep the email value intact.
      setPassword('');
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.brandWrap,
              {
                opacity,
                transform: [{ translateY }, { scale }],
              },
            ]}
          >
            <Animated.Text
              style={[
                styles.brandTop,
                {
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            >
              TYRE
            </Animated.Text>
            <Text style={styles.brandBottom}>RESCUE</Text>
            <Text style={styles.brandTag}>Assisted Chat — Operator console</Text>
          </Animated.View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>

            {expiredMessage ? (
              <View style={{ marginBottom: 12 }}>
                <InlineNotice kind="warn">{expiredMessage}</InlineNotice>
              </View>
            ) : null}

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@tyrerescue.uk"
              placeholderTextColor={colors.subtle}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!loggingIn}
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.subtle}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              editable={!loggingIn}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
              style={styles.input}
            />

            {loginError ? (
              <View style={{ marginTop: 12 }}>
                <StatusBanner kind="err" message={loginError} />
              </View>
            ) : null}

            <View style={{ marginTop: 16 }}>
              <AppButton
                label={loggingIn ? 'Signing in…' : 'Log in'}
                onPress={handleSubmit}
                disabled={!canSubmit}
                loading={loggingIn}
                fullWidth
              />
            </View>
          </View>

          <Text style={styles.footer}>
            Admin access only. Use your existing Tyre Rescue admin credentials.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'center',
    gap: 16,
  },
  brandWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  brandTop: {
    color: colors.accent,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 6,
  },
  brandBottom: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 6,
    marginTop: -4,
  },
  brandTag: {
    marginTop: 10,
    color: colors.muted,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: 12,
  },
  label: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    minHeight: 44,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  footer: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: 8,
  },
});
