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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCompanyTaxSettings } from '@/hooks/useCompanyTaxSettings';
import { colors } from '@/components/theme';
import type { CompanyProfileDto, UpdateCompanyRequest } from '@/types/tax-payroll';

function editableCompanyDetails(company: CompanyProfileDto): Partial<UpdateCompanyRequest> {
  return {
    legalName: company.legalName,
    registeredAddressLine1: company.registeredAddressLine1,
    registeredAddressLine2: company.registeredAddressLine2 ?? '',
    registeredCity: company.registeredCity ?? '',
    registeredCountry: company.registeredCountry ?? '',
    registeredPostcode: company.registeredPostcode ?? '',
    tradingName: company.tradingName ?? '',
    tradingAddress: company.tradingAddress ?? '',
    businessEmail: company.businessEmail ?? '',
    businessPhone: company.businessPhone ?? '',
  };
}

export default function CompanyTaxSettingsScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const router = useRouter();
  const { company, loading, error, saving, saveError, load, updateCompany } =
    useCompanyTaxSettings(companyId ?? '');

  useEffect(() => {
    if (companyId) void load();
  }, [companyId, load]);

  const [draftState, setDraftState] = useState<{
    companyId: string;
    value: Partial<UpdateCompanyRequest>;
  } | null>(null);
  // Derive the initial form from the loaded company. Once editing starts,
  // retain that snapshot until an explicit reload, scoped to this company.
  const draft = draftState?.companyId === companyId
    ? draftState.value
    : company ? editableCompanyDetails(company) : null;

  const set = useCallback(
    (key: keyof UpdateCompanyRequest) => (val: string) => {
      setDraftState((prev) => ({
        companyId,
        value: {
          ...(prev?.companyId === companyId ? prev.value : company ? editableCompanyDetails(company) : {}),
          [key]: val,
        },
      }));
    },
    [company, companyId],
  );

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (loading || !draft) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const fieldError = (key: string) => saveError?.fieldErrors?.[key];

  const handleSave = async () => {
    if (!draft) return;
    const result = await updateCompany(draft);
    if (result) {
      Alert.alert('Saved', 'Company details updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else if (saveError?.code === 'CONFLICT_VERSION') {
      Alert.alert(
        'Update Conflict',
        'Someone else updated this company. Please reload and try again.',
        [
          {
            text: 'Reload',
            onPress: () => {
              setDraftState(null);
              void load();
            },
          },
        ],
      );
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.note}>Company number cannot be changed after creation.</Text>

      <View style={styles.readonlyGroup}>
        <Text style={styles.fieldLabel}>Company Number</Text>
        <Text style={styles.readonlyValue}>{company?.companyNumber}</Text>
      </View>

      <Field
        label="Legal Name"
        value={String(draft.legalName ?? '')}
        onChangeText={set('legalName')}
        error={fieldError('legalName')}
      />
      <Field
        label="Address Line 1"
        value={String(draft.registeredAddressLine1 ?? '')}
        onChangeText={set('registeredAddressLine1')}
        error={fieldError('registeredAddressLine1')}
      />
      <Field
        label="Address Line 2"
        value={String(draft.registeredAddressLine2 ?? '')}
        onChangeText={set('registeredAddressLine2')}
        error={fieldError('registeredAddressLine2')}
      />
      <Field
        label="City"
        value={String(draft.registeredCity ?? '')}
        onChangeText={set('registeredCity')}
        error={fieldError('registeredCity')}
      />
      <Field
        label="Country"
        value={String(draft.registeredCountry ?? '')}
        onChangeText={set('registeredCountry')}
        error={fieldError('registeredCountry')}
      />
      <Field
        label="Postcode"
        value={String(draft.registeredPostcode ?? '')}
        onChangeText={set('registeredPostcode')}
        error={fieldError('registeredPostcode')}
        autoCapitalize="characters"
      />
      <Field
        label="Trading Name (optional)"
        value={String(draft.tradingName ?? '')}
        onChangeText={set('tradingName')}
        error={fieldError('tradingName')}
      />
      <Field
        label="Trading Address (optional)"
        value={String(draft.tradingAddress ?? '')}
        onChangeText={set('tradingAddress')}
        error={fieldError('tradingAddress')}
      />
      <Field
        label="Business Email (optional)"
        value={String(draft.businessEmail ?? '')}
        onChangeText={set('businessEmail')}
        error={fieldError('businessEmail')}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Field
        label="Business Phone (optional)"
        value={String(draft.businessPhone ?? '')}
        onChangeText={set('businessPhone')}
        error={fieldError('businessPhone')}
        keyboardType="phone-pad"
      />

      {saveError && !saveError.fieldErrors && saveError.code !== 'CONFLICT_VERSION' ? (
        <Text style={styles.errorText}>{saveError.error}</Text>
      ) : null}

      <Pressable
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.buttonText}>Save Changes</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  error,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (val: string) => void;
  error?: string;
  keyboardType?: 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'characters';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={colors.subtle}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  note: { color: colors.subtle, fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  readonlyGroup: { gap: 5 },
  readonlyValue: {
    color: colors.disabledText,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.inputDisabledBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldGroup: { gap: 5 },
  fieldLabel: {
    color: colors.subtle,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputError: { borderColor: colors.dangerBorder },
  fieldError: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.accentText, fontSize: 15, fontWeight: '900' },
});
