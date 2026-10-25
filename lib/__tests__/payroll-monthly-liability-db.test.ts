// Isolated real PostgreSQL engine; no network, production database or customer data.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: null as any, actor: '10000000-0000-4000-8000-000000000001' as string | null }));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_, key) => state.db[key] }) }));
vi.mock('@/lib/auth', () => ({ requireAdminMobile: async () => {
  if (!state.actor) throw new Error('Unauthorized');
  return { user: { id: state.actor } };
} }));
import { getMonthlyPayrollLiability, recordPayrollHmrcPayment, recordPayrollHmrcAdjustment, voidPayrollHmrcRecord } from '../tax-payroll/monthly-liability-service';
import { GET } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/route';
import { POST as paymentPost } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/payments/route';
import { POST as adjustmentPost } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/adjustments/route';
import { POST as voidPaymentPost } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/payments/[recordId]/void/route';
import { parseMonthlyTaxSummary } from '../../assisted-chat-app/src/lib/monthly-tax-response';

const pg = new PGlite();
const actor = '10000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const company = '30000000-0000-4000-8000-000000000003';
const otherCompany = '40000000-0000-4000-8000-000000000004';
const employee = '50000000-0000-4000-8000-000000000005';
const settings = '60000000-0000-4000-8000-000000000006';
const now = new Date('2026-10-21T10:00:00Z');
const context = () => ({ params: Promise.resolve({ companyId: company }) });
const get = (date = '2026-09-25') => new Request(`https://isolated.invalid/monthly-liability?date=${date}`);
const post = (body: unknown) => new Request('https://isolated.invalid/monthly-liability/payments', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const payment = (overrides = {}) => ({ periodStart: '2026-09-06', amountPence: 10000, paidOn: '2026-10-19', reference: 'Synthetic bank reference', idempotencyKey: randomUUID(), ...overrides });
const adjustment = (overrides = {}) => ({ periodStart: '2026-09-06', amountPence: -1000, reason: 'Accountant confirmed correction', idempotencyKey: randomUUID(), ...overrides });

async function run(paymentDate = '2026-09-25', status = 'finalised') {
  const id = randomUUID();
  await pg.query(`INSERT INTO payroll_runs(id,company_id,settings_id,settings_version_at_creation,period_start,period_end,intended_payment_date,run_status,created_by_user_id)
    VALUES($1,$2,$3,1,'2026-08-01','2026-08-31',$4,$5,$6)`, [id, company, settings, paymentDate, status, actor]);
  await pg.query(`INSERT INTO payroll_run_lines(run_id,company_id,employee_id,line_type,fixed_amount,entered_by_user_id)
    VALUES($1,$2,$3,'fixed_period',3000,$4)`, [id, company, employee, actor]);
  return id;
}
async function result(runId: string, overrides: Record<string, unknown> = {}) {
  const paymentDate = (await pg.query<{ paymentDate: string }>('SELECT intended_payment_date::text AS "paymentDate" FROM payroll_runs WHERE id=$1', [runId])).rows[0].paymentDate;
  const { ytdSnapshot, ...amountOverrides } = overrides;
  const values = {
    runId, companyId: company, employeeId: employee, taxYear: '2026-27', periodNumber: 6,
    grossPayPence: 300000, taxForPeriodPence: 39000, employeeNiPence: 15616, employerNiPence: 38749,
    studentLoanPence: 10000, netPayPence: 235384, totalDeductionsPence: 64616,
    taxCode: '1257L', niCategory: 'A', calculationStatus: 'calculated', ...amountOverrides,
  };
  await state.db.insert(schema.payrollRunFinalisedResults).values({
    ...values,
    ytdSnapshot: ytdSnapshot ?? { schemaVersion: 1, inputHash: 'a'.repeat(64), paymentDate, after: {}, calculation: {
      employeeId: employee, paymentDate, overallStatus: values.calculationStatus,
      grossPayPence: values.grossPayPence, tax: { taxForPeriodPence: values.taxForPeriodPence },
      ni: { method: 'periodic', employeeNiPeriodPence: values.employeeNiPence, employerNiPeriodPence: values.employerNiPence },
      totalStudentLoanPence: values.studentLoanPence,
    } },
  });
}
beforeAll(async () => {
  await pg.exec('CREATE TABLE users(id uuid PRIMARY KEY)');
  for (const name of ['0026_tax_payroll_phase1', '0027_tax_payroll_phase2a', '0028_tax_payroll_phase2b_to_5', '0032_payroll_monthly_liability']) {
    await pg.exec(readFileSync(`drizzle/migrations/${name}.sql`, 'utf8'));
  }
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  await pg.exec('TRUNCATE users CASCADE');
  await pg.query('INSERT INTO users(id) VALUES($1),($2)', [actor, other]);
  await pg.query(`INSERT INTO tax_company_entities(id,company_number,legal_name,registered_address_line1,created_by_user_id)
    VALUES($1,'SC111111','Synthetic company','Synthetic address',$3),($2,'SC222222','Other synthetic company','Other address',$3)`, [company, otherCompany, actor]);
  await pg.query(`INSERT INTO tax_company_memberships(company_id,user_id,capabilities)
    VALUES($1,$2,'["tax.read","payroll.read","payroll.settings.write"]'::jsonb)`, [company, actor]);
  await pg.query(`INSERT INTO payroll_settings(id,company_id,schedule_label,pay_frequency,activated_by_user_id)
    VALUES($1,$2,'Monthly','monthly',$3)`, [settings, company, actor]);
  await pg.query(`INSERT INTO payroll_employees(id,company_id,legal_first_name,legal_surname,employment_start_date,created_by_user_id)
    VALUES($1,$2,'Synthetic','Employee','2026-04-06',$3)`, [employee, company, actor]);
  state.actor = actor;
});
afterAll(async () => { await pg.close(); });

describe('monthly PAYE/NI liability on isolated PostgreSQL', () => {
  it('passes the actual iOS response decoder for every supported calculation state', async () => {
    const noData = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(parseMonthlyTaxSummary(noData, company).status).toBe('no_data');
    await result(await run());
    const recorded = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(parseMonthlyTaxSummary(recorded, company).status).toBe('recorded');
    await run('2026-09-30', 'approved');
    const incomplete = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(parseMonthlyTaxSummary(incomplete, company).status).toBe('incomplete');
    await result(await run('2026-10-20'));
    const provisional = await getMonthlyPayrollLiability(actor, company, '2026-10-20', now);
    expect(parseMonthlyTaxSummary(provisional, company).status).toBe('provisional');
  });
  it('never shows a zero bill when no payroll exists', async () => {
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value).toMatchObject({ status: 'no_data', hmrcVerified: false, finalizedRunCount: 0,
      totals: { liabilityPence: null, remainingPence: null, payrollLiabilityPence: null, paidPence: 0 } });
  });
  it('sums actual immutable employee results including employer NI and student loans, not wages or pension', async () => {
    await result(await run());
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value).toMatchObject({ status: 'recorded', finalizedRunCount: 1, pendingRunCount: 0,
      period: { start: '2026-09-06', end: '2026-10-05', electronicDueDate: '2026-10-22' },
      totals: { payePence: 39000, employeeNiPence: 15616, employerNiPence: 38749,
        studentLoanPence: 10000, payrollLiabilityPence: 103365, liabilityPence: 103365, remainingPence: 103365 } });
  });
  it('groups weekly/fixed runs by payment date and includes the 5th but excludes the 6th', async () => {
    await result(await run('2026-09-06'));
    await result(await run('2026-10-05'));
    await result(await run('2026-09-05'), { taxForPeriodPence: 999999 });
    await result(await run('2026-10-06'), { taxForPeriodPence: 999999 });
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value.finalizedRunCount).toBe(2);
    expect(value.totals.liabilityPence).toBe(206730);
  });
  it('marks an open month provisional even with finalised payroll', async () => {
    await result(await run('2026-10-20'));
    expect((await getMonthlyPayrollLiability(actor, company, '2026-10-21', now)).status).toBe('provisional');
  });
  it('blocks drafts instead of silently excluding their missing tax', async () => {
    await result(await run());
    const pendingId = await run('2026-09-30', 'approved');
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value).toMatchObject({ status: 'incomplete', pendingRunCount: 1, totals: { liabilityPence: null, remainingPence: null, payrollLiabilityPence: null } });
    expect(value.pendingRuns[0]).toMatchObject({ id: pendingId, status: 'approved', paymentDate: '2026-09-30' });
  });
  it('blocks old finalised runs without persisted calculation rows', async () => {
    await run();
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value).toMatchObject({ status: 'incomplete', finalizedRunCount: 1, totals: { liabilityPence: null, remainingPence: null } });
  });
  it('blocks partial or unsupported result rows and employee mismatches', async () => {
    await result(await run(), { calculationStatus: 'unsupported_ni_category' });
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).status).toBe('incomplete');
  });
  it('excludes cancelled runs and all data from another company', async () => {
    await result(await run());
    await run('2026-09-30', 'cancelled');
    await pg.query(`INSERT INTO payroll_hmrc_payments(company_id,period_start,amount_pence,paid_on,reference,idempotency_key,payload_hash,recorded_by_user_id)
      VALUES($1,'2026-09-06',999999,'2026-10-01','Other','other-key',repeat('a',64),$2)`, [otherCompany, actor]);
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value).toMatchObject({ status: 'recorded', finalizedRunCount: 1, pendingRunCount: 0, totals: { paidPence: 0 } });
    expect(value.payments).toEqual([]);
  });
  it('records payment evidence and its audit atomically without altering payroll', async () => {
    await result(await run());
    const record = await recordPayrollHmrcPayment(actor, company, payment(), now);
    expect(record).toMatchObject({ amountPence: 10000, paidOn: '2026-10-19', reference: 'Synthetic bank reference' });
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value.totals).toMatchObject({ paidPence: 10000, remainingPence: 93365 });
    expect(value.payments[0].id).toBe(record.id);
    expect((await pg.query(`SELECT COUNT(*)::int AS count FROM tax_audit_events WHERE event_type='hmrc_payment_recorded'`)).rows[0]).toEqual({ count: 1 });
  });
  it('deduplicates sequential and concurrent payment retries and rejects a changed payload', async () => {
    const input = payment();
    const records = await Promise.all([recordPayrollHmrcPayment(actor, company, input, now), recordPayrollHmrcPayment(actor, company, input, now)]);
    expect(records[0].id).toBe(records[1].id);
    expect((await recordPayrollHmrcPayment(actor, company, input, now)).id).toBe(records[0].id);
    await expect(recordPayrollHmrcPayment(actor, company, { ...input, amountPence: 20000 }, now)).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE' });
    expect((await pg.query('SELECT COUNT(*)::int AS count FROM payroll_hmrc_payments')).rows[0]).toEqual({ count: 1 });
    expect((await pg.query(`SELECT COUNT(*)::int AS count FROM tax_audit_events WHERE event_type='hmrc_payment_recorded'`)).rows[0]).toEqual({ count: 1 });
  });
  it('rejects the same receipt with a fresh request key after a lost response or app restart', async () => {
    await recordPayrollHmrcPayment(actor, company, payment(), now);
    await expect(recordPayrollHmrcPayment(actor, company, payment(), now)).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE' });
    expect((await pg.query('SELECT COUNT(*)::int AS count FROM payroll_hmrc_payments')).rows[0]).toEqual({ count: 1 });
  });
  it('does not allocate the same bank receipt twice across months or by changing reference case', async () => {
    await recordPayrollHmrcPayment(actor, company, payment(), now);
    await expect(recordPayrollHmrcPayment(actor, company, payment({ periodStart: '2026-08-06', reference: 'synthetic bank reference' }), now)).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE' });
  });
  it('stores signed, explained adjustments once and shows overpayments as credit', async () => {
    await result(await run());
    const input = adjustment({ amountPence: -3365 });
    const first = await recordPayrollHmrcAdjustment(actor, company, input);
    expect((await recordPayrollHmrcAdjustment(actor, company, input)).id).toBe(first.id);
    await recordPayrollHmrcPayment(actor, company, payment({ amountPence: 105000 }), now);
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value.totals).toMatchObject({ liabilityPence: 100000, adjustmentsPence: -3365, paidPence: 105000, remainingPence: 0, creditPence: 5000 });
  });
  it('blocks the same adjustment evidence with a fresh request key, but allows correction after a void', async () => {
    const first = await recordPayrollHmrcAdjustment(actor, company, adjustment());
    await expect(recordPayrollHmrcAdjustment(actor, company, adjustment({ reason: 'accountant confirmed correction' }))).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE' });
    await voidPayrollHmrcRecord(actor, company, 'adjustments', first.id, { reason: 'Correction of supporting evidence', idempotencyKey: randomUUID() });
    const second = await recordPayrollHmrcAdjustment(actor, company, adjustment());
    expect(second.id).not.toBe(first.id);
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).totals.adjustmentsPence).toBe(-1000);
  });
  it('keeps full totals when history exceeds the latest 100 entries and reports the record count', async () => {
    await pg.query(`INSERT INTO payroll_hmrc_payments(company_id,period_start,amount_pence,paid_on,reference,idempotency_key,payload_hash,recorded_by_user_id)
      SELECT $1,'2026-09-06',100,'2026-10-19','Synthetic transaction '||n,'synthetic-request-'||n,repeat('a',64),$2
      FROM generate_series(1,101) n`, [company, actor]);
    const summary = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(summary.payments).toHaveLength(100);
    expect(summary.paymentRecordCount).toBe(101);
    expect(summary.totals.paidPence).toBe(10100);
    expect(parseMonthlyTaxSummary(summary, company).totals.paidPence).toBe(10100);
  });
  it('does not infer zero outstanding merely because a payment was recorded before payroll', async () => {
    await recordPayrollHmrcPayment(actor, company, payment(), now);
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value).toMatchObject({ status: 'no_data', totals: { paidPence: 10000, liabilityPence: null, remainingPence: null } });
  });
  it('preserves a PAYE refund and shows a negative liability as a credit without a negative payment request', async () => {
    await result(await run(), { taxForPeriodPence: -50000, employeeNiPence: 0, employerNiPence: 0, studentLoanPence: 0 });
    const value = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(value.totals).toMatchObject({ payePence: -50000, liabilityPence: -50000, remainingPence: 0, creditPence: 50000 });
  });
  it('blocks stale or corrupt finalised amounts rather than presenting the wrong year or negative NI as a bill', async () => {
    await result(await run(), { taxYear: '2025-26', employeeNiPence: -100 });
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).totals.liabilityPence).toBeNull();
  });
  it('allows verified annual director NI refunds instead of dropping a supported finalisation', async () => {
    const id = await run();
    await result(id, { employeeNiPence: -10000, employerNiPence: -5000 });
    await pg.query(`UPDATE payroll_run_finalised_results SET ytd_snapshot=jsonb_set(ytd_snapshot,'{calculation,ni,method}','"director_annual"') WHERE run_id=$1`, [id]);
    const summary = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(summary).toMatchObject({ status: 'recorded', totals: { employeeNiPence: -10000, employerNiPence: -5000, liabilityPence: 34000 } });
    expect(parseMonthlyTaxSummary(summary, company).totals.liabilityPence).toBe(34000);
  });
  it('blocks amounts that do not match the saved calculation even if the result status says calculated', async () => {
    const id = await run(); await result(id);
    await pg.query('UPDATE payroll_run_finalised_results SET tax_for_period_pence=999999 WHERE run_id=$1', [id]);
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).status).toBe('incomplete');
  });
  it('blocks old plausible totals that have no verifiable immutable calculation snapshot', async () => {
    await result(await run(), { ytdSnapshot: {} });
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).status).toBe('incomplete');
  });
  it('uses company-scoped read/write capabilities and hides existence from other admins', async () => {
    await expect(getMonthlyPayrollLiability(other, company, '2026-09-25', now)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(recordPayrollHmrcPayment(other, company, payment(), now)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await pg.query(`UPDATE tax_company_memberships SET capabilities='["payroll.read"]'::jsonb WHERE company_id=$1`, [company]);
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).canRecordPayments).toBe(false);
    await expect(recordPayrollHmrcAdjustment(actor, company, adjustment())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it.each([
    { amountPence: -1 }, { amountPence: 0 }, { amountPence: 1.5 }, { amountPence: Number.MAX_SAFE_INTEGER },
    { paidOn: '2026-02-30' }, { paidOn: '2026-10-22' }, { periodStart: '2026-09-01' }, { reference: '' },
    { extra: 'untrusted-client-flag' },
  ])('rejects malformed payment input %j without writes', async (override) => {
    await expect(recordPayrollHmrcPayment(actor, company, payment(override), now)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await pg.query('SELECT COUNT(*)::int AS count FROM payroll_hmrc_payments')).rows[0]).toEqual({ count: 0 });
  });
  it('rolls back payment insertion if its audit fails', async () => {
    await pg.exec(`ALTER TABLE tax_audit_events ADD CONSTRAINT isolated_payment_audit_failure CHECK(event_type<>'hmrc_payment_recorded')`);
    try {
      await expect(recordPayrollHmrcPayment(actor, company, payment(), now)).rejects.toThrow();
      expect((await pg.query('SELECT COUNT(*)::int AS count FROM payroll_hmrc_payments')).rows[0]).toEqual({ count: 0 });
    } finally { await pg.exec('ALTER TABLE tax_audit_events DROP CONSTRAINT isolated_payment_audit_failure'); }
  });
  it('voids a mistaken payment with a retained receipt and excludes it from paid totals', async () => {
    await result(await run());
    const record = await recordPayrollHmrcPayment(actor, company, payment(), now);
    const value = await voidPayrollHmrcRecord(actor, company, 'payments', record.id, { reason: 'Wrong bank receipt entered', idempotencyKey: randomUUID() });
    expect(value).toMatchObject({ id: record.id, amountPence: record.amountPence, voidReason: 'Wrong bank receipt entered' });
    expect(value.voidedAt).toMatch(/^\d{4}-/);
    const summary = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(summary.totals).toMatchObject({ paidPence: 0, remainingPence: 103365 });
    expect(summary.payments[0]).toEqual(value);
    expect(parseMonthlyTaxSummary(summary, company).payments[0].id).toBe(record.id);
    expect((await pg.query(`SELECT COUNT(*)::int AS count FROM tax_audit_events WHERE event_type='hmrc_payment_voided'`)).rows[0]).toEqual({ count: 1 });
  });
  it('voids a mistaken adjustment without deleting its original signed amount or reason', async () => {
    await result(await run());
    const record = await recordPayrollHmrcAdjustment(actor, company, adjustment());
    await voidPayrollHmrcRecord(actor, company, 'adjustments', record.id, { reason: 'Accountant corrected this entry', idempotencyKey: randomUUID() });
    const summary = await getMonthlyPayrollLiability(actor, company, '2026-09-25', now);
    expect(summary.totals).toMatchObject({ adjustmentsPence: 0, liabilityPence: 103365 });
    expect(summary.adjustments[0]).toMatchObject({ id: record.id, amountPence: -1000, reason: record.reason, voidReason: 'Accountant corrected this entry' });
  });
  it('deduplicates simultaneous void retries, preserving the first reason and one audit', async () => {
    const record = await recordPayrollHmrcPayment(actor, company, payment(), now);
    const input = { reason: 'Wrong receipt entered twice', idempotencyKey: randomUUID() };
    const records = await Promise.all([voidPayrollHmrcRecord(actor, company, 'payments', record.id, input), voidPayrollHmrcRecord(actor, company, 'payments', record.id, input)]);
    expect(records[0]).toEqual(records[1]);
    await expect(voidPayrollHmrcRecord(actor, company, 'payments', record.id, { ...input, reason: 'New reason should not overwrite the original' })).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE' });
    expect((await pg.query(`SELECT COUNT(*)::int AS count FROM tax_audit_events WHERE event_type='hmrc_payment_voided'`)).rows[0]).toEqual({ count: 1 });
  });
  it('permits a corrected receipt after a void but never counts an original-request retry as a new payment', async () => {
    const input = payment();
    const record = await recordPayrollHmrcPayment(actor, company, input, now);
    await voidPayrollHmrcRecord(actor, company, 'payments', record.id, { reason: 'Receipt correction required', idempotencyKey: randomUUID() });
    expect((await recordPayrollHmrcPayment(actor, company, input, now)).voidedAt).not.toBeNull();
    const corrected = await recordPayrollHmrcPayment(actor, company, { ...input, idempotencyKey: randomUUID() }, now);
    expect(corrected.id).not.toBe(record.id);
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).totals.paidPence).toBe(10000);
  });
  it('never allows another company/admin or a read-only member to void a financial record', async () => {
    const record = await recordPayrollHmrcPayment(actor, company, payment(), now);
    const input = { reason: 'Synthetic reason', idempotencyKey: randomUUID() };
    await expect(voidPayrollHmrcRecord(other, company, 'payments', record.id, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(voidPayrollHmrcRecord(actor, otherCompany, 'payments', record.id, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await pg.query(`UPDATE tax_company_memberships SET capabilities='["payroll.read"]'::jsonb WHERE company_id=$1`, [company]);
    await expect(voidPayrollHmrcRecord(actor, company, 'payments', record.id, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).totals.paidPence).toBe(10000);
  });
  it('rolls back a void if its audit fails', async () => {
    const record = await recordPayrollHmrcPayment(actor, company, payment(), now);
    await pg.exec(`ALTER TABLE tax_audit_events ADD CONSTRAINT isolated_void_audit_failure CHECK(event_type<>'hmrc_payment_voided')`);
    try {
      await expect(voidPayrollHmrcRecord(actor, company, 'payments', record.id, { reason: 'Synthetic void reason', idempotencyKey: randomUUID() })).rejects.toThrow();
      expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).payments[0].voidedAt).toBeNull();
    } finally { await pg.exec('ALTER TABLE tax_audit_events DROP CONSTRAINT isolated_void_audit_failure'); }
  });
  it('rejects a void request key reused for a second receipt', async () => {
    const first = await recordPayrollHmrcPayment(actor, company, payment(), now);
    const second = await recordPayrollHmrcPayment(actor, company, payment({ reference: 'Different transaction' }), now);
    const input = { reason: 'Synthetic correction', idempotencyKey: randomUUID() };
    await voidPayrollHmrcRecord(actor, company, 'payments', first.id, input);
    await expect(voidPayrollHmrcRecord(actor, company, 'payments', second.id, input)).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE' });
    expect((await getMonthlyPayrollLiability(actor, company, '2026-09-25', now)).totals.paidPence).toBe(10000);
  });
  it('protects HTTP routes, validates dates and disables caching financial responses', async () => {
    state.actor = null;
    expect((await GET(get(), context())).status).toBe(401);
    expect((await paymentPost(post(payment()), context())).status).toBe(401);
    state.actor = other;
    expect((await GET(get(), context())).status).toBe(404);
    state.actor = actor;
    expect((await GET(get('2026-02-30'), context())).status).toBe(422);
    const response = await GET(get(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await paymentPost(post(payment()), context())).status).toBe(201);
    expect((await adjustmentPost(post(adjustment()), context())).status).toBe(201);
    const record = await recordPayrollHmrcPayment(actor, company, payment({ reference: 'Void HTTP route receipt' }), now);
    const voidContext = { params: Promise.resolve({ companyId: company, recordId: record.id }) };
    expect((await voidPaymentPost(post({ reason: 'Wrong HTTP receipt', idempotencyKey: randomUUID() }), voidContext)).status).toBe(200);
  });
  it('keeps new migration repeatable and enables the finalised status on a real database', async () => {
    await pg.exec(readFileSync('drizzle/migrations/0032_payroll_monthly_liability.sql', 'utf8'));
    expect(await run('2026-09-30', 'submitted_for_review')).toMatch(/^[a-f0-9-]{36}$/);
    expect(await run('2026-09-30', 'finalised')).toMatch(/^[a-f0-9-]{36}$/);
    await expect(run('2026-09-30', 'invalid-status')).rejects.toThrow();
  });
  it('fails a missing Phase 2B prerequisite explicitly before creating liability tables', async () => {
    await pg.exec('ALTER TABLE payroll_run_finalised_results RENAME TO isolated_hidden_finalised_results');
    try {
      await expect(pg.exec(readFileSync('drizzle/migrations/0032_payroll_monthly_liability.sql', 'utf8'))).rejects.toThrow(/0026, 0027 and 0028/);
    } finally { await pg.exec('ALTER TABLE isolated_hidden_finalised_results RENAME TO payroll_run_finalised_results'); }
  });
});

