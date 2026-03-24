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
import { driverApi, ApiError } from '@/api/client';
import { useI18n } from '@/i18n';

export default function ForgotPasswordScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert(t('common.error'), t('auth.enterEmail'));
      return;
    }

    setLoading(true);
    try {
      await driverApi.forgotPassword(trimmed);
      setSent(true);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : t('auth.somethingWrong');
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>{t('auth.checkEmail')}</Text>
          <Text style={styles.successText}>
            {t('auth.resetEmailSent')}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>{t('auth.backToLogin')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
          <Text style={styles.subtitle}>{t('auth.resetPassword')}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.description}>
            {t('auth.resetDescription')}
          </Text>

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
            autoFocus
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? t('common.sending') : t('auth.sendResetLink')}
            </Text>
          </Pressable>

          <Pressable
            style={styles.linkButton}
            onPress={() => router.back()}
          >
            <Text style={styles.linkText}>{t('auth.backToLogin')}</Text>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.md,
    lineHeight: 20,
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
  linkButton: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  linkText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  successIcon: {
    fontSize: 48,
    color: colors.success,
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xl,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  successText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
});
