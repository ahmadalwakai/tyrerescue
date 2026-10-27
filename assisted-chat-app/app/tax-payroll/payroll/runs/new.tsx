import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePayrollDrafts } from '@/hooks/usePayrollDrafts';
import { colors } from '@/components/theme';
import { isTaxDate } from '@/lib/tax-input';

export default function NewPayrollRunScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const router = useRouter();
  const { creating, createError, createRun } = usePayrollDrafts(companyId);

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [paymentDate, setPaymentDate] = useState('');

  const onSubmit = useCallback(async () => {
    if (![periodStart.trim(), periodEnd.trim(), paymentDate.trim()].every(isTaxDate) || periodStart.trim() > periodEnd.trim()) {
      Alert.alert('Check dates', 'Enter valid YYYY-MM-DD dates. The period end must be on or after its start.');
      return;
    }
    const result = await createRun({
      periodStart: periodStart.trim(),
      periodEnd: periodEnd.trim(),
      intendedPaymentDate: paymentDate.trim(),
    });
    if (result) {
      router.replace({
        pathname: '/tax-payroll/payroll/runs/[runId]' as const,
        params: { runId: result.id, companyId },
      });
    }
  }, [periodStart, periodEnd, paymentDate, companyId, createRun, router]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.hint}>
        Create a draft pay run for a specific period. You will be able to add employee earnings
        lines, calculate tax and deductions, and review and approve the figures before finalising.
      </Text>

      <Field label="Period Start * (YYYY-MM-DD)" value={periodStart} onChangeText={setPeriodStart} placeholder="e.g. 2026-10-01" error={createError?.fieldErrors?.['periodStart']} />
      <Field label="Period End * (YYYY-MM-DD)" value={periodEnd} onChangeText={setPeriodEnd} placeholder="e.g. 2026-10-31" error={createError?.fieldErrors?.['periodEnd']} />
      <Field label="Intended Payment Date * (YYYY-MM-DD)" value={paymentDate} onChangeText={setPaymentDate} placeholder="e.g. 2026-10-25" error={createError?.fieldErrors?.['intendedPaymentDate']} />

      {createError && !createError.fieldErrors ? (
        <Text style={styles.errorText}>{createError.error}</Text>
      ) : null}

      <Pressable style={[styles.button, creating && styles.buttonDisabled]} onPress={onSubmit} disabled={creating}>
        {creating ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.buttonText}>Create Draft Run</Text>}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, placeholder, error }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; error?: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={[styles.input, error ? styles.inputError : null]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.subtle} />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  fieldGroup: { gap: 5 },
  fieldLabel: { color: colors.subtle, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  inputError: { borderColor: colors.dangerBorder },
  fieldError: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: colors.accent, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.accentText, fontSize: 15, fontWeight: '900' },
});
