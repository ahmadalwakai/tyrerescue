import { parseTaxCompanyProfile } from './tax-company-response';
import { parsePayrollSetup } from './payroll-readiness-response';
import type {
  CompanyRegistrationStatusDto, PayrollOverviewSummaryDto, TaxCapability,
  TaxPayrollOverviewDto,
} from '../types/tax-payroll';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICES = ['corporation_tax', 'vat', 'paye'];
const STATUSES = ['unknown', 'not_registered', 'registered'];
const CAPABILITIES = ['tax.read', 'tax.company.write', 'tax.audit.read', 'payroll.read',
  'payroll.settings.write', 'payroll.employee.write', 'payroll.draft.write', 'payroll.sensitive.read'];
const FREQUENCIES = ['weekly', 'fortnightly', 'four_weekly', 'monthly'];
const FLAGS = ['setupComplete', 'payrollAvailable', 'vatAvailable', 'corporationTaxAvailable',
  'documentsAvailable', 'submissionsAvailable'] as const;
const INVALID_OVERVIEW = 'Your company profile is saved, but the server returned an invalid Tax & Payroll overview. Please retry.';

export class TaxPayrollOverviewResponseError extends Error {
  constructor() { super(INVALID_OVERVIEW); this.name = 'TaxPayrollOverviewResponseError'; }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function fail(): never { throw new TaxPayrollOverviewResponseError(); }
function nullableDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)));
}
function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parsePayrollSummary(value: unknown): PayrollOverviewSummaryDto | null {
  if (value === null) return null;
  const row = record(value);
  if (!row || typeof row.isActivated !== 'boolean'
    || !(row.payFrequency === null || (typeof row.payFrequency === 'string' && FREQUENCIES.includes(row.payFrequency)))
    || !(row.scheduleLabel === null || (typeof row.scheduleLabel === 'string' && row.scheduleLabel.length <= 1000))
    || !nonnegativeInteger(row.activeEmployeeCount) || !nonnegativeInteger(row.draftRunCount)
    || !(row.settingsVersion === null || (Number.isSafeInteger(row.settingsVersion) && (row.settingsVersion as number) >= 1))) fail();
  return {
    isActivated: row.isActivated,
    payFrequency: row.payFrequency as PayrollOverviewSummaryDto['payFrequency'],
    scheduleLabel: row.scheduleLabel as string | null,
    activeEmployeeCount: row.activeEmployeeCount,
    draftRunCount: row.draftRunCount,
    settingsVersion: row.settingsVersion as number | null,
  };
}

export function isTaxOverviewCompanyId(value: string): boolean { return UUID.test(value); }

/** Never let a deployment HTML page or partial JSON reach the status renderer. */
export function parseTaxPayrollOverview(value: unknown, requestedCompanyId: string): TaxPayrollOverviewDto {
  const raw = record(value);
  if (!raw || !isTaxOverviewCompanyId(requestedCompanyId)
    || !FLAGS.every((key) => typeof raw[key] === 'boolean')
    || !Array.isArray(raw.registrationStatuses) || raw.registrationStatuses.length !== SERVICES.length
    || !Array.isArray(raw.capabilities) || raw.capabilities.length > CAPABILITIES.length
    || !raw.capabilities.every((capability) => typeof capability === 'string' && CAPABILITIES.includes(capability))
    || new Set(raw.capabilities).size !== raw.capabilities.length) fail();
  let company;
  try { company = parseTaxCompanyProfile(raw.company); } catch { fail(); }
  if (company.id.toLowerCase() !== requestedCompanyId.toLowerCase()) fail();
  const registrationStatuses: CompanyRegistrationStatusDto[] = raw.registrationStatuses.map((value: unknown) => {
    const row = record(value);
    if (!row || typeof row.taxService !== 'string' || !SERVICES.includes(row.taxService)
      || typeof row.status !== 'string' || !STATUSES.includes(row.status) || !nullableDate(row.declaredAt)) fail();
    return { taxService: row.taxService as CompanyRegistrationStatusDto['taxService'],
      status: row.status as CompanyRegistrationStatusDto['status'], declaredAt: row.declaredAt };
  });
  if (new Set(registrationStatuses.map((row) => row.taxService)).size !== SERVICES.length) fail();
  const payrollSummary = parsePayrollSummary(raw.payrollSummary);
  if (raw.payrollAvailable !== (payrollSummary?.isActivated ?? false)) fail();
  const payrollSetup = raw.payrollSetup === undefined ? undefined : parsePayrollSetup(raw.payrollSetup);
  if (payrollSetup && (payrollSetup.canRead !== (payrollSetup.state === 'active' && raw.capabilities.includes('payroll.read'))
    || payrollSetup.canEditSettings !== (payrollSetup.state === 'active' && raw.capabilities.includes('payroll.settings.write'))
    || (payrollSetup.canActivate && !raw.capabilities.includes('tax.company.write'))
    || (payrollSetup.state === 'active') !== raw.payrollAvailable
    || (payrollSetup.state === 'not_activated' && payrollSummary?.isActivated))) fail();
  return {
    company, registrationStatuses, payrollSummary,
    capabilities: raw.capabilities as TaxCapability[],
    setupComplete: raw.setupComplete as boolean,
    payrollAvailable: raw.payrollAvailable as boolean,
    vatAvailable: raw.vatAvailable as boolean,
    corporationTaxAvailable: raw.corporationTaxAvailable as boolean,
    documentsAvailable: raw.documentsAvailable as boolean,
    submissionsAvailable: raw.submissionsAvailable as boolean,
    ...(payrollSetup ? { payrollSetup } : {}),
  };
}

export function taxPayrollOverviewRequestError(error: unknown): string {
  const status = record(error)?.status;
  if (status === 404 || status === 405) {
    return 'Your company profile is saved, but this overview could not be opened. Return to Tax & Payroll and check your company access before retrying.';
  }
  if (error instanceof TaxPayrollOverviewResponseError) return error.message;
  return 'Your company profile is saved, but its Tax & Payroll overview could not be loaded. Please retry.';
}
