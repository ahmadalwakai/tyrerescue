import 'server-only';

import { db } from '@/lib/db';
import {
  payrollRuns, payrollRunLines, payrollSettings, payrollEmployees, payrollPayTerms,
  payrollEmployeeStarterData, payrollRunFinalisedResults, payrollEmployeeEnrolments,
} from '@/lib/db/schema';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { calculateEmployeeGross, type RawLine } from './gross-pay-calculation';
import { calculatePayrollForEmployee, penceToPounds, poundsToPence, PAYROLL_CALCULATION_POLICY_VERSION, type PayrollCalculationResult,
  type EmploymentYtd, type PayFrequency } from './payroll-calculation';
import { exactTaxMonth, taxWeekNumber, taxYearForDate, getRulesetForDate } from './rule-registry';
import type { TaxWriteTransaction } from './write-transaction';

export interface CalculatedEmployeeResult {
  employeeId: string; legalFirstName: string; legalSurname: string;
  grossPayPounds: string; taxForPeriodPounds: string; employeeNiPounds: string;
  employerNiPounds: string; studentLoanPounds: string; netPayPounds: string;
  totalDeductionsPounds: string; taxCode: string; niCategory: string;
  periodNumber: number; taxYear: string; calculationStatus: string; warnings: string[];
}
export interface PayrollCalculationTotals {
  grossPayPounds: string; taxPounds: string; employeeNiPounds: string;
  employerNiPounds: string; studentLoanPounds: string; netPayPounds: string; hmrcLiabilityPounds: string;
}
export interface PayrollRunCalculationDto {
  runId: string; companyId: string; status: 'ready' | 'blocked' | 'finalised'; runVersion: number;
  paymentDate: string; taxYear: string; rulesetVersion: string | null; calculatedAt: string;
  employeeResults: CalculatedEmployeeResult[]; totals: PayrollCalculationTotals | null;
  issues: Array<{ employeeId: string | null; code: string; message: string }>;
}

export class RunCalculationError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'WRONG_STATUS') { super(message); }
}

type Reader = Pick<TaxWriteTransaction, 'select'>;
export interface PreparedPayrollCalculation {
  dto: PayrollRunCalculationDto;
  inputHash: string;
  snapshots: Array<{ employeeId: string; result: PayrollCalculationResult; before: EmploymentYtd;
    after: EmploymentYtd; opening: Record<string, unknown>; display: CalculatedEmployeeResult }>;
}

function totals(results: CalculatedEmployeeResult[]): PayrollCalculationTotals {
  const sum = (key: keyof CalculatedEmployeeResult) => results.reduce((n,r) => n + poundsToPence(String(r[key])), 0);
  const tax = sum('taxForPeriodPounds'), ni = sum('employeeNiPounds'), employer = sum('employerNiPounds'), loan = sum('studentLoanPounds');
  return { grossPayPounds: penceToPounds(sum('grossPayPounds')), taxPounds: penceToPounds(tax),
    employeeNiPounds: penceToPounds(ni), employerNiPounds: penceToPounds(employer), studentLoanPounds: penceToPounds(loan),
    netPayPounds: penceToPounds(sum('netPayPounds')), hmrcLiabilityPounds: penceToPounds(tax + ni + employer + loan) };
}

const openingKeys = ['openingYtdGrossPay','openingYtdTaxPaid','openingYtdNiEmployee','openingYtdNiEmployer',
  'openingYtdStudentLoanDeductions','openingYtdPensionEmployee','openingYtdPensionEmployer'] as const;

function isYtd(value: unknown): value is EmploymentYtd {
  if (!value || typeof value !== 'object') return false;
  return ['lastPeriodNumber','grossPayToDatePence','taxPaidToDatePence','employeeNiToDatePence','employerNiToDatePence',
    'studentLoanToDatePence','pgLoanToDatePence','niableEarningsToDatePence']
    .every(key => Number.isSafeInteger((value as Record<string,unknown>)[key]));
}

/** Read-only preview: the same preparation is repeated inside a locked write
 * transaction for finalisation. It never advances YTD or books a liability. */
export async function calculatePayrollRunPreview(companyId: string, runId: string): Promise<PayrollRunCalculationDto> {
  return (await preparePayrollRunCalculation(db as unknown as Reader, companyId, runId)).dto;
}

export async function preparePayrollRunCalculation(reader: Reader, companyId: string, runId: string): Promise<PreparedPayrollCalculation> {
  const [run] = await reader.select().from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId))).limit(1);
  if (!run) throw new RunCalculationError('Pay run not found.', 'NOT_FOUND');
  if (!['draft','submitted_for_review','approved','finalised'].includes(run.runStatus)) {
    throw new RunCalculationError('Cancelled pay runs cannot be calculated.', 'WRONG_STATUS');
  }
  const rules = getRulesetForDate(run.intendedPaymentDate);
  const dto: PayrollRunCalculationDto = { runId, companyId, status: 'blocked', runVersion: run.version,
    paymentDate: run.intendedPaymentDate, taxYear: taxYearForDate(run.intendedPaymentDate), rulesetVersion: rules ? PAYROLL_CALCULATION_POLICY_VERSION : null,
    calculatedAt: new Date().toISOString(), employeeResults: [], totals: null, issues: [] };
  const issue = (employeeId: string | null, code: string, message: string) => dto.issues.push({employeeId, code, message});
  const snapshots: PreparedPayrollCalculation['snapshots'] = [];
  const lines = await reader.select().from(payrollRunLines).where(eq(payrollRunLines.runId, runId));
  const employeeIds = [...new Set(lines.map(line => line.employeeId))].sort();
  if (!employeeIds.length) issue(null, 'NO_EMPLOYEES', 'Add earnings lines before calculating payroll.');

  if (run.runStatus === 'finalised') {
    const rows = await reader.select().from(payrollRunFinalisedResults).where(and(eq(payrollRunFinalisedResults.companyId, companyId), eq(payrollRunFinalisedResults.runId, runId)));
    for (const row of rows) {
      const saved = row.ytdSnapshot.display as CalculatedEmployeeResult | undefined;
      if (row.calculationStatus !== 'calculated' || !saved || saved.employeeId !== row.employeeId
        || row.ytdSnapshot.schemaVersion !== 1 || typeof row.ytdSnapshot.inputHash !== 'string') {
        issue(row.employeeId, 'MISSING_FINALISED_SNAPSHOT', 'This historical pay run has no verified saved calculation. Reconcile it before using the liability.');
      } else dto.employeeResults.push(saved);
    }
    if (rows.length !== employeeIds.length || employeeIds.some(id => !rows.some(row => row.employeeId === id))) {
      issue(null, 'INCOMPLETE_FINALISED_RUN', 'Saved results do not cover every employee in this finalised pay run.');
    }
    if (!dto.issues.length) {
      dto.status = 'finalised'; dto.totals = totals(dto.employeeResults);
      const calculation = rows[0]?.ytdSnapshot.calculation as {rulesetVersion?: string} | undefined;
      dto.rulesetVersion = calculation?.rulesetVersion ?? null;
    }
    return { dto, inputHash: '', snapshots };
  }

  const [settings] = await reader.select().from(payrollSettings).where(eq(payrollSettings.companyId, companyId)).limit(1);
  if (!settings) issue(null, 'NOT_ACTIVATED', 'Activate payroll before calculating deductions.');
  if (!rules) issue(null, 'NO_RULESET', 'No verified payroll rules are available for this payment date.');
  if (!settings || !rules || !employeeIds.length) return { dto, inputHash: '', snapshots };
  const frequency = settings.payFrequency as PayFrequency;
  if (!['weekly','fortnightly','four_weekly','monthly'].includes(frequency)) {
    issue(null,'UNSUPPORTED_FREQUENCY','This pay frequency is not supported.');
    return {dto,inputHash:'',snapshots};
  }
  if (settings.employeePensionRate || settings.employerPensionRate || settings.pensionContributionBasis) {
    issue(null, 'PENSION_REVIEW_REQUIRED', 'Configured pension deductions require a supported pension payroll calculation before finalising.');
  }
  const [employees, terms, starters, enrolments, allRuns] = await Promise.all([
    reader.select().from(payrollEmployees).where(and(eq(payrollEmployees.companyId,companyId),inArray(payrollEmployees.id,employeeIds))),
    reader.select().from(payrollPayTerms).where(and(eq(payrollPayTerms.companyId,companyId),inArray(payrollPayTerms.employeeId,employeeIds))),
    reader.select().from(payrollEmployeeStarterData).where(inArray(payrollEmployeeStarterData.employeeId,employeeIds))
      .orderBy(desc(payrollEmployeeStarterData.recordedAt),desc(payrollEmployeeStarterData.id)),
    reader.select().from(payrollEmployeeEnrolments).where(and(eq(payrollEmployeeEnrolments.companyId,companyId),inArray(payrollEmployeeEnrolments.employeeId,employeeIds))),
    reader.select().from(payrollRuns).where(and(eq(payrollRuns.companyId,companyId),eq(payrollRuns.runStatus,'finalised'))),
  ]);
  const historyRuns = allRuns.filter(other => taxYearForDate(other.intendedPaymentDate) === dto.taxYear);
  const history = historyRuns.length ? await reader.select().from(payrollRunFinalisedResults)
    .where(and(eq(payrollRunFinalisedResults.companyId,companyId),inArray(payrollRunFinalisedResults.runId,historyRuns.map(other => other.id)))) : [];
  const historicLines = historyRuns.length ? await reader.select().from(payrollRunLines)
    .where(inArray(payrollRunLines.runId,historyRuns.map(other => other.id))) : [];
  const periodNumber = frequency === 'monthly' ? exactTaxMonth(run.intendedPaymentDate)
    : Math.ceil(taxWeekNumber(run.intendedPaymentDate) / (frequency === 'fortnightly' ? 2 : frequency === 'four_weekly' ? 4 : 1));
  const yearStart = `${dto.taxYear.slice(0,4)}-04-06`;
  for (const employeeId of employeeIds) {
    const initialIssueCount = dto.issues.length;
    const employee = employees.find(emp => emp.id === employeeId);
    if (!employee) { issue(employeeId,'EMPLOYEE_NOT_FOUND','An earnings line refers to an employee outside this company.'); continue; }
    const name = `${employee.legalFirstName} ${employee.legalSurname}`;
    if (!employee.taxCode || !employee.niCategory || !['cumulative','week1_month1'].includes(employee.taxCodeBasis ?? '')) {
      issue(employeeId,'TAX_SETUP_REQUIRED',`${name}: record the tax code, tax basis and NI category.`);
    }
    if (!employee.taxCodeEffectiveDate || employee.taxCodeEffectiveDate > run.intendedPaymentDate
      || !['p45','starter_checklist','hmrc_notification'].includes(employee.taxCodeSource ?? '')) {
      issue(employeeId,'TAX_CODE_EFFECTIVE_DATE_REQUIRED',`${name}: record a tax code effective on or before payment.`);
    }
    if (employee.employmentStartDate > run.intendedPaymentDate) issue(employeeId,'EMPLOYMENT_NOT_STARTED',`${name}: payment is before employment starts.`);
    const starter = starters.find(row => row.employeeId === employeeId);
    let metadata: {niMethod?: string; pensionHandling?: string; schemaVersion?: number; directorFullTaxYearConfirmed?: boolean} = {};
    try {
      const value: unknown = JSON.parse(starter?.sourceReference ?? '{}');
      if (value && typeof value === 'object' && !Array.isArray(value)) metadata = value;
    } catch { /* Explicit setup below remains required. */ }
    if (!starter || starter.openingYtdCompleteness !== 'complete' || starter.openingYtdTaxYear !== dto.taxYear
      || !starter.openingYtdEffectiveDate || starter.openingYtdEffectiveDate > run.intendedPaymentDate
      || taxYearForDate(starter.openingYtdEffectiveDate) !== dto.taxYear
      || !['first_payroll_this_tax_year','current_employment_opening'].includes(starter.sourceType)
      || metadata.schemaVersion !== 1 || openingKeys.some(key => starter[key] == null
        || !Number.isFinite(Number(starter[key])) || Number(starter[key]) < 0)) {
      issue(employeeId,'OPENING_YTD_REQUIRED',`${name}: confirm first payroll of this tax year, or enter complete previous payroll totals.`);
    }
    if (metadata.pensionHandling !== 'none_confirmed' || enrolments.some(row => row.employeeId === employeeId && row.enrolmentStatus === 'enrolled')) {
      issue(employeeId,'PENSION_REVIEW_REQUIRED',`${name}: confirm the pension position; enrolled pension calculations are not supported in this run.`);
    }
    const method = employee.isDirector ? 'director_annual' : 'periodic';
    if (metadata.niMethod !== method || (employee.isDirector && (employee.employmentStartDate > yearStart || metadata.directorFullTaxYearConfirmed !== true))) {
      issue(employeeId,'NI_METHOD_REVIEW_REQUIRED',`${name}: confirm the NI method. Mid-year director appointment/proration needs a separate calculation.`);
    }
    const empHistory = history.filter(row => row.employeeId === employeeId).sort((a,b) => {
      const aDate = historyRuns.find(other => other.id === a.runId)!.intendedPaymentDate;
      const bDate = historyRuns.find(other => other.id === b.runId)!.intendedPaymentDate;
      return aDate.localeCompare(bDate);
    });
    if (historicLines.some(line => line.employeeId === employeeId && !empHistory.some(row => row.runId === line.runId))) {
      issue(employeeId,'INCOMPLETE_PAYROLL_HISTORY',`${name}: historical finalised pay has no saved result. Reconcile the opening payroll history first.`);
    }
    if (empHistory.some(row => row.calculationStatus !== 'calculated' || row.ytdSnapshot.schemaVersion !== 1 || !isYtd(row.ytdSnapshot.after))) {
      issue(employeeId,'UNVERIFIED_PAYROLL_HISTORY',`${name}: historical YTD totals are incomplete.`);
    }
    if (empHistory.some(row => {
      const previous = row.ytdSnapshot.calculation as {ni?:{method?:string}} | undefined;
      return previous?.ni?.method !== method || (employee.isDirector && row.niCategory !== employee.niCategory);
    })) {
      issue(employeeId,'NI_METHOD_CHANGED',`${name}: the NI method/director status or director NI category changed after finalised payroll. A supported mid-year reconciliation is required.`);
    }
    if (empHistory.some(row => row.periodNumber >= periodNumber)) {
      issue(employeeId,'PERIOD_ALREADY_FINALISED',`${name}: this or a later tax period is already finalised. Supplementary/correction runs require a separate workflow.`);
    }
    if (!starter || dto.issues.length !== initialIssueCount) continue;
    const opening = Object.fromEntries(openingKeys.map(key => [key, starter[key]]));
    Object.assign(opening, {taxYear: starter.openingYtdTaxYear, effectiveDate: starter.openingYtdEffectiveDate,
      p45Pay: starter.p45TotalPayPrevEmployment ?? '0', p45Tax: starter.p45TotalTaxPrevEmployment ?? '0', sourceType: starter.sourceType});
    const first = empHistory[0];
    const savedOpening = first?.ytdSnapshot.opening as Record<string, unknown> | undefined;
    // PostgreSQL jsonb sorts object keys; compare their values, never JSON text order.
    if (first && (!savedOpening || Object.keys(savedOpening).length !== Object.keys(opening).length
      || Object.entries(opening).some(([key,value]) => savedOpening[key] !== value))) {
      issue(employeeId,'OPENING_YTD_CHANGED',`${name}: opening totals have changed after payroll was finalised. Reconcile instead of overwriting history.`); continue;
    }
    const before: EmploymentYtd = empHistory.length ? empHistory[empHistory.length - 1].ytdSnapshot.after as unknown as EmploymentYtd : {
      lastPeriodNumber: 0,
      grossPayToDatePence: poundsToPence(starter.openingYtdGrossPay!) + poundsToPence(starter.p45TotalPayPrevEmployment ?? '0'),
      taxPaidToDatePence: poundsToPence(starter.openingYtdTaxPaid!) + poundsToPence(starter.p45TotalTaxPrevEmployment ?? '0'),
      employeeNiToDatePence: poundsToPence(starter.openingYtdNiEmployee!), employerNiToDatePence: poundsToPence(starter.openingYtdNiEmployer!),
      studentLoanToDatePence: poundsToPence(starter.openingYtdStudentLoanDeductions!), pgLoanToDatePence: 0,
      niableEarningsToDatePence: poundsToPence(starter.openingYtdGrossPay!),
    };
    const empLines = lines.filter(line => line.employeeId === employeeId).map(line => {
      if ((line.workedMinutes != null && (!Number.isSafeInteger(line.workedMinutes) || line.workedMinutes < 0))
        || [line.hourlyRateOverride,line.fixedAmount,line.resolvedHourlyRate].some(value => value != null && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
        issue(employeeId,'INVALID_EARNINGS',`${name}: earnings and hours must be valid non-negative values.`);
      }
      const activeTerms = terms.filter(term => term.employeeId === employeeId && term.effectiveFrom <= run.intendedPaymentDate
        && (!term.effectiveTo || term.effectiveTo >= run.intendedPaymentDate)).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
      const term = line.payTermsId ? terms.find(term => term.id === line.payTermsId && term.employeeId === employeeId) : activeTerms[0];
      if (term && (term.currency !== 'GBP' || term.payFrequency !== frequency)) issue(employeeId,'PAY_TERMS_MISMATCH',`${name}: currency/pay frequency does not match this run.`);
      if (line.payTermsId && !term) issue(employeeId,'PAY_TERMS_NOT_FOUND',`${name}: the selected pay terms cannot be resolved.`);
      if (term && (term.effectiveFrom > run.intendedPaymentDate || (term.effectiveTo && term.effectiveTo < run.intendedPaymentDate))) {
        issue(employeeId,'PAY_TERMS_NOT_EFFECTIVE',`${name}: the selected pay terms are not effective on the payment date.`);
      }
      if ((line.lineType === 'hours_worked' || line.lineType === 'overtime') && !line.hourlyRateOverride && !line.payTermsId
        && terms.some(term => term.employeeId === employeeId && term.effectiveFrom > run.periodStart && term.effectiveFrom <= run.periodEnd)) {
        issue(employeeId,'PAY_RATE_CHANGED',`${name}: split hours by the pay terms that applied when they were worked.`);
      }
      return {...line, createdAt: line.createdAt.toISOString(), lineType: line.lineType as RawLine['lineType'], resolvedHourlyRate: term?.hourlyRate ?? null};
    });
    const gross = calculateEmployeeGross(employee, empLines);
    if (gross.hasUnsupportedLines || gross.grossPay == null) { issue(employeeId,'EARNINGS_INCOMPLETE',`${name}: one or more earnings lines cannot be calculated.`); continue; }
    if (starter.studentLoanUnknown || starter.studentLoanPlans.some(plan => !['1','2','4','5'].includes(plan))) {
      issue(employeeId,'STUDENT_LOAN_SETUP_REQUIRED',`${name}: confirm the student loan plan.`); continue;
    }
    const result = calculatePayrollForEmployee({employeeId, legalFirstName: employee.legalFirstName, legalSurname: employee.legalSurname,
      paymentDate:run.intendedPaymentDate, taxCode:employee.taxCode!, taxCodeBasis:employee.taxCodeBasis as 'cumulative'|'week1_month1',
      taxCountry:employee.taxCode!.startsWith('S') ? 'GB-SCT' : employee.taxCode!.startsWith('C') ? 'GB-WLS' : 'GB',
      niCategory:employee.niCategory!, niMethod:method, frequency, periodNumber, grossPayPence:poundsToPence(gross.grossPay), ytd:before,
      studentLoan:{plans:starter.studentLoanPlans.map(plan => Number(plan) as 1|2|4|5), postgraduate:starter.postgraduateLoan}});
    if (result.overallStatus !== 'calculated' || result.netPayPence < 0) {
      issue(employeeId,'CALCULATION_BLOCKED',`${name}: ${result.warnings.join(' ') || result.overallStatus}.`); continue;
    }
    const display: CalculatedEmployeeResult = {employeeId, legalFirstName:employee.legalFirstName,legalSurname:employee.legalSurname,
      grossPayPounds:penceToPounds(result.grossPayPence),taxForPeriodPounds:penceToPounds(result.tax.taxForPeriodPence),
      employeeNiPounds:penceToPounds(result.ni.employeeNiPeriodPence),employerNiPounds:penceToPounds(result.employerNiPence),
      studentLoanPounds:penceToPounds(result.totalStudentLoanPence),netPayPounds:penceToPounds(result.netPayPence),
      totalDeductionsPounds:penceToPounds(result.totalEmployeeDeductionsPence),taxCode:employee.taxCode!,niCategory:employee.niCategory!,
      periodNumber,taxYear:dto.taxYear,calculationStatus:result.overallStatus,warnings:result.warnings};
    const after: EmploymentYtd = {lastPeriodNumber:periodNumber,grossPayToDatePence:before.grossPayToDatePence+result.grossPayPence,
      taxPaidToDatePence:result.tax.taxPaidToDatePence,employeeNiToDatePence:result.ni.employeeNiToDatePence,employerNiToDatePence:result.ni.employerNiToDatePence,
      studentLoanToDatePence:before.studentLoanToDatePence+result.studentLoans.filter(loan=>loan.plan!=='pg').reduce((sum,loan)=>sum+loan.deductionPence,0),
      pgLoanToDatePence:before.pgLoanToDatePence+result.studentLoans.filter(loan=>loan.plan==='pg').reduce((sum,loan)=>sum+loan.deductionPence,0),
      niableEarningsToDatePence:before.niableEarningsToDatePence+result.grossPayPence};
    snapshots.push({employeeId,result,before,after,opening,display}); dto.employeeResults.push(display);
  }
  if (!dto.issues.length && dto.employeeResults.length === employeeIds.length) { dto.status='ready'; dto.totals=totals(dto.employeeResults); }
  const byId=<T extends {id:string}>(rows:T[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
  const inputHash=createHash('sha256').update(JSON.stringify({policy:dto.rulesetVersion,rules,run:{id:run.id,companyId:run.companyId,settingsId:run.settingsId,periodStart:run.periodStart,periodEnd:run.periodEnd,paymentDate:run.intendedPaymentDate},settings,employees:byId(employees),terms:byId(terms),starters:byId(starters),enrolments:byId(enrolments),history:history.map(row=>row.id).sort(),lines:byId(lines)})).digest('hex');
  return {dto,inputHash,snapshots};
}
