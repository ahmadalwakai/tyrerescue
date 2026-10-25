import 'server-only';

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { PayrollSetupDto } from './contracts';

/** Company-scoped readiness only. Never loads employees, amounts or settings. */
export async function getCompanyPayrollSetup(userId: string, companyId: string): Promise<PayrollSetupDto | null> {
  if (!z.string().uuid().safeParse(companyId).success) return null;
  const result = await db.execute(sql`
    SELECT c.created_by_user_id = ${userId}::uuid AS "isFounder",
      EXISTS (SELECT 1 FROM payroll_settings s WHERE s.company_id = c.id) AS activated,
      m.capabilities ? 'tax.read' AS "canReadCompany",
      m.capabilities ? 'tax.company.write' AS "canWriteCompany",
      m.capabilities ? 'payroll.read' AS "hasPayrollRead",
      m.capabilities ? 'payroll.settings.write' AS "hasSettingsWrite"
    FROM tax_company_entities c
    JOIN tax_company_memberships m ON m.company_id = c.id AND m.user_id = ${userId}::uuid
    WHERE c.id = ${companyId}::uuid
      AND (m.capabilities ? 'tax.read' OR m.capabilities ? 'payroll.read')
    LIMIT 1
  `);
  const row = result.rows[0] as undefined | {
    isFounder: boolean; activated: boolean; canReadCompany: boolean; canWriteCompany: boolean;
    hasPayrollRead: boolean; hasSettingsWrite: boolean;
  };
  if (!row) return null;
  const canRead = row.activated && row.hasPayrollRead;
  return {
    state: row.activated ? canRead ? 'active' : 'restricted' : 'not_activated',
    canActivate: !row.activated && row.isFounder && row.canReadCompany && row.canWriteCompany,
    canRead,
    canEditSettings: canRead && row.hasSettingsWrite,
  };
}
