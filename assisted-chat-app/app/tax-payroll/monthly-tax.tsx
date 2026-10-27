import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/components/theme';
import { useMonthlyTax } from '@/hooks/useMonthlyTax';
import { isTaxDate, londonTaxToday, parseTaxPounds, taxMoney } from '@/lib/tax-input';

export default function MonthlyTaxScreen() {
  const { companyId = '', date: requestedDate } = useLocalSearchParams<{ companyId: string; date?: string }>();
  const router = useRouter();
  const initialDate = isTaxDate(requestedDate) ? requestedDate : londonTaxToday();
  const [date, setDate] = useState(initialDate); const [selected, setSelected] = useState(initialDate);
  const monthly = useMonthlyTax(companyId, selected);
  const loadSummary = monthly.load;
  const [amount, setAmount] = useState(''); const [paidOn, setPaidOn] = useState(londonTaxToday); const [reference, setReference] = useState('');
  const [adjustment, setAdjustment] = useState(''); const [reason, setReason] = useState('');
  const [voidTarget, setVoidTarget] = useState<{ kind: 'payments' | 'adjustments'; id: string } | null>(null); const [voidReason, setVoidReason] = useState('');
  useEffect(() => { const nextDate = isTaxDate(requestedDate) ? requestedDate : londonTaxToday(); setDate(nextDate); setSelected(nextDate); }, [companyId, requestedDate]);
  useEffect(() => { setVoidTarget(null); setVoidReason(''); setAmount(''); setReference(''); setAdjustment(''); setReason(''); setPaidOn(londonTaxToday()); }, [companyId, selected, monthly.formScope]);
  useFocusEffect(useCallback(() => { void loadSummary(); }, [loadSummary]));
  const data = monthly.data;
  const setupRequired = data?.payrollSetup?.state === 'not_activated';
  const recordPayment = async () => {
    if (!data) return;
    try {
      const amountPence = parseTaxPounds(amount);
      if (amountPence <= 0 || !isTaxDate(paidOn) || !reference.trim()) throw new Error('Enter the amount, payment date and a unique bank transaction reference.');
      const input = { periodStart: data.period.start, amountPence, paidOn, reference: reference.trim() };
      if (await monthly.record('payments', { ...input, idempotencyKey: monthly.requestKey(input) })) { setAmount(''); setReference(''); }
    } catch (error) { Alert.alert('Check payment details', error instanceof Error ? error.message : 'Check the payment details.'); }
  };
  const recordAdjustment = async () => {
    if (!data) return;
    try {
      const amountPence = parseTaxPounds(adjustment, true);
      if (!amountPence || reason.trim().length < 5) throw new Error('Enter a signed amount and a reason of at least five characters from your accounting or HMRC records.');
      const input = { periodStart: data.period.start, amountPence, reason: reason.trim() };
      if (await monthly.record('adjustments', { ...input, idempotencyKey: monthly.requestKey(input) })) { setAdjustment(''); setReason(''); }
    } catch (error) { Alert.alert('Check adjustment details', error instanceof Error ? error.message : 'Check the adjustment details.'); }
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Monthly PAYE & National Insurance</Text>
    <Text style={styles.hint}>Based on finalised payroll and payment records in Assisted Chat. This is not a live HMRC account balance. VAT and Corporation Tax are separate.</Text>
    <Field label="Date within tax month (YYYY-MM-DD)" value={date} set={setDate} />
    <Button label="Show tax month" disabled={monthly.busy || monthly.loading} onPress={() => {
      if (!isTaxDate(date)) { Alert.alert('Check date', 'Use a valid YYYY-MM-DD date.'); return; }
      if (date === selected) void monthly.load(); else setSelected(date);
    }} />
    {monthly.loading ? <ActivityIndicator color={colors.accent} /> : null}
    {monthly.error ? <><Text style={styles.error}>{monthly.error}</Text><Button label="Retry summary" onPress={() => { void monthly.load(); }} disabled={monthly.busy} /></> : null}
    {monthly.notice ? <Text style={styles.notice}>{monthly.notice}</Text> : null}
    {monthly.writeError ? <Text style={styles.error}>{monthly.writeError}</Text> : null}
    {setupRequired ? <View style={styles.card}>
      <Text style={styles.section}>Payroll setup required</Text>
      <Text style={styles.text}>Your company profile is saved. Payroll has not been activated, so PAYE, National Insurance and the amount due are not calculated yet.</Text>
      {data?.payrollSetup?.canActivate ? <>
        <Text style={styles.hint}>Choose the pay schedule, add employees and their tax details, then enter, review and finalise a pay run. Activation alone does not calculate a tax bill or register the company with HMRC.</Text>
        <Button label="Set up payroll schedule" onPress={() => router.push({ pathname: '/tax-payroll/payroll/settings', params: { companyId } })} />
      </> : <Text style={styles.hint}>Only the company founder can activate payroll. Ask them to complete setup; there is no calculated tax bill to show yet.</Text>}
    </View> : data ? <Button label="Open employees & payroll setup" disabled={monthly.busy} onPress={() => router.push({ pathname: '/tax-payroll/employees-payroll', params: { companyId } })} /> : null}
    <Button label="Back to Tax & Payroll" disabled={monthly.busy} onPress={() => router.push('/tax-payroll')} />
    {data && !setupRequired ? <>
      <View style={styles.card}>
        <Text style={styles.section}>Tax month {data.period.taxMonth} · {data.period.taxYear}</Text>
        <Text style={styles.text}>{data.period.start} to {data.period.end}</Text>
        <Text style={styles.text}>Monthly electronic payment deadline: {data.period.electronicDueDate}</Text>
        <Text style={styles.hint}>{data.period.isOpen ? 'This tax month is still open; figures can change.' : 'Closed tax month.'} Tax months run from the 6th to the 5th.</Text>
        <Text style={styles.status}>{data.status === 'no_data' ? 'No finalised payroll recorded' : data.status === 'incomplete' ? 'Incomplete — resolve the issues below' : data.status === 'provisional' ? 'Provisional month total' : 'Recorded month total'}</Text>
        <Row label="Calculated liability after recorded adjustments" amount={data.totals.liabilityPence} large />
        <Row label="Payments recorded" amount={data.totals.paidPence} />
        <Row label="Remaining from these records" amount={data.totals.remainingPence} large />
        {data.totals.creditPence !== null && data.totals.creditPence > 0 ? <Row label="Recorded credit / excess payments" amount={data.totals.creditPence} /> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.section}>Breakdown</Text>
        <Row label="Employee PAYE income tax" amount={data.totals.payePence} />
        <Row label="Employee National Insurance" amount={data.totals.employeeNiPence} />
        <Row label="Employer National Insurance" amount={data.totals.employerNiPence} />
        <Row label="Student / postgraduate loan deductions" amount={data.totals.studentLoanPence} />
        <Row label="Recorded adjustments / credits" amount={data.totals.adjustmentsPence} />
        <Text style={styles.hint}>{data.finalizedRunCount} finalised pay run(s); {data.pendingRunCount} pending. No payroll data is shown as “Not calculated”, never as a zero tax bill.</Text>
      </View>
      {data.issues.length ? <View style={styles.card}><Text style={styles.section}>Needs attention</Text>{data.issues.map((issue, index) => <Text key={`${index}:${issue}`} style={styles.warning}>{issue}</Text>)}</View> : null}
      {data.pendingRuns.length ? <View style={styles.card}><Text style={styles.section}>Pending pay runs</Text>{data.pendingRuns.map((run) => <Button key={run.id} label={`${run.paymentDate} · ${run.status.replace(/_/g, ' ')}`} disabled={monthly.busy} onPress={() => router.push({ pathname: '/tax-payroll/payroll/runs/[runId]', params: { companyId, runId: run.id } })} />)}</View> : null}
      {data.canRecordPayments ? <View style={styles.card}>
        <Text style={styles.section}>Record a payment already made</Text>
        <Text style={styles.hint}>For tax month starting {data.period.start}. This records an existing bank payment; it does not transfer money.</Text>
        <Field label="Amount paid (£)" value={amount} set={setAmount} numeric />
        <Field label="Payment date (YYYY-MM-DD)" value={paidOn} set={setPaidOn} />
        <Field label="Unique bank transaction / receipt reference" value={reference} set={setReference} />
        <Button label={monthly.busy ? 'Saving…' : 'Record payment'} disabled={monthly.busy} onPress={() => { void recordPayment(); }} />
      </View> : null}
      {data.canRecordAdjustments ? <View style={styles.card}>
        <Text style={styles.section}>Record an adjustment</Text>
        <Text style={styles.hint}>Enter only confirmed accounting adjustments: positive adds to the liability; negative records a credit or reduction. Employment Allowance and recoveries are not claimed automatically.</Text>
        <Field label="Signed adjustment (£, e.g. -100.00)" value={adjustment} set={setAdjustment} />
        <Field label="Reason / supporting reference" value={reason} set={setReason} />
        <Button label="Record adjustment" disabled={monthly.busy} onPress={() => { void recordAdjustment(); }} />
      </View> : null}
      <View style={styles.card}><Text style={styles.section}>Payment history</Text>
        {data.paymentRecordCount > data.payments.length ? <Text style={styles.hint}>Showing the latest {data.payments.length} of {data.paymentRecordCount} payment records. Totals include every active record.</Text> : null}
        {data.payments.length ? data.payments.map((payment) => <View key={payment.id} style={styles.history}><Row label={payment.paidOn} amount={payment.amountPence} /><Text selectable style={styles.hint}>{payment.reference}</Text>{payment.voidedAt ? <Text style={styles.warning}>Voided: {payment.voidReason}</Text> : data.canRecordPayments ? <Button label="Correct this payment record" disabled={monthly.busy} onPress={() => { setVoidTarget({ kind: 'payments', id: payment.id }); setVoidReason(''); }} /> : null}</View>) : <Text style={styles.hint}>No payments recorded for this month.</Text>}
        <Text style={styles.section}>Adjustment history</Text>
        {data.adjustmentRecordCount > data.adjustments.length ? <Text style={styles.hint}>Showing the latest {data.adjustments.length} of {data.adjustmentRecordCount} adjustments. Totals include every active record.</Text> : null}
        {data.adjustments.map((item) => <View key={item.id} style={styles.history}><Row label="Adjustment" amount={item.amountPence} /><Text selectable style={styles.hint}>{item.reason}</Text>{item.voidedAt ? <Text style={styles.warning}>Voided: {item.voidReason}</Text> : data.canRecordAdjustments ? <Button label="Correct this adjustment" disabled={monthly.busy} onPress={() => { setVoidTarget({ kind: 'adjustments', id: item.id }); setVoidReason(''); }} /> : null}</View>)}
        {voidTarget ? <View style={styles.card}><Text style={styles.section}>Void the incorrect record</Text><Text style={styles.hint}>Its original details remain in history. No bank transaction is cancelled. After voiding, record the correct details separately.</Text><Field label="Reason for correction (at least five characters)" value={voidReason} set={setVoidReason} /><Button label="Confirm void of this local record" disabled={monthly.busy || voidReason.trim().length < 5} onPress={() => {
          const target = voidTarget; const input = { ...target, reason: voidReason.trim() };
          Alert.alert('Void this local record?', 'It will be excluded from the monthly total and retained in audit history.', [{ text: 'Keep record', style: 'cancel' }, { text: 'Void record', style: 'destructive', onPress: () => { void monthly.voidRecord(target.kind, target.id, input.reason, monthly.requestKey(input)).then((saved) => { if (saved) { setVoidTarget(null); setVoidReason(''); } }); } }]);
        }} /><Button label="Cancel correction" disabled={monthly.busy} onPress={() => setVoidTarget(null)} /></View> : null}
      </View>
    </> : null}
  </ScrollView>;
}
function Row({ label, amount, large = false }: { label: string; amount: number | null; large?: boolean }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={[styles.amount, large && styles.large]}>{taxMoney(amount)}</Text></View>;
}
function Field({ label, value, set, numeric = false }: { label: string; value: string; set: (value: string) => void; numeric?: boolean }) {
  return <View style={styles.field}><Text style={styles.hint}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={set} style={styles.input} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize="none" /></View>;
}
function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.button, disabled && styles.disabled]} onPress={onPress} disabled={disabled}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: 18, paddingBottom: 48, gap: 14 }, title: { color: colors.text, fontSize: 21, fontWeight: '800' },
  text: { color: colors.text, fontSize: 14 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 }, card: { backgroundColor: colors.surface, padding: 16, gap: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  section: { color: colors.text, fontSize: 15, fontWeight: '800' }, status: { color: colors.accent, fontWeight: '700' }, row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowLabel: { color: colors.muted, fontSize: 13, flexShrink: 1 }, amount: { color: colors.text, fontSize: 15, fontWeight: '700' }, large: { fontSize: 21 },
  error: { color: colors.danger, lineHeight: 21 }, warning: { color: colors.warning, fontSize: 13, lineHeight: 20 }, notice: { color: colors.success, fontSize: 13, lineHeight: 20 },
  button: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12 }, buttonText: { color: colors.accent, fontWeight: '800' }, disabled: { opacity: 0.45 },
  field: { gap: 5 }, input: { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 }, history: { gap: 6, paddingVertical: 6 },
});
