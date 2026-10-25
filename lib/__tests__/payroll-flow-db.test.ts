// Synthetic PostgreSQL only. The HTTP database and the write connection are
// replaced together; no environment secret or real network is read.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
const state = vi.hoisted(() => ({ db: null as any, actor: '10000000-0000-4000-8000-000000000001' }));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_, key) => state.db[key] }) }));
vi.mock('@/lib/tax-payroll/write-transaction', () => ({ withTaxWriteTransaction: (fn: any) => state.db.transaction(fn) }));
vi.mock('@/lib/auth', () => ({ requireAdminMobile: async () => ({ user: { id: state.actor } }) }));
import { createCompany, updateCompany, declareRegistrationStatus } from '../tax-payroll/company-service';
import { activatePayroll, updatePayrollSettings } from '../tax-payroll/payroll-settings-service';
import { createEmployee, updateEmployee } from '../tax-payroll/employee-service';
import { createPayTerms } from '../tax-payroll/pay-terms-service';
import { createPayrollRun, upsertRunLines, calculateDraftPreview, cancelPayrollRun, getPayrollRun } from '../tax-payroll/payroll-draft-service';
import { saveEmployeeTaxSetup, getEmployeeTaxSetup, employeeTaxSetupSchema } from '../tax-payroll/employee-tax-setup';
import { submitForReview, processReview } from '../tax-payroll/review-service';
import { POST as activateRoute } from '../../app/api/admin/tax/companies/[companyId]/payroll/settings/route';
import { PATCH as taxSetupRoute, GET as taxSetupGetRoute } from '../../app/api/admin/tax/companies/[companyId]/payroll/employees/[employeeId]/tax-setup/route';
import { ALL_PAYROLL_CAPABILITIES, FOUNDER_CAPABILITIES } from '../tax-payroll/permissions';
import { listCompanyMembers, changeCompanyMember } from '../tax-payroll/company-members-service';

const pg = new PGlite();
const actor = '10000000-0000-4000-8000-000000000001';
const reviewer = '20000000-0000-4000-8000-000000000002';
let companyId: string;
const schedule = { scheduleLabel: 'Monthly wages', payFrequency: 'monthly' as const, monthlyPayDay: 28 };
const employeeInput = { legalFirstName: 'Synthetic', legalSurname: 'Employee', employmentStartDate: '2026-04-06' };
const runInput = { periodStart: '2026-10-01', periodEnd: '2026-10-31', intendedPaymentDate: '2026-10-31' };
const setupInput = () => employeeTaxSetupSchema.parse({ expectedVersion: 1, taxCode: 'S1257L', taxCodeBasis: 'cumulative',
  taxCodeSource: 'starter_checklist', taxCodeEffectiveDate: '2026-04-06', niCategory: 'A', niMethod: 'periodic',
  sourceType: 'first_payroll_this_tax_year', openingYtdTaxYear: '2026-27', openingYtdEffectiveDate: '2026-04-06',
  openingYtdGrossPay: '0.00', openingYtdTaxPaid: '0.00', openingYtdNiEmployee: '0.00', openingYtdNiEmployer: '0.00',
  openingYtdStudentLoanDeductions: '0.00', openingYtdPensionEmployee: '0.00', openingYtdPensionEmployer: '0.00',
  studentLoanPlans: [], postgraduateLoan: false, studentLoanUnknown: false, pensionHandling: 'none_confirmed' });
const ctx = (employeeId: string) => ({ params: Promise.resolve({ companyId, employeeId }) });
const req = (payload: unknown, method = 'PATCH') => new Request('https://isolated.invalid/tax', { method,
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
async function prepareRun() {
  await activatePayroll(actor, companyId, schedule);
  const employee = await createEmployee(actor, companyId, employeeInput);
  await saveEmployeeTaxSetup(actor, companyId, employee.id, setupInput());
  const run = await createPayrollRun(actor, companyId, runInput);
  await upsertRunLines(actor, companyId, run.id, { employeeId: employee.id, expectedVersion: 1,
    lines: [{ lineType: 'fixed_period', fixedAmount: '2500.00' }] });
  return { run, employee };
}
beforeAll(async () => {
  await pg.exec("CREATE TABLE users (id uuid PRIMARY KEY, email varchar(255) UNIQUE NOT NULL, name varchar(255) NOT NULL, role text NOT NULL, email_verified boolean NOT NULL)");
  for (const migration of ['0026_tax_payroll_phase1.sql', '0027_tax_payroll_phase2a.sql', '0028_tax_payroll_phase2b_to_5.sql', '0032_payroll_monthly_liability.sql']) {
    await pg.exec(readFileSync(`drizzle/migrations/${migration}`, 'utf8'));
  }
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  await pg.exec('TRUNCATE users CASCADE');
  await pg.query("INSERT INTO users (id, email, name, role, email_verified) VALUES ($1, 'founder@isolated.invalid', 'Founder', 'admin', true), ($2, 'reviewer@isolated.invalid', 'Reviewer', 'admin', true)", [actor, reviewer]);
  state.actor = actor;
  const company = await createCompany(actor, { companyNumber: 'SC123456', legalName: 'Synthetic Ltd', registeredAddressLine1: 'Fixture only' });
  companyId = company.id;
});
afterAll(async () => { await pg.close(); });

describe('supported atomic payroll write workflow', () => {
  it('grants a separate verified reviewer only through a founder action after payroll activation', async () => {
    await expect(changeCompanyMember(actor, companyId, { email: 'reviewer@isolated.invalid', action: 'grant_payroll' })).rejects.toMatchObject({ code: 'NOT_ACTIVATED' });
    await activatePayroll(actor, companyId, schedule);
    const result = await changeCompanyMember(actor, companyId, { email: 'reviewer@isolated.invalid', action: 'grant_payroll' });
    expect(result).toMatchObject({ canManage: true });
    expect(result.members.find((member) => member.userId === reviewer)?.capabilities).toEqual(['tax.read', 'tax.audit.read', ...ALL_PAYROLL_CAPABILITIES]);
    expect(await listCompanyMembers(reviewer, companyId)).toEqual({ canManage: false, members: [] });
  });
  it('does not allow an unverified admin or customer to receive company payroll access', async () => {
    await activatePayroll(actor, companyId, schedule);
    for (const patch of [{ emailVerified: false }, { emailVerified: true, role: 'customer' }]) {
      await state.db.update(schema.users).set(patch).where(eq(schema.users.id, reviewer));
      await expect(changeCompanyMember(actor, companyId, { email: 'reviewer@isolated.invalid', action: 'grant_payroll' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect((await state.db.select().from(schema.taxCompanyMemberships))).toHaveLength(1);
  });
  it('prevents nonfounder management and founder removal, preserving the other company membership', async () => {
    await activatePayroll(actor, companyId, schedule);
    await changeCompanyMember(actor, companyId, { email: 'reviewer@isolated.invalid', action: 'grant_payroll' });
    await expect(changeCompanyMember(reviewer, companyId, { email: 'founder@isolated.invalid', action: 'revoke' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(changeCompanyMember(actor, companyId, { email: 'founder@isolated.invalid', action: 'revoke' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const other = await createCompany(reviewer, { companyNumber: 'SC987654', legalName: 'Other synthetic Ltd', registeredAddressLine1: 'Fixture' });
    await changeCompanyMember(actor, companyId, { email: 'reviewer@isolated.invalid', action: 'revoke' });
    expect((await state.db.select().from(schema.taxCompanyMemberships).where(eq(schema.taxCompanyMemberships.companyId, other.id)))).toHaveLength(1);
    expect((await listCompanyMembers(actor, companyId)).members).toHaveLength(1);
  });
  it('rolls back membership grants when the access audit cannot be written', async () => {
    await activatePayroll(actor, companyId, schedule);
    await pg.exec("ALTER TABLE tax_audit_events ADD CONSTRAINT synthetic_membership_failure CHECK(event_type <> 'company_payroll_access_granted')");
    try {
      await expect(changeCompanyMember(actor, companyId, { email: 'reviewer@isolated.invalid', action: 'grant_payroll' })).rejects.toThrow();
      expect((await listCompanyMembers(actor, companyId)).members).toHaveLength(1);
    } finally { await pg.exec('ALTER TABLE tax_audit_events DROP CONSTRAINT synthetic_membership_failure'); }
  });
  it('lets a founder with tax capabilities explicitly activate payroll and preserves existing capabilities', async () => {
    const response = await activateRoute(req(schedule, 'POST'), { params: Promise.resolve({ companyId }) });
    expect(response.status).toBe(201);
    const [membership] = await state.db.select().from(schema.taxCompanyMemberships);
    expect(membership.capabilities).toEqual([...FOUNDER_CAPABILITIES, ...ALL_PAYROLL_CAPABILITIES]);
    expect((await state.db.select().from(schema.payrollSettingsRevisions))).toHaveLength(1);
    await expect(activatePayroll(actor, companyId, schedule)).rejects.toMatchObject({ code: 'ALREADY_ACTIVATED' });
  });
  it('does not allow another member to activate on behalf of the founder', async () => {
    await state.db.insert(schema.taxCompanyMemberships).values({ companyId, userId: reviewer, capabilities: [...FOUNDER_CAPABILITIES] });
    await expect(activatePayroll(reviewer, companyId, schedule)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await state.db.select().from(schema.payrollSettings))).toHaveLength(0);
  });
  it('rolls back activation and capability grants when audit insertion fails', async () => {
    await pg.exec("ALTER TABLE tax_audit_events ADD CONSTRAINT synthetic_activation_failure CHECK(event_type <> 'payroll_activated')");
    try {
      await expect(activatePayroll(actor, companyId, schedule)).rejects.toThrow();
      expect((await state.db.select().from(schema.payrollSettings))).toHaveLength(0);
      expect((await state.db.select().from(schema.taxCompanyMemberships))[0].capabilities).toEqual(FOUNDER_CAPABILITIES);
    } finally { await pg.exec('ALTER TABLE tax_audit_events DROP CONSTRAINT synthetic_activation_failure'); }
  });
  it('updates company and registration status with history using the supported write connection', async () => {
    const updated = await updateCompany(actor, companyId, { expectedVersion: 1, legalName: 'Updated synthetic Ltd' });
    expect(updated.version).toBe(2);
    await expect(updateCompany(actor, companyId, { expectedVersion: 1, legalName: 'Stale' })).rejects.toMatchObject({ code: 'CONFLICT_VERSION' });
    await declareRegistrationStatus(actor, companyId, 'paye', 'registered');
    expect((await state.db.select().from(schema.taxRegistrationStatuses).where(and(eq(schema.taxRegistrationStatuses.companyId, companyId), eq(schema.taxRegistrationStatuses.taxService, 'paye'))))[0].status).toBe('registered');
  });
  it('enforces settings optimistic concurrency and rolls back stale updates', async () => {
    await activatePayroll(actor, companyId, schedule);
    expect((await updatePayrollSettings(actor, companyId, { expectedVersion: 1, scheduleLabel: 'Revised' })).version).toBe(2);
    await expect(updatePayrollSettings(actor, companyId, { expectedVersion: 1, scheduleLabel: 'Stale' })).rejects.toMatchObject({ code: 'CONFLICT_VERSION' });
    expect((await state.db.select().from(schema.payrollSettingsRevisions))).toHaveLength(2);
  });
  it('keeps employee creation idempotent and rejects payload changes under the same key', async () => {
    const a = await createEmployee(actor, companyId, { ...employeeInput, idempotencyKey: 'employee-1' });
    const b = await createEmployee(actor, companyId, { ...employeeInput, idempotencyKey: 'employee-1' });
    expect(b.id).toBe(a.id);
    await expect(createEmployee(actor, companyId, { ...employeeInput, legalSurname: 'Different', idempotencyKey: 'employee-1' })).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE' });
    expect((await state.db.select().from(schema.payrollEmployees))).toHaveLength(1);
    expect((await state.db.select().from(schema.payrollEmployeeSensitive))).toHaveLength(1);
  });
  it('updates employee fields with a single revision and rejects stale changes', async () => {
    const employee = await createEmployee(actor, companyId, employeeInput);
    const updated = await updateEmployee(actor, companyId, employee.id, { expectedVersion: 1, taxCode: 'S1257L' });
    expect(updated.version).toBe(2);
    await expect(updateEmployee(actor, companyId, employee.id, { expectedVersion: 1, taxCode: 'BR' })).rejects.toMatchObject({ code: 'CONFLICT_VERSION' });
    expect((await state.db.select().from(schema.payrollEmployeeRevisions))).toHaveLength(2);
  });
  it('keeps pay terms scoped to the employee and detects overlapping effective periods inside the lock', async () => {
    const employee = await createEmployee(actor, companyId, employeeInput);
    const terms = { payBasis: 'hourly' as const, hourlyRate: '15.00', payFrequency: 'monthly' as const, effectiveFrom: '2026-04-06' };
    await createPayTerms(actor, companyId, employee.id, terms);
    await expect(createPayTerms(actor, companyId, employee.id, terms)).rejects.toMatchObject({ code: 'CONFLICT_OVERLAP' });
    await expect(createPayTerms(actor, reviewer, employee.id, terms)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await state.db.select().from(schema.payrollPayTerms))).toHaveLength(1);
  });
  it('records complete tax setup as append-only history, bumps employee version and rejects stale writes', async () => {
    await activatePayroll(actor, companyId, schedule);
    const employee = await createEmployee(actor, companyId, employeeInput);
    const result = await taxSetupRoute(req(setupInput()), ctx(employee.id));
    expect(result.status).toBe(200);
    expect((await result.json()).setup).toMatchObject({ expectedVersion: 2, taxCode: 'S1257L', sourceType: 'first_payroll_this_tax_year', openingYtdCompleteness: 'complete', studentLoanUnknown: false, niMethod: 'periodic' });
    expect((await taxSetupRoute(req(setupInput()), ctx(employee.id))).status).toBe(409);
    const revised = { ...setupInput(), expectedVersion: 2, taxCode: 'BR' };
    expect((await taxSetupRoute(req(revised), ctx(employee.id))).status).toBe(200);
    expect((await getEmployeeTaxSetup(companyId, employee.id)).taxCode).toBe('BR');
    expect((await state.db.select().from(schema.payrollEmployeeStarterData))).toHaveLength(2);
  });
  it('does not expose or mutate tax setup across companies or without payroll capability', async () => {
    await activatePayroll(actor, companyId, schedule);
    const employee = await createEmployee(actor, companyId, employeeInput);
    state.actor = reviewer;
    expect((await taxSetupGetRoute(new Request('https://isolated.invalid/tax'), ctx(employee.id))).status).toBe(404);
    expect((await taxSetupRoute(req(setupInput()), ctx(employee.id))).status).toBe(404);
    expect((await state.db.select().from(schema.payrollEmployeeStarterData))).toHaveLength(0);
  });
  it('creates one draft for an idempotent request and clears lines with version invalidation', async () => {
    await activatePayroll(actor, companyId, schedule);
    const employee = await createEmployee(actor, companyId, employeeInput);
    const run = await createPayrollRun(actor, companyId, { ...runInput, idempotencyKey: 'run-1' });
    expect((await createPayrollRun(actor, companyId, { ...runInput, idempotencyKey: 'run-1' })).id).toBe(run.id);
    await upsertRunLines(actor, companyId, run.id, { employeeId: employee.id, expectedVersion: 1, lines: [{ lineType: 'fixed_period', fixedAmount: '100.00' }] });
    await upsertRunLines(actor, companyId, run.id, { employeeId: employee.id, expectedVersion: 2, lines: [] });
    expect((await getPayrollRun(companyId, run.id))).toMatchObject({ version: 3, lines: [] });
    await expect(upsertRunLines(actor, companyId, run.id, { employeeId: employee.id, expectedVersion: 2, lines: [{ lineType: 'fixed_period', fixedAmount: '999.00' }] })).rejects.toMatchObject({ code: 'CONFLICT_VERSION' });
    expect((await getPayrollRun(companyId, run.id))?.lines).toEqual([]);
  });
  it('rejects another employee pay terms and previews using the run payment date', async () => {
    await activatePayroll(actor, companyId, schedule);
    const employee = await createEmployee(actor, companyId, employeeInput);
    const other = await createEmployee(actor, companyId, { ...employeeInput, legalFirstName: 'Other' });
    const terms = await createPayTerms(actor, companyId, employee.id, { payBasis: 'hourly', hourlyRate: '15.00', payFrequency: 'monthly', effectiveFrom: '2026-10-25' });
    const run = await createPayrollRun(actor, companyId, runInput);
    await expect(upsertRunLines(actor, companyId, run.id, { employeeId: other.id, expectedVersion: 1, lines: [{ lineType: 'hours_worked', workedMinutes: 60, payTermsId: terms.id }] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await upsertRunLines(actor, companyId, run.id, { employeeId: employee.id, expectedVersion: 1, lines: [{ lineType: 'hours_worked', workedMinutes: 60, payTermsId: terms.id }] });
    expect((await calculateDraftPreview(actor, companyId, run.id)).grossTotal).toBe('15.0000');
  });
  it('cancels a draft atomically and rejects later edits', async () => {
    const { employee, run } = await prepareRun();
    await cancelPayrollRun(actor, companyId, run.id);
    expect(await getPayrollRun(companyId, run.id)).toMatchObject({ runStatus: 'cancelled', version: 3 });
    await expect(upsertRunLines(actor, companyId, run.id, { employeeId: employee.id, lines: [] })).rejects.toMatchObject({ code: 'WRONG_STATUS' });
  });
  it('requires ready payroll before review and preserves state when calculation is blocked', async () => {
    await activatePayroll(actor, companyId, schedule);
    const run = await createPayrollRun(actor, companyId, runInput);
    await expect(submitForReview(actor, companyId, 'payroll_run', run.id, 1)).rejects.toMatchObject({ code: 'CALCULATION_BLOCKED' });
    expect((await getPayrollRun(companyId, run.id))?.runStatus).toBe('draft');
    expect((await state.db.select().from(schema.taxReviews))).toHaveLength(0);
  });
  it('submits/approves together with audit and preserves separate-reviewer and version changes', async () => {
    const { run } = await prepareRun();
    const review = await submitForReview(actor, companyId, 'payroll_run', run.id, 2);
    expect((await state.db.select().from(schema.taxReviews))[0].calculationInputHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await processReview(reviewer, companyId, review.id, 'approve', 1)).status).toBe('approved');
    expect(await getPayrollRun(companyId, run.id)).toMatchObject({ runStatus: 'approved', version: 4 });
    await expect(processReview(reviewer, companyId, review.id, 'reject', 1)).rejects.toMatchObject({ code: 'WRONG_STATUS' });
  });
  it('refuses stale approval if tax setup changed and permits explicit rejection back to draft', async () => {
    const { run, employee } = await prepareRun();
    const review = await submitForReview(actor, companyId, 'payroll_run', run.id, 2);
    await saveEmployeeTaxSetup(actor, companyId, employee.id, { ...setupInput(), expectedVersion: 2, taxCode: 'BR' });
    await expect(processReview(reviewer, companyId, review.id, 'approve', 1)).rejects.toMatchObject({ code: 'CONFLICT_VERSION' });
    expect((await state.db.select().from(schema.taxReviews))[0].status).toBe('pending');
    expect((await processReview(reviewer, companyId, review.id, 'reject', 1)).status).toBe('rejected');
    expect((await getPayrollRun(companyId, run.id))?.runStatus).toBe('draft');
  });
  it('can request a fresh independent review for an approved run after tax inputs change', async () => {
    const { run, employee } = await prepareRun();
    const review = await submitForReview(actor, companyId, 'payroll_run', run.id, 2);
    await processReview(reviewer, companyId, review.id, 'approve', 1);
    await saveEmployeeTaxSetup(actor, companyId, employee.id, { ...setupInput(), expectedVersion: 2, taxCode: 'BR' });
    const fresh = await submitForReview(actor, companyId, 'payroll_run', run.id, 4);
    expect(fresh.id).not.toBe(review.id);
    expect(fresh.status).toBe('pending');
    expect((await state.db.select().from(schema.taxReviews))).toHaveLength(2);
    expect((await getPayrollRun(companyId, run.id))?.runStatus).toBe('submitted_for_review');
    expect((await processReview(reviewer, companyId, fresh.id, 'approve', 1)).status).toBe('approved');
  });
});

