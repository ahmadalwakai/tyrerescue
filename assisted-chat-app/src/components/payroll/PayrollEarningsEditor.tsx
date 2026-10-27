import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/components/theme';
import { useTaxApiScope } from '@/hooks/useTaxApiScope';
import { parsePayrollEmployees } from '@/lib/payroll-workspace-response';
import { parseTaxPounds, taxRequestMessage } from '@/lib/tax-input';
import type { EmployeeSummaryDto, PayrollRunDto, UpsertRunLinesRequest } from '@/types/tax-payroll';

type Line = UpsertRunLinesRequest['lines'][number];
export function PayrollEarningsEditor({ companyId, run, busy, save }: { companyId: string; run: PayrollRunDto; busy: boolean; save: (body: UpsertRunLinesRequest) => Promise<boolean> }) {
  const router = useRouter(); const { scope, call, isCurrent } = useTaxApiScope(`earnings:${companyId}:${run.id}`);
  const [employees, setEmployees] = useState<{ scope: object; items: EmployeeSummaryDto[] } | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(''); const [lines, setLines] = useState<Line[]>([]);
  const [type, setType] = useState<Line['lineType']>('hours_worked'); const [hours, setHours] = useState(''); const [minutes, setMinutes] = useState('');
  const [rate, setRate] = useState(''); const [amount, setAmount] = useState(''); const [description, setDescription] = useState('');
  const loadEmployees = useCallback(async () => {
    setLoading(true); setError(null);
    try { const items = await call('GET', `/api/admin/tax/companies/${companyId}/employees`, undefined, parsePayrollEmployees); if (isCurrent()) setEmployees({ scope, items }); }
    catch (cause) { if (isCurrent()) setError(taxRequestMessage(cause)); }
    finally { if (isCurrent()) setLoading(false); }
  }, [scope, call, companyId, isCurrent]);
  useEffect(() => { setSelected(''); void loadEmployees(); }, [loadEmployees]);
  useEffect(() => {
    setLines(run.lines.filter((line) => line.employeeId === selected).map(({ lineType, workedMinutes, hourlyRateOverride, fixedAmount, description, payTermsId }) => ({ lineType, workedMinutes, hourlyRateOverride, fixedAmount, description, payTermsId })));
  }, [run.id, run.version, run.lines, selected]);
  const addLine = () => {
    try {
      const hourly = type === 'hours_worked' || type === 'overtime';
      let workedMinutes: number | undefined;
      if (hourly) {
        if (!/^\d{0,5}$/.test(hours) || !/^\d{0,2}$/.test(minutes) || Number(minutes) > 59) throw new Error('Enter whole hours and minutes (0 to 59).');
        workedMinutes = Number(hours || 0) * 60 + Number(minutes || 0);
        if (!workedMinutes) throw new Error('Enter the time worked.');
        if (rate && parseTaxPounds(rate) <= 0) throw new Error('The hourly rate must be positive.');
      } else if (parseTaxPounds(amount) <= 0) throw new Error('Enter a positive gross amount.');
      setLines((current) => [...current, { lineType: type, ...(hourly ? { workedMinutes, hourlyRateOverride: rate.trim() || null } : { fixedAmount: amount.trim() }), description: description.trim() || null }]);
      setHours(''); setMinutes(''); setAmount(''); setRate(''); setDescription(''); setError(null);
    } catch (cause) { setError(taxRequestMessage(cause)); }
  };
  const items = employees?.scope === scope ? employees.items : [];
  return <View style={styles.card}>
    <Text style={styles.title}>Earnings for this pay run</Text>
    <Text style={styles.hint}>Select an employee, add their hours or gross pay, then save their lines. Hours use the pay rate effective on the payment date unless you supply an explicit rate.</Text>
    {loading ? <ActivityIndicator color={colors.accent} /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.wrap}>{items.map((employee) => <Button key={employee.id} label={`${employee.legalFirstName} ${employee.legalSurname}`} selected={selected === employee.id} disabled={busy} onPress={() => setSelected(employee.id)} />)}</View>
    {!loading && !items.length ? <Button label="Add employees first" disabled={busy} onPress={() => router.push({ pathname: '/tax-payroll/employees-payroll', params: { companyId } })} /> : null}
    {selected ? <>
      <Button label="Open selected employee’s tax setup" disabled={busy} onPress={() => router.push({ pathname: '/tax-payroll/employees/[employeeId]', params: { companyId, employeeId: selected } })} />
      {lines.map((line, index) => <View key={index} style={styles.line}><Text style={styles.text}>{line.lineType.replace(/_/g, ' ')} · {line.workedMinutes != null ? `${line.workedMinutes} minutes${line.hourlyRateOverride ? ` at £${line.hourlyRateOverride}/hr` : ''}` : `£${line.fixedAmount}`}</Text><Button label="Remove line" disabled={busy} onPress={() => setLines((current) => current.filter((_, position) => index !== position))} /></View>)}
      <View style={styles.wrap}>{(['hours_worked', 'fixed_period', 'overtime', 'bonus', 'commission'] as const).map((value) => <Button key={value} label={value.replace(/_/g, ' ')} disabled={busy} selected={type === value} onPress={() => setType(value)} />)}</View>
      {type === 'hours_worked' || type === 'overtime' ? <><Input label="Hours worked" value={hours} set={setHours} /><Input label="Additional minutes (0–59)" value={minutes} set={setMinutes} /><Input label="Hourly rate override (£, optional)" value={rate} set={setRate} /></> : <Input label="Gross amount (£)" value={amount} set={setAmount} />}
      <Input label="Description (optional)" value={description} set={setDescription} />
      <Button label="Add line to list" disabled={busy} onPress={addLine} />
      <Button label={busy ? 'Saving…' : `Save ${lines.length} line(s) for selected employee`} disabled={busy} onPress={() => { void save({ employeeId: selected, expectedVersion: run.version, lines }); }} />
      <Text style={styles.hint}>Saving replaces only this employee’s earnings in this draft. Saved changes require a fresh calculation and review.</Text>
    </> : null}
  </View>;
}
function Input({ label, value, set }: { label: string; value: string; set: (value: string) => void }) { return <View style={styles.field}><Text style={styles.hint}>{label}</Text><TextInput style={styles.input} accessibilityLabel={label} value={value} onChangeText={set} /></View>; }
function Button({ label, disabled, selected = false, onPress }: { label: string; disabled: boolean; selected?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, selected && { borderColor: colors.accent }, disabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, padding: 16, borderRadius: 14, borderColor: colors.border, borderWidth: 1, gap: 12 }, title: { color: colors.text, fontSize: 15, fontWeight: '800' }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 }, text: { color: colors.text, fontSize: 13 }, field: { gap: 5 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, button: { padding: 11, borderRadius: 10, borderColor: colors.borderStrong, borderWidth: 1, minHeight: 44, justifyContent: 'center' }, buttonText: { color: colors.accent, fontWeight: '700' }, input: { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, borderRadius: 10, color: colors.text, padding: 12 }, line: { gap: 8, paddingVertical: 8 }, error: { color: colors.danger, lineHeight: 20 } });
