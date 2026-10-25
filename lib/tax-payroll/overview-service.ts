import 'server-only';

import { db } from '@/lib/db';
import { payrollSettings, payrollEmployees, payrollRuns } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { getCompanyById, getRegistrationStatuses } from './company-service';
import { getMemberCapabilities, hasCapabilities } from './permissions';
import { getCompanyPayrollSetup } from './payroll-setup-service';
import type {
  TaxPayrollOverviewDto,
  CompanyRegistrationStatusDto,
  TaxCapability,
  TaxService,
  RegistrationStatus,
  PayrollOverviewSummaryDto,
} from './contracts';

export async function getTaxPayrollOverview(
  userId: string,
  companyId: string,
): Promise<TaxPayrollOverviewDto | null> {
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps || !hasCapabilities(caps, ['tax.read'])) return null;

  const [company, statusRows, payrollSetup] = await Promise.all([
    getCompanyById(companyId),
    getRegistrationStatuses(companyId),
    getCompanyPayrollSetup(userId, companyId),
  ]);

  if (!company || !payrollSetup) return null;

  const registrationStatuses: CompanyRegistrationStatusDto[] = statusRows.map((row) => ({
    taxService: row.taxService as TaxService,
    status: row.status as RegistrationStatus,
    declaredAt: row.declaredAt ? row.declaredAt.toISOString() : null,
  }));

  // Pad missing service rows with unknown
  const present = new Set(registrationStatuses.map((r) => r.taxService));
  const ALL_SERVICES: TaxService[] = ['corporation_tax', 'vat', 'paye'];
  for (const svc of ALL_SERVICES) {
    if (!present.has(svc)) {
      registrationStatuses.push({ taxService: svc, status: 'unknown', declaredAt: null });
    }
  }

  const setupComplete =
    Boolean(company.registeredAddressLine1) &&
    Boolean(company.registeredCity) &&
    Boolean(company.registeredPostcode);

  // Build payroll summary if the user can read payroll
  let payrollSummary: PayrollOverviewSummaryDto | null = null;
  const canReadPayroll = payrollSetup.canRead;

  if (canReadPayroll) {
    const [settings] = await db
      .select()
      .from(payrollSettings)
      .where(eq(payrollSettings.companyId, companyId))
      .limit(1);

    if (settings) {
      const [activeEmpCountRow] = await db
        .select({ value: count() })
        .from(payrollEmployees)
        .where(
          and(
            eq(payrollEmployees.companyId, companyId),
            eq(payrollEmployees.employeeStatus, 'active'),
          ),
        );

      const [draftRunCountRow] = await db
        .select({ value: count() })
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.companyId, companyId),
            eq(payrollRuns.runStatus, 'draft'),
          ),
        );

      payrollSummary = {
        isActivated: true,
        payFrequency: settings.payFrequency as PayrollOverviewSummaryDto['payFrequency'],
        scheduleLabel: settings.scheduleLabel,
        activeEmployeeCount: activeEmpCountRow?.value ?? 0,
        draftRunCount: draftRunCountRow?.value ?? 0,
        settingsVersion: settings.version,
      };
    } else {
      payrollSummary = {
        isActivated: false,
        payFrequency: null,
        scheduleLabel: null,
        activeEmployeeCount: 0,
        draftRunCount: 0,
        settingsVersion: null,
      };
    }
  }

  return {
    company,
    setupComplete,
    registrationStatuses,
    capabilities: caps as TaxCapability[],
    payrollAvailable: payrollSummary?.isActivated ?? false,
    payrollSummary,
    payrollSetup,
    vatAvailable: false,
    corporationTaxAvailable: false,
    documentsAvailable: false,
    submissionsAvailable: false,
  };
}
