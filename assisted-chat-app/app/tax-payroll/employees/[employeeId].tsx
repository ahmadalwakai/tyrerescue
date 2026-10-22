import { useCallback, useEffect, useState } from 'react';
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
import { useLocalSearchParams } from 'expo-router';
import { useEmployee } from '@/hooks/useEmployee';
import { colors } from '@/components/theme';
import { EmployeeTaxSetupPanel } from '@/components/payroll/EmployeeTaxSetupPanel';
import type { PayBasis, PayFrequency } from '@/types/tax-payroll';

export default function EmployeeDetailScreen() {
  const { companyId, employeeId } = useLocalSearchParams<{ companyId: string; employeeId: string }>();
  const { employee, loading, error, saving, saveError, payTerms, load, loadPayTerms, updateEmployee, addPayTerms } = useEmployee(companyId, employeeId);

  const [editMode, setEditMode] = useState(false);
  const [addTermsMode, setAddTermsMode] = useState(false);

  // Edit fields
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [niCategory, setNiCategory] = useState('');
  const [editVersion, setEditVersion] = useState(0);

  // Pay terms fields
  const [payBasis, setPayBasis] = useState<PayBasis>('hourly');
  const [hourlyRate, setHourlyRate] = useState('');
  const [fixedGross, setFixedGross] = useState('');
  const [payFreq, setPayFreq] = useState<PayFrequency>('monthly');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  useEffect(() => {
    void load();
    void loadPayTerms();
  }, [load, loadPayTerms]);

  const onSave = useCallback(async () => {
    if (!employee) return;
    if (editVersion !== employee.version) { Alert.alert('Employee details changed', 'Close this edit form and reopen it to use the latest employee record.'); return; }
    const result = await updateEmployee({
      expectedVersion: editVersion,
      legalFirstName: firstName.trim() || undefined,
      legalSurname: surname.trim() || undefined,
      taxCode: taxCode.trim() || null,
      niCategory: niCategory.trim().toUpperCase() || null,
    });
    if (result) {
      setEditMode(false);
    } else if (saveError?.code === 'CONFLICT_VERSION') {
      Alert.alert('Update Conflict', 'This record was updated elsewhere. Reload and try again.', [
        { text: 'Reload', onPress: () => { setEditMode(false); void load(); } },
      ]);
    }
  }, [employee, editVersion, firstName, surname, taxCode, niCategory, updateEmployee, saveError, load]);

  const onAddTerms = useCallback(async () => {
    if (!effectiveFrom.trim()) {
      Alert.alert('Required', 'Effective from date is required (YYYY-MM-DD).');
      return;
    }
    const result = await addPayTerms({
      payBasis,
      hourlyRate: payBasis === 'hourly' ? (hourlyRate.trim() || undefined) : undefined,
      fixedPeriodGross: payBasis === 'fixed_period' ? (fixedGross.trim() || undefined) : undefined,
      payFrequency: payFreq,
      effectiveFrom: effectiveFrom.trim(),
    });
    if (result) {
      setAddTermsMode(false);
      setHourlyRate('');
      setFixedGross('');
      setEffectiveFrom('');
    }
  }, [payBasis, hourlyRate, fixedGross, payFreq, effectiveFrom, addPayTerms]);

  if (loading && !employee) {
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

  if (!employee) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Identity card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{employee.legalFirstName} {employee.legalSurname}</Text>
            {employee.employeeReference ? <Text style={styles.cardSub}>Ref: {employee.employeeReference}</Text> : null}
          </View>
          <Text style={[styles.statusBadge, employee.employeeStatus === 'active' ? styles.statusActive : styles.statusInactive]}>
            {employee.employeeStatus}
          </Text>
        </View>
        <Row label="Start Date" value={employee.employmentStartDate} />
        {employee.isDirector ? <Text style={styles.directorTag}>Director</Text> : null}
        {employee.dateOfBirth ? <Row label="Date of Birth" value={employee.dateOfBirth} /> : null}
        {employee.ninoMasked != null ? <Row label="NINO" value={employee.ninoMasked ?? 'Not supplied'} /> : null}
      </View>

      {/* Tax details */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Tax Details</Text>
        <Row label="Tax Code" value={employee.taxCode ?? 'Not supplied'} />
        <Row label="NI Category" value={employee.niCategory ?? 'Not supplied'} />
        {employee.taxCodeBasis ? <Row label="Basis" value={employee.taxCodeBasis.replace(/_/g, ' ')} /> : null}
        <Text style={styles.disclaimer}>
          Tax code and NI category are as supplied. No defaults are applied by this system.
        </Text>
      </View>

      {/* Edit mode */}
      {editMode ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Edit Employee</Text>
          <LabelInput label="First Name" value={firstName} onChangeText={setFirstName} />
          <LabelInput label="Surname" value={surname} onChangeText={setSurname} />
          <LabelInput label="Tax Code" value={taxCode} onChangeText={setTaxCode} placeholder="e.g. 1257L" />
          <LabelInput label="NI Category (1 letter)" value={niCategory} onChangeText={setNiCategory} placeholder="e.g. A" autoCapitalize="characters" />
          {saveError && !saveError.fieldErrors ? <Text style={styles.errorText}>{saveError.error}</Text> : null}
          <View style={styles.rowActions}>
            <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={onSave} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.buttonText}>Save</Text>}
            </Pressable>
            <Pressable style={styles.buttonSecondary} onPress={() => setEditMode(false)}>
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.outlineButton} onPress={() => { setFirstName(employee.legalFirstName); setSurname(employee.legalSurname); setTaxCode(employee.taxCode ?? ''); setNiCategory(employee.niCategory ?? ''); setEditVersion(employee.version); setEditMode(true); }}>
          <Text style={styles.outlineButtonText}>Edit Details</Text>
        </Pressable>
      )}

      {/* Pay terms */}
      <EmployeeTaxSetupPanel key={`${employeeId}:${employee.version}`} companyId={companyId} employeeId={employeeId} onSaved={() => { void load(); }} />
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>Pay Terms</Text>
          {!addTermsMode ? (
            <Pressable style={styles.chipButton} onPress={() => setAddTermsMode(true)}>
              <Text style={styles.chipButtonText}>+ Add</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Current pay terms */}
        {employee.currentPayTerms ? (
          <View style={styles.payTermRow}>
            <Row label="Basis" value={employee.currentPayTerms.payBasis.replace(/_/g, ' ')} />
            {employee.currentPayTerms.hourlyRate ? <Row label="Hourly Rate" value={`£${employee.currentPayTerms.hourlyRate}`} /> : null}
            {employee.currentPayTerms.fixedPeriodGross ? <Row label="Fixed Gross" value={`£${employee.currentPayTerms.fixedPeriodGross}`} /> : null}
            <Row label="Frequency" value={employee.currentPayTerms.payFrequency.replace(/_/g, ' ')} />
            <Row label="From" value={employee.currentPayTerms.effectiveFrom} />
          </View>
        ) : (
          <Text style={styles.muteText}>No active pay terms.</Text>
        )}

        {/* All pay terms history */}
        {payTerms && payTerms.length > 1 ? (
          <Text style={styles.hintText}>+{payTerms.length - 1} historical record(s)</Text>
        ) : null}

        {/* Add pay terms form */}
        {addTermsMode ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Text style={styles.sectionLabel}>New Pay Terms</Text>
            <View style={styles.segmented}>
              {(['hourly', 'fixed_period'] as PayBasis[]).map((b) => (
                <Pressable key={b} style={[styles.segment, payBasis === b && styles.segmentActive]} onPress={() => setPayBasis(b)}>
                  <Text style={[styles.segmentText, payBasis === b && styles.segmentActiveText]}>{b === 'hourly' ? 'Hourly' : 'Fixed'}</Text>
                </Pressable>
              ))}
            </View>
            {payBasis === 'hourly' ? (
              <LabelInput label="Hourly Rate (£)" value={hourlyRate} onChangeText={setHourlyRate} placeholder="e.g. 12.50" keyboardType="decimal-pad" />
            ) : (
              <LabelInput label="Fixed Gross per Period (£)" value={fixedGross} onChangeText={setFixedGross} placeholder="e.g. 2000.00" keyboardType="decimal-pad" />
            )}
            <View style={styles.segmented}>
              {(['weekly', 'fortnightly', 'four_weekly', 'monthly'] as PayFrequency[]).map((f) => (
                <Pressable key={f} style={[styles.segment, payFreq === f && styles.segmentActive]} onPress={() => setPayFreq(f)}>
                  <Text style={[styles.segmentText, payFreq === f && styles.segmentActiveText]}>{f.replace(/_/g, ' ')}</Text>
                </Pressable>
              ))}
            </View>
            <LabelInput label="Effective From (YYYY-MM-DD) *" value={effectiveFrom} onChangeText={setEffectiveFrom} placeholder="2026-04-06" />
            {saveError && !saveError.fieldErrors ? <Text style={styles.errorText}>{saveError.error}</Text> : null}
            <View style={styles.rowActions}>
              <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={onAddTerms} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.buttonText}>Add Pay Terms</Text>}
              </Pressable>
              <Pressable style={styles.buttonSecondary} onPress={() => setAddTermsMode(false)}>
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function LabelInput({ label, value, onChangeText, placeholder, autoCapitalize, keyboardType }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cardSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  sectionLabel: { color: colors.subtle, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  rowActions: { flexDirection: 'row', gap: 8 },
  statusBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', textTransform: 'capitalize' },
  statusActive: { backgroundColor: colors.successBg, color: colors.success },
  statusInactive: { backgroundColor: colors.dangerBg, color: colors.danger },
  directorTag: { color: colors.warning, fontSize: 12, fontWeight: '800' },
  disclaimer: { color: colors.subtle, fontSize: 11, lineHeight: 16, marginTop: 4 },
  button: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.accentText, fontSize: 14, fontWeight: '900' },
  buttonSecondary: { flex: 1, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  buttonSecondaryText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  outlineButton: { borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  outlineButtonText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  chipButton: { backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  chipButtonText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  muteText: { color: colors.muted, fontSize: 13 },
  hintText: { color: colors.subtle, fontSize: 12 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  fieldGroup: { gap: 4 },
  fieldLabel: { color: colors.subtle, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 11 },
  payTermRow: { gap: 4, paddingTop: 4 },
  segmented: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  segment: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg },
  segmentActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  segmentActiveText: { color: colors.accentText },
});
