/* eslint-disable @typescript-eslint/no-explicit-any -- synthetic React state slots and VM module exports */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const APP = path.resolve('assisted-chat-app/src');
const COMPANY = '11111111-1111-4111-8111-111111111111';
const RECEIPT = '44444444-4444-4444-8444-444444444444';
const WHEN = '2026-10-21T12:00:00.000Z';
const reason = 'Wrong receipt was recorded';
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const receipt = () => ({ id: RECEIPT, amountPence: 15000, paidOn: '2026-10-21', reference: 'Synthetic bank transaction', recordedAt: WHEN, voidedAt: null as string | null, voidReason: null as string | null });
function monthly() { return {
  companyId: COMPANY, currency: 'GBP', source: 'local_payroll_records', hmrcVerified: false,
  period: { start: '2026-10-06', end: '2026-11-05', taxYear: '2026-27', taxMonth: 7, electronicDueDate: '2026-11-22', chequeDueDate: '2026-11-19', isOpen: true },
  status: 'provisional', finalizedRunCount: 1, pendingRunCount: 0, paymentRecordCount: 1, adjustmentRecordCount: 0,
  canRecordPayments: true, canRecordAdjustments: true, pendingRuns: [], issues: [], adjustments: [], payments: [receipt()],
  totals: { payePence: 20000, employeeNiPence: 10000, employerNiPence: 15000, studentLoanPence: 0, payrollLiabilityPence: 45000,
    adjustmentsPence: 0, liabilityPence: 45000, paidPence: 15000, remainingPence: 30000, creditPence: 0 },
}; }
type Hook = { data: any; notice: string | null; writeError: string | null; busy: boolean; load: () => Promise<void>;
  voidRecord: (kind: 'payments' | 'adjustments', id: string, reason: string, key: string) => Promise<boolean> };
type RequestFixture = { method: string; url: string; body: any };
function harness() {
  let args = [COMPANY, '2026-10-21']; let revision = 1; let mounted = true; let dirty = false; let cursor = 0;
  const slots: Array<{ value?: any; deps?: any[]; cleanup?: any }> = []; let effects: Array<() => void> = [];
  const requests: RequestFixture[] = []; let handler: (request: RequestFixture) => Promise<Response> = async () => json(monthly());
  const changed = (before?: any[], next?: any[]) => !before || !next || before.length !== next.length || next.some((value, i) => value !== before[i]);
  const memo = (factory: () => any, deps?: any[]) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; };
  const react = {
    useState(initial: any) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (update: any) => { const next = typeof update === 'function' ? update(slots[i].value) : update; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; } }]; },
    useRef(initial: any) { const i = cursor++; if (!slots[i]) slots[i] = { value: { current: initial } }; return slots[i].value; },
    useMemo: memo, useCallback: (callback: any, deps?: any[]) => memo(() => callback, deps),
    useEffect(effect: () => any, deps?: any[]) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); },
  };
  const context = vm.createContext({ Error, TypeError, RangeError, Promise, AbortController, URL, Response, Headers,
    __DEV__: false, process: { env: { NODE_ENV: 'production' } }, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async (url: string, init: RequestInit = {}) => { const request = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined }; requests.push(request); return handler(request); },
  });
  const modules = new Map<string, any>();
  function load(filename: string): any {
    const absolute = path.resolve(filename); if (modules.has(absolute)) return modules.get(absolute).exports;
    const sourceModule = { exports: {} }; modules.set(absolute, sourceModule);
    const code = ts.transpileModule(readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const requireFixture = (id: string): any => {
      if (id === 'react') return react;
      if (id === 'react-native') return { Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
      if (id === 'expo-constants') return { expoConfig: { version: '0.0.0' } };
      if (id.includes('startup-logging')) return { logStartupModuleStarted() {}, logStartupModuleCompleted() {}, logStartupModuleFailed() {} };
      if (id.endsWith('/useAdminSession') || id === './useAdminSession') return { getAdminSessionRevision: () => revision };
      if (id.startsWith('@/')) return load(path.join(APP, `${id.slice(2)}.ts`));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(absolute), `${id}.ts`));
      throw new Error(`Unexpected fixture module ${id}`);
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: absolute })(requireFixture, sourceModule, sourceModule.exports);
    return sourceModule.exports;
  }
  const api = load(path.join(APP, 'lib/api.ts')); api.setApiBaseUrl('https://isolated-tax.invalid'); api.setAdminToken('synthetic-admin');
  const run = load(path.join(APP, 'hooks/useMonthlyTax.ts')).useMonthlyTax; let value: Hook;
  function render(): Hook { if (!mounted) return value; let tries = 0; do { cursor = 0; dirty = false; effects = []; value = run(...args); for (const effect of effects) effect(); if (++tries > 15) throw new Error('Hook did not settle'); } while (dirty); return value; }
  render();
  return { requests, render, handle(next: typeof handler) { handler = next; }, async ready(data = monthly()) { handler = async () => json(data); await render().load(); return render(); },
    change(kind: string) { if (kind === 'month') args = [COMPANY, '2026-11-21']; else if (kind === 'company') args = [RECEIPT, '2026-10-21']; else if (kind === 'backend') { api.setApiBaseUrl('https://other-isolated.invalid'); revision++; } else if (kind === 'logout') { api.setAdminToken(null); revision++; } else revision++; render(); },
    unmount() { mounted = false; slots.forEach((slot) => slot.cleanup?.()); },
  };
}

describe('monthly tax actual hook void corrections', () => {
  it('accepts a truncated history while preserving all-record totals', async () => {
    const data = monthly(); data.payments = Array.from({ length: 100 }, (_, i) => ({ ...receipt(), id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`, amountPence: 100 }));
    data.paymentRecordCount = 101; data.totals.paidPence = 10100; data.totals.remainingPence = 34900;
    const h = harness(); await h.ready(data); expect(h.render().data.totals.paidPence).toBe(10100);
  });
  it.each(['permission', 'missing', 'wrong-kind', 'already-voided'])('does not send a void request for %s', async (condition) => {
    const h = harness(); const data = monthly();
    if (condition === 'permission') data.canRecordPayments = false;
    if (condition === 'already-voided') { data.payments[0].voidedAt = WHEN; data.payments[0].voidReason = reason; data.totals.paidPence = 0; data.totals.remainingPence = 45000; }
    await h.ready(data);
    expect(await h.render().voidRecord(condition === 'wrong-kind' ? 'adjustments' : 'payments', condition === 'missing' ? COMPANY : RECEIPT, reason, 'synthetic-void-key')).toBe(false);
    expect(h.requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });
  it('accepts a canonical void receipt and refreshes the remaining balance', async () => {
    const h = harness(); await h.ready(); const after = monthly(); after.payments[0].voidedAt = WHEN; after.payments[0].voidReason = reason; after.totals.paidPence = 0; after.totals.remainingPence = 45000;
    h.handle(async (request) => json(request.method === 'POST' ? after.payments[0] : after));
    expect(await h.render().voidRecord('payments', RECEIPT, reason, 'synthetic-void-key')).toBe(true);
    expect(h.render().data.totals.remainingPence).toBe(45000); expect(h.render().notice).toContain('Record voided');
  });
  it.each([{ amountPence: 1 }, { reference: 'Different bank transaction' }, { paidOn: '2026-10-20' }, { recordedAt: 'invalid' }])('rejects a noncanonical void response %j', async (change) => {
    const h = harness(); await h.ready(); h.handle(async () => json({ ...receipt(), ...change, voidedAt: WHEN, voidReason: reason }));
    expect(await h.render().voidRecord('payments', RECEIPT, reason, 'synthetic-void-key')).toBe(false);
    expect(h.render().notice).toBeNull(); expect(h.render().writeError).toBeTruthy();
  });
  it.each(['month', 'company', 'backend', 'logout', 'session'])('suppresses a late void result after %s changes', async (kind) => {
    const h = harness(); await h.ready(); let resolve!: (value: Response) => void; const waiting = new Promise<Response>((yes) => { resolve = yes; });
    h.handle(async () => waiting); const operation = h.render().voidRecord('payments', RECEIPT, reason, 'synthetic-void-key');
    h.change(kind); resolve(json({ ...receipt(), voidedAt: WHEN, voidReason: reason }));
    expect(await operation).toBe(false); expect(h.render().notice).toBeNull(); expect(h.render().data).toBeNull();
  });
});
