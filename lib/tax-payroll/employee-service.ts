import 'server-only';

import { db } from '@/lib/db';
import { withTaxWriteTransaction } from './write-transaction';
import {
  payrollEmployees,
  payrollEmployeeSensitive,
  payrollEmployeeRevisions,
  payrollIdempotencyKeys,
  payrollPayTerms,
  type PayrollEmployee,
  type NewPayrollEmployee,
  type NewPayrollEmployeeSensitive,
  type NewPayrollEmployeeRevision,
  type PayrollPayTerms,
} from '@/lib/db/schema';
import { eq, and, isNull, or, lte, gte, sql } from 'drizzle-orm';
import { encryptField, decryptField, maskNino, isEncryptedField, CURRENT_ENCRYPTION_KEY_VERSION } from './field-encryption';
import { insertAuditEvent } from './audit-service';
import { createHash } from 'crypto';
import type { EmployeeSummaryDto, EmployeeDetailDto, EmployeeSensitiveDto, PayTermsDto } from './contracts';
import type { CreateEmployeeInput, UpdateEmployeeInput } from './validation';

// ─── Error type ───────────────────────────────────────────────────────────────

export class EmployeeServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONFLICT_DUPLICATE' | 'CONFLICT_VERSION' | 'NOT_FOUND' | 'INTERNAL' | 'ENCRYPTION_UNAVAILABLE',
  ) {
    super(message);
    this.name = 'EmployeeServiceError';
  }
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function employeeToSummaryDto(row: PayrollEmployee): EmployeeSummaryDto {
  return {
    id: row.id,
    companyId: row.companyId,
    legalFirstName: row.legalFirstName,
    legalSurname: row.legalSurname,
    employeeReference: row.employeeReference,
    employmentStartDate: row.employmentStartDate,
    employmentEndDate: row.employmentEndDate,
    isDirector: row.isDirector,
    employeeStatus: row.employeeStatus as EmployeeSummaryDto['employeeStatus'],
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function payTermsToDto(row: PayrollPayTerms): PayTermsDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    companyId: row.companyId,
    payBasis: row.payBasis as PayTermsDto['payBasis'],
    hourlyRate: row.hourlyRate,
    fixedPeriodGross: row.fixedPeriodGross,
    currency: row.currency,
    annualSalaryNote: row.annualSalaryNote,
    payFrequency: row.payFrequency as PayTermsDto['payFrequency'],
    contractedHoursPerWeek: row.contractedHoursPerWeek,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    sourceNote: row.sourceNote,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildDetailDto(
  row: PayrollEmployee,
  currentPayTerms: PayTermsDto | null,
  sensitiveFields?: { dateOfBirth?: string | null; ninoMasked?: string | null },
): EmployeeDetailDto {
  const summary = employeeToSummaryDto(row);
  return {
    ...summary,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    addressCity: row.addressCity,
    addressPostcode: row.addressPostcode,
    taxCode: row.taxCode,
    taxCodeBasis: (row.taxCodeBasis as EmployeeDetailDto['taxCodeBasis']) ?? null,
    taxCodeEffectiveDate: row.taxCodeEffectiveDate,
    taxCodeSource: (row.taxCodeSource as EmployeeDetailDto['taxCodeSource']) ?? null,
    niCategory: row.niCategory,
    dateOfBirth: sensitiveFields ? sensitiveFields.dateOfBirth : undefined,
    ninoMasked: sensitiveFields ? sensitiveFields.ninoMasked : undefined,
    linkedUserId: row.linkedUserId,
    payrollIdMigrationRef: row.payrollIdMigrationRef,
    currentPayTerms,
  };
}

// ─── Current pay terms helper ─────────────────────────────────────────────────

async function getCurrentPayTerms(employeeId: string): Promise<PayTermsDto | null> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(payrollPayTerms)
    .where(
      and(
        eq(payrollPayTerms.employeeId, employeeId),
        lte(payrollPayTerms.effectiveFrom, today),
        or(
          isNull(payrollPayTerms.effectiveTo),
          gte(payrollPayTerms.effectiveTo, today),
        ),
      ),
    )
    .orderBy(sql`${payrollPayTerms.effectiveFrom} DESC`)
    .limit(1);
  return rows[0] ? payTermsToDto(rows[0]) : null;
}

// ─── Create employee ──────────────────────────────────────────────────────────

export async function createEmployee(
  actorUserId: string,
  companyId: string,
  input: CreateEmployeeInput,
): Promise<EmployeeDetailDto> {
  // Idempotency: if key provided and already exists for same payload, return the stored result
  if (input.idempotencyKey) {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ companyId, ...input }))
      .digest('hex');
    const [existing] = await db
      .select()
      .from(payrollIdempotencyKeys)
      .where(
        and(
          eq(payrollIdempotencyKeys.companyId, companyId),
          eq(payrollIdempotencyKeys.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new EmployeeServiceError(
          'Idempotency key reused with a different payload.',
          'CONFLICT_DUPLICATE',
        );
      }
      if (existing.resultId) {
        const emp = await getEmployee(companyId, existing.resultId, false);
        if (emp) return emp;
      }
    }
  }

  // Encrypt NINO before entering transaction
  let ninoEncrypted: string | null = null;
  if (input.nino) {
    try {
      ninoEncrypted = encryptField(input.nino);
    } catch {
      throw new EmployeeServiceError(
        'NINO encryption is unavailable. Configure PAYROLL_FIELD_ENCRYPTION_KEY before storing National Insurance numbers.',
        'ENCRYPTION_UNAVAILABLE',
      );
    }
  }

  const newEmployee = await withTaxWriteTransaction(async (tx) => {
    if (input.idempotencyKey) {
      // Lock the logical operation before checking the key. A duplicate must
      // never create a second employee, even when the requests arrive together.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${companyId}:${input.idempotencyKey}`}, 0))`);
      const [key] = await tx.select().from(payrollIdempotencyKeys).where(and(
        eq(payrollIdempotencyKeys.companyId, companyId),
        eq(payrollIdempotencyKeys.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (key) {
        const payloadHash = createHash('sha256').update(JSON.stringify({ companyId, ...input })).digest('hex');
        if (key.intent !== 'create_employee' || key.payloadHash !== payloadHash || !key.resultId) {
          throw new EmployeeServiceError('Idempotency key reused with a different payload.', 'CONFLICT_DUPLICATE');
        }
        const [existingEmployee] = await tx.select().from(payrollEmployees).where(and(
          eq(payrollEmployees.id, key.resultId), eq(payrollEmployees.companyId, companyId),
        )).limit(1);
        if (!existingEmployee) throw new EmployeeServiceError('Stored employee could not be found.', 'INTERNAL');
        return existingEmployee;
      }
    }
    // 1. Insert employee
    const insertValues: NewPayrollEmployee = {
      companyId,
      legalFirstName: input.legalFirstName,
      legalSurname: input.legalSurname,
      employmentStartDate: input.employmentStartDate,
      employeeReference: input.employeeReference ?? null,
      isDirector: input.isDirector ?? false,
      employeeStatus: 'active',
      dateOfBirth: input.dateOfBirth ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      addressCity: input.addressCity ?? null,
      addressPostcode: input.addressPostcode ?? null,
      taxCode: input.taxCode ?? null,
      taxCodeBasis: input.taxCodeBasis ?? null,
      taxCodeEffectiveDate: input.taxCodeEffectiveDate ?? null,
      taxCodeSource: input.taxCodeSource ?? null,
      niCategory: input.niCategory ?? null,
      linkedUserId: input.linkedUserId ?? null,
      payrollIdMigrationRef: input.payrollIdMigrationRef ?? null,
      version: 1,
      createdByUserId: actorUserId,
    };

    let employee: PayrollEmployee | undefined;
    try {
      const rows = await tx.insert(payrollEmployees).values(insertValues).returning();
      employee = rows[0] as PayrollEmployee | undefined;
    } catch (err: unknown) {
      let cause: unknown = err;
      const seen = new Set<unknown>();
      while (cause && typeof cause === 'object' && !seen.has(cause)) {
        seen.add(cause);
        const pg = cause as { code?: string; cause?: unknown };
        if (pg.code === '23505') {
          throw new EmployeeServiceError(
            'An employee with this reference already exists in this company.', 'CONFLICT_DUPLICATE',
          );
        }
        cause = pg.cause;
      }
      throw err;
    }

    if (!employee) throw new EmployeeServiceError('Insert did not return a row.', 'INTERNAL');

    // 2. Store sensitive data (always insert a row; nino_encrypted may be null)
    const sensitive: NewPayrollEmployeeSensitive = {
      employeeId: employee.id,
      ninoEncrypted,
      ninoKeyVersion: ninoEncrypted ? CURRENT_ENCRYPTION_KEY_VERSION : null,
      updatedByUserId: actorUserId,
    };
    await tx.insert(payrollEmployeeSensitive).values(sensitive);

    // 3. Insert revision snapshot
    const revision: NewPayrollEmployeeRevision = {
      employeeId: employee.id,
      companyId,
      version: 1,
      snapshot: employeeToSummaryDto(employee) as unknown as Record<string, unknown>,
      changedFields: Object.keys(insertValues).filter(
        (k) => k !== 'createdByUserId' && (insertValues as Record<string, unknown>)[k] != null,
      ),
      changedByUserId: actorUserId,
    };
    await tx.insert(payrollEmployeeRevisions).values(revision);

    // 4. Audit event
    await insertAuditEvent(tx, {
      companyId,
      eventType: 'employee_created',
      actorUserId,
      payload: {
        employeeId: employee.id,
        legalFirstName: employee.legalFirstName,
        legalSurname: employee.legalSurname,
      },
    });

    // 5. Record idempotency key
    if (input.idempotencyKey) {
      const payloadHash = createHash('sha256')
        .update(JSON.stringify({ companyId, ...input }))
        .digest('hex');
      await tx.insert(payrollIdempotencyKeys).values({
          companyId,
          idempotencyKey: input.idempotencyKey,
          intent: 'create_employee',
          payloadHash,
          resultId: employee.id,
      });
    }

    return employee;
  });

  return buildDetailDto(newEmployee, null);
}

// ─── Read employees ───────────────────────────────────────────────────────────

export async function listEmployees(companyId: string): Promise<EmployeeSummaryDto[]> {
  const rows = await db
    .select()
    .from(payrollEmployees)
    .where(eq(payrollEmployees.companyId, companyId))
    .orderBy(payrollEmployees.legalSurname, payrollEmployees.legalFirstName);
  return rows.map(employeeToSummaryDto);
}

export async function getEmployee(
  companyId: string,
  employeeId: string,
  includeSensitive: boolean,
): Promise<EmployeeDetailDto | null> {
  const [row] = await db
    .select()
    .from(payrollEmployees)
    .where(
      and(
        eq(payrollEmployees.id, employeeId),
        eq(payrollEmployees.companyId, companyId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const currentPayTerms = await getCurrentPayTerms(employeeId);

  let sensitiveFields: { dateOfBirth?: string | null; ninoMasked?: string | null } | undefined;
  if (includeSensitive) {
    const [sens] = await db
      .select()
      .from(payrollEmployeeSensitive)
      .where(eq(payrollEmployeeSensitive.employeeId, employeeId))
      .limit(1);

    let ninoMasked: string | null = null;
    if (sens?.ninoEncrypted && isEncryptedField(sens.ninoEncrypted)) {
      try {
        const plain = decryptField(sens.ninoEncrypted);
        ninoMasked = maskNino(plain);
      } catch {
        ninoMasked = null;
      }
    }
    sensitiveFields = {
      dateOfBirth: row.dateOfBirth,
      ninoMasked,
    };
  }

  return buildDetailDto(row, currentPayTerms, sensitiveFields);
}

export async function getEmployeeSensitive(
  companyId: string,
  employeeId: string,
): Promise<EmployeeSensitiveDto | null> {
  const [emp] = await db
    .select({ id: payrollEmployees.id })
    .from(payrollEmployees)
    .where(
      and(
        eq(payrollEmployees.id, employeeId),
        eq(payrollEmployees.companyId, companyId),
      ),
    )
    .limit(1);

  if (!emp) return null;

  const [sens] = await db
    .select()
    .from(payrollEmployeeSensitive)
    .where(eq(payrollEmployeeSensitive.employeeId, employeeId))
    .limit(1);

  let nino: string | null = null;
  if (sens?.ninoEncrypted && isEncryptedField(sens.ninoEncrypted)) {
    nino = decryptField(sens.ninoEncrypted);
  }

  return { employeeId, nino };
}

// ─── Update employee ──────────────────────────────────────────────────────────

export async function updateEmployee(
  actorUserId: string,
  companyId: string,
  employeeId: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeDetailDto> {
  // Pre-encrypt NINO if being updated
  let newNinoEncrypted: string | null | undefined = undefined; // undefined = do not update
  if ('nino' in input) {
    if (input.nino) {
      try {
        newNinoEncrypted = encryptField(input.nino);
      } catch {
        throw new EmployeeServiceError(
          'NINO encryption is unavailable. Configure PAYROLL_FIELD_ENCRYPTION_KEY.',
          'ENCRYPTION_UNAVAILABLE',
        );
      }
    } else {
      newNinoEncrypted = null; // explicitly clear
    }
  }

  const updatedEmployee = await withTaxWriteTransaction(async (tx) => {
    // 1. Read + OCC check
    const [current] = await tx
      .select()
      .from(payrollEmployees)
      .where(
        and(
          eq(payrollEmployees.id, employeeId),
          eq(payrollEmployees.companyId, companyId),
        ),
      )
      .limit(1);

    if (!current) throw new EmployeeServiceError('Employee not found.', 'NOT_FOUND');
    if (current.version !== input.expectedVersion) {
      throw new EmployeeServiceError(
        `Version conflict: expected ${input.expectedVersion}, found ${current.version}.`,
        'CONFLICT_VERSION',
      );
    }

    // 2. Build patch
    const editableFields = [
      'legalFirstName', 'legalSurname', 'employmentStartDate', 'employmentEndDate',
      'employeeReference', 'isDirector', 'employeeStatus',
      'dateOfBirth', 'addressLine1', 'addressLine2', 'addressCity', 'addressPostcode',
      'taxCode', 'taxCodeBasis', 'taxCodeEffectiveDate', 'taxCodeSource', 'niCategory',
      'linkedUserId', 'payrollIdMigrationRef',
    ] as const;

    const patchValues: Record<string, unknown> = {};
    const changedFields: string[] = [];

    for (const field of editableFields) {
      if (!(field in input)) continue;
      const incoming = (input as Record<string, unknown>)[field];
      if (incoming === undefined) continue;
      const currentVal = (current as Record<string, unknown>)[field];
      const normalised = typeof incoming === 'string' && incoming.trim() === '' ? null : incoming;
      if (normalised !== (currentVal ?? null)) {
        patchValues[field] = normalised;
        changedFields.push(field);
      }
    }

    const ninoChanged = newNinoEncrypted !== undefined;
    if (changedFields.length === 0 && !ninoChanged) {
      return current;
    }

    const newVersion = current.version + 1;

    // 3. Update employee row
    const [updated] = await tx
      .update(payrollEmployees)
      .set({ ...patchValues, version: newVersion, updatedAt: new Date() })
      .where(
        and(
          eq(payrollEmployees.id, employeeId),
          eq(payrollEmployees.version, current.version),
        ),
      )
      .returning();

    if (!updated) {
      throw new EmployeeServiceError('Version conflict: concurrent update detected.', 'CONFLICT_VERSION');
    }

    // 4. Update sensitive row if NINO changed
    if (ninoChanged) {
      await tx
        .update(payrollEmployeeSensitive)
        .set({
          ninoEncrypted: newNinoEncrypted,
          ninoKeyVersion: newNinoEncrypted ? CURRENT_ENCRYPTION_KEY_VERSION : null,
          updatedAt: new Date(),
          updatedByUserId: actorUserId,
        })
        .where(eq(payrollEmployeeSensitive.employeeId, employeeId));
      changedFields.push('nino');
    }

    // 5. Insert revision
    const revision: NewPayrollEmployeeRevision = {
      employeeId,
      companyId,
      version: newVersion,
      snapshot: employeeToSummaryDto(updated) as unknown as Record<string, unknown>,
      changedFields,
      changedByUserId: actorUserId,
    };
    await tx.insert(payrollEmployeeRevisions).values(revision);

    // 6. Audit event (no NINO in payload)
    await insertAuditEvent(tx, {
      companyId,
      eventType: 'employee_updated',
      actorUserId,
      payload: { employeeId, changedFields: changedFields.filter((f) => f !== 'nino'), newVersion },
    });

    return updated;
  });

  const currentPayTerms = await getCurrentPayTerms(employeeId);
  return buildDetailDto(updatedEmployee, currentPayTerms);
}
