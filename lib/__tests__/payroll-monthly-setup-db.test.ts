// Real PostgreSQL and the actual persistent-device authentication path. Only the
// database transport and unused web-session provider are isolated; no live data.
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
import { POST as createCompanyRoute } from '../../app/api/admin/tax/companies/route';
import { GET as monthlyRoute } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/route';
import { GET as overviewRoute } from '../../app/api/admin/tax/companies/[companyId]/overview/route';
import { GET as settingsRoute, POST as activateRoute } from '../../app/api/admin/tax/companies/[companyId]/payroll/settings/route';
import { POST as paymentRoute } from '../../app/api/admin/tax/companies/[companyId]/payroll/monthly-liability/payments/route';
import { parseMonthlyTaxSummary } from '../../assisted-chat-app/src/lib/monthly-tax-response';
import { parseTaxPayrollOverview } from '../../assisted-chat-app/src/lib/tax-payroll-overview-response';

const pg = new PGlite();
const founder = '10000000-0000-4000-8000-000000000001';
const member = '20000000-0000-4000-8000-000000000002';
const outsider = '30000000-0000-4000-8000-000000000003';
const schedule = { scheduleLabel: 'Synthetic monthly wages', payFrequency: 'monthly', monthlyPayDay: 28 };
let tokens: Record<string, string>;
let companyId: string;
const context = () => ({ params: Promise.resolve({ companyId }) });
function request(actor: string | null = founder, body?: unknown, token?: string) {
  return new Request('https://isolated.invalid/api/admin/tax?date=2026-09-25', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(actor ? { Authorization: `Bearer ${token ?? tokens[actor]}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function grant(caps: string[]) {
  await pg.query('INSERT INTO tax_company_memberships(company_id,user_id,capabilities) VALUES($1,$2,$3::jsonb)',
    [companyId, member, JSON.stringify(caps)]);
}
async function activate() {
  const response = await activateRoute(request(founder, schedule), context());
  expect(response.status).toBe(201);
  return response.json();
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
    ($3,'outsider@isolated.invalid','Synthetic Outsider','admin',true)`, [founder, member, outsider]);
  tokens = {};
  for (const id of [founder, member, outsider]) tokens[id] = await createAdminDeviceSession(id, { platform: 'ios' });
  const response = await createCompanyRoute(request(founder, {
    companyNumber: 'SC123456', legalName: 'Synthetic Company Ltd', registeredAddressLine1: 'Fixture Only',
    registeredCity: 'Glasgow', registeredPostcode: 'G31 1PB',
  }));
  expect(response.status).toBe(201);
  companyId = (await response.json()).id;
});
afterAll(async () => { await pg.close(); });

describe('company creation to monthly payroll setup with actual device authentication', () => {
  it('returns the installed46-compatible setup-only monthly summary immediately after company creation', async () => {
    const response = await monthlyRoute(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private, no-store');
    const value = await response.json();
    expect(parseMonthlyTaxSummary(value, companyId).status).toBe('no_data');
    expect(value).toMatchObject({ status: 'no_data', canRecordPayments: false, canRecordAdjustments: false,
      payrollSetup: { state: 'not_activated', canActivate: true, canRead: false, canEditSettings: false },
      totals: { liabilityPence: null, remainingPence: null, payrollLiabilityPence: null }, payments: [], adjustments: [] });
    expect(value.issues[0]).toContain('Payroll has not been activated');
    expect((await pg.query('SELECT count(*)::int AS count FROM payroll_settings')).rows[0]).toEqual({ count: 0 });
    expect((await pg.query('SELECT capabilities FROM tax_company_memberships WHERE user_id=$1', [founder])).rows[0])
      .toEqual({ capabilities: ['tax.read', 'tax.company.write', 'tax.audit.read'] });
    const overview = await (await overviewRoute(request(), context())).json();
    expect(parseTaxPayrollOverview(overview, companyId).payrollSetup).toEqual(value.payrollSetup);
    expect(overview.payrollSetup).toEqual(value.payrollSetup);
    expect(overview.registrationStatuses.map((entry: { status: string }) => entry.status)).toEqual(['unknown', 'unknown', 'unknown']);
    const settings = await settingsRoute(request(), context());
    expect(settings.status).toBe(404);
    expect(await settings.json()).toMatchObject({ error: 'Payroll not activated', code: 'NOT_FOUND',
      reason: 'PAYROLL_NOT_ACTIVATED', payrollSetup: value.payrollSetup });
  });

  it('uses explicit founder activation to grant access atomically and still never invents a zero monthly bill', async () => {
    await activate();
    const response = await monthlyRoute(request(), context());
    expect(response.status).toBe(200);
    const value = await response.json();
    expect(parseMonthlyTaxSummary(value, companyId).status).toBe('no_data');
    expect(value).toMatchObject({ payrollSetup: { state: 'active', canActivate: false, canRead: true, canEditSettings: true },
      canRecordPayments: true, totals: { liabilityPence: null, remainingPence: null } });
    const settings = await settingsRoute(request(), context());
    expect(settings.status).toBe(200);
    expect(await settings.json()).toMatchObject({ companyId, scheduleLabel: schedule.scheduleLabel, payrollSetup: value.payrollSetup });
    const overview = await (await overviewRoute(request(), context())).json();
    expect(parseTaxPayrollOverview(overview, companyId).payrollSetup).toEqual(value.payrollSetup);
    expect(overview.payrollSetup).toEqual(value.payrollSetup);
    expect(overview.payrollSummary.isActivated).toBe(true);
    expect((await pg.query("SELECT count(*)::int AS count FROM tax_audit_events WHERE event_type='payroll_activated'")).rows[0])
      .toEqual({ count: 1 });
    expect((await activateRoute(request(founder, schedule), context())).status).toBe(409);
  });

  it('hides both inactive and active companies from an authenticated admin in another account', async () => {
    for (const active of [false, true]) {
      if (active) await activate();
      for (const route of [monthlyRoute, settingsRoute, overviewRoute]) {
        const response = await route(request(outsider), context());
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ error: 'Not found', code: 'NOT_FOUND' });
      }
    }
  });

  it('lets a company reader see setup guidance but never impersonate the founder even with profile write access', async () => {
    await grant(['tax.read', 'tax.company.write']);
    const response = await monthlyRoute(request(member), context());
    expect(response.status).toBe(200);
    const value = await response.json();
    expect(parseMonthlyTaxSummary(value, companyId).status).toBe('no_data');
    expect(value).toMatchObject({ status: 'no_data', payrollSetup: {
      state: 'not_activated', canActivate: false, canRead: false, canEditSettings: false,
    } });
    const overview = await (await overviewRoute(request(member), context())).json();
    expect(parseTaxPayrollOverview(overview, companyId).payrollSetup).toEqual(value.payrollSetup);
    expect((await activateRoute(request(member, schedule), context())).status).toBe(403);
    expect((await pg.query('SELECT count(*)::int AS count FROM payroll_settings')).rows[0]).toEqual({ count: 0 });
  });

  it('returns clear403 access guidance for a known company reader after activation, without exposing payroll records', async () => {
    await grant(['tax.read', 'tax.company.write']);
    await activate();
    await pg.query(`INSERT INTO payroll_hmrc_payments(company_id,period_start,amount_pence,paid_on,reference,
      idempotency_key,payload_hash,recorded_by_user_id) VALUES($1,'2026-09-06',912345,'2026-10-01',
      'Confidential receipt','synthetic-evidence-key',repeat('a',64),$2)`, [companyId, founder]);
    for (const route of [monthlyRoute, settingsRoute]) {
      const response = await route(request(member), context());
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code).toBe('PAYROLL_ACCESS_REQUIRED');
      expect(body.error).toContain('grant payroll read access');
      expect(JSON.stringify(body)).not.toContain('912345');
      expect(body).not.toHaveProperty('payments');
    }
    const overview = await (await overviewRoute(request(member), context())).json();
    expect(parseTaxPayrollOverview(overview, companyId).payrollSetup?.state).toBe('restricted');
    expect(overview).toMatchObject({ payrollSummary: null, payrollSetup: {
      state: 'restricted', canActivate: false, canRead: false, canEditSettings: false,
    } });
  });

  it('provides active payroll read access with explicit read-only settings and record flags', async () => {
    await activate();
    await grant(['tax.read', 'payroll.read']);
    const value = await (await monthlyRoute(request(member), context())).json();
    expect(parseMonthlyTaxSummary(value, companyId).status).toBe('no_data');
    expect(value).toMatchObject({ payrollSetup: { state: 'active', canRead: true, canEditSettings: false, canActivate: false },
      canRecordPayments: false, canRecordAdjustments: false });
    const settings = await (await settingsRoute(request(member), context())).json();
    expect(settings.payrollSetup).toEqual(value.payrollSetup);
    const overview = await (await overviewRoute(request(member), context())).json();
    expect(parseTaxPayrollOverview(overview, companyId).payrollSetup).toEqual(value.payrollSetup);
    const write = await paymentRoute(request(member, { periodStart: '2026-09-06', amountPence: 10000, paidOn: '2026-10-01',
      reference: 'Synthetic receipt', idempotencyKey: randomUUID() }), context());
    expect(write.status).toBe(404);
  });

  it('never grants readiness visibility solely from profile-write capability', async () => {
    await grant(['tax.company.write']);
    for (const route of [monthlyRoute, settingsRoute, overviewRoute]) {
      expect((await route(request(member), context())).status).toBe(404);
    }
  });

  it('keeps a legacy pre-granted payroll.read member in setup until settings actually exist', async () => {
    await pg.query(`UPDATE tax_company_memberships SET capabilities=capabilities || '["payroll.read"]'::jsonb
      WHERE company_id=$1 AND user_id=$2`, [companyId, founder]);
    const value = await (await monthlyRoute(request(), context())).json();
    expect(parseMonthlyTaxSummary(value, companyId).status).toBe('no_data');
    expect(value.payrollSetup).toEqual({ state: 'not_activated', canActivate: true, canRead: false, canEditSettings: false });
    const overview = await (await overviewRoute(request(), context())).json();
    expect(parseTaxPayrollOverview(overview, companyId).payrollSetup).toEqual(value.payrollSetup);
    expect(overview.payrollSummary).toBeNull();
  });

  it('does not turn an invalid date or a nonexistent company into an activation invitation', async () => {
    const invalid = new Request('https://isolated.invalid/tax?date=2026-02-30', { headers: { Authorization: `Bearer ${tokens[founder]}` } });
    expect((await monthlyRoute(invalid, context())).status).toBe(422);
    expect((await monthlyRoute(request(), { params: Promise.resolve({ companyId: randomUUID() }) })).status).toBe(404);
  });

  it('rejects missing, malformed and revoked real opaque device credentials', async () => {
    for (const route of [monthlyRoute, settingsRoute, overviewRoute]) {
      expect((await route(request(null), context())).status).toBe(401);
      expect((await route(request(founder, undefined, 'acs_v1.malformed'), context())).status).toBe(401);
    }
    await pg.query('UPDATE admin_device_sessions SET revoked_at=now() WHERE user_id=$1', [founder]);
    expect((await monthlyRoute(request(), context())).status).toBe(401);
  });

  it('does not leak anomalous evidence before activation or mutate tax-registration state on read', async () => {
    await pg.query(`INSERT INTO payroll_hmrc_payments(company_id,period_start,amount_pence,paid_on,reference,
      idempotency_key,payload_hash,recorded_by_user_id) VALUES($1,'2026-09-06',998877,'2026-10-01',
      'Private legacy evidence','synthetic-legacy-key',repeat('b',64),$2)`, [companyId, founder]);
    const value = await (await monthlyRoute(request(), context())).json();
    expect(parseMonthlyTaxSummary(value, companyId).status).toBe('no_data');
    expect(value).toMatchObject({ paymentRecordCount: 0, payments: [], totals: { paidPence: 0, liabilityPence: null } });
    expect(JSON.stringify(value)).not.toContain('998877');
    expect((await pg.query("SELECT count(*)::int AS count FROM tax_registration_statuses WHERE status<>'unknown'")).rows[0])
      .toEqual({ count: 0 });
    expect((await pg.query("SELECT count(*)::int AS count FROM tax_audit_events WHERE event_type<>'company_created'")).rows[0])
      .toEqual({ count: 0 });
  });
});
