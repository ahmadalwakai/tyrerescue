import { isTaxDate, taxRecord, TAX_UUID } from './tax-input';

export const payrollOpeningFields = ['openingYtdGrossPay', 'openingYtdTaxPaid', 'openingYtdNiEmployee',
  'openingYtdNiEmployer', 'openingYtdStudentLoanDeductions', 'openingYtdPensionEmployee', 'openingYtdPensionEmployer'] as const;
const monetaryFields = [...payrollOpeningFields, 'p45TotalPayPrevEmployment', 'p45TotalTaxPrevEmployment'];
const id = (value: unknown): value is string => typeof value === 'string' && TAX_UUID.test(value);
const time = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableText = (value: unknown, maximum = 100) => value === null || (typeof value === 'string' && value.length <= maximum);
const oneOf = (value: unknown, allowed: string[]) => value === null || (typeof value === 'string' && allowed.includes(value));
const amount = (value: unknown) => value === null || (typeof value === 'string' && /^\d{1,9}(?:\.\d{1,4})?$/.test(value));
const fail = (): never => { throw new Error('The server response did not confirm these changes. Reload before retrying.'); };
const decimal = (value: unknown) => {
  if (value === null) return null;
  if (!amount(value) || typeof value !== 'string') fail();
  const [whole, fraction = ''] = (value as string).split('.');
  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(4, '0')}`;
};

export type EmployeeTaxSetup = Record<string, unknown> & { employeeId: string; companyId: string; expectedVersion: number; isDirector: boolean };
export function parseEmployeeTaxSetup(value: unknown, companyId: string, employeeId: string): EmployeeTaxSetup {
  const setup = taxRecord(taxRecord(value)?.setup);
  if (!setup || !id(companyId) || !id(employeeId) || setup.companyId !== companyId || setup.employeeId !== employeeId
    || !Number.isSafeInteger(setup.expectedVersion) || Number(setup.expectedVersion) < 1 || typeof setup.isDirector !== 'boolean'
    || typeof setup.directorFullTaxYearConfirmed !== 'boolean'
    || !nullableText(setup.taxCode, 20) || !nullableText(setup.niCategory, 5)
    || !oneOf(setup.taxCodeBasis, ['cumulative', 'week1_month1'])
    || !oneOf(setup.taxCodeSource, ['p45', 'starter_checklist', 'hmrc_notification'])
    || !oneOf(setup.niMethod, ['periodic', 'director_annual']) || !oneOf(setup.pensionHandling, ['none_confirmed'])
    || !oneOf(setup.sourceType, ['p45', 'starter_checklist', 'none_confirmed', 'first_payroll_this_tax_year', 'current_employment_opening'])
    || !(setup.taxCodeEffectiveDate === null || isTaxDate(setup.taxCodeEffectiveDate))
    || !(setup.openingYtdEffectiveDate === null || isTaxDate(setup.openingYtdEffectiveDate))
    || !(setup.openingYtdTaxYear === null || (typeof setup.openingYtdTaxYear === 'string' && /^\d{4}-\d{2}$/.test(setup.openingYtdTaxYear)))
    || !monetaryFields.every((field) => amount(setup[field]))
    || !['incomplete', 'complete', 'verified'].includes(String(setup.openingYtdCompleteness))
    || !(setup.studentLoanPlans === null || (Array.isArray(setup.studentLoanPlans)
      && setup.studentLoanPlans.every((plan) => ['1', '2', '4', '5'].includes(String(plan)))
      && setup.studentLoanPlans.every((plan) => typeof plan === 'string')
      && new Set(setup.studentLoanPlans).size === setup.studentLoanPlans.length))
    || !(setup.postgraduateLoan === null || typeof setup.postgraduateLoan === 'boolean')
    || typeof setup.studentLoanUnknown !== 'boolean' || !(setup.recordedAt === null || time(setup.recordedAt))) fail();
  return setup as EmployeeTaxSetup;
}

export function assertEmployeeTaxSetupSaved(saved: EmployeeTaxSetup, before: EmployeeTaxSetup, input: Record<string, unknown>): void {
  if (saved.employeeId !== before.employeeId || saved.companyId !== before.companyId || saved.isDirector !== before.isDirector
    || input.expectedVersion !== before.expectedVersion || saved.expectedVersion !== before.expectedVersion + 1
    || saved.openingYtdCompleteness !== 'complete' || saved.studentLoanUnknown !== false || !time(saved.recordedAt)) fail();
  for (const field of ['taxCode', 'taxCodeBasis', 'taxCodeSource', 'taxCodeEffectiveDate', 'niCategory', 'niMethod',
    'sourceType', 'openingYtdTaxYear', 'openingYtdEffectiveDate', 'postgraduateLoan', 'studentLoanUnknown', 'pensionHandling', 'directorFullTaxYearConfirmed']) {
    if (saved[field] !== input[field]) fail();
  }
  for (const field of monetaryFields) if (decimal(saved[field]) !== decimal(input[field] ?? null)) fail();
  if (!Array.isArray(saved.studentLoanPlans) || !Array.isArray(input.studentLoanPlans)
    || [...saved.studentLoanPlans].sort().join(',') !== [...input.studentLoanPlans].sort().join(',')) fail();
}

/** Database amounts use scale four; remove only extra zeroes, never round pay history. */
export function editablePayrollSetupAmount(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) return value;
  const [whole, fraction = ''] = value.split('.');
  return /^0*$/.test(fraction.slice(2)) ? `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}` : value;
}

export interface CompanyPayrollMember { userId: string; name: string; email: string; capabilities: string[]; isFounder: boolean }
export interface CompanyPayrollAccess { canManage: boolean; members: CompanyPayrollMember[] }
export const grantedPayrollCapabilities = ['tax.read', 'tax.audit.read', 'payroll.read', 'payroll.settings.write',
  'payroll.employee.write', 'payroll.draft.write', 'payroll.sensitive.read'];
const knownCapabilities = [...grantedPayrollCapabilities, 'tax.company.write'];
export function parseCompanyPayrollAccess(value: unknown): CompanyPayrollAccess {
  const row = taxRecord(value);
  if (!row || typeof row.canManage !== 'boolean' || !Array.isArray(row.members)) fail();
  const members = row!.members as unknown[];
  for (const raw of members) {
    const member = taxRecord(raw);
    if (!member || !id(member.userId) || typeof member.name !== 'string' || member.name.length > 255
      || typeof member.email !== 'string' || member.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)
      || typeof member.isFounder !== 'boolean' || !Array.isArray(member.capabilities)
      || !member.capabilities.every((capability) => typeof capability === 'string' && knownCapabilities.includes(capability))
      || new Set(member.capabilities).size !== member.capabilities.length) fail();
  }
  const typed = members as CompanyPayrollMember[];
  if (new Set(typed.map((member) => member.userId)).size !== typed.length
    || new Set(typed.map((member) => member.email.toLowerCase())).size !== typed.length
    || (row!.canManage ? typed.filter((member) => member.isFounder).length !== 1 : typed.length !== 0)) fail();
  return row as unknown as CompanyPayrollAccess;
}

export function assertCompanyPayrollAccessSaved(saved: CompanyPayrollAccess, before: CompanyPayrollAccess, email: string, action: 'grant_payroll' | 'revoke'): void {
  const address = email.trim().toLowerCase();
  const founder = before.members.find((member) => member.isFounder);
  const savedFounder = saved.members.find((member) => member.isFounder);
  if (!before.canManage || !saved.canManage || !founder || !savedFounder || founder.userId !== savedFounder.userId
    || founder.email !== savedFounder.email || founder.capabilities.some((capability) => !savedFounder.capabilities.includes(capability))) fail();
  const existing = before.members.find((member) => member.email.toLowerCase() === address);
  if (existing?.isFounder) fail();
  const target = saved.members.find((member) => member.email.toLowerCase() === address);
  if (action === 'revoke') {
    if (!existing || target || saved.members.some((member) => member.userId === existing.userId)) fail();
  } else if (!target || target.isFounder || (existing && existing.userId !== target.userId)
    || grantedPayrollCapabilities.some((capability) => !target.capabilities.includes(capability))) fail();
}
