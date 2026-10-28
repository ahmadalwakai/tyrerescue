import { isTaxDate, taxRecord, TAX_UUID } from './tax-input';
import type { MonthlyTaxSummary } from '../types/monthly-tax';
import { parsePayrollSetup } from './payroll-readiness-response';

const nullableAmounts = ['payePence', 'employeeNiPence', 'employerNiPence', 'studentLoanPence', 'payrollLiabilityPence', 'liabilityPence', 'remainingPence', 'creditPence'] as const;
const invalid = () => new Error('The monthly tax calculation could not be verified. Refresh before using these figures.');
const money = (value: unknown): value is number => Number.isSafeInteger(value);
const dateTime = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function parseMonthlyTaxSummary(value: unknown, companyId: string, selectedDate?: string): MonthlyTaxSummary {
  const row = taxRecord(value); const period = taxRecord(row?.period); const totals = taxRecord(row?.totals);
  if (!row || row.companyId !== companyId || !TAX_UUID.test(companyId) || row.currency !== 'GBP'
    || row.source !== 'local_payroll_records' || row.hmrcVerified !== false
    || !['no_data', 'incomplete', 'provisional', 'recorded'].includes(String(row.status))
    || !period || ![period.start, period.end, period.electronicDueDate, period.chequeDueDate].every(isTaxDate)
    || (period.start as string) > (period.end as string) || !/^\d{4}-\d{2}$/.test(String(period.taxYear))
    || !Number.isInteger(period.taxMonth) || Number(period.taxMonth) < 1 || Number(period.taxMonth) > 12 || typeof period.isOpen !== 'boolean'
    || !money(row.finalizedRunCount) || row.finalizedRunCount < 0 || !money(row.pendingRunCount) || row.pendingRunCount < 0
    || !money(row.paymentRecordCount) || row.paymentRecordCount < 0 || !money(row.adjustmentRecordCount) || row.adjustmentRecordCount < 0
    || typeof row.canRecordPayments !== 'boolean' || typeof row.canRecordAdjustments !== 'boolean'
    || !totals || !nullableAmounts.every((key) => totals[key] === null || money(totals[key]))
    || !money(totals.adjustmentsPence) || !money(totals.paidPence) || totals.paidPence < 0
    || !Array.isArray(row.issues) || !row.issues.every((issue) => typeof issue === 'string')
    || !Array.isArray(row.pendingRuns) || !Array.isArray(row.payments) || !Array.isArray(row.adjustments)) throw invalid();
  const start = period.start as string;
  const calendarDate = new Date(`${start}T00:00:00Z`);
  const month = calendarDate.getUTCMonth() + 1; const year = calendarDate.getUTCFullYear();
  const endDate = new Date(calendarDate); endDate.setUTCMonth(endDate.getUTCMonth() + 1, 5);
  const electronicDue = new Date(endDate); electronicDue.setUTCDate(22);
  const chequeDue = new Date(endDate); chequeDue.setUTCDate(19);
  const taxYearStart = month >= 4 ? year : year - 1;
  if (!start.endsWith('-06') || endDate.toISOString().slice(0, 10) !== period.end
    || electronicDue.toISOString().slice(0, 10) !== period.electronicDueDate || chequeDue.toISOString().slice(0, 10) !== period.chequeDueDate
    || period.taxMonth !== ((month + 8) % 12) + 1 || period.taxYear !== `${taxYearStart}-${String(taxYearStart + 1).slice(-2)}`
    || (selectedDate !== undefined && (!isTaxDate(selectedDate) || selectedDate < start || selectedDate > (period.end as string)))
    || row.pendingRunCount !== row.pendingRuns.length || row.payments.length !== Math.min(row.paymentRecordCount, 100)
    || row.adjustments.length !== Math.min(row.adjustmentRecordCount, 100)) throw invalid();
  if ((row.status === 'recorded' || row.status === 'provisional') && (row.finalizedRunCount < 1 || row.pendingRunCount !== 0
    || (row.status === 'recorded' ? period.isOpen : !period.isOpen))) throw invalid();
  if (row.status === 'no_data' && (row.finalizedRunCount !== 0 || row.pendingRunCount !== 0)) throw invalid();
  for (const items of [row.pendingRuns, row.payments, row.adjustments]) {
    if (new Set(items.map((item) => taxRecord(item)?.id)).size !== items.length) throw invalid();
  }
  for (const raw of row.pendingRuns) {
    const run = taxRecord(raw);
    if (!run || typeof run.id !== 'string' || !TAX_UUID.test(run.id) || typeof run.status !== 'string'
      || !['draft', 'submitted_for_review', 'approved'].includes(run.status)
      || ![run.paymentDate, run.periodStart, run.periodEnd].every(isTaxDate) || !money(run.version) || run.version < 1
      || (run.periodStart as string) > (run.periodEnd as string) || (run.paymentDate as string) < start || (run.paymentDate as string) > (period.end as string)) throw invalid();
  }
  for (const raw of row.payments) {
    const payment = taxRecord(raw);
    if (!payment || typeof payment.id !== 'string' || !TAX_UUID.test(payment.id) || !money(payment.amountPence) || payment.amountPence <= 0
      || !isTaxDate(payment.paidOn) || typeof payment.reference !== 'string' || !dateTime(payment.recordedAt)
      || !(payment.voidedAt === null || dateTime(payment.voidedAt)) || !(payment.voidReason === null || typeof payment.voidReason === 'string')
      || (payment.voidedAt === null) !== (payment.voidReason === null)) throw invalid();
  }
  for (const raw of row.adjustments) {
    const adjustment = taxRecord(raw);
    if (!adjustment || typeof adjustment.id !== 'string' || !TAX_UUID.test(adjustment.id) || !money(adjustment.amountPence) || adjustment.amountPence === 0
      || typeof adjustment.reason !== 'string' || !adjustment.reason.trim() || !dateTime(adjustment.recordedAt)
      || !(adjustment.voidedAt === null || dateTime(adjustment.voidedAt)) || !(adjustment.voidReason === null || typeof adjustment.voidReason === 'string')
      || (adjustment.voidedAt === null) !== (adjustment.voidReason === null)) throw invalid();
  }
  const paid = row.payments.reduce((sum: number, value) => sum + (value.voidedAt === null ? value.amountPence : 0), 0);
  const adjustments = row.adjustments.reduce((sum: number, value) => sum + (value.voidedAt === null ? value.amountPence : 0), 0);
  if (!Number.isSafeInteger(paid) || !Number.isSafeInteger(adjustments)
    || (row.paymentRecordCount === row.payments.length && paid !== totals.paidPence)
    || (row.adjustmentRecordCount === row.adjustments.length && adjustments !== totals.adjustmentsPence)) throw invalid();
  if (row.status === 'no_data' || row.status === 'incomplete') {
    if (!nullableAmounts.every((key) => totals[key] === null)) throw invalid();
  } else {
    if (!nullableAmounts.every((key) => money(totals[key]))) throw invalid();
    const amounts = totals as unknown as NonNullable<MonthlyTaxSummary['totals']>;
    const sum = amounts.payePence! + amounts.employeeNiPence! + amounts.employerNiPence! + amounts.studentLoanPence!;
    if (sum !== amounts.payrollLiabilityPence || sum + amounts.adjustmentsPence !== amounts.liabilityPence
      || Math.max(0, amounts.liabilityPence! - amounts.paidPence) !== amounts.remainingPence
      || Math.max(0, amounts.paidPence - amounts.liabilityPence!) !== amounts.creditPence) throw invalid();
  }
  if (row.payrollSetup !== undefined) {
    const setup = parsePayrollSetup(row.payrollSetup);
    if (setup.state === 'restricted' || row.canRecordPayments !== setup.canEditSettings || row.canRecordAdjustments !== setup.canEditSettings
      || (setup.state === 'not_activated' && (row.status !== 'no_data'
      || row.finalizedRunCount !== 0 || row.pendingRunCount !== 0 || row.paymentRecordCount !== 0 || row.adjustmentRecordCount !== 0
      || totals.paidPence !== 0 || totals.adjustmentsPence !== 0 || row.canRecordPayments || row.canRecordAdjustments))) throw invalid();
  }
  return row as unknown as MonthlyTaxSummary;
}
