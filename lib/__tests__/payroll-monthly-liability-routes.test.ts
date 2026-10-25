import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const test = vi.hoisted(() => ({
  actor: '10000000-0000-4000-8000-000000000001' as string | null,
  caps: ['payroll.read', 'payroll.settings.write'] as string[] | null,
  execute: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireAdminMobile: async () => {
  if (!test.actor) throw new Error('Unauthorized');
  return { user: { id: test.actor } };
} }));
vi.mock('@/lib/db', () => ({ db: { execute: test.execute } }));
vi.mock('@/lib/tax-payroll/permissions', () => ({
  getMemberCapabilities: async () => test.caps,
  hasCapabilities: (caps: string[], required: string[]) => required.every((cap) => caps.includes(cap)),
}));
// This suite isolates monetary SQL/HTTP contracts. Real company/readiness
// authorisation is exercised against PostgreSQL in payroll-monthly-setup-db.
vi.mock('@/lib/tax-payroll/payroll-setup-service', () => ({ getCompanyPayrollSetup: async () => ({
  state: 'active', canActivate: false, canRead: true, canEditSettings: test.caps?.includes('payroll.settings.write') ?? false,
}) }));

import { GET } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/route';
import { POST } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/payments/route';
import { POST as adjustmentPost } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/adjustments/route';
import { POST as voidPost } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/payments/[recordId]/void/route';

const companyId = '30000000-0000-4000-8000-000000000003';
const recordId = '40000000-0000-4000-8000-000000000004';
const context = { params: Promise.resolve({ companyId }) };
const get = (date = '2026-09-25') => new Request(`https://isolated.invalid/monthly-liability?date=${date}`);
const post = (body: unknown) => new Request('https://isolated.invalid/payments', { method: 'POST', body: JSON.stringify(body) });
const payment = { periodStart: '2026-09-06', amountPence: 10000, paidOn: '2001-01-01', reference: 'Synthetic transaction', idempotencyKey: 'synthetic-retry-key' };
const paymentHash = () => createHash('sha256').update(JSON.stringify({
  periodStart: payment.periodStart, amountPence: payment.amountPence, paidOn: payment.paidOn, reference: payment.reference,
})).digest('hex');
const paymentRow = () => ({ id: recordId, amountPence: payment.amountPence, paidOn: payment.paidOn,
  reference: payment.reference, recordedAt: '2026-10-20T00:00:00Z', payloadHash: paymentHash(), voidedAt: null, voidReason: null });
const monthlyRow = (runs: unknown[] = []) => ({ runs, paid: 10000, adjustments: -1000, payments: [], adjustmentRecords: [], paymentRecordCount: 0, adjustmentRecordCount: 0 });
const run = (overrides = {}) => ({ id: recordId, status: 'finalised', employeeCount: 1, resultCount: 1,
  mismatchedEmployees: 0, badResultCount: 0, payePence: 40000, employeeNiPence: 10000, employerNiPence: 30000,
  studentLoanPence: 5000, paymentDate: '2026-09-25', periodStart: '2026-09-01', periodEnd: '2026-09-30', version: 3, ...overrides });

beforeEach(() => {
  test.actor = '10000000-0000-4000-8000-000000000001';
  test.caps = ['payroll.read', 'payroll.settings.write'];
  test.execute.mockReset();
});

describe('protected monthly PAYE HTTP contracts', () => {
  it('does not read or write financial records for an unauthenticated caller', async () => {
    test.actor = null;
    expect((await GET(get(), context)).status).toBe(401);
    expect((await POST(post(payment), context)).status).toBe(401);
    expect((await voidPost(post({}), { params: Promise.resolve({ companyId, recordId }) })).status).toBe(401);
    expect(test.execute).not.toHaveBeenCalled();
  });
  it('hides an unrelated company from nonmembers and requires write capabilities for records', async () => {
    test.caps = null;
    expect((await GET(get(), context)).status).toBe(404);
    test.caps = ['payroll.read'];
    expect((await POST(post(payment), context)).status).toBe(404);
    expect((await adjustmentPost(post({}), context)).status).toBe(404);
    expect(test.execute).not.toHaveBeenCalled();
  });
  it('validates malformed company IDs and nonexistent dates before running payroll SQL', async () => {
    expect((await GET(get(), { params: Promise.resolve({ companyId: 'untrusted-id' }) })).status).toBe(404);
    expect((await GET(get('2026-02-30'), context)).status).toBe(422);
    expect(test.execute).not.toHaveBeenCalled();
  });
  it('uses null rather than zero when no payroll is available despite a manually recorded payment', async () => {
    test.execute.mockResolvedValue({ rows: [monthlyRow()] });
    const response = await GET(get(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    expect(await response.json()).toMatchObject({ status: 'no_data', hmrcVerified: false,
      totals: { payrollLiabilityPence: null, liabilityPence: null, paidPence: 10000, remainingPence: null, creditPence: null } });
  });
  it('includes employer NI and loan deductions in the outstanding amount', async () => {
    test.execute.mockResolvedValue({ rows: [monthlyRow([run()])] });
    const data = await (await GET(get(), context)).json();
    expect(data.totals).toMatchObject({ payePence: 40000, employeeNiPence: 10000, employerNiPence: 30000,
      studentLoanPence: 5000, payrollLiabilityPence: 85000, liabilityPence: 84000, paidPence: 10000, remainingPence: 74000 });
  });
  it.each([
    run({ resultCount: 0 }), run({ badResultCount: 1 }), run({ mismatchedEmployees: 1 }), run({ employeeCount: 0 }), run({ status: 'approved' }),
  ])('never presents missing or unfinished deductions as a bill (%j)', async (item) => {
    test.execute.mockResolvedValue({ rows: [monthlyRow([item])] });
    const data = await (await GET(get(), context)).json();
    expect(data.status).toBe('incomplete');
    expect(data.totals).toMatchObject({ payePence: null, payrollLiabilityPence: null, liabilityPence: null, remainingPence: null });
  });
  it('fails closed on database errors without leaking SQL, bank details or configuration', async () => {
    test.execute.mockRejectedValue(new Error('secret connection and financial details must not be returned'));
    const response = await GET(get(), context);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret connection');
  });
  it.each([{ amountPence: -1 }, { amountPence: 0 }, { amountPence: 1.2 }, { periodStart: '2026-09-01' }, { reference: '' }, { unexpected: true }])('rejects malformed payment %j without SQL writes', async (override) => {
    expect((await POST(post({ ...payment, ...override }), context)).status).toBe(422);
    expect(test.execute).not.toHaveBeenCalled();
  });
  it('returns only confirmed public payment fields with no payload hash', async () => {
    test.execute.mockResolvedValue({ rows: [paymentRow()] });
    const response = await POST(post(payment), context);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toMatchObject({ id: recordId, amountPence: 10000, paidOn: '2001-01-01', voidedAt: null });
    expect(data).not.toHaveProperty('payloadHash');
    expect(data).not.toHaveProperty('recordedByUserId');
  });
  it('returns conflict when a saved request key belongs to a different payment body', async () => {
    test.execute.mockResolvedValue({ rows: [{ ...paymentRow(), payloadHash: 'b'.repeat(64) }] });
    expect((await POST(post(payment), context)).status).toBe(409);
  });
  it('returns conflict for a duplicate bank receipt entered with a new request key', async () => {
    test.execute.mockRejectedValue({ cause: { code: '23505', constraint: 'payroll_hmrc_payments_receipt_unique' } });
    const response = await POST(post(payment), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('already recorded');
  });
});
