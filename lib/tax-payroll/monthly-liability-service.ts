import 'server-only';

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getMemberCapabilities, hasCapabilities } from './permissions';
import { getCompanyPayrollSetup } from './payroll-setup-service';
import { isPayrollDate, londonToday, payrollTaxMonth } from './tax-month';
import type {
  MonthlyPayrollLiabilityDto,
  PayrollHmrcAdjustmentDto,
  PayrollHmrcPaymentDto,
  RecordPayrollHmrcAdjustmentRequest,
  RecordPayrollHmrcPaymentRequest,
  VoidPayrollHmrcRecordRequest,
} from './monthly-liability-contracts';

export class MonthlyLiabilityError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'CONFLICT_DUPLICATE' | 'PAYROLL_ACCESS_REQUIRED') {
    super(message);
    this.name = 'MonthlyLiabilityError';
  }
}

const payrollDate = z.string().refine(isPayrollDate, 'Enter a valid YYYY-MM-DD date');
const periodStart = payrollDate.refine((date) => date.endsWith('-06'), 'Tax months start on the 6th');
const idempotencyKey = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/);
const paymentSchema = z.object({
  periodStart,
  amountPence: z.number().int().positive().max(2_000_000_000),
  paidOn: payrollDate,
  reference: z.string().trim().min(1).max(120),
  idempotencyKey,
}).strict();
const adjustmentSchema = z.object({
  periodStart,
  amountPence: z.number().int().min(-2_000_000_000).max(2_000_000_000).refine((value) => value !== 0, 'Adjustment must be nonzero'),
  reason: z.string().trim().min(5).max(500),
  idempotencyKey,
}).strict();
const voidSchema = z.object({ reason: z.string().trim().min(5).max(500), idempotencyKey }).strict();

interface RunAggregate {
  id: string;
  status: string;
  paymentDate: string;
  periodStart: string;
  periodEnd: string;
  version: number;
  employeeCount: number;
  resultCount: number;
  mismatchedEmployees: number;
  badResultCount: number;
  payePence: number;
  employeeNiPence: number;
  employerNiPence: number;
  studentLoanPence: number;
}

/**
 * A single SQL statement gives payroll, payments and adjustments one consistent
 * snapshot. Only immutable calculated finalisations count towards the liability.
 * Drafts, missing historical results and unsupported calculations never mean £0.
 */
export async function getMonthlyPayrollLiability(
  userId: string,
  companyId: string,
  date = londonToday(),
  now = new Date(),
): Promise<MonthlyPayrollLiabilityDto> {
  if (!z.string().uuid().safeParse(companyId).success) throw new MonthlyLiabilityError('Not found', 'NOT_FOUND');
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps || (!hasCapabilities(caps, ['payroll.read']) && !hasCapabilities(caps, ['tax.read']))) {
    throw new MonthlyLiabilityError('Not found', 'NOT_FOUND');
  }
  if (!isPayrollDate(date)) throw new MonthlyLiabilityError('Enter a valid date', 'VALIDATION_ERROR');
  const period = payrollTaxMonth(date, londonToday(now));
  const payrollSetup = await getCompanyPayrollSetup(userId, companyId);
  if (!payrollSetup) throw new MonthlyLiabilityError('Not found', 'NOT_FOUND');
  if (payrollSetup.state === 'restricted') {
    throw new MonthlyLiabilityError('Payroll access is required. Ask the company founder to grant payroll read access.', 'PAYROLL_ACCESS_REQUIRED');
  }
  if (payrollSetup.state === 'not_activated') {
    // This is a setup response, not a financial query. Even legacy or anomalous
    // payroll records must remain hidden until payroll access is explicitly granted.
    return {
      companyId, currency: 'GBP', period, status: 'no_data', source: 'local_payroll_records', hmrcVerified: false,
      finalizedRunCount: 0, pendingRunCount: 0, paymentRecordCount: 0, adjustmentRecordCount: 0,
      canRecordPayments: false, canRecordAdjustments: false, payrollSetup,
      pendingRuns: [], payments: [], adjustments: [],
      totals: {
        payePence: null, employeeNiPence: null, employerNiPence: null, studentLoanPence: null,
        payrollLiabilityPence: null, liabilityPence: null, remainingPence: null, creditPence: null,
        adjustmentsPence: 0, paidPence: 0,
      },
      issues: [
        payrollSetup.canActivate
          ? 'Payroll has not been activated. Open Employees & payroll setup to choose a payroll schedule and activate it.'
          : 'Payroll has not been activated. Ask the company founder to complete Employees & payroll setup.',
        'No tax amount has been calculated. A zero tax bill cannot be confirmed.',
        'Company profile creation does not register PAYE with HMRC. VAT and Corporation Tax are separate.',
      ],
    };
  }
  const result = await db.execute(sql`
    WITH selected_runs AS (
      SELECT id, run_status, intended_payment_date, period_start, period_end, version
      FROM payroll_runs
      WHERE company_id = ${companyId}::uuid
        AND intended_payment_date BETWEEN ${period.start}::date AND ${period.end}::date
        AND run_status <> 'cancelled'
    ), run_totals AS (
      SELECT r.id, r.run_status AS status, r.intended_payment_date::text AS "paymentDate",
        r.period_start::text AS "periodStart", r.period_end::text AS "periodEnd", r.version,
        (SELECT COUNT(DISTINCT l.employee_id)::int FROM payroll_run_lines l
          WHERE l.run_id = r.id AND l.company_id = ${companyId}::uuid) AS "employeeCount",
        COUNT(f.id)::int AS "resultCount",
        COUNT(f.id) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM payroll_run_lines l WHERE l.run_id = r.id AND l.company_id = ${companyId}::uuid
            AND l.employee_id = f.employee_id
        ))::int AS "mismatchedEmployees",
        COUNT(f.id) FILTER (WHERE f.calculation_status <> 'calculated'
          OR f.tax_year <> ${period.taxYear} OR f.gross_pay_pence < 0
          OR f.student_loan_pence < 0
          OR NOT COALESCE((f.ytd_snapshot ->> 'schemaVersion' = '1'
            AND f.ytd_snapshot ->> 'inputHash' ~ '^[a-f0-9]{64}$'
            AND f.ytd_snapshot ->> 'paymentDate' = r.intended_payment_date::text
            AND jsonb_typeof(f.ytd_snapshot -> 'after') = 'object'
            AND f.ytd_snapshot #>> '{calculation,overallStatus}' = 'calculated'
            AND f.ytd_snapshot #>> '{calculation,employeeId}' = f.employee_id::text
            AND f.ytd_snapshot #>> '{calculation,paymentDate}' = r.intended_payment_date::text
            AND f.ytd_snapshot #> '{calculation,grossPayPence}' = to_jsonb(f.gross_pay_pence)
            AND f.ytd_snapshot #> '{calculation,tax,taxForPeriodPence}' = to_jsonb(f.tax_for_period_pence)
            AND f.ytd_snapshot #> '{calculation,ni,employeeNiPeriodPence}' = to_jsonb(f.employee_ni_pence)
            AND f.ytd_snapshot #> '{calculation,ni,employerNiPeriodPence}' = to_jsonb(f.employer_ni_pence)
            AND f.ytd_snapshot #> '{calculation,totalStudentLoanPence}' = to_jsonb(f.student_loan_pence)
            AND ((f.employee_ni_pence >= 0 AND f.employer_ni_pence >= 0)
              OR f.ytd_snapshot #>> '{calculation,ni,method}' = 'director_annual')), FALSE))::int AS "badResultCount",
        COALESCE(SUM(f.tax_for_period_pence), 0)::bigint AS "payePence",
        COALESCE(SUM(f.employee_ni_pence), 0)::bigint AS "employeeNiPence",
        COALESCE(SUM(f.employer_ni_pence), 0)::bigint AS "employerNiPence",
        COALESCE(SUM(f.student_loan_pence), 0)::bigint AS "studentLoanPence"
      FROM selected_runs r
      LEFT JOIN payroll_run_finalised_results f ON f.run_id = r.id AND f.company_id = ${companyId}::uuid
      GROUP BY r.id, r.run_status, r.intended_payment_date, r.period_start, r.period_end, r.version
    )
    SELECT
      COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM run_totals r), '[]'::jsonb) AS runs,
      (SELECT COUNT(*)::int FROM payroll_hmrc_payments
        WHERE company_id = ${companyId}::uuid AND period_start = ${period.start}::date) AS "paymentRecordCount",
      (SELECT COUNT(*)::int FROM payroll_hmrc_adjustments
        WHERE company_id = ${companyId}::uuid AND period_start = ${period.start}::date) AS "adjustmentRecordCount",
      COALESCE((SELECT SUM(amount_pence)::bigint FROM payroll_hmrc_payments
        WHERE company_id = ${companyId}::uuid AND period_start = ${period.start}::date AND voided_at IS NULL), 0) AS paid,
      COALESCE((SELECT SUM(amount_pence)::bigint FROM payroll_hmrc_adjustments
        WHERE company_id = ${companyId}::uuid AND period_start = ${period.start}::date AND voided_at IS NULL), 0) AS adjustments,
      COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
        SELECT id, amount_pence AS "amountPence", paid_on::text AS "paidOn", reference,
          created_at AS "recordedAt", voided_at AS "voidedAt", void_reason AS "voidReason" FROM payroll_hmrc_payments
        WHERE company_id = ${companyId}::uuid AND period_start = ${period.start}::date
        ORDER BY created_at DESC, id DESC LIMIT 100
      ) p), '[]'::jsonb) AS payments,
      COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM (
        SELECT id, amount_pence AS "amountPence", reason, created_at AS "recordedAt", voided_at AS "voidedAt", void_reason AS "voidReason"
        FROM payroll_hmrc_adjustments
        WHERE company_id = ${companyId}::uuid AND period_start = ${period.start}::date
        ORDER BY created_at DESC, id DESC LIMIT 100
      ) a), '[]'::jsonb) AS "adjustmentRecords"
  `);
  const row = result.rows[0] as unknown as {
    runs: RunAggregate[];
    paymentRecordCount: number;
    adjustmentRecordCount: number;
    paid: string | number;
    adjustments: string | number;
    payments: PayrollHmrcPaymentDto[];
    adjustmentRecords: PayrollHmrcAdjustmentDto[];
  };
  const runs = row.runs;
  const finalized = runs.filter((run) => run.status === 'finalised');
  const valid = finalized.filter((run) => run.employeeCount > 0 && run.resultCount === run.employeeCount &&
    run.mismatchedEmployees === 0 && run.badResultCount === 0);
  const pendingRunCount = runs.length - finalized.length;
  const incomplete = pendingRunCount > 0 || valid.length !== finalized.length;
  const status = incomplete ? 'incomplete' : valid.length === 0 ? 'no_data' : period.isOpen ? 'provisional' : 'recorded';
  const issues: string[] = [
    'Local PAYE/NI payroll records only; not a verified HMRC balance. VAT and Corporation Tax are separate.',
    'Employment Allowance, statutory recoveries, CIS, levy and other HMRC adjustments are not inferred. Record confirmed adjustments separately.',
    'Monthly payment dates assume electronic monthly PAYE. If HMRC agreed quarterly payments, follow that agreement.',
    'Payments are manually recorded here; this screen does not send money or confirm receipt by HMRC.',
  ];
  if (status === 'no_data') issues.unshift('No finalised payroll is recorded for this tax month. A zero tax bill cannot be confirmed.');
  if (pendingRunCount > 0) issues.unshift(`${pendingRunCount} payroll run(s) still require calculation, review or finalisation.`);
  if (valid.length !== finalized.length) issues.unshift('Some finalised payroll has incomplete calculation records and must be reconciled.');
  if (period.isOpen) issues.unshift('This tax month has not closed. Amounts may change before the 5th.');
  const sum = (key: 'payePence' | 'employeeNiPence' | 'employerNiPence' | 'studentLoanPence') => {
    const value = valid.reduce((total, run) => total + Number(run[key]), 0);
    if (!Number.isSafeInteger(value)) throw new Error('Payroll monetary total is outside the supported range');
    return valid.length ? value : null;
  };
  const payePence = sum('payePence');
  const employeeNiPence = sum('employeeNiPence');
  const employerNiPence = sum('employerNiPence');
  const studentLoanPence = sum('studentLoanPence');
  const payrollLiabilityPence = valid.length ? payePence! + employeeNiPence! + employerNiPence! + studentLoanPence! : null;
  const paidPence = Number(row.paid);
  const adjustmentsPence = Number(row.adjustments);
  if (![paidPence, adjustmentsPence, payrollLiabilityPence ?? 0].every(Number.isSafeInteger)) {
    throw new Error('Payroll monetary total is outside the supported range');
  }
  const liabilityPence = status === 'recorded' || status === 'provisional' ? payrollLiabilityPence! + adjustmentsPence : null;
  const balance = liabilityPence === null ? null : liabilityPence - paidPence;
  if (![liabilityPence ?? 0, balance ?? 0].every(Number.isSafeInteger)) {
    throw new Error('Payroll monetary total is outside the supported range');
  }
  return {
    companyId, currency: 'GBP', period, status, source: 'local_payroll_records', hmrcVerified: false,
    payrollSetup,
    finalizedRunCount: finalized.length, pendingRunCount,
    paymentRecordCount: row.paymentRecordCount, adjustmentRecordCount: row.adjustmentRecordCount,
    canRecordPayments: payrollSetup.canEditSettings,
    canRecordAdjustments: payrollSetup.canEditSettings,
    pendingRuns: runs.filter((run) => run.status !== 'finalised').map((run) => ({
      id: run.id, status: run.status, paymentDate: run.paymentDate,
      periodStart: run.periodStart, periodEnd: run.periodEnd, version: run.version,
    })),
    totals: {
      payePence: liabilityPence === null ? null : payePence,
      employeeNiPence: liabilityPence === null ? null : employeeNiPence,
      employerNiPence: liabilityPence === null ? null : employerNiPence,
      studentLoanPence: liabilityPence === null ? null : studentLoanPence,
      payrollLiabilityPence: liabilityPence === null ? null : payrollLiabilityPence,
      adjustmentsPence, liabilityPence, paidPence,
      remainingPence: balance === null ? null : Math.max(0, balance),
      creditPence: balance === null ? null : Math.max(0, -balance),
    },
    issues,
    payments: row.payments.map((payment) => ({ ...payment, recordedAt: new Date(payment.recordedAt).toISOString(), voidedAt: payment.voidedAt ? new Date(payment.voidedAt).toISOString() : null })),
    adjustments: row.adjustmentRecords.map((adjustment) => ({ ...adjustment, recordedAt: new Date(adjustment.recordedAt).toISOString(), voidedAt: adjustment.voidedAt ? new Date(adjustment.voidedAt).toISOString() : null })),
  };
}

async function requireRecordAccess(userId: string, companyId: string) {
  if (!z.string().uuid().safeParse(companyId).success) throw new MonthlyLiabilityError('Not found', 'NOT_FOUND');
  const caps = await getMemberCapabilities(userId, companyId);
  if (!caps || !hasCapabilities(caps, ['payroll.read', 'payroll.settings.write'])) {
    throw new MonthlyLiabilityError('Not found', 'NOT_FOUND');
  }
}

function validated<T>(parsed: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!parsed.success) throw new MonthlyLiabilityError(parsed.error.issues[0]?.message ?? 'Invalid record', 'VALIDATION_ERROR');
  return parsed.data;
}

function samePayload(stored: unknown, expected: string): boolean {
  return typeof stored === 'string' && stored === expected;
}

function isDuplicateReceipt(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const value = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (value.code === '23505' && value.constraint === 'payroll_hmrc_payments_receipt_unique') return true;
    current = value.cause;
  }
  return false;
}

/** Manual evidence only. The idempotency key prevents a network retry counting a payment twice. */
export async function recordPayrollHmrcPayment(
  userId: string, companyId: string, raw: RecordPayrollHmrcPaymentRequest, now = new Date(),
): Promise<PayrollHmrcPaymentDto> {
  await requireRecordAccess(userId, companyId);
  const input = validated(paymentSchema.safeParse(raw));
  if (input.paidOn > londonToday(now)) throw new MonthlyLiabilityError('A future payment cannot be recorded as paid', 'VALIDATION_ERROR');
  const hash = createHash('sha256').update(JSON.stringify({
    periodStart: input.periodStart, amountPence: input.amountPence, paidOn: input.paidOn, reference: input.reference,
  })).digest('hex');
  let result;
  try { result = await db.execute(sql`
    WITH inserted AS (
      INSERT INTO payroll_hmrc_payments (company_id, period_start, amount_pence, paid_on, reference,
        idempotency_key, payload_hash, recorded_by_user_id)
      VALUES (${companyId}::uuid, ${input.periodStart}::date, ${input.amountPence}, ${input.paidOn}::date,
        ${input.reference}, ${input.idempotencyKey}, ${hash}, ${userId}::uuid)
      ON CONFLICT (company_id, idempotency_key) DO UPDATE
        SET idempotency_key = EXCLUDED.idempotency_key
      RETURNING *, (xmax = 0) AS inserted
    ), audit AS (
      INSERT INTO tax_audit_events (company_id, event_type, actor_user_id, payload)
      SELECT company_id, 'hmrc_payment_recorded', ${userId}::uuid,
        jsonb_build_object('paymentId', id, 'periodStart', period_start, 'amountPence', amount_pence)
      FROM inserted WHERE inserted
      RETURNING id
    )
    SELECT id, amount_pence AS "amountPence", paid_on::text AS "paidOn", reference,
      created_at AS "recordedAt", payload_hash AS "payloadHash", voided_at AS "voidedAt", void_reason AS "voidReason" FROM inserted
  `); } catch (error) {
    if (isDuplicateReceipt(error)) throw new MonthlyLiabilityError('This payment receipt is already recorded. Refresh the summary before adding another payment.', 'CONFLICT_DUPLICATE');
    throw error;
  }
  const row = result.rows[0] as unknown as PayrollHmrcPaymentDto & { payloadHash: string };
  if (!samePayload(row.payloadHash, hash)) throw new MonthlyLiabilityError('This request key was already used for a different payment', 'CONFLICT_DUPLICATE');
  return { id: row.id, amountPence: row.amountPence, paidOn: row.paidOn, reference: row.reference, recordedAt: new Date(row.recordedAt).toISOString(), voidedAt: row.voidedAt ? new Date(row.voidedAt).toISOString() : null, voidReason: row.voidReason };
}

/** Signed, explained local adjustment. It does not file an EPS or claim an allowance. */
export async function recordPayrollHmrcAdjustment(
  userId: string, companyId: string, raw: RecordPayrollHmrcAdjustmentRequest,
): Promise<PayrollHmrcAdjustmentDto> {
  await requireRecordAccess(userId, companyId);
  const input = validated(adjustmentSchema.safeParse(raw));
  const hash = createHash('sha256').update(JSON.stringify({
    periodStart: input.periodStart, amountPence: input.amountPence, reason: input.reason,
  })).digest('hex');
  let result;
  try { result = await db.execute(sql`
    WITH inserted AS (
      INSERT INTO payroll_hmrc_adjustments (company_id, period_start, amount_pence, reason,
        idempotency_key, payload_hash, recorded_by_user_id)
      VALUES (${companyId}::uuid, ${input.periodStart}::date, ${input.amountPence}, ${input.reason},
        ${input.idempotencyKey}, ${hash}, ${userId}::uuid)
      ON CONFLICT (company_id, idempotency_key) DO UPDATE
        SET idempotency_key = EXCLUDED.idempotency_key
      RETURNING *, (xmax = 0) AS inserted
    ), audit AS (
      INSERT INTO tax_audit_events (company_id, event_type, actor_user_id, payload)
      SELECT company_id, 'hmrc_adjustment_recorded', ${userId}::uuid,
        jsonb_build_object('adjustmentId', id, 'periodStart', period_start, 'amountPence', amount_pence)
      FROM inserted WHERE inserted
      RETURNING id
    )
    SELECT id, amount_pence AS "amountPence", reason, created_at AS "recordedAt", payload_hash AS "payloadHash", voided_at AS "voidedAt", void_reason AS "voidReason"
    FROM inserted
  `); } catch (error) {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
      const item = current as { code?: unknown; constraint?: unknown; cause?: unknown };
      if (item.code === '23505' && item.constraint === 'payroll_hmrc_adjustments_evidence_unique') {
        throw new MonthlyLiabilityError('This adjustment evidence is already recorded. Use a distinct supporting reference for a separate adjustment.', 'CONFLICT_DUPLICATE');
      }
      current = item.cause;
    }
    throw error;
  }
  const row = result.rows[0] as unknown as PayrollHmrcAdjustmentDto & { payloadHash: string };
  if (!samePayload(row.payloadHash, hash)) throw new MonthlyLiabilityError('This request key was already used for a different adjustment', 'CONFLICT_DUPLICATE');
  return { id: row.id, amountPence: row.amountPence, reason: row.reason, recordedAt: new Date(row.recordedAt).toISOString(), voidedAt: row.voidedAt ? new Date(row.voidedAt).toISOString() : null, voidReason: row.voidReason };
}

/** Preserve the original evidence and an audit trail when a manual record was wrong. */
export async function voidPayrollHmrcRecord(
  userId: string, companyId: string, kind: 'payments' | 'adjustments', id: string, raw: VoidPayrollHmrcRecordRequest,
): Promise<PayrollHmrcPaymentDto | PayrollHmrcAdjustmentDto> {
  await requireRecordAccess(userId, companyId);
  if (!z.string().uuid().safeParse(id).success) throw new MonthlyLiabilityError('Not found', 'NOT_FOUND');
  const input = validated(voidSchema.safeParse(raw));
  const table = sql.identifier(kind === 'payments' ? 'payroll_hmrc_payments' : 'payroll_hmrc_adjustments');
  const hash = createHash('sha256').update(JSON.stringify({ id, kind, reason: input.reason })).digest('hex');
  const fields = kind === 'payments' ? sql`paid_on::text AS "paidOn", reference` : sql`reason`;
  let result;
  try {
    result = await db.execute(sql`
      WITH target AS MATERIALIZED (
        SELECT * FROM ${table} WHERE company_id = ${companyId}::uuid AND id = ${id}::uuid FOR UPDATE
      ), changed AS (
        UPDATE ${table} p SET voided_at = NOW(), void_reason = ${input.reason},
          voided_by_user_id = ${userId}::uuid, void_idempotency_key = ${input.idempotencyKey}, void_payload_hash = ${hash}
        FROM target t WHERE p.id = t.id AND t.voided_at IS NULL
        RETURNING p.*
      ), audit AS (
        INSERT INTO tax_audit_events (company_id, event_type, actor_user_id, payload)
        SELECT company_id, ${kind === 'payments' ? 'hmrc_payment_voided' : 'hmrc_adjustment_voided'}, ${userId}::uuid,
          jsonb_build_object('recordId', id, 'periodStart', period_start, 'reason', void_reason)
        FROM changed RETURNING id
      ), outcome AS (
        SELECT * FROM changed UNION ALL SELECT * FROM target WHERE voided_at IS NOT NULL
      )
      SELECT id, amount_pence AS "amountPence", ${fields}, created_at AS "recordedAt",
        voided_at AS "voidedAt", void_reason AS "voidReason", void_payload_hash AS "voidPayloadHash" FROM outcome
    `);
  } catch (error) {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
      const item = current as { code?: unknown; constraint?: unknown; cause?: unknown };
      if (item.code === '23505' && typeof item.constraint === 'string' && item.constraint.endsWith('_void_key_unique')) {
        throw new MonthlyLiabilityError('This request key was already used to void another record', 'CONFLICT_DUPLICATE');
      }
      current = item.cause;
    }
    throw error;
  }
  const row = result.rows[0] as unknown as (PayrollHmrcPaymentDto | PayrollHmrcAdjustmentDto) & { voidPayloadHash: string } | undefined;
  if (!row) throw new MonthlyLiabilityError('Not found', 'NOT_FOUND');
  if (!samePayload(row.voidPayloadHash, hash)) throw new MonthlyLiabilityError('This record was already voided with a different reason. Refresh the history.', 'CONFLICT_DUPLICATE');
  const publicRecord = {
    id: row.id, amountPence: row.amountPence, recordedAt: new Date(row.recordedAt).toISOString(),
    voidedAt: new Date(row.voidedAt!).toISOString(), voidReason: row.voidReason,
  };
  return kind === 'payments'
    ? { ...publicRecord, paidOn: (row as PayrollHmrcPaymentDto).paidOn, reference: (row as PayrollHmrcPaymentDto).reference }
    : { ...publicRecord, reason: (row as PayrollHmrcAdjustmentDto).reason };
}
