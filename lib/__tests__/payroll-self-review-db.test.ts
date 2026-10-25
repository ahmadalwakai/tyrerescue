// Actual PostgreSQL, opaque device authentication, HTTP handlers and services.
// All companies, users and credentials are synthetic; no external connection.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock('@/lib/db', async () => ({
  ...await import('../db/schema'), db: new Proxy({}, { get: (_, key) => Reflect.get(state.db, key) }),
}));
vi.mock('@/lib/tax-payroll/write-transaction', () => ({ withTaxWriteTransaction:
  (fn: Parameters<PgliteDatabase<typeof schema>['transaction']>[0]) => state.db.transaction(fn) }));
vi.mock('next-auth', () => ({ default: () => ({ handlers: {}, auth: async () => null, signIn: vi.fn(), signOut: vi.fn() }) }));

import { createAdminDeviceSession } from '../auth/admin-device-sessions';
import { submitForReview, processReview } from '../tax-payroll/review-service';
import { listAuditEvents } from '../tax-payroll/audit-service';
import { POST as companyPost } from '../../app/api/admin/tax/companies/route';
import { POST as activatePost } from '../../app/api/admin/tax/companies/[companyId]/payroll/settings/route';
import { POST as employeePost } from '../../app/api/admin/tax/companies/[companyId]/employees/route';
import { PATCH as setupPatch } from '../../app/api/admin/tax/companies/[companyId]/payroll/employees/[employeeId]/tax-setup/route';
import { POST as runPost } from '../../app/api/admin/tax/companies/[companyId]/payroll/runs/route';
import { GET as runGet, PATCH as earningsPatch } from '../../app/api/admin/tax/companies/[companyId]/payroll/runs/[runId]/route';
import { POST as submitPost, PATCH as reviewPatch } from '../../app/api/admin/tax/companies/[companyId]/payroll/runs/[runId]/review/route';
import { POST as finalisePost } from '../../app/api/admin/tax/companies/[companyId]/payroll/runs/[runId]/finalise/route';
import { GET as monthlyGet } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/route';
import { parseMonthlyTaxSummary } from '../../assisted-chat-app/src/lib/monthly-tax-response';

const pg = new PGlite();
const actor = '10000000-0000-4000-8000-000000000001';
const member = '20000000-0000-4000-8000-000000000002';
const outsider = '30000000-0000-4000-8000-000000000003';
let tokens: Record<string, string>;
let companyId: string;
const companyContext = () => ({ params: Promise.resolve({ companyId }) });
const runContext = (runId: string) => ({ params: Promise.resolve({ companyId, runId }) });
function request(body?: unknown, method = 'POST', user: string | null = actor) {
  return new Request('https://isolated.invalid/api/admin/tax?date=2026-04-30', { method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const taxSetup = (overrides = {}) => ({ expectedVersion: 1, taxCode: '1257L', taxCodeBasis: 'cumulative',
  taxCodeSource: 'starter_checklist', taxCodeEffectiveDate: '2026-04-06', niCategory: 'A', niMethod: 'periodic',
  sourceType: 'first_payroll_this_tax_year', openingYtdTaxYear: '2026-27', openingYtdEffectiveDate: '2026-04-06',
  openingYtdGrossPay: '0.00', openingYtdTaxPaid: '0.00', openingYtdNiEmployee: '0.00', openingYtdNiEmployer: '0.00',
  openingYtdStudentLoanDeductions: '0.00', openingYtdPensionEmployee: '0.00', openingYtdPensionEmployer: '0.00',
  studentLoanPlans: [], postgraduateLoan: false, studentLoanUnknown: false, pensionHandling: 'none_confirmed', ...overrides });
async function changeTax(employeeId: string) {
  const response = await setupPatch(request(taxSetup({ expectedVersion: 2, taxCode: 'BR' }), 'PATCH'),
    { params: Promise.resolve({ companyId, employeeId }) });
  expect(response.status).toBe(200);
}
async function prepareRun() {
  const employeeResponse = await employeePost(request({ legalFirstName: 'Synthetic', legalSurname: 'Employee', employmentStartDate: '2026-04-06' }), companyContext());
  expect(employeeResponse.status).toBe(201);
  const employeeId = (await employeeResponse.json()).id as string;
  expect((await setupPatch(request(taxSetup(), 'PATCH'), { params: Promise.resolve({ companyId, employeeId }) })).status).toBe(200);
  const runResponse = await runPost(request({ periodStart: '2026-04-06', periodEnd: '2026-04-30', intendedPaymentDate: '2026-04-30' }), companyContext());
  expect(runResponse.status).toBe(201);
  const runId = (await runResponse.json()).id as string;
  const earnings = await earningsPatch(request({ employeeId, expectedVersion: 1,
    lines: [{ lineType: 'fixed_period', fixedAmount: '2500.00' }] }, 'PATCH'), runContext(runId));
  expect(earnings.status).toBe(200);
  return { runId, employeeId };
}
async function submit(runId: string, expectedVersion = 2) {
  const response = await submitPost(request({ expectedVersion }), runContext(runId));
  expect(response.status).toBe(201);
  return (await response.json()).review as { id: string; status: string; version: number };
}
async function approve(runId: string) {
  const review = await submit(runId);
  const response = await reviewPatch(request({ action: 'approve', expectedVersion: review.version, notes: 'I checked the payroll calculation.' }, 'PATCH'), runContext(runId));
  expect(response.status).toBe(200);
  return (await response.json()).review;
}
async function counts() {
  return (await pg.query(`SELECT (SELECT count(*)::int FROM payroll_run_finalised_results) AS results,
    (SELECT count(*)::int FROM journal_entries) AS journals,
    (SELECT count(*)::int FROM tax_audit_events WHERE event_type='payroll_finalised') AS finalisations,
    (SELECT count(*)::int FROM tax_audit_events WHERE event_type='review_approved') AS approvals`)).rows[0];
}
beforeAll(async () => {
  await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE NOT NULL,
    password_hash varchar(255), name varchar(255) NOT NULL, phone varchar(20), role text NOT NULL,
    email_verified boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE admin_push_tokens(id uuid PRIMARY KEY);`);
  for (const migration of ['0026_tax_payroll_phase1', '0027_tax_payroll_phase2a', '0028_tax_payroll_phase2b_to_5',
    '0030_admin_device_sessions', '0031_admin_device_session_activity', '0032_payroll_monthly_liability']) {
    await pg.exec(readFileSync(`drizzle/migrations/${migration}.sql`, 'utf8'));
  }
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  await pg.exec('TRUNCATE users CASCADE');
  await pg.query(`INSERT INTO users(id,email,name,role,email_verified) VALUES
    ($1,'founder@isolated.invalid','Synthetic Founder','admin',true),
    ($2,'member@isolated.invalid','Synthetic Member','admin',true),
    ($3,'outsider@isolated.invalid','Synthetic Outsider','admin',true)`, [actor, member, outsider]);
  tokens = {};
  for (const user of [actor, member, outsider]) tokens[user] = await createAdminDeviceSession(user, { platform: 'ios' });
  const company = await companyPost(request({ companyNumber: 'SC123456', legalName: 'Synthetic Ltd', registeredAddressLine1: 'Fixture only' }));
  expect(company.status).toBe(201);
  companyId = (await company.json()).id as string;
  expect((await activatePost(request({ scheduleLabel: 'Monthly wages', payFrequency: 'monthly', monthlyPayDay: 28 }), companyContext())).status).toBe(201);
});
afterAll(async () => { await pg.close(); });

describe('explicit self review through authenticated payroll HTTP endpoints', () => {
  it('lets the same authorised admin enter earnings, submit, approve and finalise into one verified monthly liability', async () => {
    const { runId } = await prepareRun();
    const reviewed = await approve(runId);
    expect(reviewed).toMatchObject({ submittedByUserId: actor, reviewedByUserId: actor, status: 'approved', version: 2 });
    expect(Number.isFinite(Date.parse(reviewed.reviewedAt))).toBe(true);
    expect(await counts()).toEqual({ results: 0, journals: 0, finalisations: 0, approvals: 1 });
    const approvalAudit = (await pg.query("SELECT actor_user_id,payload FROM tax_audit_events WHERE event_type='review_approved'")).rows[0];
    expect(approvalAudit).toMatchObject({ actor_user_id: actor, payload: { selfReviewed: true, approvalMode: 'self_review', reviewId: reviewed.id } });
    const activity = await listAuditEvents(companyId);
    expect(activity.events.find((event) => event.eventType as string === 'review_approved')?.summary)
      .toBe('Payroll approved by the same administrator who submitted it');
    const finalise = await finalisePost(request({ expectedVersion: 4 }), runContext(runId));
    expect(finalise.status).toBe(200);
    const result = await finalise.json();
    expect(result).toMatchObject({ runId, finalised: true, finalisedByUserId: actor, totalGrossPounds: '2500.00', totalHmrcLiabilityPounds: '718.81' });
    const monthly = await monthlyGet(request(undefined, 'GET'), companyContext());
    expect(monthly.status).toBe(200);
    const summary = await monthly.json();
    expect(parseMonthlyTaxSummary(summary, companyId).status).toBe('recorded');
    expect(summary).toMatchObject({ finalizedRunCount: 1, pendingRunCount: 0, totals: { liabilityPence: 71881, remainingPence: 71881 } });
    const audit = (await pg.query("SELECT actor_user_id,payload FROM tax_audit_events WHERE event_type='payroll_finalised'")).rows[0];
    expect(audit).toMatchObject({ actor_user_id: actor, payload: { reviewedByUserId: actor, submittedByUserId: actor,
      selfReviewed: true, approvalMode: 'self_review', reviewId: reviewed.id } });
    const saved = (await pg.query('SELECT ytd_snapshot FROM payroll_run_finalised_results')).rows[0];
    expect(saved).toMatchObject({ ytd_snapshot: { finalisedByUserId: actor } });
    const balances = (await pg.query('SELECT sum(debit_pence-credit_pence)::int AS balance FROM journal_lines')).rows[0];
    expect(balances).toEqual({ balance: 0 });
    expect(await counts()).toEqual({ results: 1, journals: 1, finalisations: 1, approvals: 1 });
  });

  it('allows an explicit self rejection and a fresh submission without auto approving or finalising', async () => {
    const { runId } = await prepareRun();
    const first = await submit(runId);
    const rejected = await reviewPatch(request({ action: 'reject', expectedVersion: 1, notes: 'I need to correct these earnings.' }, 'PATCH'), runContext(runId));
    expect(rejected.status).toBe(200);
    expect((await rejected.json()).review).toMatchObject({ id: first.id, status: 'rejected', reviewedByUserId: actor });
    const run = await (await runGet(request(undefined, 'GET'), runContext(runId))).json();
    expect(run).toMatchObject({ runStatus: 'draft', version: 4 });
    expect(await counts()).toEqual({ results: 0, journals: 0, finalisations: 0, approvals: 0 });
    const fresh = await submit(runId, 4);
    expect(fresh.id).not.toBe(first.id);
    expect(fresh.status).toBe('pending');
    const audit = (await pg.query("SELECT payload FROM tax_audit_events WHERE event_type='review_rejected'")).rows[0];
    expect(audit).toMatchObject({ payload: { selfReviewed: true, approvalMode: 'self_review' } });
    expect((await listAuditEvents(companyId)).events.find((event) => event.eventType as string === 'review_rejected')?.summary)
      .toBe('Payroll rejected by the same administrator who submitted it');
  });

  it('does not grant approval capability merely because the actor submitted the run', async () => {
    const { runId } = await prepareRun();
    await submit(runId);
    await pg.query(`UPDATE tax_company_memberships SET capabilities='["tax.read","payroll.read","payroll.draft.write"]'::jsonb
      WHERE company_id=$1 AND user_id=$2`, [companyId, actor]);
    expect((await reviewPatch(request({ action: 'approve', expectedVersion: 1 }, 'PATCH'), runContext(runId))).status).toBe(404);
    expect((await pg.query('SELECT status FROM tax_reviews')).rows[0]).toEqual({ status: 'pending' });
    expect(await counts()).toEqual({ results: 0, journals: 0, finalisations: 0, approvals: 0 });
    const caps = (await pg.query('SELECT capabilities FROM tax_company_memberships WHERE user_id=$1', [actor])).rows[0].capabilities;
    expect(caps).not.toContain('payroll.settings.write');
  });

  it('rejects unauthenticated, outsider, read-only and draft-only approval attempts without changing review state', async () => {
    const { runId } = await prepareRun();
    await submit(runId);
    const body = { action: 'approve', expectedVersion: 1 };
    expect((await reviewPatch(request(body, 'PATCH', null), runContext(runId))).status).toBe(401);
    expect((await reviewPatch(request(body, 'PATCH', outsider), runContext(runId))).status).toBe(404);
    await pg.query(`INSERT INTO tax_company_memberships(company_id,user_id,capabilities) VALUES($1,$2,'["tax.read","payroll.read"]'::jsonb)`, [companyId, member]);
    expect((await reviewPatch(request(body, 'PATCH', member), runContext(runId))).status).toBe(404);
    await pg.query(`UPDATE tax_company_memberships SET capabilities=capabilities || '["payroll.draft.write"]'::jsonb WHERE user_id=$1`, [member]);
    expect((await reviewPatch(request(body, 'PATCH', member), runContext(runId))).status).toBe(404);
    expect((await pg.query('SELECT status FROM tax_reviews')).rows[0]).toEqual({ status: 'pending' });
    expect(await counts()).toEqual({ results: 0, journals: 0, finalisations: 0, approvals: 0 });
  });

  it('blocks self approval of payroll figures changed after submission but permits rejection for correction', async () => {
    const { runId, employeeId } = await prepareRun();
    await submit(runId);
    await changeTax(employeeId);
    const response = await reviewPatch(request({ action: 'approve', expectedVersion: 1 }, 'PATCH'), runContext(runId));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('CONFLICT_VERSION');
    expect((await pg.query('SELECT status FROM tax_reviews')).rows[0]).toEqual({ status: 'pending' });
    expect((await reviewPatch(request({ action: 'reject', expectedVersion: 1 }, 'PATCH'), runContext(runId))).status).toBe(200);
    expect(await counts()).toEqual({ results: 0, journals: 0, finalisations: 0, approvals: 0 });
  });

  it('blocks finalisation when inputs changed after self approval instead of finalising unreviewed figures', async () => {
    const { runId, employeeId } = await prepareRun();
    await approve(runId);
    await changeTax(employeeId);
    const response = await finalisePost(request({ expectedVersion: 4 }), runContext(runId));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('inputs changed after review');
    expect(await counts()).toEqual({ results: 0, journals: 0, finalisations: 0, approvals: 1 });
    expect((await pg.query('SELECT run_status FROM payroll_runs')).rows[0]).toEqual({ run_status: 'approved' });
  });

  it('preserves expected review and run versions for self approval and finalisation', async () => {
    const { runId } = await prepareRun();
    await submit(runId);
    expect((await reviewPatch(request({ action: 'approve', expectedVersion: 99 }, 'PATCH'), runContext(runId))).status).toBe(409);
    expect((await reviewPatch(request({ action: 'approve', expectedVersion: 1 }, 'PATCH'), runContext(runId))).status).toBe(200);
    expect((await finalisePost(request({ expectedVersion: 99 }), runContext(runId))).status).toBe(409);
    expect(await counts()).toEqual({ results: 0, journals: 0, finalisations: 0, approvals: 1 });
    expect((await finalisePost(request({ expectedVersion: 4 }), runContext(runId))).status).toBe(200);
  });

  it('accepts exactly one concurrent self approval and replays immutable finalisation without duplicate liability', async () => {
    const { runId } = await prepareRun();
    await submit(runId);
    const requests = await Promise.all([1, 2].map(() => reviewPatch(request({ action: 'approve', expectedVersion: 1 }, 'PATCH'), runContext(runId))));
    expect(requests.filter((response) => response.status === 200)).toHaveLength(1);
    expect(requests.filter((response) => [404, 409, 422].includes(response.status))).toHaveLength(1);
    const finalisations = await Promise.all([1, 2].map(() => finalisePost(request({ expectedVersion: 4 }), runContext(runId))));
    expect(finalisations.map((response) => response.status)).toEqual([200, 200]);
    expect(await finalisations[0].json()).toEqual(await finalisations[1].json());
    expect(await counts()).toEqual({ results: 1, journals: 1, finalisations: 1, approvals: 1 });
  });

  it('does not permit another company context to approve or finalise the actor own run', async () => {
    const { runId } = await prepareRun();
    await submit(runId);
    const ownCompany = companyId;
    const other = await companyPost(request({ companyNumber: 'SC654321', legalName: 'Other Synthetic Ltd', registeredAddressLine1: 'Other fixture' }));
    companyId = (await other.json()).id;
    expect((await activatePost(request({ scheduleLabel: 'Other monthly wages', payFrequency: 'monthly', monthlyPayDay: 28 }), companyContext())).status).toBe(201);
    expect((await reviewPatch(request({ action: 'approve', expectedVersion: 1 }, 'PATCH'), runContext(runId))).status).toBe(404);
    expect((await finalisePost(request({ expectedVersion: 4 }), runContext(runId))).status).toBe(404);
    expect((await pg.query('SELECT status FROM tax_reviews WHERE company_id=$1', [ownCompany])).rows[0]).toEqual({ status: 'pending' });
  });

  it('retains separate-reviewer policy for both VAT and Corporation Tax returns', async () => {
    for (const entityType of ['vat_return', 'corporation_tax_return'] as const) {
      const review = await submitForReview(actor, companyId, entityType, randomUUID(), 1);
      for (const action of ['approve', 'reject'] as const) {
        await expect(processReview(actor, companyId, review.id, action, 1)).rejects.toMatchObject({ code: 'SELF_REVIEW' });
      }
      expect((await pg.query('SELECT status,reviewed_by_user_id FROM tax_reviews WHERE id=$1', [review.id])).rows[0])
        .toEqual({ status: 'pending', reviewed_by_user_id: null });
    }
    expect(await counts()).toEqual({ results: 0, journals: 0, finalisations: 0, approvals: 0 });
  });

  it('cannot process a different tax entity through the payroll-review URL', async () => {
    const { runId } = await prepareRun();
    const review = await submitForReview(actor, companyId, 'vat_return', runId, 1);
    const response = await reviewPatch(request({ action: 'approve', expectedVersion: 1 }, 'PATCH'), runContext(runId));
    expect(response.status).toBe(404);
    expect((await pg.query('SELECT status FROM tax_reviews WHERE id=$1', [review.id])).rows[0]).toEqual({ status: 'pending' });
  });
});
