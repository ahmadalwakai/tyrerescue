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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { colors } from '@/components/theme';
import { isTaxDate } from '@/lib/tax-input';
import type { PayFrequency } from '@/types/tax-payroll';

export default function PayrollSettingsScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const router = useRouter();
  const { settings, setup, isActivated, loading, error, saving, saveError, saveNotice, load, activatePayroll, updateSettings } = usePayrollSettings(companyId);
  const canSubmit = isActivated ? setup?.canEditSettings === true : setup?.canActivate === true;

  type Fields = { label: string; frequency: PayFrequency; anchorDate: string; monthlyPayDay: string };
  const formKey = `${companyId}:${settings?.version ?? 'new'}`;
  const [draft, setDraft] = useState<{ key: string; fields: Fields } | null>(null);
  const fields: Fields = draft?.key === formKey ? draft.fields : {
    label: settings?.scheduleLabel ?? '', frequency: settings?.payFrequency ?? 'monthly', anchorDate: settings?.scheduleAnchorDate ?? '',
    monthlyPayDay: settings?.monthlyPayDay == null ? '' : String(settings.monthlyPayDay),
  };
  const { label, frequency, anchorDate, monthlyPayDay } = fields;
  const setField = <K extends keyof Fields>(key: K, value: Fields[K]) => setDraft({ key: formKey, fields: { ...fields, [key]: value } });

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const onSubmit = useCallback(async () => {
    if (!canSubmit || saving) return;
    const payDayNum = /^(-1|\d{1,2})$/.test(monthlyPayDay.trim()) ? Number(monthlyPayDay.trim()) : null;
    if (frequency === 'monthly' && (payDayNum === null || (payDayNum !== -1 && (payDayNum < 1 || payDayNum > 28)))) {
      Alert.alert('Check pay day', 'Use a day from 1 to 28, or -1 for the last working day.'); return;
    }
    if (frequency !== 'monthly' && !isTaxDate(anchorDate.trim())) {
      Alert.alert('Check payment date', 'Enter a valid first payment date in YYYY-MM-DD format.'); return;
    }

    if (isActivated && settings) {
      const result = await updateSettings({
        expectedVersion: settings.version,
        scheduleLabel: label.trim() || undefined,
        scheduleAnchorDate: frequency !== 'monthly' ? (anchorDate.trim() || null) : null,
        monthlyPayDay: frequency === 'monthly' ? payDayNum : null,
      });
      if (!result && saveError?.code === 'CONFLICT_VERSION') {
        Alert.alert('Conflict', 'Settings were updated elsewhere. Reloading.', [
          { text: 'OK', onPress: () => void load() },
        ]);
      }
    } else {
      if (!label.trim()) {
        Alert.alert('Required', 'Schedule label is required.');
        return;
      }
      if (frequency === 'monthly' && !payDayNum) {
        Alert.alert('Required', 'Monthly pay day is required for monthly frequency.');
        return;
      }
      if (frequency !== 'monthly' && !anchorDate.trim()) {
        Alert.alert('Required', 'Schedule anchor date is required for non-monthly frequencies.');
        return;
      }
      await activatePayroll({
        scheduleLabel: label.trim(),
        payFrequency: frequency,
        scheduleAnchorDate: frequency !== 'monthly' ? (anchorDate.trim() || null) : null,
        monthlyPayDay: frequency === 'monthly' ? payDayNum : null,
      });
    }
  }, [canSubmit, saving, isActivated, settings, label, frequency, anchorDate, monthlyPayDay, activatePayroll, updateSettings, saveError, load]);

  if (loading && !settings) {
    return <View style={styles.centered}><ActivityIndicator color={colors.accent} /></View>;
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.button} onPress={load}><Text style={styles.buttonText}>Retry</Text></Pressable>
      </View>
    );
  }

  if (!isActivated && !setup?.canActivate) {
    return <View style={styles.centered}>
      <Text style={styles.infoText}>{setup?.state === 'not_activated'
        ? 'Your company profile is saved. Payroll has not been activated. Ask the company founder to choose the payroll schedule; this account cannot activate payroll.'
        : 'Payroll setup permissions could not be verified. Return to Tax & Payroll and check your company access.'}</Text>
      <Pressable style={styles.button} onPress={() => router.push('/tax-payroll')}><Text style={styles.buttonText}>Back to Tax & Payroll</Text></Pressable>
    </View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!isActivated ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Activating payroll enables employee pay runs for this company.
            Only the company founder may activate payroll.
            This saves your pay schedule in Assisted Chat; it does not register with HMRC or calculate a tax bill.
          </Text>
        </View>
      ) : null}
      {isActivated && !canSubmit ? <Text style={styles.infoText}>You can view this payroll schedule. Ask the company founder for payroll settings permission to change it.</Text> : null}
      {saveNotice ? <View style={styles.infoCard}><Text style={styles.infoText}>{saveNotice}</Text></View> : null}

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Schedule Label *</Text>
        <TextInput
          style={styles.input}
          accessibilityLabel="Schedule label"
          value={label}
          editable={canSubmit && !saving}
          onChangeText={(value) => setField('label', value)}
          placeholder="e.g. Monthly Payroll"
          placeholderTextColor={colors.subtle}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Pay Frequency</Text>
        <View style={styles.segmented}>
          {(['weekly', 'fortnightly', 'four_weekly', 'monthly'] as PayFrequency[]).map((f) => (
            <Pressable
              key={f}
              style={[styles.segment, frequency === f && styles.segmentActive]}
              onPress={() => setField('frequency', f)}
              disabled={isActivated || !canSubmit || saving}
            >
              <Text style={[styles.segmentText, frequency === f && styles.segmentActiveText]}>
                {f.replace(/_/g, ' ')}
              </Text>
            </Pressable>
          ))}
        </View>
        {isActivated ? <Text style={styles.hint}>Frequency cannot be changed after activation.</Text> : null}
      </View>

      {frequency === 'monthly' ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Pay Day (1–28, or -1 for last working day)</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Monthly pay day"
            value={monthlyPayDay}
            editable={canSubmit && !saving}
            onChangeText={(value) => setField('monthlyPayDay', value)}
            placeholder="e.g. 28"
            keyboardType="number-pad"
            placeholderTextColor={colors.subtle}
          />
          <Pressable style={styles.segment} disabled={!canSubmit || saving} onPress={() => setField('monthlyPayDay', monthlyPayDay === '-1' ? '' : '-1')}>
            <Text style={styles.segmentText}>{monthlyPayDay === '-1' ? '✓ Last working day selected' : 'Use last working day'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>First Payment Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="First payment date"
            value={anchorDate}
            editable={canSubmit && !saving}
            onChangeText={(value) => setField('anchorDate', value)}
            placeholder="e.g. 2026-04-11"
            placeholderTextColor={colors.subtle}
          />
        </View>
      )}

      {saveError ? <Text style={styles.errorText}>{saveError.error}</Text> : null}

      {canSubmit ? <Pressable
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.buttonText}>{isActivated ? 'Save Changes' : 'Activate Payroll'}</Text>
        )}
      </Pressable> : null}
      {isActivated ? <Pressable style={styles.button} disabled={saving} onPress={() => router.push({ pathname: '/tax-payroll/employees-payroll', params: { companyId } })}>
        <Text style={styles.buttonText}>Continue to employees & tax setup</Text>
      </Pressable> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  infoCard: { backgroundColor: colors.warningBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.warningBorder ?? colors.border },
  infoText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  fieldGroup: { gap: 5 },
  fieldLabel: { color: colors.subtle, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  segmented: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  segment: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg },
  segmentActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  segmentActiveText: { color: colors.accentText },
  hint: { color: colors.subtle, fontSize: 12 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: colors.accent, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.accentText, fontSize: 15, fontWeight: '900' },
});
