import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { useAuth } from '@/auth/context';
import { ApiError } from '@/api/client';
import { useI18n } from '@/i18n';

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('common.error'), t('auth.enterCredentials'));
      return;
    }

    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('auth.somethingWrong');
      Alert.alert(t('auth.loginFailed'), message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoBox}>
          <Text style={styles.brand}>{t('auth.brand')}</Text>
          <Text style={styles.subtitle}>{t('auth.driverApp')}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>{t('auth.email')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />

          <Text style={styles.label}>{t('auth.password')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </Text>
          </Pressable>

          <Pressable
            style={styles.forgotButton}
            onPress={() => router.push('/(auth)/forgot-password')}
          >
            <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  brand: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 42,
    color: colors.accent,
    letterSpacing: 3,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    color: colors.muted,
    marginTop: 4,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonPressed: {
    backgroundColor: colors.accentHover,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: '#FFFFFF',
  },
  forgotButton: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  forgotText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.accent,
  },
});
