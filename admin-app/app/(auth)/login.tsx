import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/context';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { colors, spacing, typography } from '@/ui/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/(tabs)/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen centered>
      <View style={styles.header}>
        <Text style={styles.brand}>Tyre Rescue</Text>
        <Text style={styles.title}>Admin Console</Text>
        <Text style={styles.subtitle}>Internal operations mobile console</Text>
      </View>

      <Card style={styles.formCard}>
        <InputField label="Email" value={email} onChangeText={setEmail} placeholder="admin@tyrerescue.uk" keyboardType="email-address" />
        <InputField label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <PrimaryButton title={submitting ? 'Signing in…' : 'Sign in'} onPress={handleLogin} disabled={submitting} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing['2xl'],
    alignItems: 'center',
  },
  brand: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  formCard: {
    gap: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.sm,
  },
});
