import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/components/theme';
import { useTaxApiScope } from '@/hooks/useTaxApiScope';
import { isTaxDate, londonTaxToday, parseTaxPounds, taxRequestMessage } from '@/lib/tax-input';
import { parseEmployeeTaxSetup, assertEmployeeTaxSetupSaved, editablePayrollSetupAmount, type EmployeeTaxSetup as Setup } from '@/lib/payroll-panel-response';

const opening = [
  ['openingYtdGrossPay', 'Gross pay with this employer'], ['openingYtdTaxPaid', 'PAYE tax paid with this employer'],
  ['openingYtdNiEmployee', 'Employee NI'], ['openingYtdNiEmployer', 'Employer NI'], ['openingYtdStudentLoanDeductions', 'Student loan deductions'],
  ['openingYtdPensionEmployee', 'Employee pension'], ['openingYtdPensionEmployer', 'Employer pension'],
] as const;
const text = (value: unknown) => typeof value === 'string' ? value : '';
function currentYear() { const date = londonTaxToday(); const year = Number(date.slice(0, 4)) - (date.slice(5) < '04-06' ? 1 : 0); return `${year}-${String(year + 1).slice(2)}`; }

export function EmployeeTaxSetupPanel({ companyId, employeeId, onSaved }: { companyId: string; employeeId: string; onSaved: () => void }) {
  const { scope, isCurrent, call } = useTaxApiScope(`employee-tax:${companyId}:${employeeId}`);
  const [loaded, setLoaded] = useState<{ scope: object; setup: Setup } | null>(null);
  const [progress, setProgress] = useState({ scope, loading: true, busy: false });
  const [feedback, setFeedback] = useState<{ scope: object; error: string | null; notice: string | null }>({ scope, error: null, notice: null });
  const lock = useRef<object | null>(null); const read = useRef<object | null>(null);
  const setLoading = useCallback((loading: boolean) => setProgress((old) => ({ scope, loading, busy: old.scope === scope && old.busy })), [scope]);
  const setBusy = useCallback((busy: boolean) => setProgress((old) => ({ scope, busy, loading: old.scope === scope ? old.loading : true })), [scope]);
  const setError = useCallback((error: string | null) => setFeedback((old) => ({ scope, error, notice: old.scope === scope ? old.notice : null })), [scope]);
  const setNotice = useCallback((notice: string | null) => setFeedback((old) => ({ scope, notice, error: old.scope === scope ? old.error : null })), [scope]);
  const loading = progress.scope === scope ? progress.loading : true; const busy = progress.scope === scope && progress.busy;
  const error = feedback.scope === scope ? feedback.error : null; const notice = feedback.scope === scope ? feedback.notice : null;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [source, setSource] = useState(''); const [basis, setBasis] = useState(''); const [codeSource, setCodeSource] = useState('');
  const [plans, setPlans] = useState<string[]>([]); const [postgraduate, setPostgraduate] = useState(false);
  const [loansConfirmed, setLoansConfirmed] = useState(false); const [pensionConfirmed, setPensionConfirmed] = useState(false); const [zeroConfirmed, setZeroConfirmed] = useState(false);
  const [directorConfirmed, setDirectorConfirmed] = useState(false);
  const path = `/api/admin/tax/companies/${companyId}/payroll/employees/${employeeId}/tax-setup`;
  const apply = useCallback((setup: Setup) => {
    setLoaded({ scope, setup });
    setFields({ ...Object.fromEntries(['taxCode', 'niCategory', 'taxCodeEffectiveDate', ...opening.map(([key]) => key), 'p45TotalPayPrevEmployment', 'p45TotalTaxPrevEmployment'].map((key) => [key,
      key.startsWith('openingYtd') || key.startsWith('p45Total') ? editablePayrollSetupAmount(setup[key]) : text(setup[key])])),
      openingYtdTaxYear: text(setup.openingYtdTaxYear) || currentYear(), openingYtdEffectiveDate: text(setup.openingYtdEffectiveDate) });
    setBasis(text(setup.taxCodeBasis)); setSource(text(setup.sourceType)); setCodeSource(text(setup.taxCodeSource));
    setPlans(Array.isArray(setup.studentLoanPlans) ? setup.studentLoanPlans.filter((plan): plan is string => typeof plan === 'string' && ['1', '2', '4', '5'].includes(plan)) : []);
    setPostgraduate(setup.postgraduateLoan === true);
    // Every save confirms the current facts rather than silently carrying an old declaration.
    setLoansConfirmed(false); setPensionConfirmed(false); setZeroConfirmed(false); setDirectorConfirmed(false);
  }, [scope]);
  const load = useCallback(async () => {
    if (!isCurrent() || lock.current) return;
    const request = {}; read.current = request; setLoaded(null); setLoading(true); setError(null); setNotice(null);
    try {
      const setup = await call('GET', path, undefined, (value) => parseEmployeeTaxSetup(value, companyId, employeeId));
      if (isCurrent() && read.current === request) apply(setup);
    } catch (cause) { if (isCurrent() && read.current === request) setError(taxRequestMessage(cause)); }
    finally { if (read.current === request) { read.current = null; if (isCurrent()) setLoading(false); } }
  }, [isCurrent, call, path, companyId, employeeId, apply, setLoading, setError, setNotice]);
  useEffect(() => { lock.current = null; read.current = null; setBusy(false); setLoaded(null); void load(); }, [load, setBusy]);
  const setup = loaded?.scope === scope ? loaded.setup : null;
  const save = async () => {
    if (!setup || lock.current || read.current || !isCurrent()) return;
    const operation = {}; lock.current = operation; setBusy(true); setError(null); setNotice(null);
    try {
      if (!loansConfirmed || !pensionConfirmed) throw new Error('Confirm student loan status and the pension statement before calculating.');
      if (setup.isDirector && !directorConfirmed) throw new Error('Confirm this employee was a director for the full tax year before using the annual NI calculation.');
      if (!['first_payroll_this_tax_year', 'current_employment_opening'].includes(source)) throw new Error('Choose whether this is the first payroll this tax year or an imported opening balance.');
      if (source === 'first_payroll_this_tax_year' && !zeroConfirmed) throw new Error('Confirm that there were no earlier payments with this employer in this tax year.');
      if (!fields.taxCode?.trim() || !fields.niCategory?.trim() || !basis || !codeSource) throw new Error('Supply the employee tax code, basis, source and NI category.');
      if (!isTaxDate(fields.taxCodeEffectiveDate) || !isTaxDate(fields.openingYtdEffectiveDate)) throw new Error('Enter the tax code and opening balance effective dates.');
      const balances = Object.fromEntries(opening.map(([key]) => {
        const amount = source === 'first_payroll_this_tax_year' ? '0.00' : fields[key] ?? '';
        parseTaxPounds(amount);
        return [key, amount];
      }));
      const body = { expectedVersion: setup.expectedVersion, taxCode: fields.taxCode.trim().toUpperCase(), taxCodeBasis: basis,
        taxCodeSource: codeSource, taxCodeEffectiveDate: fields.taxCodeEffectiveDate, niCategory: fields.niCategory.trim().toUpperCase(),
        niMethod: setup.isDirector ? 'director_annual' : 'periodic', directorFullTaxYearConfirmed: setup.isDirector ? directorConfirmed : false,
        sourceType: source, openingYtdTaxYear: fields.openingYtdTaxYear,
        openingYtdEffectiveDate: fields.openingYtdEffectiveDate, ...balances,
        p45TotalPayPrevEmployment: fields.p45TotalPayPrevEmployment?.trim() || null, p45TotalTaxPrevEmployment: fields.p45TotalTaxPrevEmployment?.trim() || null,
        studentLoanPlans: plans, postgraduateLoan: postgraduate, studentLoanUnknown: false, pensionHandling: 'none_confirmed' };
      const saved = await call('PATCH', path, body, (value) => {
        const confirmed = parseEmployeeTaxSetup(value, companyId, employeeId);
        assertEmployeeTaxSetupSaved(confirmed, setup, body);
        return confirmed;
      });
      if (!isCurrent() || lock.current !== operation) return;
      apply(saved); setNotice('Tax setup saved. Recalculate and review any affected draft payroll before finalising.'); onSaved();
    } catch (cause) { if (isCurrent() && lock.current === operation) setError(taxRequestMessage(cause)); }
    finally { if (lock.current === operation) { lock.current = null; if (isCurrent()) setBusy(false); } }
  };
  const set = (key: string) => (value: string) => setFields((previous) => ({ ...previous, [key]: value }));
  return <View style={styles.card}>
    <Text style={styles.title}>Payroll tax setup & opening balances</Text>
    <Text style={styles.hint}>Use the employee’s supplied tax information. Missing data blocks the calculation instead of assuming a tax code, loan status or zero history.</Text>
    {loading ? <ActivityIndicator color={colors.accent} /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <Button label="Reload tax setup" disabled={busy || loading} onPress={() => { void load(); }} />
    {setup ? <>
      <Input disabled={busy || loading} label="Tax code" value={fields.taxCode ?? ''} set={set('taxCode')} />
      <Choices disabled={busy || loading} label="Tax code basis" values={['cumulative', 'week1_month1']} selected={basis} set={setBasis} />
      <Choices disabled={busy || loading} label="Tax code source" values={['p45', 'starter_checklist', 'hmrc_notification']} selected={codeSource} set={setCodeSource} />
      <Input disabled={busy || loading} label="Tax code effective date (YYYY-MM-DD)" value={fields.taxCodeEffectiveDate ?? ''} set={set('taxCodeEffectiveDate')} />
      <Input disabled={busy || loading} label="NI category supplied for this employee" value={fields.niCategory ?? ''} set={set('niCategory')} />
      <Text style={styles.hint}>NI method: {setup.isDirector ? 'Director annual calculation (full tax-year directors only)' : 'Regular earnings-period calculation'}.</Text>
      {setup.isDirector ? <Check disabled={busy || loading} label="I confirm this employee was a director for the full tax year. Mid-year appointments require a separate NI calculation." checked={directorConfirmed} set={setDirectorConfirmed} /> : null}
      <Choices disabled={busy || loading} label="Opening payroll history" values={['first_payroll_this_tax_year', 'current_employment_opening']} selected={source} set={setSource} />
      <Input disabled={busy || loading} label="Tax year (e.g. 2026-27)" value={fields.openingYtdTaxYear ?? ''} set={set('openingYtdTaxYear')} />
      <Input disabled={busy || loading} label="Opening balance effective date (YYYY-MM-DD)" value={fields.openingYtdEffectiveDate ?? ''} set={set('openingYtdEffectiveDate')} />
      {source === 'first_payroll_this_tax_year' ? <Check disabled={busy || loading} label="I confirm no earlier payroll payments with this employer this tax year; all current-employer opening balances are zero." checked={zeroConfirmed} set={setZeroConfirmed} />
        : source === 'current_employment_opening' ? opening.map(([key, label]) => <Input disabled={busy || loading} key={key} label={`${label} to date (£)`} value={fields[key] ?? ''} set={set(key)} numeric />) : null}
      <Input disabled={busy || loading} label="P45 prior-employer pay (£, optional pair)" value={fields.p45TotalPayPrevEmployment ?? ''} set={set('p45TotalPayPrevEmployment')} numeric />
      <Input disabled={busy || loading} label="P45 prior-employer tax (£, optional pair)" value={fields.p45TotalTaxPrevEmployment ?? ''} set={set('p45TotalTaxPrevEmployment')} numeric />
      <Text style={styles.title}>Student loan plans</Text>
      {['1', '2', '4', '5'].map((plan) => <Check disabled={busy || loading} key={plan} label={`Plan ${plan}`} checked={plans.includes(plan)} set={(value) => setPlans((current) => value ? [...current, plan] : current.filter((item) => item !== plan))} />)}
      <Check disabled={busy || loading} label="Postgraduate loan" checked={postgraduate} set={setPostgraduate} />
      <Check disabled={busy || loading} label="I have checked the employee’s loan status. Unselected plans do not apply." checked={loansConfirmed} set={setLoansConfirmed} />
      <Check disabled={busy || loading} label="I confirm no pension deductions or contributions apply to this setup. Pension payroll needs separate supported configuration." checked={pensionConfirmed} set={setPensionConfirmed} />
      <Button label={busy ? 'Saving…' : 'Save confirmed tax setup'} disabled={busy || loading} onPress={() => { void save(); }} />
    </> : null}
  </View>;
}
function Input({ label, value, set, numeric = false, disabled }: { label: string; value: string; set: (value: string) => void; numeric?: boolean; disabled: boolean }) {
  return <View style={styles.field}><Text style={styles.hint}>{label}</Text><TextInput editable={!disabled} accessibilityLabel={label} value={value} onChangeText={set} style={styles.input} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize="none" /></View>;
}
function Choices({ label, values, selected, set, disabled }: { label: string; values: string[]; selected: string; set: (value: string) => void; disabled: boolean }) {
  return <View style={styles.field}><Text style={styles.hint}>{label}</Text><View style={styles.choices}>{values.map((value) => <Pressable disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected: value === selected }} key={value} onPress={() => set(value)} style={[styles.choice, value === selected && styles.selected]}><Text style={styles.text}>{value.replace(/_/g, ' ')}</Text></Pressable>)}</View></View>;
}
function Check({ label, checked, set, disabled }: { label: string; checked: boolean; set: (value: boolean) => void; disabled: boolean }) {
  return <Pressable disabled={disabled} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => set(!checked)}><Text style={styles.text}>{checked ? '☑' : '☐'} {label}</Text></Pressable>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} style={[styles.choice, disabled && { opacity: 0.45 }]} onPress={onPress}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' }, text: { color: colors.text, fontSize: 13, lineHeight: 20 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  input: { borderColor: colors.border, borderWidth: 1, padding: 12, borderRadius: 10, backgroundColor: colors.inputBg, color: colors.text }, field: { gap: 5 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44, justifyContent: 'center' }, selected: { borderColor: colors.accent },
  check: { minHeight: 44, justifyContent: 'center' }, buttonText: { color: colors.accent, fontWeight: '700' }, error: { color: colors.danger, lineHeight: 20 }, notice: { color: colors.success, lineHeight: 20 },
});
