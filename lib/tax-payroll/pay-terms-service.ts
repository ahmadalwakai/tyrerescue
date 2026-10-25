import 'server-only';

import { db } from '@/lib/db';
import { withTaxWriteTransaction, type TaxWriteTransaction } from './write-transaction';
import {
  payrollPayTerms,
  payrollEmployees,
  type NewPayrollPayTerms,
  type PayrollPayTerms,
} from '@/lib/db/schema';
import { eq, and, or, isNull, lt, gte } from 'drizzle-orm';
import { insertAuditEvent } from './audit-service';
import { payTermsToDto } from './employee-service';
import type { PayTermsDto } from './contracts';
import type { CreatePayTermsInput } from './validation';

// ─── Error type ───────────────────────────────────────────────────────────────

export class PayTermsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONFLICT_OVERLAP' | 'NOT_FOUND' | 'INTERNAL',
  ) {
    super(message);
    this.name = 'PayTermsServiceError';
  }
}

// ─── Overlap detection ────────────────────────────────────────────────────────
// Two effective-dated intervals overlap when:
//   A.start < B.end (or B is open-ended) AND B.start < A.end (or A is open-ended)
//
// This query finds any existing active row that would overlap the proposed interval.

async function hasOverlappingPayTerms(
  employeeId: string,
  effectiveFrom: string,
  effectiveTo: string | null | undefined,
  tx: TaxWriteTransaction,
): Promise<boolean> {
  const rows = await tx
    .select({ id: payrollPayTerms.id })
    .from(payrollPayTerms)
    .where(
      and(
        eq(payrollPayTerms.employeeId, employeeId),
        // Existing row starts before proposed end (or proposed is open-ended)
        effectiveTo
          ? lt(payrollPayTerms.effectiveFrom, effectiveTo)
          : undefined,
        // Existing row ends after proposed start (or existing is open-ended)
        or(
          isNull(payrollPayTerms.effectiveTo),
          gte(payrollPayTerms.effectiveTo, effectiveFrom),
        ),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

// ─── Create pay terms ─────────────────────────────────────────────────────────
// Effective-dated terms cannot overlap for the same employee. If the caller
// passes effectiveTo = null, this creates an open-ended (currently active) term.
// To close an existing open-ended term, the caller should update it first.

export async function createPayTerms(
  actorUserId: string,
  companyId: string,
  employeeId: string,
  input: CreatePayTermsInput,
): Promise<PayTermsDto> {
  const insertValues: NewPayrollPayTerms = {
    employeeId,
    companyId,
    payBasis: input.payBasis,
    hourlyRate: input.payBasis === 'hourly' ? (input.hourlyRate ?? null) : null,
    fixedPeriodGross: input.payBasis === 'fixed_period' ? (input.fixedPeriodGross ?? null) : null,
    currency: 'GBP',
    annualSalaryNote: input.annualSalaryNote ?? null,
    payFrequency: input.payFrequency,
    contractedHoursPerWeek: input.contractedHoursPerWeek ?? null,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
    sourceNote: input.sourceNote ?? null,
    version: 1,
    createdByUserId: actorUserId,
  };

  let created: PayrollPayTerms | undefined;
  await withTaxWriteTransaction(async (tx) => {
    // Verify employee belongs to company
    const [emp] = await tx
      .select({ id: payrollEmployees.id })
      .from(payrollEmployees)
      .where(
        and(
          eq(payrollEmployees.id, employeeId),
          eq(payrollEmployees.companyId, companyId),
        ),
      )
      .for('update');

    if (!emp) throw new PayTermsServiceError('Employee not found in this company.', 'NOT_FOUND');

    // Check for overlapping terms
    const overlaps = await hasOverlappingPayTerms(
      employeeId,
      input.effectiveFrom,
      undefined, // new terms are open-ended
      tx,
    );
    if (overlaps) {
      throw new PayTermsServiceError(
        'A pay terms record already covers this period. Close the existing record (set effectiveTo) before creating new terms.',
        'CONFLICT_OVERLAP',
      );
    }


    const rows = await tx.insert(payrollPayTerms).values(insertValues).returning();
    created = rows[0] as PayrollPayTerms | undefined;

    if (!created) throw new PayTermsServiceError('Insert did not return a row.', 'INTERNAL');

    await insertAuditEvent(tx, {
      companyId,
      eventType: 'pay_terms_created',
      actorUserId,
      payload: {
        payTermsId: created.id,
        employeeId,
        payBasis: created.payBasis,
        payFrequency: created.payFrequency,
        effectiveFrom: created.effectiveFrom,
      },
    });
  });

  return payTermsToDto(created!);
}

// ─── List pay terms history for an employee ───────────────────────────────────

export async function listPayTerms(
  companyId: string,
  employeeId: string,
): Promise<PayTermsDto[]> {
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

  if (!emp) return [];

  const rows = await db
    .select()
    .from(payrollPayTerms)
    .where(eq(payrollPayTerms.employeeId, employeeId))
    .orderBy(payrollPayTerms.effectiveFrom);

  return rows.map(payTermsToDto);
}
