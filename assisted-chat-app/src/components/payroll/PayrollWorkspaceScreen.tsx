import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors } from '@/components/theme';
import { useAdminSession } from '@/hooks/useAdminSession';
import { usePayrollWorkspace } from '@/hooks/usePayrollWorkspace';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { PayrollEarningsEditor } from './PayrollEarningsEditor';

export function PayrollWorkspaceScreen({ companyId, runId }: { companyId: string; runId: string }) {
  const router = useRouter(); const session = useAdminSession(); const payroll = usePayrollWorkspace(companyId, runId);
  const approvalAccess = usePayrollSettings(companyId);
  const loadPayroll = payroll.load;
  const loadApprovalAccess = approvalAccess.load;
  const [notes, setNotes] = useState('');
  useFocusEffect(useCallback(() => { void loadPayroll(); void loadApprovalAccess(); }, [loadPayroll, loadApprovalAccess]));
  const run = payroll.run; const calculation = payroll.calculation; const review = payroll.review;
  const selfReview = review?.submittedByUserId === session.user?.id;
  const canApprove = approvalAccess.setup?.canEditSettings === true;
  const confirmApprove = () => {
    if (!review || review.status !== 'pending' || calculation?.status !== 'ready' || !canApprove || payroll.busy || payroll.loading) return;
    Alert.alert('Approve reviewed figures?', `${selfReview ? 'You are approving the payroll you submitted. ' : ''}Confirm that you have checked the employee earnings, tax, National Insurance and net pay. Approval is recorded under your account; finalisation is a separate step.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'I reviewed these figures', onPress: () => { void payroll.act('approve', { action: 'approve', expectedVersion: review.version, notes }); } },
    ]);
  };
  const confirmFinalise = () => {
    if (!run) return;
    Alert.alert('Finalise reviewed payroll?', 'This locks these payroll figures and records the tax liability. It does not pay wages or send a return to HMRC.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Finalise payroll', onPress: () => { void payroll.act('finalise', { expectedVersion: run.version }); } },
    ]);
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Payroll calculation & review</Text>
    <Text style={styles.hint}>Calculate the deductions, review and approve the figures yourself or with another authorised administrator, then finalise to include them in the monthly tax summary.</Text>
    <Button label="Refresh payroll calculation" disabled={payroll.busy || payroll.loading} onPress={() => { void payroll.load(); void approvalAccess.load(); }} />
    {payroll.loading ? <ActivityIndicator color={colors.accent} /> : null}
    {payroll.error ? <Text style={styles.error}>{payroll.error}</Text> : null}
    {payroll.writeError ? <Text style={styles.error}>{payroll.writeError}</Text> : null}
    {payroll.notice ? <Text style={styles.notice}>{payroll.notice}</Text> : null}
    {run ? <>
      <View style={styles.card}><Text style={styles.section}>{run.periodStart} to {run.periodEnd}</Text><Text style={styles.text}>Payment date: {run.intendedPaymentDate}</Text><Text style={styles.status}>{run.runStatus.replace(/_/g, ' ')}</Text></View>
      {run.runStatus === 'draft' ? <PayrollEarningsEditor companyId={companyId} run={run} busy={payroll.busy || payroll.loading} save={(body) => payroll.act('lines', body)} /> : null}
      {calculation ? <>
        <View style={styles.card}><Text style={styles.section}>{calculation.status === 'finalised' ? 'Finalised figures' : calculation.status === 'ready' ? 'Calculated preview — not yet finalised' : 'Calculation blocked'}</Text>
          {calculation.totals ? <>
            <Row label="Gross pay" value={calculation.totals.grossPayPounds} /><Row label="Employee PAYE tax" value={calculation.totals.taxPounds} />
            <Row label="Employee NI" value={calculation.totals.employeeNiPounds} /><Row label="Employer NI" value={calculation.totals.employerNiPounds} />
            <Row label="Student / postgraduate loans" value={calculation.totals.studentLoanPounds} /><Row label="Net pay" value={calculation.totals.netPayPounds} />
            <Row label="PAYE / NI liability for this run" value={calculation.totals.hmrcLiabilityPounds} />
          </> : <Text style={styles.warning}>Totals are not available until every employee’s calculation is complete.</Text>}
          {calculation.issues.map((issue, index) => <View key={`${issue.code}:${index}`} style={styles.issue}><Text style={styles.warning}>{issue.message}</Text>{issue.employeeId ? <Button label="Open employee tax setup" disabled={payroll.busy} onPress={() => router.push({ pathname: '/tax-payroll/employees/[employeeId]', params: { companyId, employeeId: issue.employeeId! } })} /> : null}</View>)}
        </View>
        {calculation.totals ? calculation.employeeResults.map((employee) => <View key={employee.employeeId} style={styles.card}>
          <Text style={styles.section}>{employee.legalFirstName} {employee.legalSurname}</Text><Text style={styles.hint}>{employee.taxCode} · NI {employee.niCategory} · {employee.taxYear}</Text>
          <Row label="Gross" value={employee.grossPayPounds} /><Row label="Tax" value={employee.taxForPeriodPounds} /><Row label="Employee NI" value={employee.employeeNiPounds} /><Row label="Employer NI" value={employee.employerNiPounds} /><Row label="Loan deductions" value={employee.studentLoanPounds} /><Row label="Net" value={employee.netPayPounds} />
          {employee.warnings.map((warning, index) => <Text key={index} style={styles.warning}>{warning}</Text>)}
        </View>) : null}
      </> : null}
      {run.runStatus === 'draft' ? <>
        <Button label="Submit calculated payroll for review" disabled={payroll.busy || payroll.loading || calculation?.status !== 'ready'} onPress={() => { void payroll.act('submit', { expectedVersion: run.version }); }} />
        <Button label="Cancel draft payroll" disabled={payroll.busy} onPress={() => Alert.alert('Cancel this draft?', 'This removes it from pending payroll calculations.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Cancel draft', style: 'destructive', onPress: () => { void payroll.act('cancel', undefined); } }])} />
      </> : null}
      {run.runStatus === 'submitted_for_review' && review?.status === 'pending' ? <View style={styles.card}>
        <Text style={styles.section}>{selfReview ? 'Review your payroll' : 'Payroll review'}</Text>
        <Text style={styles.hint}>{approvalAccess.loading ? 'Checking payroll approval permissions…' : !canApprove ? 'Payroll settings permission is required to approve or reject these figures. Ask the company founder to check your access.' : selfReview ? 'You can review and approve the payroll you submitted. Check every figure before confirming your approval.' : 'Check every figure before approving. Reject to return this pay run to a draft for corrections.'}</Text>
        {approvalAccess.error ? <Text style={styles.error}>{approvalAccess.error}</Text> : null}
        <TextInput editable={canApprove && !payroll.busy} accessibilityLabel="Review notes" placeholder="Review notes (optional)" placeholderTextColor={colors.muted} style={styles.input} value={notes} onChangeText={setNotes} />
        <Button label="Approve reviewed figures" disabled={payroll.busy || payroll.loading || !canApprove || calculation?.status !== 'ready'} onPress={confirmApprove} />
        <Button label="Reject and return to draft" disabled={payroll.busy || payroll.loading || !canApprove} onPress={() => { if (canApprove) void payroll.act('reject', { action: 'reject', expectedVersion: review.version, notes }); }} />
      </View> : null}
      {run.runStatus === 'approved' ? <>
        <Button label="Finalise approved payroll" disabled={payroll.busy || payroll.loading || calculation?.status !== 'ready'} onPress={confirmFinalise} />
        <Button label="Request a fresh review after changes" disabled={payroll.busy || payroll.loading || calculation?.status !== 'ready'} onPress={() => { void payroll.act('submit', { expectedVersion: run.version }); }} />
      </> : null}
      <Button label="View this tax month" disabled={payroll.busy} onPress={() => router.push({ pathname: '/tax-payroll/monthly-tax', params: { companyId, date: run.intendedPaymentDate } })} />
    </> : null}
  </ScrollView>;
}
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.hint}>{label}</Text><Text style={styles.amount}>£{value}</Text></View>; }
function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} style={[styles.button, disabled && { opacity: 0.45 }]} onPress={onPress}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: 16, paddingBottom: 48, gap: 14 }, title: { color: colors.text, fontSize: 20, fontWeight: '800' }, section: { color: colors.text, fontSize: 15, fontWeight: '800' }, text: { color: colors.text, fontSize: 14 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  card: { backgroundColor: colors.surface, padding: 16, borderRadius: 14, borderColor: colors.border, borderWidth: 1, gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }, amount: { color: colors.text, fontSize: 16, fontWeight: '700' }, status: { color: colors.accent, fontWeight: '800' }, error: { color: colors.danger, lineHeight: 20 }, notice: { color: colors.success, lineHeight: 20 }, warning: { color: colors.warning, lineHeight: 20, fontSize: 13 }, issue: { gap: 8 },
  button: { borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 11, padding: 12, minHeight: 48, justifyContent: 'center' }, buttonText: { color: colors.accent, fontWeight: '800' }, input: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.inputBg, padding: 12 },
});
