/* eslint-disable @typescript-eslint/no-explicit-any -- isolated hook slots carry dynamic React state */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseMonthlyTaxSummary } from '../../assisted-chat-app/src/lib/monthly-tax-response';
import { parsePayrollCalculation, parsePayrollRun, parsePayrollReview } from '../../assisted-chat-app/src/lib/payroll-workspace-response';
const APP = path.resolve('assisted-chat-app/src');
const BASE = 'https://tax-client-fixture.invalid';
const OTHER_BASE = 'https://other-tax-fixture.invalid';
const COMPANY = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';
const RECORD = '44444444-4444-4444-8444-444444444444';
const ACTOR = '55555555-5555-4555-8555-555555555555';
const REVIEWER = '66666666-6666-4666-8666-666666666666';
const WHEN = '2026-10-21T12:00:00.000Z';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 4; i += 1) await tick(); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Hook = { load: () => Promise<unknown>; data: any; run: any; calculation: any; review: any;
  loading: boolean; error: string | null; busy: boolean; writeError: string | null; notice: string | null;
  record: (kind: 'payments' | 'adjustments', body: Record<string, unknown>) => Promise<boolean>;
  requestKey: (body: Record<string, unknown>) => string;
  act: (action: 'lines' | 'submit' | 'approve' | 'reject' | 'finalise' | 'cancel', body: unknown) => Promise<boolean>;
};
function monthly() { return {
  companyId: COMPANY, currency: 'GBP', source: 'local_payroll_records', hmrcVerified: false,
  period: { start: '2026-10-06', end: '2026-11-05', taxYear: '2026-27', taxMonth: 7,
    electronicDueDate: '2026-11-22', chequeDueDate: '2026-11-19', isOpen: true },
  status: 'provisional', finalizedRunCount: 1, pendingRunCount: 0, paymentRecordCount: 0, adjustmentRecordCount: 0,
  canRecordPayments: true, canRecordAdjustments: true,
  totals: { payePence: 20000, employeeNiPence: 10000, employerNiPence: 15000, studentLoanPence: 0,
    payrollLiabilityPence: 45000, adjustmentsPence: 0, liabilityPence: 45000, paidPence: 0, remainingPence: 45000, creditPence: 0 },
  issues: [], pendingRuns: [], payments: [], adjustments: [],
}; }
function payRun() { return { id: RUN, companyId: COMPANY, settingsId: RECORD, periodStart: '2026-10-01', periodEnd: '2026-10-31',
  intendedPaymentDate: '2026-10-31', runStatus: 'draft', employeeCount: 1, latestPreview: null, version: 2, createdAt: WHEN,
  lines: [{ id: RECORD, runId: RUN, employeeId: EMPLOYEE, payTermsId: null, lineType: 'fixed_period', workedMinutes: null,
    hourlyRateOverride: null, fixedAmount: '2500.0000', description: null, enteredByUserId: ACTOR, createdAt: WHEN }] }; }
function calculation() { return { runId: RUN, companyId: COMPANY, status: 'ready', runVersion: 2, paymentDate: '2026-10-31',
  taxYear: '2026-27', rulesetVersion: 'hmrc-2026-27-v1', calculatedAt: WHEN, issues: [],
  employeeResults: [{ employeeId: EMPLOYEE, legalFirstName: 'Synthetic', legalSurname: 'Employee', taxCode: 'S1257L', niCategory: 'A',
    taxYear: '2026-27', periodNumber: 7, calculationStatus: 'calculated', warnings: [], grossPayPounds: '2500.00', taxForPeriodPounds: '200.00',
    employeeNiPounds: '100.00', employerNiPounds: '150.00', studentLoanPounds: '0.00', netPayPounds: '2200.00', totalDeductionsPounds: '300.00' }],
  totals: { grossPayPounds: '2500.00', taxPounds: '200.00', employeeNiPounds: '100.00', employerNiPounds: '150.00',
    studentLoanPounds: '0.00', netPayPounds: '2200.00', hmrcLiabilityPounds: '450.00' },
}; }
function review(status = 'pending') { return { review: { id: RECORD, companyId: COMPANY, entityId: RUN, entityType: 'payroll_run',
  submittedByUserId: ACTOR, reviewedByUserId: status === 'pending' ? null : REVIEWER,
  status, notes: null, submittedAt: WHEN, reviewedAt: status === 'pending' ? null : WHEN, version: 1 } }; }
function workspaceResponse(request: RequestFixture) {
  return request.url.endsWith('/calculation') ? json(calculation()) : request.url.endsWith('/review') ? json(review()) : json(payRun());
}
const paymentInput = { periodStart: '2026-10-06', amountPence: 15000, paidOn: '2026-10-21', reference: 'Fixture payment', idempotencyKey: 'synthetic-stable-operation-1' };
const paymentReceipt = () => ({ id: RECORD, amountPence: paymentInput.amountPence, paidOn: paymentInput.paidOn,
  reference: paymentInput.reference, recordedAt: WHEN, voidedAt: null, voidReason: null });
type RequestFixture = { method: string; url: string; body: unknown; signal?: AbortSignal | null };
type Slot = { value?: unknown; deps?: unknown[]; callback?: unknown; cleanup?: (() => void) | void };

// Execute the real hook, response decoder and API transport. Only React/native
// infrastructure and fetch are replaced; no request can leave this fixture.
function harness(kind: 'monthly' | 'workspace' = 'monthly') {
  let args = kind === 'monthly' ? [COMPANY, '2026-10-21'] : [COMPANY, RUN];
  const hooks: Slot[] = [];
  let cursor = 0;
  let dirty = false;
  let mounted = true;
  let sessionRevision = 1;
  let effects: Array<() => void> = [];
  const requests: RequestFixture[] = [];
  let handler: (request: RequestFixture) => Promise<Response> = async () => { throw new Error('Isolated network unavailable'); };
  const changed = (before: unknown[] | undefined, next: unknown[] | undefined) => !before || !next || next.length !== before.length || next.some((item, index) => item !== before[index]);
  const memo = (factory: () => unknown, deps?: unknown[]) => {
    const index = cursor++;
    if (!hooks[index] || changed(hooks[index].deps, deps)) hooks[index] = { value: factory(), deps };
    return hooks[index].value;
  };
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, (update: unknown) => {
        const next = typeof update === 'function' ? update(hooks[index].value) : update;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: { current: initial } };
      return hooks[index].value;
    },
    useMemo: memo,
    useCallback(callback: unknown, deps?: unknown[]) { return memo(() => callback, deps); },
    useEffect(effect: () => (() => void) | void, deps?: unknown[]) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) {
        effects.push(() => {
          hooks[index]?.cleanup?.();
          hooks[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const context = vm.createContext({
    Error, TypeError, RangeError, Promise, AbortController, URL, Response, Headers,
    __DEV__: false, process: { env: { NODE_ENV: 'production' } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async (url: string, init: RequestInit = {}) => {
      const request = { method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : undefined, signal: init.signal };
      requests.push(request);
      return handler(request);
    },
  });
  function loadModule(filename: string): Record<string, unknown> {
    const absolute = path.resolve(filename);
    const cached = cache.get(absolute);
    if (cached) return cached.exports;
    const sourceModule = { exports: {} as Record<string, unknown> };
    cache.set(absolute, sourceModule);
    const code = ts.transpileModule(readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const requireFixture = (id: string) => {
      if (id === 'react') return react;
      if (id === 'react-native') return { Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
      if (id === 'expo-constants') return { expoConfig: { version: '0.0.0' } };
      if (id.includes('startup-logging')) return { logStartupModuleStarted() {}, logStartupModuleCompleted() {}, logStartupModuleFailed() {} };
      if (id.endsWith('/useAdminSession') || id === './useAdminSession') return { getAdminSessionRevision: () => sessionRevision };
      if (id.startsWith('@/')) return loadModule(path.join(APP, `${id.slice(2)}.ts`));
      if (id.startsWith('.')) return loadModule(path.resolve(path.dirname(absolute), `${id}.ts`));
      throw new Error(`Unexpected isolated module: ${id}`);
    };
    const run = vm.runInContext(`(function(require, module, exports) { ${code}\n})`, context, { filename: absolute });
    run(requireFixture, sourceModule, sourceModule.exports);
    return sourceModule.exports;
  }
  const api = loadModule(path.join(APP, 'lib/api.ts')) as {
    setApiBaseUrl: (value: string) => void; setAdminToken: (value: string | null) => void;
  };
  api.setApiBaseUrl(BASE); api.setAdminToken('isolated-admin-credential');
  const name = kind === 'monthly' ? 'useMonthlyTax' : 'usePayrollWorkspace';
  const runHook = loadModule(path.join(APP, `hooks/${name}.ts`))[name] as (...args: string[]) => Hook;
  let value: Hook;
  function render(): Hook {
    if (!mounted) return value;
    let attempts = 0;
    do {
      dirty = false; cursor = 0; effects = [];
      value = runHook(...args);
      for (const effect of effects) effect();
      attempts += 1;
      if (attempts > 12) throw new Error('Hook did not settle');
    } while (dirty);
    return value;
  }
  render();
  return {
    requests, render,
    handle(next: typeof handler) { handler = next; },
    async ready() {
      handler = async (request) => kind === 'monthly' ? json(monthly()) : workspaceResponse(request);
      await render().load(); return render();
    },
    changeScreen(next: string[]) { args = next; render(); },
    changeScope(next: { baseUrl?: string; token?: string | null }, shouldRender = true) {
      if (next.baseUrl !== undefined) api.setApiBaseUrl(next.baseUrl);
      if ('token' in next) api.setAdminToken(next.token ?? null);
      sessionRevision += 1;
      if (shouldRender) render();
    },
    unmount() { mounted = false; for (const hook of hooks) hook.cleanup?.(); },
  };
}

describe('monthly tax through the real hook, scoped transport and parser', () => {
  it('loads verified monthly totals and rejects an HTML deployment/login page', async () => {
    const h = harness(); await h.ready(); expect(h.render().data?.totals.remainingPence).toBe(45000);
    h.handle(async () => new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }));
    await h.render().load(); expect(h.render().data).toBeNull(); expect(h.render().error).toBeTruthy();
  });
  it.each([{}, { ok: true }, { ...paymentReceipt(), amountPence: 99 }, { ...paymentReceipt(), reference: 'Wrong reference' }])('rejects an unconfirmed or mismatched saved payment %j', async (payload) => {
    const h = harness(); await h.ready(); h.handle(async () => json(payload));
    expect(await h.render().record('payments', paymentInput)).toBe(false);
    expect(h.render().notice).toBeNull(); expect(h.render().writeError).toBeTruthy();
  });
  it('uses a synchronous mutation lock to prevent a second payment on rapid double taps', async () => {
    const h = harness(); await h.ready(); const waiting = deferred<Response>();
    h.handle(async (request) => request.method === 'POST' ? waiting.promise : json(monthly()));
    const record = h.render().record;
    const first = record('payments', paymentInput); const second = record('payments', paymentInput);
    await settle(); expect(h.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    waiting.resolve(json(paymentReceipt(), 201));
    expect(await first).toBe(true); expect(await second).toBe(false); expect(h.render().busy).toBe(false);
  });
  it.each(['logout', 'project', 'same-token-new-login', 'unmount', 'month'])('suppresses a late payment result after %s', async (change) => {
    const h = harness(); await h.ready(); const waiting = deferred<Response>(); h.handle(async () => waiting.promise);
    const operation = h.render().record('payments', paymentInput); await settle();
    if (change === 'unmount') h.unmount();
    else if (change === 'project') h.changeScope({ baseUrl: OTHER_BASE });
    else if (change === 'logout') h.changeScope({ token: null });
    else if (change === 'month') h.changeScreen([COMPANY, '2026-11-21']);
    else h.changeScope({ token: 'isolated-admin-credential' });
    waiting.resolve(json(paymentReceipt(), 201)); expect(await operation).toBe(false);
    if (change !== 'unmount') { expect(h.render().data).toBeNull(); expect(h.render().notice).toBeNull(); }
  });
  it('does not let an old operation unlock a newer project payment', async () => {
    const h = harness(); await h.ready(); const old = deferred<Response>(); h.handle(async () => old.promise);
    const oldOperation = h.render().record('payments', paymentInput); await settle();
    h.changeScope({ baseUrl: OTHER_BASE }); await h.ready();
    const current = deferred<Response>(); h.handle(async (request) => request.method === 'POST' ? current.promise : json(monthly()));
    const currentOperation = h.render().record('payments', paymentInput); await settle();
    old.resolve(json(paymentReceipt(), 201)); expect(await oldOperation).toBe(false);
    expect(h.render().busy).toBe(true); expect(await h.render().record('payments', paymentInput)).toBe(false);
    current.resolve(json(paymentReceipt(), 201)); expect(await currentOperation).toBe(true);
  });
  it('keeps the same idempotency key for an unchanged retry and scopes it to the selected company', async () => {
    const h = harness(); const first = h.render().requestKey(paymentInput);
    expect(h.render().requestKey(paymentInput)).toBe(first);
    expect(h.render().requestKey({ ...paymentInput, amountPence: 16000 })).not.toBe(first);
    h.changeScreen([RUN, '2026-10-21']); expect(h.render().requestKey(paymentInput)).not.toBe(first);
  });
  it('ignores a late read when credentials changed before React rerenders', async () => {
    const h = harness(); const waiting = deferred<Response>(); h.handle(async () => waiting.promise);
    const operation = h.render().load(); h.changeScope({ token: null }, false);
    waiting.resolve(json(monthly())); await operation; expect(h.render().data).toBeNull();
  });
  it('keeps login after a generic unauthorized response and allows a verified retry', async () => {
    const h = harness(); h.handle(async () => json({ error: 'Unauthorized' }, 401));
    await h.render().load(); expect(h.render().error).toBeTruthy();
    await h.ready(); expect(h.render().data?.companyId).toBe(COMPANY);
  });
  it('rejects a valid response for another tax month instead of showing it under the selected date', async () => {
    const h = harness(); const wrong = monthly(); wrong.period = { ...wrong.period, start: '2026-09-06', end: '2026-10-05', taxMonth: 6,
      electronicDueDate: '2026-10-22', chequeDueDate: '2026-10-19' };
    h.handle(async () => json(wrong)); await h.render().load();
    expect(h.render().data).toBeNull(); expect(h.render().error).toBeTruthy();
  });
});

describe('payroll workspace actual hook and mutation responses', () => {
  it('loads a run, deductions and review and rejects a version mismatch', async () => {
    const h = harness('workspace'); await h.ready(); expect(h.render().calculation?.totals.netPayPounds).toBe('2200.00');
    h.handle(async (request) => request.url.endsWith('/calculation') ? json({ ...calculation(), runVersion: 3 }) : workspaceResponse(request));
    await h.render().load(); expect(h.render().calculation).toBeNull(); expect(h.render().error).toBeTruthy();
  });
  it.each(['logout', 'project', 'same-token-new-login', 'unmount', 'run'])('suppresses a late payroll review mutation after %s', async (change) => {
    const h = harness('workspace'); await h.ready(); const waiting = deferred<Response>(); h.handle(async () => waiting.promise);
    const operation = h.render().act('submit', { expectedVersion: 2 }); await settle();
    if (change === 'unmount') h.unmount();
    else if (change === 'project') h.changeScope({ baseUrl: OTHER_BASE });
    else if (change === 'logout') h.changeScope({ token: null });
    else if (change === 'run') h.changeScreen([COMPANY, RECORD]);
    else h.changeScope({ token: 'isolated-admin-credential' });
    waiting.resolve(json(review(), 201)); expect(await operation).toBe(false);
    if (change !== 'unmount') { expect(h.render().run).toBeNull(); expect(h.render().notice).toBeNull(); }
  });
  it('does not confirm cancellation until a canonical GET says cancelled', async () => {
    const h = harness('workspace'); await h.ready(); h.handle(async (request) => request.method === 'DELETE' ? new Response(null, { status: 204 }) : json(payRun()));
    expect(await h.render().act('cancel', undefined)).toBe(false); expect(h.render().notice).toBeNull(); expect(h.render().writeError).toBeTruthy();
  });
  it('rejects an empty 2xx lines response when nonempty employee earnings were submitted', async () => {
    const h = harness('workspace'); await h.ready();
    h.handle(async (request) => request.method === 'PATCH' ? json({ lines: [] }) : workspaceResponse(request));
    expect(await h.render().act('lines', { expectedVersion: 2, employeeId: EMPLOYEE, lines: [{ lineType: 'fixed_period', fixedAmount: '100.00' }] })).toBe(false);
    expect(h.render().notice).toBeNull();
  });
  it('rejects a fake 2xx finalisation that contains no saved employee calculations', async () => {
    const h = harness('workspace'); await h.ready();
    h.handle(async (request) => request.method === 'POST' ? json({ runId: RUN, companyId: COMPANY, finalised: true, employeeResults: [] }) : workspaceResponse(request));
    expect(await h.render().act('finalise', { expectedVersion: 2 })).toBe(false); expect(h.render().notice).toBeNull();
  });
  it('rejects an otherwise balanced calculation for employees absent from the pay run', async () => {
    const h = harness('workspace');
    const wrong = calculation(); wrong.employeeResults[0].employeeId = REVIEWER;
    h.handle(async (request) => request.url.endsWith('/calculation') ? json(wrong) : workspaceResponse(request));
    await h.render().load(); expect(h.render().calculation).toBeNull(); expect(h.render().error).toBeTruthy();
  });
  it('confirms a legitimate saved earnings amount with canonical decimal normalization', async () => {
    const h = harness('workspace'); await h.ready();
    const savedRun = payRun(); savedRun.version = 3; savedRun.lines[0].fixedAmount = '100.0000';
    const savedCalculation = calculation(); savedCalculation.runVersion = 3;
    savedCalculation.employeeResults[0] = { ...savedCalculation.employeeResults[0], grossPayPounds: '100.00', taxForPeriodPounds: '0.00',
      employeeNiPounds: '0.00', employerNiPounds: '0.00', netPayPounds: '100.00', totalDeductionsPounds: '0.00' };
    savedCalculation.totals = { grossPayPounds: '100.00', taxPounds: '0.00', employeeNiPounds: '0.00', employerNiPounds: '0.00',
      studentLoanPounds: '0.00', netPayPounds: '100.00', hmrcLiabilityPounds: '0.00' };
    h.handle(async (request) => request.method === 'PATCH' ? json({ lines: savedRun.lines })
      : request.url.endsWith('/calculation') ? json(savedCalculation) : request.url.endsWith('/review') ? json({ review: null }) : json(savedRun));
    expect(await h.render().act('lines', { expectedVersion: 2, employeeId: EMPLOYEE, lines: [{ lineType: 'fixed_period', fixedAmount: '100.00' }] })).toBe(true);
    expect(h.render().run?.version).toBe(3); expect(h.render().calculation?.totals.netPayPounds).toBe('100.00');
  });
  it('confirms clearing the last employee lines without inventing a calculated zero tax bill', async () => {
    const h = harness('workspace'); await h.ready();
    const cleared = { ...payRun(), version: 3, employeeCount: 0, lines: [] };
    const blocked = { ...calculation(), runVersion: 3, status: 'blocked', totals: null, employeeResults: [],
      issues: [{ employeeId: null, code: 'NO_EMPLOYEES', message: 'Add earnings before calculating.' }] };
    h.handle(async (request) => request.method === 'PATCH' ? json({ lines: [] }) : request.url.endsWith('/calculation') ? json(blocked)
      : request.url.endsWith('/review') ? json({ review: null }) : json(cleared));
    expect(await h.render().act('lines', { expectedVersion: 2, employeeId: EMPLOYEE, lines: [] })).toBe(true);
    expect(h.render().calculation?.status).toBe('blocked'); expect(h.render().calculation?.totals).toBeNull();
  });
  it('accepts a complete confirmed finalisation and loads its matching immutable results', async () => {
    const h = harness('workspace');
    h.handle(async (request) => request.url.endsWith('/calculation') ? json(calculation())
      : request.url.endsWith('/review') ? json(review('approved')) : json({ ...payRun(), runStatus: 'approved' }));
    await h.render().load();
    const c = calculation();
    const receipt = { runId: RUN, companyId: COMPANY, finalised: true, periodStart: payRun().periodStart, periodEnd: payRun().periodEnd, intendedPaymentDate: '2026-10-31', finalisedAt: WHEN,
      rulesetVersion: c.rulesetVersion, employeeResults: c.employeeResults, totalGrossPounds: c.totals.grossPayPounds,
      totalTaxPounds: c.totals.taxPounds, totalEmployeeNiPounds: c.totals.employeeNiPounds, totalEmployerNiPounds: c.totals.employerNiPounds,
      totalStudentLoanPounds: c.totals.studentLoanPounds, totalNetPayPounds: c.totals.netPayPounds, totalHmrcLiabilityPounds: c.totals.hmrcLiabilityPounds };
    h.handle(async (request) => request.method === 'POST' ? json(receipt) : request.url.endsWith('/calculation')
      ? json({ ...c, status: 'finalised', runVersion: 3 }) : request.url.endsWith('/review') ? json(review('approved'))
        : json({ ...payRun(), runStatus: 'finalised', version: 3 }));
    expect(await h.render().act('finalise', { expectedVersion: 2 })).toBe(true);
    expect(h.render().calculation?.status).toBe('finalised'); expect(h.render().notice).toContain('Payroll finalised');
  });
  it.each(['paymentDate', 'period', 'employee'])('rejects a balanced finalisation receipt for another %s', async (change) => {
    const h = harness('workspace');
    h.handle(async (request) => request.url.endsWith('/calculation') ? json(calculation())
      : request.url.endsWith('/review') ? json(review('approved')) : json({ ...payRun(), runStatus: 'approved' }));
    await h.render().load();
    const c = calculation();
    const receipt = { runId: RUN, companyId: COMPANY, finalised: true, periodStart: payRun().periodStart,
      periodEnd: change === 'period' ? '2026-11-30' : payRun().periodEnd,
      intendedPaymentDate: change === 'paymentDate' ? '2026-11-30' : '2026-10-31', finalisedAt: WHEN,
      rulesetVersion: c.rulesetVersion, employeeResults: c.employeeResults.map((employee) => change === 'employee' ? { ...employee, employeeId: COMPANY } : employee),
      totalGrossPounds: c.totals.grossPayPounds, totalTaxPounds: c.totals.taxPounds,
      totalEmployeeNiPounds: c.totals.employeeNiPounds, totalEmployerNiPounds: c.totals.employerNiPounds,
      totalStudentLoanPounds: c.totals.studentLoanPounds, totalNetPayPounds: c.totals.netPayPounds, totalHmrcLiabilityPounds: c.totals.hmrcLiabilityPounds };
    h.handle(async () => json(receipt));
    expect(await h.render().act('finalise', { expectedVersion: 2 })).toBe(false);
    expect(h.render().notice).toBeNull(); expect(h.render().writeError).toBeTruthy();
  });
  it('does not confirm a different earnings amount merely because line count and employee match', async () => {
    const h = harness('workspace'); await h.ready();
    h.handle(async (request) => request.method === 'PATCH' ? json({ lines: payRun().lines }) : workspaceResponse(request));
    expect(await h.render().act('lines', { expectedVersion: 2, employeeId: EMPLOYEE, lines: [{ lineType: 'fixed_period', fixedAmount: '100.00' }] })).toBe(false);
    expect(h.render().notice).toBeNull();
  });
  it('prevents duplicate review/finalise mutations before React can rerender', async () => {
    const h = harness('workspace'); await h.ready(); const waiting = deferred<Response>();
    h.handle(async (request) => request.method === 'POST' ? waiting.promise : workspaceResponse(request));
    const act = h.render().act; const first = act('submit', { expectedVersion: 2 }); const second = act('submit', { expectedVersion: 2 });
    await settle(); expect(h.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    waiting.resolve(json(review(), 201)); expect(await first).toBe(true); expect(await second).toBe(false); expect(h.render().busy).toBe(false);
  });
});

describe('financial response integrity', () => {
  it('accepts canonical examples and rejects cross-company or inconsistent headline totals', () => {
    expect(parseMonthlyTaxSummary(monthly(), COMPANY)).toMatchObject({ status: 'provisional' });
    expect(parsePayrollCalculation(calculation(), COMPANY, RUN)).toMatchObject({ status: 'ready' });
    expect(parsePayrollRun(payRun(), COMPANY, RUN)).toMatchObject({ id: RUN });
    expect(parsePayrollReview(review(), RUN)).toMatchObject({ status: 'pending' });
    expect(() => parseMonthlyTaxSummary(monthly(), RUN)).toThrow();
    expect(() => parseMonthlyTaxSummary({ ...monthly(), totals: { ...monthly().totals, remainingPence: 1 } }, COMPANY)).toThrow();
    expect(() => parsePayrollCalculation({ ...calculation(), totals: { ...calculation().totals, netPayPounds: '1.00' } }, COMPANY, RUN)).toThrow();
  });
  it('reconciles payment evidence, ignoring voided records rather than trusting a fake paid total', () => {
    const row = monthly(); row.totals = { ...row.totals, paidPence: 15000, remainingPence: 30000 };
    expect(() => parseMonthlyTaxSummary(row, COMPANY)).toThrow();
  });
  it('rejects adjustment or pending-run counts that do not match their histories', () => {
    const row = monthly(); row.totals = { ...row.totals, adjustmentsPence: 1000, liabilityPence: 46000, remainingPence: 46000 };
    expect(() => parseMonthlyTaxSummary(row, COMPANY)).toThrow();
    expect(() => parseMonthlyTaxSummary({ ...monthly(), pendingRunCount: 1 }, COMPANY)).toThrow();
  });
  it('rejects a wrong per-employee deductions figure even when headline totals balance', () => {
    const row = calculation(); row.employeeResults[0].totalDeductionsPounds = '1.00';
    expect(() => parsePayrollCalculation(row, COMPANY, RUN)).toThrow();
  });
  it('accepts a recorded approval by the submitter while still requiring a valid reviewer identity and timestamp', () => {
    const row = review('approved'); row.review.reviewedByUserId = ACTOR;
    expect(parsePayrollReview(row, RUN)).toMatchObject({ status: 'approved', reviewedByUserId: ACTOR });
    expect(() => parsePayrollReview({ review: { ...row.review, reviewedByUserId: 'unverified' } }, RUN)).toThrow();
    expect(() => parsePayrollReview({ review: { ...row.review, reviewedAt: null } }, RUN)).toThrow();
  });
  it('rejects duplicate employee calculations even when every total was doubled consistently', () => {
    const row = calculation(); row.employeeResults.push({ ...row.employeeResults[0] });
    row.totals = { grossPayPounds: '5000.00', taxPounds: '400.00', employeeNiPounds: '200.00', employerNiPounds: '300.00',
      studentLoanPounds: '0.00', netPayPounds: '4400.00', hmrcLiabilityPounds: '900.00' };
    expect(() => parsePayrollCalculation(row, COMPANY, RUN)).toThrow();
  });
  it.each([{ calculationStatus: 'unsupported_tax_code' }, { taxYear: '2025-26' }])('rejects a ready employee with unverified calculation metadata %j', (patch) => {
    const row = calculation(); row.employeeResults[0] = { ...row.employeeResults[0], ...patch };
    expect(() => parsePayrollCalculation(row, COMPANY, RUN)).toThrow();
  });
  it('rejects a ready result without a verified rule version', () => {
    expect(() => parsePayrollCalculation({ ...calculation(), rulesetVersion: null }, COMPANY, RUN)).toThrow();
  });
  it('rejects a reversed payroll period or employee count that does not match the run lines', () => {
    expect(() => parsePayrollRun({ ...payRun(), employeeCount: 2 }, COMPANY, RUN)).toThrow();
    expect(() => parsePayrollRun({ ...payRun(), periodStart: '2026-11-01', periodEnd: '2026-10-01' }, COMPANY, RUN)).toThrow();
  });
});

