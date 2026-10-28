import type { PayrollRunDto, ReviewDto, EmployeeSummaryDto } from '../types/tax-payroll';
import type { PayrollRunCalculation } from '../types/payroll-calculation';
import { isTaxDate, parseTaxPounds, taxRecord, TAX_UUID } from './tax-input';

const fail = () => { throw new Error('The payroll response could not be verified. Reload before changing or finalising this pay run.'); };
const id = (value: unknown): value is string => typeof value === 'string' && TAX_UUID.test(value);
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1;
const money = (value: unknown): value is string => typeof value === 'string' && /^-?\d{1,12}\.\d{2}$/.test(value);
const dateTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const pence = (value: string) => parseTaxPounds(value, true);
const taxYear = (date: string) => {
  const year = Number(date.slice(0, 4));
  const firstYear = date.slice(5) >= '04-06' ? year : year - 1;
  return `${firstYear}-${String(firstYear + 1).slice(-2)}`;
};
export function parsePayrollRun(value: unknown, companyId: string, runId: string): PayrollRunDto {
  const run = taxRecord(value);
  if (!run || run.companyId !== companyId || run.id !== runId || !id(companyId) || !id(runId) || !id(run.settingsId)
    || ![run.periodStart, run.periodEnd, run.intendedPaymentDate].every(isTaxDate) || !integer(run.version)
    || !['draft', 'cancelled', 'submitted_for_review', 'approved', 'finalised'].includes(String(run.runStatus))
    || !Number.isSafeInteger(run.employeeCount) || Number(run.employeeCount) < 0 || !Array.isArray(run.lines)) fail();
  if ((run!.periodStart as string) > (run!.periodEnd as string)) fail();
  for (const value of run!.lines as unknown[]) {
    const line = taxRecord(value);
    if (!line || !id(line.id) || line.runId !== runId || !id(line.employeeId)
      || !(line.payTermsId === null || id(line.payTermsId)) || !['hours_worked', 'fixed_period', 'overtime', 'bonus', 'commission'].includes(String(line.lineType))
      || !(line.workedMinutes === null || (Number.isSafeInteger(line.workedMinutes) && Number(line.workedMinutes) > 0))
      || ![line.hourlyRateOverride, line.fixedAmount].every((amount) => amount === null || (typeof amount === 'string' && /^\d+(\.\d{1,4})?$/.test(amount)))
      || !(line.description === null || typeof line.description === 'string')) fail();
  }
  const lines = run!.lines as Array<{ id: string; employeeId: string }>;
  if (new Set(lines.map((line) => line.id)).size !== lines.length
    || new Set(lines.map((line) => line.employeeId)).size !== run!.employeeCount) fail();
  return run as unknown as PayrollRunDto;
}
export function parsePayrollCalculation(value: unknown, companyId: string, runId: string): PayrollRunCalculation {
  const row = taxRecord(value);
  if (!row || row.companyId !== companyId || row.runId !== runId || !id(companyId) || !id(runId) || !integer(row.runVersion)
    || !['ready', 'blocked', 'finalised'].includes(String(row.status)) || !isTaxDate(row.paymentDate)
    || typeof row.taxYear !== 'string' || row.taxYear !== taxYear(row.paymentDate)
    || !(row.rulesetVersion === null || (typeof row.rulesetVersion === 'string' && row.rulesetVersion.trim()))
    || typeof row.calculatedAt !== 'string' || !Number.isFinite(Date.parse(row.calculatedAt))
    || !Array.isArray(row.employeeResults) || !Array.isArray(row.issues)) fail();
  const employees = row!.employeeResults as unknown[];
  if (new Set(employees.map((employee) => taxRecord(employee)?.employeeId)).size !== employees.length) fail();
  for (const raw of employees) {
    const employee = taxRecord(raw);
    if (!employee || !id(employee.employeeId) || !['legalFirstName', 'legalSurname', 'taxCode', 'niCategory', 'taxYear', 'calculationStatus'].every((key) => typeof employee[key] === 'string')
      || !['grossPayPounds', 'taxForPeriodPounds', 'employeeNiPounds', 'employerNiPounds', 'studentLoanPounds', 'netPayPounds', 'totalDeductionsPounds'].every((key) => money(employee[key]))
      || employee.taxYear !== row!.taxYear || employee.calculationStatus !== 'calculated'
      || !integer(employee.periodNumber) || Number(employee.periodNumber) > 53
      || !Array.isArray(employee.warnings) || !employee.warnings.every((warning) => typeof warning === 'string')) fail();
    const values = employee! as Record<string, string>;
    const deductions = pence(values.taxForPeriodPounds) + pence(values.employeeNiPounds) + pence(values.studentLoanPounds);
    if (!Number.isSafeInteger(deductions) || deductions !== pence(values.totalDeductionsPounds)
      || pence(values.grossPayPounds) < 0 || pence(values.netPayPounds) < 0 || pence(values.studentLoanPounds) < 0
      || pence(values.grossPayPounds) - deductions !== pence(values.netPayPounds)) fail();
  }
  for (const value of row!.issues as unknown[]) {
    const issue = taxRecord(value);
    if (!issue || !(issue.employeeId === null || id(issue.employeeId)) || typeof issue.code !== 'string' || typeof issue.message !== 'string') fail();
  }
  if (row!.status === 'blocked') { if (row!.totals !== null) fail(); }
  else {
    const totals = taxRecord(row!.totals);
    const keys = ['grossPayPounds', 'taxPounds', 'employeeNiPounds', 'employerNiPounds', 'studentLoanPounds', 'netPayPounds', 'hmrcLiabilityPounds'];
    if (!totals || !keys.every((key) => money(totals[key])) || (row!.issues as unknown[]).length || !employees.length
      || typeof row!.rulesetVersion !== 'string' || !row!.rulesetVersion.trim()) fail();
    const t = totals! as Record<string, string>;
    const pounds = (value: string) => parseTaxPounds(value, true);
    if (pounds(t.taxPounds) + pounds(t.employeeNiPounds) + pounds(t.employerNiPounds) + pounds(t.studentLoanPounds) !== pounds(t.hmrcLiabilityPounds)
      || pounds(t.grossPayPounds) - pounds(t.taxPounds) - pounds(t.employeeNiPounds) - pounds(t.studentLoanPounds) !== pounds(t.netPayPounds)) fail();
    const map = { grossPayPounds: 'grossPayPounds', taxPounds: 'taxForPeriodPounds', employeeNiPounds: 'employeeNiPounds', employerNiPounds: 'employerNiPounds', studentLoanPounds: 'studentLoanPounds', netPayPounds: 'netPayPounds' };
    for (const [key, employeeKey] of Object.entries(map)) {
      if (employees.reduce<number>((sum, employee) => sum + pounds((employee as Record<string, string>)[employeeKey]), 0) !== pounds(t[key])) fail();
    }
  }
  return row as unknown as PayrollRunCalculation;
}
export function parsePayrollReview(value: unknown, runId: string): ReviewDto | null {
  const row = taxRecord(value);
  if (!row || !('review' in row)) fail();
  if (row!.review === null) return null;
  const review = taxRecord(row!.review);
  if (!review || !id(review.id) || review.entityId !== runId || review.entityType !== 'payroll_run' || !id(review.submittedByUserId)
    || !['pending', 'approved', 'rejected'].includes(String(review.status)) || !integer(review.version)
    || !dateTime(review.submittedAt) || !(review.notes === null || typeof review.notes === 'string')) fail();
  if (review!.status === 'pending') {
    if (review!.reviewedByUserId !== null || review!.reviewedAt !== null) fail();
  } else if (!id(review!.reviewedByUserId) || !dateTime(review!.reviewedAt)) fail();
  return review as unknown as ReviewDto;
}
export function parsePayrollEmployees(value: unknown): EmployeeSummaryDto[] {
  const row = taxRecord(value);
  if (!row || !Array.isArray(row.employees)) fail();
  for (const raw of row!.employees as unknown[]) {
    const employee = taxRecord(raw);
    if (!employee || !id(employee.id) || typeof employee.legalFirstName !== 'string' || typeof employee.legalSurname !== 'string') fail();
  }
  return row!.employees as EmployeeSummaryDto[];
}
