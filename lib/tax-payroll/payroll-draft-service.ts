import 'server-only';

import { db } from '@/lib/db';
import { withTaxWriteTransaction } from './write-transaction';
import {
  payrollRuns,
  payrollRunLines,
  payrollRunPreviews,
  payrollSettings,
  payrollEmployees,
  payrollPayTerms,
  payrollIdempotencyKeys,
  taxCompanyEntities,
  type PayrollRun,
  type NewPayrollRun,
  type PayrollRunLine,
  type NewPayrollRunLine,
  type NewPayrollRunPreview,
} from '@/lib/db/schema';
import { eq, and, or, isNull, gte, lte, sql } from 'drizzle-orm';
import { insertAuditEvent } from './audit-service';
import { buildPreviewResult, CALC_POLICY_VERSION, type RawLine, type EmployeeStub } from './gross-pay-calculation';
import { createHash } from 'crypto';
import type {
  PayrollRunDto,
  PayrollRunSummaryDto,
  PayrollRunLineDto,
  GrossPayPreviewDto,
} from './contracts';
import type { CreatePayrollRunInput, UpsertRunLinesInput } from './validation';
import { previewRowToDto } from './gross-pay-calculation';

// ─── Error type ───────────────────────────────────────────────────────────────

export class PayrollDraftError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_ACTIVATED'
      | 'NOT_FOUND'
      | 'CONFLICT_VERSION'
      | 'CONFLICT_DUPLICATE'
      | 'WRONG_STATUS'
      | 'INTERNAL',
  ) {
    super(message);
    this.name = 'PayrollDraftError';
  }
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function lineToDto(row: PayrollRunLine): PayrollRunLineDto {
  return {
    id: row.id,
    runId: row.runId,
    employeeId: row.employeeId,
    payTermsId: row.payTermsId,
    lineType: row.lineType as PayrollRunLineDto['lineType'],
    workedMinutes: row.workedMinutes,
    hourlyRateOverride: row.hourlyRateOverride,
    fixedAmount: row.fixedAmount,
    description: row.description,
    enteredByUserId: row.enteredByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function runToSummaryDto(
  row: PayrollRun,
  employeeCount: number,
  latestPreview: GrossPayPreviewDto | null,
): PayrollRunSummaryDto {
  return {
    id: row.id,
    companyId: row.companyId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    intendedPaymentDate: row.intendedPaymentDate,
    runStatus: row.runStatus as PayrollRunSummaryDto['runStatus'],
    employeeCount,
    latestPreview,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Create draft pay run ─────────────────────────────────────────────────────

export async function createPayrollRun(
  actorUserId: string,
  companyId: string,
  input: CreatePayrollRunInput,
): Promise<PayrollRunSummaryDto> {
  // Verify payroll is activated
  const [settings] = await db
    .select()
    .from(payrollSettings)
    .where(eq(payrollSettings.companyId, companyId))
    .limit(1);

  if (!settings) {
    throw new PayrollDraftError('Payroll is not activated for this company.', 'NOT_ACTIVATED');
  }

  // Idempotency check
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
        throw new PayrollDraftError('Idempotency key reused with a different payload.', 'CONFLICT_DUPLICATE');
      }
      if (existing.resultId) {
        const run = await getPayrollRun(companyId, existing.resultId);
        if (run) return run;
      }
    }
  }

  let createdRun: PayrollRun | undefined;
  await withTaxWriteTransaction(async (tx) => {
    if (input.idempotencyKey) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${companyId}:${input.idempotencyKey}`}, 0))`);
      const [key] = await tx.select().from(payrollIdempotencyKeys).where(and(
        eq(payrollIdempotencyKeys.companyId, companyId), eq(payrollIdempotencyKeys.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (key) {
        const hash = createHash('sha256').update(JSON.stringify({ companyId, ...input })).digest('hex');
        if (key.intent !== 'create_run' || key.payloadHash !== hash || !key.resultId) {
          throw new PayrollDraftError('Idempotency key reused with a different payload.', 'CONFLICT_DUPLICATE');
        }
        const [stored] = await tx.select().from(payrollRuns).where(and(
          eq(payrollRuns.id, key.resultId), eq(payrollRuns.companyId, companyId),
        )).limit(1);
        if (!stored) throw new PayrollDraftError('Stored pay run could not be found.', 'INTERNAL');
        createdRun = stored;
        return;
      }
    }

    const insertValues: NewPayrollRun = {
      companyId,
      settingsId: settings.id,
      settingsVersionAtCreation: settings.version,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      intendedPaymentDate: input.intendedPaymentDate,
      runStatus: 'draft',
      version: 1,
      createdByUserId: actorUserId,
    };

    const rows = await tx.insert(payrollRuns).values(insertValues).returning();
    createdRun = rows[0] as PayrollRun | undefined;
    if (!createdRun) throw new PayrollDraftError('Insert did not return a row.', 'INTERNAL');

    if (input.idempotencyKey) {
      const payloadHash = createHash('sha256')
        .update(JSON.stringify({ companyId, ...input }))
        .digest('hex');
      await tx.insert(payrollIdempotencyKeys).values({
          companyId,
          idempotencyKey: input.idempotencyKey,
          intent: 'create_run',
          payloadHash,
          resultId: createdRun.id,
        });
    }

    await insertAuditEvent(tx, {
      companyId,
      eventType: 'draft_created',
      actorUserId,
      payload: {
        runId: createdRun.id,
        periodStart: createdRun.periodStart,
        periodEnd: createdRun.periodEnd,
      },
    });
  });

  return runToSummaryDto(createdRun!, 0, null);
}

// ─── Upsert run lines for one employee ────────────────────────────────────────
// Replaces all existing lines for this employee in this run atomically.

export async function upsertRunLines(
  actorUserId: string,
  companyId: string,
  runId: string,
  input: UpsertRunLinesInput,
): Promise<PayrollRunLineDto[]> {
  return withTaxWriteTransaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.id, runId),
          eq(payrollRuns.companyId, companyId),
        ),
      )
      .for('update');

    if (!run) throw new PayrollDraftError('Pay run not found.', 'NOT_FOUND');
    if (run.runStatus !== 'draft') {
      throw new PayrollDraftError('Cannot edit lines on a non-draft pay run.', 'WRONG_STATUS');
    }

    // Verify employee belongs to company
    const [emp] = await tx
      .select({ id: payrollEmployees.id })
      .from(payrollEmployees)
      .where(
        and(
          eq(payrollEmployees.id, input.employeeId),
          eq(payrollEmployees.companyId, companyId),
        ),
      )
      .limit(1);

    if (!emp) throw new PayrollDraftError('Employee not found in this company.', 'NOT_FOUND');

    if (input.expectedVersion !== undefined && run.version !== input.expectedVersion) {
      throw new PayrollDraftError('Version conflict: reload the pay run before saving.', 'CONFLICT_VERSION');
    }

    const resolvedTerms = new Map<string, typeof payrollPayTerms.$inferSelect>();
    for (const line of input.lines) {
      if (!line.payTermsId || resolvedTerms.has(line.payTermsId)) continue;
      const [terms] = await tx.select().from(payrollPayTerms).where(and(
        eq(payrollPayTerms.id, line.payTermsId), eq(payrollPayTerms.companyId, companyId),
        eq(payrollPayTerms.employeeId, input.employeeId),
        lte(payrollPayTerms.effectiveFrom, run.intendedPaymentDate),
        or(isNull(payrollPayTerms.effectiveTo), gte(payrollPayTerms.effectiveTo, run.intendedPaymentDate)),
      )).limit(1);
      if (!terms) throw new PayrollDraftError('Pay terms do not belong to this employee or cover the payment date.', 'NOT_FOUND');
      resolvedTerms.set(terms.id, terms);
    }

    // Locking the run serialises edits with review, cancellation and previews.
    await tx.update(payrollRuns).set({ version: run.version + 1, updatedAt: new Date() })
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.companyId, companyId), eq(payrollRuns.runStatus, 'draft')));

    // Delete existing lines for this employee in this run
    await tx
      .delete(payrollRunLines)
      .where(
        and(
          eq(payrollRunLines.runId, runId),
          eq(payrollRunLines.employeeId, input.employeeId),
        ),
      );

    if (input.lines.length === 0) {
      await insertAuditEvent(tx, {
        companyId,
        eventType: 'draft_lines_updated',
        actorUserId,
        payload: { runId, employeeId: input.employeeId, lineCount: 0 },
      });
      return [];
    }

    const newLines: NewPayrollRunLine[] = input.lines.map((line) => ({
      runId,
      companyId,
      employeeId: input.employeeId,
      payTermsId: line.payTermsId ?? null,
      payTermsVersionAtEntry: line.payTermsId ? resolvedTerms.get(line.payTermsId)?.version ?? null : null,
      lineType: line.lineType,
      workedMinutes: line.workedMinutes ?? null,
      hourlyRateOverride: line.hourlyRateOverride ?? null,
      fixedAmount: line.fixedAmount ?? null,
      description: line.description ?? null,
      enteredByUserId: actorUserId,
    }));

    const inserted = await tx.insert(payrollRunLines).values(newLines).returning();

    await insertAuditEvent(tx, {
      companyId,
      eventType: 'draft_lines_updated',
      actorUserId,
      payload: { runId, employeeId: input.employeeId, lineCount: input.lines.length },
    });

    return (inserted as PayrollRunLine[]).map(lineToDto);
  });
}

// ─── Calculate gross-pay preview ──────────────────────────────────────────────
// Creates an immutable snapshot. Does NOT update YTD balances.
// Tax, NI, net pay remain null — never fabricated.

export async function calculateDraftPreview(
  actorUserId: string,
  companyId: string,
  runId: string,
): Promise<GrossPayPreviewDto> {
  let created: typeof payrollRunPreviews.$inferSelect | undefined;
  await withTaxWriteTransaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.id, runId),
          eq(payrollRuns.companyId, companyId),
        ),
      )
      .for('update');

    if (!run) throw new PayrollDraftError('Pay run not found.', 'NOT_FOUND');
    if (run.runStatus !== 'draft') {
      throw new PayrollDraftError('Cannot preview a non-draft run.', 'WRONG_STATUS');
    }

    const [settings] = await tx
      .select()
      .from(payrollSettings)
      .where(eq(payrollSettings.companyId, companyId))
      .limit(1);

    if (!settings) throw new PayrollDraftError('Payroll not activated.', 'NOT_ACTIVATED');

    const [company] = await tx
      .select({ version: taxCompanyEntities.version })
      .from(taxCompanyEntities)
      .where(eq(taxCompanyEntities.id, companyId))
      .limit(1);

    const companyVersion = company?.version ?? 0;

    // Load all lines for this run
    const lines = await tx
      .select()
      .from(payrollRunLines)
      .where(eq(payrollRunLines.runId, runId));

    // Collect unique employee IDs
    const employeeIds = [...new Set(lines.map((l) => l.employeeId))];

    // Load employee stubs
    const termsDate = run.intendedPaymentDate;
    const employeeLinesMap = new Map<string, { employee: EmployeeStub; lines: RawLine[] }>();

    for (const empId of employeeIds) {
      const [emp] = await tx
        .select({
          id: payrollEmployees.id,
          legalFirstName: payrollEmployees.legalFirstName,
          legalSurname: payrollEmployees.legalSurname,
        })
        .from(payrollEmployees)
        .where(eq(payrollEmployees.id, empId))
        .limit(1);

      if (!emp) continue;

      // Resolve active pay terms for rate lookups
      const [activeTerms] = await tx
        .select()
        .from(payrollPayTerms)
        .where(
          and(
            eq(payrollPayTerms.employeeId, empId),
            lte(payrollPayTerms.effectiveFrom, termsDate),
            or(
              isNull(payrollPayTerms.effectiveTo),
              gte(payrollPayTerms.effectiveTo, termsDate),
            ),
          ),
        )
        .orderBy(sql`${payrollPayTerms.effectiveFrom} DESC`)
        .limit(1);

      const linkedTerms = new Map<string, typeof payrollPayTerms.$inferSelect>();
      for (const line of lines.filter((candidate) => candidate.employeeId === empId && candidate.payTermsId)) {
        const [terms] = await tx.select().from(payrollPayTerms).where(and(
          eq(payrollPayTerms.id, line.payTermsId!), eq(payrollPayTerms.companyId, companyId),
          eq(payrollPayTerms.employeeId, empId),
          lte(payrollPayTerms.effectiveFrom, termsDate),
          or(isNull(payrollPayTerms.effectiveTo), gte(payrollPayTerms.effectiveTo, termsDate)),
        )).limit(1);
        if (terms) linkedTerms.set(terms.id, terms);
      }
      const empLines = lines
        .filter((l) => l.employeeId === empId)
        .map((l): RawLine => ({
          id: l.id,
          runId: l.runId,
          employeeId: l.employeeId,
          payTermsId: l.payTermsId,
          lineType: l.lineType as RawLine['lineType'],
          workedMinutes: l.workedMinutes,
          hourlyRateOverride: l.hourlyRateOverride,
          fixedAmount: l.fixedAmount,
          description: l.description,
          enteredByUserId: l.enteredByUserId,
          createdAt: l.createdAt.toISOString(),
          resolvedHourlyRate: l.payTermsId ? linkedTerms.get(l.payTermsId)?.hourlyRate ?? null : activeTerms?.hourlyRate ?? null,
        }));

      employeeLinesMap.set(empId, { employee: emp, lines: empLines });
    }

    const previewResult = buildPreviewResult({
      runId,
      companyId,
      runVersion: run.version,
      settingsVersion: settings.version,
      companyVersion,
      employeeLinesMap,
      calculatedByUserId: actorUserId,
    });


    const insertValues: NewPayrollRunPreview = {
      runId,
      companyId,
      runVersionAtCalc: run.version,
      settingsVersionAtCalc: settings.version,
      companyVersionAtCalc: companyVersion,
      inputSnapshot: previewResult.inputSnapshot,
      inputHash: previewResult.inputHash,
      perEmployeeResults: previewResult.perEmployeeResults,
      grossTotal: previewResult.grossTotal,
      supportedSubtotal: previewResult.supportedSubtotal,
      hasUnsupportedLines: previewResult.hasUnsupportedLines,
      completenessState: previewResult.completenessState,
      calcPolicyVersion: CALC_POLICY_VERSION,
      taxNotCalculated: true,
      netPayNotCalculated: true,
      calculatedByUserId: actorUserId,
    };

    const rows = await tx.insert(payrollRunPreviews).values(insertValues).returning();
    created = rows[0];

    await insertAuditEvent(tx, {
      companyId,
      eventType: 'draft_calculated',
      actorUserId,
      payload: {
        runId,
        previewId: created?.id,
        completenessState: previewResult.completenessState,
        grossTotal: previewResult.grossTotal,
      },
    });
  });

  if (!created) throw new PayrollDraftError('Preview insert did not return a row.', 'INTERNAL');

  return previewRowToDto(created);
}

// ─── Cancel draft run ─────────────────────────────────────────────────────────

export async function cancelPayrollRun(
  actorUserId: string,
  companyId: string,
  runId: string,
): Promise<void> {
  await withTaxWriteTransaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.id, runId),
          eq(payrollRuns.companyId, companyId),
        ),
      )
      .for('update');

    if (!run) throw new PayrollDraftError('Pay run not found.', 'NOT_FOUND');
    if (run.runStatus !== 'draft') {
      throw new PayrollDraftError('Only draft runs can be cancelled.', 'WRONG_STATUS');
    }


    await tx
      .update(payrollRuns)
      .set({ runStatus: 'cancelled', version: run.version + 1, updatedAt: new Date() })
      .where(eq(payrollRuns.id, runId));

    await insertAuditEvent(tx, {
      companyId,
      eventType: 'draft_cancelled',
      actorUserId,
      payload: { runId },
    });
  });
}

// ─── Read runs ────────────────────────────────────────────────────────────────

export async function getPayrollRun(
  companyId: string,
  runId: string,
): Promise<PayrollRunDto | null> {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.id, runId),
        eq(payrollRuns.companyId, companyId),
      ),
    )
    .limit(1);

  if (!run) return null;

  const lines = await db
    .select()
    .from(payrollRunLines)
    .where(eq(payrollRunLines.runId, runId));

  const [latestPreviewRow] = await db
    .select()
    .from(payrollRunPreviews)
    .where(eq(payrollRunPreviews.runId, runId))
    .orderBy(sql`${payrollRunPreviews.calculatedAt} DESC`)
    .limit(1);

  const latestPreview = latestPreviewRow ? previewRowToDto(latestPreviewRow) : null;
  const employeeCount = new Set(lines.map((l) => l.employeeId)).size;

  const summary = runToSummaryDto(run, employeeCount, latestPreview);
  return {
    ...summary,
    lines: (lines as PayrollRunLine[]).map(lineToDto),
    settingsId: run.settingsId,
  };
}

export async function listPayrollRuns(companyId: string): Promise<PayrollRunSummaryDto[]> {
  const runs = await db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.companyId, companyId))
    .orderBy(sql`${payrollRuns.createdAt} DESC`);

  const summaries: PayrollRunSummaryDto[] = [];
  for (const run of runs) {
    const lines = await db
      .select({ employeeId: payrollRunLines.employeeId })
      .from(payrollRunLines)
      .where(eq(payrollRunLines.runId, run.id));

    const [latestPreviewRow] = await db
      .select()
      .from(payrollRunPreviews)
      .where(eq(payrollRunPreviews.runId, run.id))
      .orderBy(sql`${payrollRunPreviews.calculatedAt} DESC`)
      .limit(1);

    const latestPreview = latestPreviewRow ? previewRowToDto(latestPreviewRow) : null;
    const employeeCount = new Set(lines.map((l) => l.employeeId)).size;
    summaries.push(runToSummaryDto(run, employeeCount, latestPreview));
  }

  return summaries;
}
