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
import { useFocusEffect, useRouter } from 'expo-router';
import { useTaxCompanies } from '@/hooks/useTaxCompanies';
import { useTaxPayrollOverview } from '@/hooks/useTaxPayrollOverview';
import { colors } from '@/components/theme';
import { CompanyPayrollAccessPanel } from '@/components/payroll/CompanyPayrollAccessPanel';
import type { CompanyProfileDto, TaxPayrollOverviewDto } from '@/types/tax-payroll';

// Prefilled defaults for GORBALS TYRES LTD
const DEFAULTS = {
  companyNumber: 'SC784534',
  legalName: 'GORBALS TYRES LTD',
  registeredAddressLine1: 'Unit 3, 10 Gateside Street',
  registeredAddressLine2: '',
  registeredCity: 'Glasgow',
  registeredCountry: 'Scotland',
  registeredPostcode: 'G31 1PB',
  tradingName: '',
  businessEmail: '',
  businessPhone: '',
};

export default function TaxPayrollIndex() {
  const router = useRouter();
  const { companies, canCreate, loading, error, creating, createError, load, createCompany } =
    useTaxCompanies();

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const firstCompany = companies?.[0] ?? null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

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

  // Company exists — show overview inline, with navigation to sub-screens
  if (firstCompany) {
    return (
      <CompanyOverviewView
        company={firstCompany}
        onSettings={() => router.push({ pathname: '/tax-payroll/settings', params: { companyId: firstCompany.id } })}
        onActivity={() => router.push({ pathname: '/tax-payroll/activity', params: { companyId: firstCompany.id } })}
      />
    );
  }

  // No company yet — show create form
  if (canCreate) {
    return (
      <CreateCompanyForm
        creating={creating}
        createError={createError}
        onCreate={async (fields) => {
          const result = await createCompany(fields);
          if (!result) return;
          Alert.alert('Company Profile Saved', `${result.legalName} has been saved in Assisted Chat.`);
        }}
      />
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.muteText}>No company access configured.</Text>
    </View>
  );
}

// ─── Overview panel ───────────────────────────────────────────────────────────

function CompanyOverviewView({
  company,
  onSettings,
  onActivity,
}: {
  company: CompanyProfileDto;
  onSettings: () => void;
  onActivity: () => void;
}) {
  const router = useRouter();
  const { overview, loading, error, load } = useTaxPayrollOverview(company.id);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{company.legalName}</Text>
        <Text style={styles.cardSub}>Company No. {company.companyNumber}</Text>
        {company.registeredAddressLine1 ? (
          <Text style={styles.cardBody}>
            {[
              company.registeredAddressLine1,
              company.registeredAddressLine2,
              company.registeredCity,
              company.registeredPostcode,
            ]
              .filter(Boolean)
              .join(', ')}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      ) : error ? (
        <View style={styles.actions}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => { void load(); }}>
            <Text style={styles.buttonSecondaryText}>Retry Overview</Text>
          </Pressable>
        </View>
      ) : overview ? (
        <OverviewStatusPanel overview={overview} />
      ) : null}

      <View style={styles.actions}>
        <Text style={styles.cardBody}>Your company profile is saved in Assisted Chat. Tax registration statuses are internal records; live HMRC submissions are not enabled.</Text>
        {overview?.payrollSetup?.state === 'not_activated' ? <View style={styles.card}>
          <Text style={styles.cardTitle}>Payroll setup required</Text>
          <Text style={styles.cardBody}>Saving the company profile is complete. Payroll has not been activated, so monthly PAYE and NI have not been calculated.</Text>
          {overview.payrollSetup.canActivate ? <>
            <Text style={styles.cardBody}>Start by choosing the pay schedule. Then add employees, complete their tax details and opening balances, enter earnings, and review and finalise the pay run.</Text>
            <Pressable style={styles.button} onPress={() => router.push({ pathname: '/tax-payroll/payroll/settings', params: { companyId: company.id } })}>
              <Text style={styles.buttonText}>Set up payroll schedule</Text>
            </Pressable>
          </> : <Text style={styles.cardBody}>Ask the company founder to activate payroll. Your company profile remains saved.</Text>}
        </View> : overview?.payrollSetup?.state === 'restricted' ? <Text style={styles.cardBody}>Payroll access has not been granted to this account. Ask the company founder to give you payroll access.</Text> : null}
        <Text style={styles.cardBody}>For monthly PAYE and NI: activate payroll, complete each employee’s tax setup, add earnings to a pay run, then review and finalise it. Missing data is shown as not calculated.</Text>
        {overview?.payrollSetup?.state !== 'restricted' ? <Pressable style={overview?.payrollSetup?.state === 'not_activated' ? [styles.button, styles.buttonSecondary] : styles.button} onPress={() => router.push({ pathname: '/tax-payroll/monthly-tax', params: { companyId: company.id } })}>
          <Text style={overview?.payrollSetup?.state === 'not_activated' ? styles.buttonSecondaryText : styles.buttonText}>{overview?.payrollSetup?.state === 'not_activated' ? 'View monthly tax · Not calculated yet' : 'Monthly PAYE & NI · Due, Paid & Remaining'}</Text>
        </Pressable> : null}
        <Pressable style={styles.button} onPress={onSettings}>
          <Text style={styles.buttonText}>Edit Company Details</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonSecondary]}
          onPress={() =>
            router.push({
              pathname: '/tax-payroll/employees-payroll',
              params: { companyId: company.id },
            })
          }
        >
          <Text style={styles.buttonSecondaryText}>Employees & Payroll</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onActivity}>
          <Text style={styles.buttonSecondaryText}>View Activity Log</Text>
        </Pressable>
      </View>
      <CompanyPayrollAccessPanel companyId={company.id} />
    </ScrollView>
  );
}

function OverviewStatusPanel({ overview }: { overview: TaxPayrollOverviewDto }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Recorded Tax Registration</Text>
      <Text style={styles.cardBody}>These statuses come from details recorded in Assisted Chat, not a live HMRC check. “Not recorded” means nobody has entered a status; it does not mean the company is unregistered. Saving a company profile does not register it with HMRC.</Text>
      {overview.registrationStatuses.map((row) => (
        <View key={row.taxService} style={styles.statusRow}>
          <Text style={styles.statusLabel}>
            {row.taxService === 'vat' ? 'VAT' : row.taxService === 'paye' ? 'PAYE' : 'Corporation Tax'}
          </Text>
          <Text
            style={[
              styles.statusBadge,
              row.status === 'registered'
                ? styles.statusRegistered
                : row.status === 'not_registered'
                  ? styles.statusNotRegistered
                  : styles.statusUnknown,
            ]}
          >
            {row.status === 'unknown' ? 'Not recorded' : row.status === 'registered' ? 'Recorded as registered' : 'Recorded as not registered'}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

interface CreateFields {
  companyNumber: string;
  legalName: string;
  registeredAddressLine1: string;
  registeredAddressLine2: string;
  registeredCity: string;
  registeredCountry: string;
  registeredPostcode: string;
  tradingName: string;
  businessEmail: string;
  businessPhone: string;
}

function CreateCompanyForm({
  creating,
  createError,
  onCreate,
}: {
  creating: boolean;
  createError: { error: string; fieldErrors?: Record<string, string> } | null;
  onCreate: (fields: CreateFields) => void;
}) {
  const [fields, setFields] = useState<CreateFields>(DEFAULTS);

  const set = useCallback((key: keyof CreateFields) => (val: string) => {
    setFields((prev) => ({ ...prev, [key]: val }));
  }, []);

  const fieldError = (key: string) => createError?.fieldErrors?.[key];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Create Company Profile</Text>
      <Text style={styles.subheading}>
        Save your company details in Assisted Chat to start setting up employees and payroll. This does not register your company or submit anything to HMRC.
      </Text>

      <Field label="Company Number" value={fields.companyNumber} onChangeText={set('companyNumber')} error={fieldError('companyNumber')} editable={false} />
      <Field label="Legal Name" value={fields.legalName} onChangeText={set('legalName')} error={fieldError('legalName')} />
      <Field label="Address Line 1" value={fields.registeredAddressLine1} onChangeText={set('registeredAddressLine1')} error={fieldError('registeredAddressLine1')} />
      <Field label="Address Line 2" value={fields.registeredAddressLine2} onChangeText={set('registeredAddressLine2')} error={fieldError('registeredAddressLine2')} />
      <Field label="City" value={fields.registeredCity} onChangeText={set('registeredCity')} error={fieldError('registeredCity')} />
      <Field label="Country" value={fields.registeredCountry} onChangeText={set('registeredCountry')} error={fieldError('registeredCountry')} />
      <Field label="Postcode" value={fields.registeredPostcode} onChangeText={set('registeredPostcode')} error={fieldError('registeredPostcode')} autoCapitalize="characters" />
      <Field label="Trading Name (optional)" value={fields.tradingName} onChangeText={set('tradingName')} error={fieldError('tradingName')} />
      <Field label="Business Email (optional)" value={fields.businessEmail} onChangeText={set('businessEmail')} error={fieldError('businessEmail')} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Business Phone (optional)" value={fields.businessPhone} onChangeText={set('businessPhone')} error={fieldError('businessPhone')} keyboardType="phone-pad" />

      {createError && !createError.fieldErrors ? (
        <Text style={styles.errorText}>{createError.error}</Text>
      ) : null}

      <Pressable
        style={[styles.button, creating && styles.buttonDisabled]}
        onPress={() => !creating && onCreate(fields)}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.buttonText}>Create Company</Text>
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
  editable = true,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (val: string) => void;
  error?: string;
  editable?: boolean;
  keyboardType?: 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'characters';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={colors.subtle}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  heading: { color: colors.text, fontSize: 22, fontWeight: '900' },
  subheading: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cardSub: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  cardBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  sectionLabel: { color: colors.subtle, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  statusLabel: { color: colors.muted, fontSize: 14 },
  statusBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', textTransform: 'capitalize' },
  statusRegistered: { backgroundColor: colors.successBg, color: colors.success },
  statusNotRegistered: { backgroundColor: colors.dangerBg, color: colors.danger },
  statusUnknown: { backgroundColor: colors.warningBg, color: colors.warning },
  spinner: { marginVertical: 12 },
  actions: { gap: 10 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.accentText, fontSize: 15, fontWeight: '900' },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  buttonSecondaryText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  fieldGroup: { gap: 5 },
  fieldLabel: { color: colors.subtle, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
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
  inputDisabled: { color: colors.disabledText, backgroundColor: colors.inputDisabledBg },
  inputError: { borderColor: colors.dangerBorder },
  fieldError: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  muteText: { color: colors.muted, fontSize: 14 },
});
