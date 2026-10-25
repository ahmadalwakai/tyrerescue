import 'server-only';

import { db } from '@/lib/db';
import { withTaxWriteTransaction } from './write-transaction';
import {
  payrollSettings,
  payrollSettingsRevisions,
  taxCompanyEntities,
  taxCompanyMemberships,
  type PayrollSettings,
  type NewPayrollSettings,
  type NewPayrollSettingsRevision,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ALL_PAYROLL_CAPABILITIES } from './permissions';
import { insertAuditEvent } from './audit-service';
import type { PayrollSettingsDto } from './contracts';
import type { ActivatePayrollInput, UpdatePayrollSettingsInput } from './validation';

// ─── Error type ───────────────────────────────────────────────────────────────

export class PayrollSettingsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'ALREADY_ACTIVATED'
      | 'NOT_ACTIVATED'
      | 'CONFLICT_VERSION'
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'VALIDATION_ERROR'
      | 'INTERNAL',
  ) {
    super(message);
    this.name = 'PayrollSettingsError';
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function settingsToDto(row: PayrollSettings): PayrollSettingsDto {
  return {
    id: row.id,
    companyId: row.companyId,
    scheduleLabel: row.scheduleLabel,
    payFrequency: row.payFrequency as PayrollSettingsDto['payFrequency'],
    scheduleAnchorDate: row.scheduleAnchorDate,
    monthlyPayDay: row.monthlyPayDay,
    timezone: row.timezone,
    version: row.version,
    activatedByUserId: row.activatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Activate payroll ─────────────────────────────────────────────────────────
// Only the company founder (taxCompanyEntities.createdByUserId === actorUserId)
// may activate payroll. This is verified server-side against the immutable
// createdByUserId field. Never trust a client-supplied creator ID.

export async function activatePayroll(
  actorUserId: string,
  companyId: string,
  input: ActivatePayrollInput,
): Promise<PayrollSettingsDto> {
  // 1. Verify actor is the company founder
  const [company] = await db
    .select({ createdByUserId: taxCompanyEntities.createdByUserId })
    .from(taxCompanyEntities)
    .where(eq(taxCompanyEntities.id, companyId))
    .limit(1);

  if (!company) throw new PayrollSettingsError('Company not found.', 'NOT_FOUND');
  if (company.createdByUserId !== actorUserId) {
    throw new PayrollSettingsError(
      'Only the company founder may activate payroll.',
      'FORBIDDEN',
    );
  }

  // 2. Check not already activated
  const [existing] = await db
    .select({ id: payrollSettings.id })
    .from(payrollSettings)
    .where(eq(payrollSettings.companyId, companyId))
    .limit(1);

  if (existing) {
    throw new PayrollSettingsError(
      'Payroll is already activated for this company.',
      'ALREADY_ACTIVATED',
    );
  }

  const insertValues: NewPayrollSettings = {
    companyId,
    scheduleLabel: input.scheduleLabel,
    payFrequency: input.payFrequency,
    scheduleAnchorDate: input.scheduleAnchorDate ?? null,
    monthlyPayDay: input.monthlyPayDay ?? null,
    timezone: input.timezone ?? 'Europe/London',
    version: 1,
    activatedByUserId: actorUserId,
  };

  let created: PayrollSettings | undefined;
  await withTaxWriteTransaction(async (tx) => {
    // Serialise activation for the same company. Payroll capabilities are
    // granted only by this explicit founder action, together with settings.
    const [lockedCompany] = await tx.select().from(taxCompanyEntities)
      .where(eq(taxCompanyEntities.id, companyId)).for('update');
    if (!lockedCompany || lockedCompany.createdByUserId !== actorUserId) {
      throw new PayrollSettingsError('Only the company founder may activate payroll.', 'FORBIDDEN');
    }
    const [activated] = await tx.select({ id: payrollSettings.id }).from(payrollSettings)
      .where(eq(payrollSettings.companyId, companyId)).limit(1);
    if (activated) throw new PayrollSettingsError('Payroll is already activated for this company.', 'ALREADY_ACTIVATED');

    const rows = await tx.insert(payrollSettings).values(insertValues).returning();
    created = rows[0] as PayrollSettings | undefined;
    if (!created) throw new PayrollSettingsError('Insert did not return a row.', 'INTERNAL');

    const [membership] = await tx.select().from(taxCompanyMemberships).where(and(
      eq(taxCompanyMemberships.companyId, companyId), eq(taxCompanyMemberships.userId, actorUserId),
    )).for('update');
    if (!membership) throw new PayrollSettingsError('Company membership not found.', 'FORBIDDEN');
    const capabilities = [...new Set([...(membership.capabilities ?? []), ...ALL_PAYROLL_CAPABILITIES])];
    await tx.update(taxCompanyMemberships).set({ capabilities })
      .where(eq(taxCompanyMemberships.id, membership.id));

    const revision: NewPayrollSettingsRevision = {
      settingsId: created.id,
      companyId,
      version: 1,
      snapshot: settingsToDto(created) as unknown as Record<string, unknown>,
      changedFields: Object.keys(insertValues).filter(
        (k) => k !== 'activatedByUserId' && (insertValues as Record<string, unknown>)[k] != null,
      ),
      changedByUserId: actorUserId,
    };
    await tx.insert(payrollSettingsRevisions).values(revision);

    await insertAuditEvent(tx, {
      companyId,
      eventType: 'payroll_activated',
      actorUserId,
      payload: {
        settingsId: created.id,
        payFrequency: created.payFrequency,
        scheduleLabel: created.scheduleLabel,
      },
    });
  });

  return settingsToDto(created!);
}

// ─── Get payroll settings ─────────────────────────────────────────────────────

export async function getPayrollSettings(companyId: string): Promise<PayrollSettingsDto | null> {
  const [row] = await db
    .select()
    .from(payrollSettings)
    .where(eq(payrollSettings.companyId, companyId))
    .limit(1);
  return row ? settingsToDto(row) : null;
}

// ─── Update payroll settings ──────────────────────────────────────────────────

export async function updatePayrollSettings(
  actorUserId: string,
  companyId: string,
  input: UpdatePayrollSettingsInput,
): Promise<PayrollSettingsDto> {
  return withTaxWriteTransaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(payrollSettings)
      .where(eq(payrollSettings.companyId, companyId))
      .limit(1);

    if (!current) throw new PayrollSettingsError('Payroll not activated for this company.', 'NOT_ACTIVATED');
    if (current.version !== input.expectedVersion) {
      throw new PayrollSettingsError(
        `Version conflict: expected ${input.expectedVersion}, found ${current.version}.`,
        'CONFLICT_VERSION',
      );
    }

    const editableFields = ['scheduleLabel', 'scheduleAnchorDate', 'monthlyPayDay', 'timezone'] as const;
    const patchValues: Record<string, unknown> = {};
    const changedFields: string[] = [];

    for (const field of editableFields) {
      if (!(field in input)) continue;
      const incoming = (input as Record<string, unknown>)[field];
      if (incoming === undefined) continue;
      const currentVal = (current as Record<string, unknown>)[field];
      if (incoming !== (currentVal ?? null)) {
        patchValues[field] = incoming;
        changedFields.push(field);
      }
    }

    if (changedFields.length === 0) return settingsToDto(current);

    if (current.payFrequency === 'monthly' && (patchValues.monthlyPayDay === null ||
      (!('monthlyPayDay' in patchValues) && current.monthlyPayDay === null))) {
      throw new PayrollSettingsError('A monthly pay day is required for this schedule.', 'VALIDATION_ERROR');
    }
    if (current.payFrequency !== 'monthly' && (patchValues.scheduleAnchorDate === null ||
      (!('scheduleAnchorDate' in patchValues) && current.scheduleAnchorDate === null))) {
      throw new PayrollSettingsError('An anchor date is required for this schedule.', 'VALIDATION_ERROR');
    }

    const newVersion = current.version + 1;
    const [updated] = await tx
      .update(payrollSettings)
      .set({ ...patchValues, version: newVersion, updatedAt: new Date() })
      .where(
        and(
          eq(payrollSettings.id, current.id),
          eq(payrollSettings.version, current.version),
        ),
      )
      .returning();

    if (!updated) {
      throw new PayrollSettingsError('Version conflict: concurrent update.', 'CONFLICT_VERSION');
    }

    const revision: NewPayrollSettingsRevision = {
      settingsId: current.id,
      companyId,
      version: newVersion,
      snapshot: settingsToDto(updated) as unknown as Record<string, unknown>,
      changedFields,
      changedByUserId: actorUserId,
    };
    await tx.insert(payrollSettingsRevisions).values(revision);

    await insertAuditEvent(tx, {
      companyId,
      eventType: 'payroll_settings_updated',
      actorUserId,
      payload: { changedFields, newVersion },
    });

    return settingsToDto(updated);
  });
}
