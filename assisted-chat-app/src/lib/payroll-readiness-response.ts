import { taxRecord } from './tax-input';
import type { PayrollSetupDto } from '../types/tax-payroll';

/** This is a server permission decision, never inferred from a generic 404. */
export function parsePayrollSetup(value: unknown): PayrollSetupDto {
  const row = taxRecord(value);
  if (!row || !['not_activated', 'active', 'restricted'].includes(String(row.state))
    || typeof row.canActivate !== 'boolean' || typeof row.canRead !== 'boolean' || typeof row.canEditSettings !== 'boolean'
    || (row.canActivate && row.state !== 'not_activated')
    || (row.state === 'not_activated' && row.canRead)
    || (row.canEditSettings && (row.state !== 'active' || !row.canRead))
    || (row.state === 'active' && !row.canRead)
    || (row.state === 'restricted' && (row.canActivate || row.canRead || row.canEditSettings))) {
    throw new Error('The server did not confirm payroll setup permissions. Refresh Tax & Payroll before continuing.');
  }
  return row as unknown as PayrollSetupDto;
}

export function inactivePayrollResponse(error: unknown): PayrollSetupDto | null {
  const raw = taxRecord(error); const details = taxRecord(raw?.details);
  if (raw?.status !== 404 || !details || details.error !== 'Payroll not activated'
    || !['NOT_FOUND', 'PAYROLL_NOT_ACTIVATED'].includes(String(details.code))) return null;
  const setup = parsePayrollSetup(details.payrollSetup);
  if (setup.state !== 'not_activated') throw new Error('Payroll activation status could not be verified. Refresh before continuing.');
  return setup;
}
