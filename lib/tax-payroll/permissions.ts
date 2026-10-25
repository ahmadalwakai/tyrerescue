import 'server-only';

import { db } from '@/lib/db';
import { taxCompanyMemberships } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { TaxCapability } from './contracts';

// Fetch the capability list for a user on a specific company.
// Returns null if the user has no membership record.
export async function getMemberCapabilities(
  userId: string,
  companyId: string,
): Promise<TaxCapability[] | null> {
  const [row] = await db
    .select({ capabilities: taxCompanyMemberships.capabilities })
    .from(taxCompanyMemberships)
    .where(
      and(
        eq(taxCompanyMemberships.userId, userId),
        eq(taxCompanyMemberships.companyId, companyId),
      ),
    )
    .limit(1);

  if (!row) return null;
  return (row.capabilities ?? []) as TaxCapability[];
}

// Returns true when the member holds every required capability.
export function hasCapabilities(
  memberCaps: TaxCapability[],
  required: TaxCapability[],
): boolean {
  return required.every((cap) => memberCaps.includes(cap));
}

// Convenience check: can the user read company data?
export async function canReadCompany(userId: string, companyId: string): Promise<boolean> {
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps) return false;
  return hasCapabilities(caps, ['tax.read']);
}

// Convenience check: can the user write company profile fields?
export async function canWriteCompany(userId: string, companyId: string): Promise<boolean> {
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps) return false;
  return hasCapabilities(caps, ['tax.read', 'tax.company.write']);
}

// Full capability set granted to the founding member.
export const FOUNDER_CAPABILITIES: TaxCapability[] = [
  'tax.read',
  'tax.company.write',
  'tax.audit.read',
];

// Payroll capabilities: only granted on explicit activation by the founder.
// These are NEVER added to FOUNDER_CAPABILITIES automatically.
export const ALL_PAYROLL_CAPABILITIES: TaxCapability[] = [
  'payroll.read',
  'payroll.settings.write',
  'payroll.employee.write',
  'payroll.draft.write',
  'payroll.sensitive.read',
];

export async function canReadPayroll(userId: string, companyId: string): Promise<boolean> {
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps) return false;
  return hasCapabilities(caps, ['payroll.read']);
}

export async function canWritePayrollSettings(userId: string, companyId: string): Promise<boolean> {
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps) return false;
  return hasCapabilities(caps, ['payroll.read', 'payroll.settings.write']);
}

export async function canWriteEmployee(userId: string, companyId: string): Promise<boolean> {
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps) return false;
  return hasCapabilities(caps, ['payroll.read', 'payroll.employee.write']);
}

export async function canWriteDraft(userId: string, companyId: string): Promise<boolean> {
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps) return false;
  return hasCapabilities(caps, ['payroll.read', 'payroll.draft.write']);
}

export async function canReadSensitive(userId: string, companyId: string): Promise<boolean> {
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps) return false;
  return hasCapabilities(caps, ['payroll.read', 'payroll.sensitive.read']);
}
