import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/context';
import { colors, radius } from '@/theme';
import type { SessionRole } from '@/types';
import { Button, Field, Message } from './StockPrimitives';

export function StockLogin() {
  const { login } = useAuth();
  const [role, setRole] = useState<SessionRole>('driver');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealPassword, setRevealPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting || !email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(role, email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.brand}>
              <View style={styles.mark}><MaterialCommunityIcons name="tire" size={29} color={colors.primary} /></View>
              <View><Text style={styles.brandName}>TYRE RESCUE</Text><Text style={styles.title}>Stock</Text></View>
            </View>
            <Text style={styles.description}>Sign in to manage city stock and your shift.</Text>
            <View style={styles.roles}>
              {(['driver', 'admin'] as const).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: role === option, disabled: submitting }}
                  disabled={submitting}
                  onPress={() => { setRole(option); setError(null); }}
                  style={({ pressed }) => [styles.role, role === option && styles.roleSelected, pressed && { opacity: 0.8 }]}
                >
                  <Text style={[styles.roleText, role === option && { color: colors.primary }]}>{option === 'driver' ? 'Driver' : 'Admin'}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <View style={styles.passwordGroup}>
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!revealPassword} placeholder="Your password" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={revealPassword ? 'Hide password' : 'Show password'}
                onPress={() => setRevealPassword((current) => !current)}
                style={styles.reveal}
              >
                <MaterialCommunityIcons name={revealPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                <Text style={styles.revealText}>{revealPassword ? 'Hide password' : 'Show password'}</Text>
              </Pressable>
            </View>
            {error ? <Message text={error} tone="error" /> : null}
            <Button title={submitting ? 'Signing in…' : 'Sign in'} icon="login" tone="primary" onPress={() => { void submit(); }} disabled={submitting || !email.trim() || !password} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 24, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: colors.muted, fontSize: 11, letterSpacing: 1.8, fontWeight: '700' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 3 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  roles: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  role: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  roleSelected: { backgroundColor: colors.primarySoft },
  roleText: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  passwordGroup: { gap: 2 },
  reveal: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  revealText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
});
