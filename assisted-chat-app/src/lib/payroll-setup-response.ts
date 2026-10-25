import type { EmployeeDetailDto, EmployeeSummaryDto, PayTermsDto, PayrollRunSummaryDto, PayrollSettingsDto, TaxApiError } from '../types/tax-payroll';
import { parsePayrollEmployees } from './payroll-workspace-response';
import { isTaxDate, taxRecord, taxRequestMessage, TAX_UUID } from './tax-input';

const fail = (): never => { throw new Error('The payroll response could not be verified. Refresh to check whether your changes were saved.'); };
const id = (value: unknown): value is string => typeof value === 'string' && TAX_UUID.test(value);
const version = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const string = (value: unknown) => typeof value === 'string' && value.length <= 2000;
const nullableString = (value: unknown) => value === null || string(value);
const dateTime = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableDate = (value: unknown) => value === null || isTaxDate(value);
const money = (value: unknown) => typeof value === 'string' && /^\d{1,12}(\.\d{1,4})?$/.test(value);
const frequencies = ['weekly','fortnightly','four_weekly','monthly'];

export function parsePayrollSettings(value: unknown, companyId: string): PayrollSettingsDto {
  const row = taxRecord(value);
  if (!row || !id(row.id) || !id(companyId) || row.companyId !== companyId || !version(row.version)
    || !string(row.scheduleLabel) || !String(row.scheduleLabel).trim() || !frequencies.includes(String(row.payFrequency))
    || !nullableDate(row.scheduleAnchorDate) || !(row.monthlyPayDay === null || (Number.isInteger(row.monthlyPayDay)
      && (row.monthlyPayDay === -1 || (Number(row.monthlyPayDay) >= 1 && Number(row.monthlyPayDay) <= 28))))
    || row.timezone !== 'Europe/London' || !id(row.activatedByUserId) || !dateTime(row.createdAt) || !dateTime(row.updatedAt)
    || (row.payFrequency === 'monthly' ? row.monthlyPayDay === null : row.scheduleAnchorDate === null)) fail();
  return row as unknown as PayrollSettingsDto;
}

export function parsePayrollEmployeeSummary(value: unknown, companyId: string): EmployeeSummaryDto {
  const row = taxRecord(value);
  if (!row || !id(row.id) || !id(companyId) || row.companyId !== companyId || !version(row.version)
    || !string(row.legalFirstName) || !String(row.legalFirstName).trim() || !string(row.legalSurname) || !String(row.legalSurname).trim()
    || !nullableString(row.employeeReference) || !isTaxDate(row.employmentStartDate) || !nullableDate(row.employmentEndDate)
    || typeof row.isDirector !== 'boolean' || !['active','left','suspended'].includes(String(row.employeeStatus))
    || !dateTime(row.createdAt) || !dateTime(row.updatedAt)) fail();
  return row as unknown as EmployeeSummaryDto;
}
export function parsePayrollEmployeeList(value: unknown, companyId: string): EmployeeSummaryDto[] {
  const rows = parsePayrollEmployees(value).map(row => parsePayrollEmployeeSummary(row,companyId));
  if (new Set(rows.map(row => row.id)).size !== rows.length) fail();
  return rows;
}

export function parsePayrollPayTerms(value: unknown, companyId: string, employeeId: string): PayTermsDto {
  const row=taxRecord(value);
  if (!row || !id(row.id) || row.companyId !== companyId || !id(companyId) || row.employeeId !== employeeId || !id(employeeId)
    || !version(row.version) || !['hourly','fixed_period'].includes(String(row.payBasis)) || row.currency !== 'GBP'
    || !frequencies.includes(String(row.payFrequency)) || !isTaxDate(row.effectiveFrom) || !nullableDate(row.effectiveTo)
    || (row.effectiveTo !== null && String(row.effectiveTo) < String(row.effectiveFrom)) || !dateTime(row.createdAt)
    || ![row.annualSalaryNote,row.contractedHoursPerWeek].every(value=>value===null||money(value)) || !nullableString(row.sourceNote)
    || (row.payBasis === 'hourly' ? !money(row.hourlyRate) || row.fixedPeriodGross !== null : !money(row.fixedPeriodGross) || row.hourlyRate !== null)) fail();
  return row as unknown as PayTermsDto;
}
export function parsePayrollPayTermsList(value: unknown, companyId: string, employeeId: string): PayTermsDto[] {
  const row=taxRecord(value);
  if (!row || !Array.isArray(row.payTerms)) fail();
  const terms=(row!.payTerms as unknown[]).map(value=>parsePayrollPayTerms(value,companyId,employeeId));
  if (new Set(terms.map(value=>value.id)).size !== terms.length) fail();
  return terms;
}

export function parsePayrollEmployee(value: unknown, companyId: string, employeeId?: string): EmployeeDetailDto {
  const employee=parsePayrollEmployeeSummary(value,companyId);
  const row=taxRecord(value)!;
  if ((employeeId !== undefined && employee.id !== employeeId)
    || !['addressLine1','addressLine2','addressCity','addressPostcode','taxCode','niCategory','payrollIdMigrationRef'].every(key=>nullableString(row[key]))
    || !(row.taxCodeBasis===null||['cumulative','week1_month1'].includes(String(row.taxCodeBasis)))
    || !(row.taxCodeSource===null||['p45','starter_checklist','hmrc_notification'].includes(String(row.taxCodeSource)))
    || !nullableDate(row.taxCodeEffectiveDate) || !(row.linkedUserId===null||id(row.linkedUserId))
    || !(row.dateOfBirth===undefined||nullableDate(row.dateOfBirth)) || !(row.ninoMasked===undefined||nullableString(row.ninoMasked))) fail();
  if (row.currentPayTerms !== null) parsePayrollPayTerms(row.currentPayTerms,companyId,employee.id);
  return row as unknown as EmployeeDetailDto;
}

export function parsePayrollRunSummary(value: unknown, companyId: string): PayrollRunSummaryDto {
  const row=taxRecord(value);
  if (!row || !id(row.id) || row.companyId!==companyId || !id(companyId) || !version(row.version)
    || ![row.periodStart,row.periodEnd,row.intendedPaymentDate].every(isTaxDate) || String(row.periodEnd)<String(row.periodStart)
    || !['draft','cancelled','submitted_for_review','approved','finalised'].includes(String(row.runStatus))
    || !Number.isSafeInteger(row.employeeCount) || Number(row.employeeCount)<0 || !dateTime(row.createdAt)
    || !(row.latestPreview===null||taxRecord(row.latestPreview))) fail();
  if (row!.latestPreview !== null) {
    const preview=taxRecord(row!.latestPreview)!;
    if (!id(preview.id) || preview.runId!==row!.id || preview.companyId!==companyId
      || !['complete','partial','blocked'].includes(String(preview.completenessState))
      || ![preview.grossTotal,preview.supportedSubtotal].every(value=>value===null||money(value))
      || typeof preview.hasUnsupportedLines!=='boolean' || !Array.isArray(preview.perEmployeeResults)
      || preview.taxNotCalculated!==true || preview.netPayNotCalculated!==true || !dateTime(preview.calculatedAt)) fail();
  }
  return row as unknown as PayrollRunSummaryDto;
}
export function parsePayrollRunList(value: unknown, companyId: string): PayrollRunSummaryDto[] {
  const row=taxRecord(value); if (!row||!Array.isArray(row.runs)) fail();
  const runs=(row!.runs as unknown[]).map(value=>parsePayrollRunSummary(value,companyId));
  if (new Set(runs.map(row=>row.id)).size!==runs.length) fail();
  return runs;
}

/** A valid existing object is not proof that the submitted fields were saved. */
export function assertPayrollSavedFields(saved: object, input: object, excluded: string[] = []): void {
  const row=saved as Record<string,unknown>;
  for (const [key,value] of Object.entries(input)) {
    if (['expectedVersion','idempotencyKey','nino',...excluded].includes(key) || value===undefined) continue;
    if (typeof value==='string' && typeof row[key]==='string') {
      if (/Rate|Gross|Amount|Hours/.test(key) && money(value) && money(row[key])) {
        if (Number(value)!==Number(row[key])) fail();
      } else if (value.trim()!==String(row[key]).trim()) fail();
    } else if (value!==row[key]) fail();
  }
}

export function payrollSetupError(error: unknown): TaxApiError {
  const raw=taxRecord(error); const details=taxRecord(raw?.details); const fields=taxRecord(details?.fieldErrors);
  return {error:taxRequestMessage(error),code:typeof details?.code==='string'?details.code:'INTERNAL',
    ...(fields && Object.values(fields).every(value=>typeof value==='string')?{fieldErrors:fields as Record<string,string>}:{})};
}
