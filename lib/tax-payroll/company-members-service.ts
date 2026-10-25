import 'server-only';

import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payrollSettings, taxCompanyEntities, taxCompanyMemberships, taxAuditEvents, users } from '@/lib/db/schema';
import { ALL_PAYROLL_CAPABILITIES } from './permissions';
import { withTaxWriteTransaction } from './write-transaction';

export const companyMemberChangeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  action: z.enum(['grant_payroll', 'revoke']),
}).strict();

export class CompanyMemberError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'NOT_ACTIVATED') { super(message); }
}

export async function listCompanyMembers(actorUserId: string, companyId: string) {
  const [company] = await db.select().from(taxCompanyEntities).where(eq(taxCompanyEntities.id, companyId)).limit(1);
  const [ownMembership] = await db.select().from(taxCompanyMemberships).where(and(
    eq(taxCompanyMemberships.companyId, companyId), eq(taxCompanyMemberships.userId, actorUserId),
  )).limit(1);
  if (!company || !ownMembership?.capabilities.includes('tax.read')) throw new CompanyMemberError('Company not found.', 'NOT_FOUND');
  if (company.createdByUserId !== actorUserId) return { canManage: false, members: [] };
  const rows = await db.select({ userId: users.id, name: users.name, email: users.email,
    capabilities: taxCompanyMemberships.capabilities })
    .from(taxCompanyMemberships).innerJoin(users, eq(users.id, taxCompanyMemberships.userId))
    .where(eq(taxCompanyMemberships.companyId, companyId)).orderBy(users.name);
  return { canManage: true, members: rows.map((row) => ({ ...row, isFounder: row.userId === company.createdByUserId })) };
}

export async function changeCompanyMember(actorUserId: string, companyId: string, input: z.infer<typeof companyMemberChangeSchema>) {
  await withTaxWriteTransaction(async (tx) => {
    const [company] = await tx.select().from(taxCompanyEntities).where(eq(taxCompanyEntities.id, companyId)).for('update');
    const [actorMembership] = await tx.select().from(taxCompanyMemberships).where(and(
      eq(taxCompanyMemberships.companyId, companyId), eq(taxCompanyMemberships.userId, actorUserId),
    )).limit(1);
    if (!company || company.createdByUserId !== actorUserId || !actorMembership?.capabilities.includes('tax.company.write')) {
      throw new CompanyMemberError('Company not found.', 'NOT_FOUND');
    }
    const targets = await tx.select({ id: users.id }).from(users).where(and(
      sql`lower(${users.email}) = ${input.email}`,
      input.action === 'grant_payroll' ? eq(users.role, 'admin') : undefined,
      input.action === 'grant_payroll' ? eq(users.emailVerified, true) : undefined,
    )).limit(2);
    if (targets.length !== 1) throw new CompanyMemberError('Use the email of an existing verified administrator.', 'VALIDATION_ERROR');
    const target = targets[0];
    if (target.id === company.createdByUserId) throw new CompanyMemberError('The company founder cannot be removed or replaced.', 'VALIDATION_ERROR');
    const [membership] = await tx.select().from(taxCompanyMemberships).where(and(
      eq(taxCompanyMemberships.companyId, companyId), eq(taxCompanyMemberships.userId, target.id),
    )).for('update');
    if (input.action === 'revoke') {
      if (!membership) return;
      await tx.delete(taxCompanyMemberships).where(eq(taxCompanyMemberships.id, membership.id));
    } else {
      const [settings] = await tx.select({ id: payrollSettings.id }).from(payrollSettings)
        .where(eq(payrollSettings.companyId, companyId)).limit(1);
      if (!settings) throw new CompanyMemberError('Activate payroll before granting payroll access.', 'NOT_ACTIVATED');
      const capabilities = [...new Set([...(membership?.capabilities ?? []), 'tax.read', 'tax.audit.read', ...ALL_PAYROLL_CAPABILITIES])];
      await tx.insert(taxCompanyMemberships).values({ companyId, userId: target.id, capabilities, grantedByUserId: actorUserId })
        .onConflictDoUpdate({ target: [taxCompanyMemberships.companyId, taxCompanyMemberships.userId], set: { capabilities, grantedByUserId: actorUserId } });
    }
    await tx.insert(taxAuditEvents).values({ companyId, actorUserId,
      eventType: input.action === 'revoke' ? 'company_member_revoked' : 'company_payroll_access_granted',
      payload: { targetUserId: target.id, action: input.action } });
  });
  return listCompanyMembers(actorUserId, companyId);
}
