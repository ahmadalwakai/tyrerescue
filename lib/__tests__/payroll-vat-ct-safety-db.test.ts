// Real PostgreSQL, synthetic financial records only. No production URL or HMRC.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';
const state = vi.hoisted(() => ({ db: null as any, actor: '10000000-0000-4000-8000-000000000001' as string | null }));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_, key) => state.db[key] }) }));
vi.mock('@/lib/tax-payroll/write-transaction', () => ({ withTaxWriteTransaction: (fn: any) => state.db.transaction(fn) }));
vi.mock('@/lib/auth', () => ({ requireAdminMobile: async () => { if (!state.actor) throw new Error('Unauthorized'); return { user: { id: state.actor } }; } }));
import { GET as vatList, POST as vatCalculate } from '../../app/api/admin/tax/companies/[companyId]/vat/periods/route';
import { GET as vatRead, POST as vatReady } from '../../app/api/admin/tax/companies/[companyId]/vat/returns/[returnId]/route';
import { GET as ctRead, PATCH as ctUpdate } from '../../app/api/admin/tax/companies/[companyId]/corporation-tax/periods/[periodId]/route';
import { calculateVatReturn } from '../tax-payroll/vat-calculation';

const pg = new PGlite();
const actor = '10000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const companyId = '30000000-0000-4000-8000-000000000003';
const otherCompanyId = '40000000-0000-4000-8000-000000000004';
const periodId = '50000000-0000-4000-8000-000000000005';
const ctPeriodId = '60000000-0000-4000-8000-000000000006';
const returnId = '70000000-0000-4000-8000-000000000007';
const context = { params: Promise.resolve({ companyId }) };
const ctContext = { params: Promise.resolve({ companyId, periodId: ctPeriodId }) };
const vatContext = { params: Promise.resolve({ companyId, returnId }) };
const read = () => new Request('https://isolated.invalid/tax');
const post = (body: unknown) => new Request('https://isolated.invalid/tax', { method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown) => new Request('https://isolated.invalid/tax', { method: 'PATCH', body: JSON.stringify(body) });
const ctInput = (extra = {}) => ({ expectedVersion: 1, tradingProfitsPence: 3000000, nonTradingIncomePence: 0,
  chargeableGainsPence: 0, exemptDistributionsPence: 0, associatedCompanies: 0, ...extra });

beforeAll(async () => {
  await pg.exec('CREATE TABLE users(id uuid PRIMARY KEY)');
  for (const name of ['0026_tax_payroll_phase1', '0027_tax_payroll_phase2a', '0028_tax_payroll_phase2b_to_5', '0032_payroll_monthly_liability']) await pg.exec(readFileSync(`drizzle/migrations/${name}.sql`, 'utf8'));
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  await pg.exec('TRUNCATE users CASCADE');
  await pg.query('INSERT INTO users(id) VALUES($1),($2)', [actor, other]);
  await pg.query(`INSERT INTO tax_company_entities(id,company_number,legal_name,registered_address_line1,created_by_user_id)
    VALUES($1,'SC111111','Synthetic company','Synthetic address',$3),($2,'SC222222','Other synthetic company','Other address',$3)`, [companyId, otherCompanyId, actor]);
  await pg.query(`INSERT INTO tax_company_memberships(company_id,user_id,capabilities) VALUES($1,$2,'["tax.read","tax.company.write"]'::jsonb)`, [companyId, actor]);
  await pg.query(`INSERT INTO vat_periods(id,company_id,period_key,period_start,period_end,due_date)
    VALUES($1,$2,'26AA','2026-07-01','2026-09-30','2026-11-07')`, [periodId, companyId]);
  await pg.query(`INSERT INTO corporation_tax_periods(id,company_id,period_start,period_end)
    VALUES($1,$2,'2026-01-01','2026-12-31')`, [ctPeriodId, companyId]);
  state.actor = actor;
});
afterAll(async () => { await pg.close(); });

describe('VAT cannot manufacture an empty-data bill', () => {
  it('lists actual stored periods but declares the transaction calculation unavailable', async () => {
    const response = await vatList(read(), context);
    expect(await response.json()).toMatchObject({ calculationAvailable: false, calculationStatus: 'no_data', hmrcVerified: false });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('returns no_data and never inserts a fictitious zero return or invented return ID', async () => {
    const response = await vatCalculate(post({ periodId }), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ calculationStatus: 'no_data', calculationAvailable: false, draft: null });
    expect((await pg.query('SELECT COUNT(*)::int AS count FROM vat_returns')).rows[0]).toEqual({ count: 0 });
  });
  it('validates owned periods and cannot accept unverified transaction arrays from the client', async () => {
    expect((await vatCalculate(post({ periodId, transactions: [] }), context)).status).toBe(422);
    expect((await vatCalculate(post({ periodId: otherCompanyId }), context)).status).toBe(404);
    state.actor = other;
    expect((await vatCalculate(post({ periodId }), context)).status).toBe(404);
    state.actor = null;
    expect((await vatCalculate(post({ periodId }), context)).status).toBe(401);
  });
  it('rejects closed and inverted periods rather than returning a fake calculation success', async () => {
    await pg.query(`UPDATE vat_periods SET status='submitted' WHERE id=$1`, [periodId]);
    expect((await vatCalculate(post({ periodId }), context)).status).toBe(409);
    await pg.query(`UPDATE vat_periods SET status='open',period_start='2026-10-01' WHERE id=$1`, [periodId]);
    expect((await vatCalculate(post({ periodId }), context)).status).toBe(422);
  });
  it('does not present legacy transaction-free drafts as confirmed zero liabilities or ready for submission', async () => {
    await pg.query(`INSERT INTO vat_returns(id,company_id,period_id,period_key,box5_net_vat_payable_pence,transaction_count,calculated_by_user_id)
      VALUES($1,$2,$3,'26AA',0,0,$4)`, [returnId, companyId, periodId, actor]);
    expect(await (await vatRead(read(), vatContext)).json()).toMatchObject({ vatReturn: null, calculationStatus: 'no_data' });
    const ready = await vatReady(post({}), vatContext);
    expect(ready.status).toBe(422);
    expect(await ready.json()).toMatchObject({ guard: { canSubmit: false }, calculationStatus: 'no_data' });
  });
  it('requires source transactions even when a pure calculation caller supplies no rows', () => {
    expect(() => calculateVatReturn(companyId, '26AA', '2026-07-01', '2026-09-30', '2026-11-07', [])).toThrow(/without complete reconciled/);
  });
});

describe('bounded Corporation Tax estimate safety', () => {
  it('does not expose default database zeros as a real Corporation Tax bill', async () => {
    const response = await ctRead(read(), ctContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ period: null, calculationStatus: 'no_data', hmrcVerified: false,
      periodDetails: { id: ctPeriodId, version: 1 } });
  });
  it('requires all first-estimate categories explicitly instead of treating missing inputs as zeros', async () => {
    expect((await ctUpdate(patch({ expectedVersion: 1, tradingProfitsPence: 0 }), ctContext)).status).toBe(422);
    expect((await pg.query('SELECT version FROM corporation_tax_periods WHERE id=$1', [ctPeriodId])).rows[0]).toEqual({ version: 1 });
  });
  it('persists an explicitly supplied draft estimate and returns it with an unverified-estimate label', async () => {
    const response = await ctUpdate(patch(ctInput()), ctContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ calculationStatus: 'estimate', hmrcVerified: false, newVersion: 2,
      calculation: { taxableTotalProfitsPence: 3000000, netCtPayablePence: 570000 } });
    const readback = await ctRead(read(), ctContext);
    expect(await readback.json()).toMatchObject({ calculationStatus: 'estimate', period: { version: 2, netCtPayablePence: 570000 } });
  });
  it('distinguishes explicit confirmed zeros from absent accounting inputs', async () => {
    expect((await ctUpdate(patch(ctInput({ tradingProfitsPence: 0 })), ctContext)).status).toBe(200);
    expect(await (await ctRead(read(), ctContext)).json()).toMatchObject({ calculationStatus: 'estimate', period: { netCtPayablePence: 0 } });
  });
  it.each([{ tradingProfitsPence: '3000000' }, { tradingProfitsPence: -1 }, { tradingProfitsPence: 1.2 },
    { tradingProfitsPence: Number.MAX_SAFE_INTEGER }, { associatedCompanies: -1 }, { associatedCompanies: 0.5 },
    { nonTradingIncomePence: null }, { expectedVersion: 1.5 }, { unexpected: true },
  ])('rejects unsafe or ambiguous input %j without changing saved numbers', async (extra) => {
    expect((await ctUpdate(patch(ctInput(extra)), ctContext)).status).toBe(422);
    expect((await pg.query('SELECT version FROM corporation_tax_periods WHERE id=$1', [ctPeriodId])).rows[0]).toEqual({ version: 1 });
  });
  it('serializes concurrent edits and returns conflict rather than claiming an unsaved version succeeded', async () => {
    const responses = await Promise.all([ctUpdate(patch(ctInput()), ctContext), ctUpdate(patch(ctInput({ tradingProfitsPence: 5000000 })), ctContext)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await pg.query(`SELECT COUNT(*)::int AS count FROM tax_audit_events WHERE event_type='corporation_tax_estimate_saved'`)).rows[0]).toEqual({ count: 1 });
  });
  it('rolls back estimate changes when their audit fails', async () => {
    await pg.exec(`ALTER TABLE tax_audit_events ADD CONSTRAINT isolated_ct_audit_failure CHECK(event_type<>'corporation_tax_estimate_saved')`);
    try {
      expect((await ctUpdate(patch(ctInput()), ctContext)).status).toBe(503);
      expect((await pg.query('SELECT version FROM corporation_tax_periods WHERE id=$1', [ctPeriodId])).rows[0]).toEqual({ version: 1 });
    } finally { await pg.exec('ALTER TABLE tax_audit_events DROP CONSTRAINT isolated_ct_audit_failure'); }
  });
  it('does not overwrite approved/submitted accounting periods or unsupported dates', async () => {
    await pg.query(`UPDATE corporation_tax_periods SET status='approved' WHERE id=$1`, [ctPeriodId]);
    expect((await ctUpdate(patch(ctInput()), ctContext)).status).toBe(422);
    await pg.query(`UPDATE corporation_tax_periods SET status='open',period_end='2027-12-31' WHERE id=$1`, [ctPeriodId]);
    expect((await ctUpdate(patch(ctInput()), ctContext)).status).toBe(422);
  });
  it('masks inconsistent or historical persisted numbers without a matching input snapshot', async () => {
    await ctUpdate(patch(ctInput()), ctContext);
    await pg.query('UPDATE corporation_tax_periods SET net_ct_payable_pence=1 WHERE id=$1', [ctPeriodId]);
    expect(await (await ctRead(read(), ctContext)).json()).toMatchObject({ period: null, calculationStatus: 'no_data' });
  });
  it('requires company membership for reads and write capability for edits', async () => {
    state.actor = other;
    expect((await ctRead(read(), ctContext)).status).toBe(404);
    state.actor = actor;
    await pg.query(`UPDATE tax_company_memberships SET capabilities='["tax.read"]'::jsonb WHERE company_id=$1`, [companyId]);
    expect((await ctUpdate(patch(ctInput()), ctContext)).status).toBe(404);
  });
});
