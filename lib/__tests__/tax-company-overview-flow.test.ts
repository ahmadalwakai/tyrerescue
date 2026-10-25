import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { TaxPayrollOverviewDto } from '../../assisted-chat-app/src/types/tax-payroll';

const APP = path.resolve('assisted-chat-app/src');
const BASE = 'https://tax-overview-fixture.invalid';
const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPANY = '22222222-2222-4222-8222-222222222222';
const profile = {
  id: COMPANY, companyNumber: 'SC784534', legalName: 'Fixture Tyres Ltd',
  registeredAddressLine1: '1 Fixture Street', registeredAddressLine2: null,
  registeredCity: 'Glasgow', registeredCountry: 'Scotland', registeredPostcode: 'G31 1PB',
  tradingName: null, tradingAddress: null, businessEmail: null, businessPhone: null,
  version: 1, createdAt: '2026-10-21T12:00:00.000Z', updatedAt: '2026-10-21T12:00:00.000Z',
};
const overview = (id = COMPANY): TaxPayrollOverviewDto => ({
  company: { ...profile, id }, setupComplete: true,
  registrationStatuses: [
    { taxService: 'corporation_tax', status: 'unknown', declaredAt: null },
    { taxService: 'vat', status: 'registered', declaredAt: '2026-10-20T12:00:00.000Z' },
    { taxService: 'paye', status: 'not_registered', declaredAt: '2026-10-20T13:00:00+01:00' },
  ],
  capabilities: ['tax.read', 'tax.company.write', 'tax.audit.read'],
  payrollAvailable: false, payrollSummary: null, vatAvailable: false,
  corporationTaxAvailable: false, documentsAvailable: false, submissionsAvailable: false,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
type Hook = { overview: TaxPayrollOverviewDto | null; loading: boolean; error: string | null; load: () => Promise<void> };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: (() => void) | void };
type RequestFixture = { url: string; signal?: AbortSignal | null; authorization: string | null };

// Run the actual hook, runtime decoder and API transport. Fetch cannot leave
// this isolated VM, including requests issued after account/project switching.
function harness() {
  const hooks: Slot[] = [];
  const requests: RequestFixture[] = [];
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  let cursor = 0;
  let dirty = false;
  let mounted = true;
  let revision = 1;
  let companyId = COMPANY;
  let effects: Array<() => void> = [];
  let handler: (request: RequestFixture) => Promise<Response> = async () => json(overview());
  const changed = (before?: unknown[], next?: unknown[]) => !before || !next
    || before.length !== next.length || next.some((entry, index) => entry !== before[index]);
  const memo = (factory: () => unknown, deps?: unknown[]) => {
    const index = cursor++;
    if (!hooks[index] || changed(hooks[index].deps, deps)) hooks[index] = { value: factory(), deps };
    return hooks[index].value;
  };
  const react = {
    // Runs during render, like the render-time ref writes it replaced.
    useLayoutEffect(effect: () => unknown) { effect(); },
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
      if (!hooks[index] || changed(hooks[index].deps, deps)) effects.push(() => {
        hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const context = vm.createContext({
    Error, TypeError, RangeError, Promise, AbortController, URL, Response, Headers,
    __DEV__: false, process: { env: { NODE_ENV: 'production' } },
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async (url: string, init: RequestInit = {}) => {
      const request = { url, signal: init.signal, authorization: new Headers(init.headers).get('Authorization') };
      requests.push(request); return handler(request);
    },
  });
  function loadModule(filename: string): Record<string, unknown> {
    const absolute = path.resolve(filename);
    const cached = cache.get(absolute); if (cached) return cached.exports;
    const sourceModule = { exports: {} as Record<string, unknown> }; cache.set(absolute, sourceModule);
    const code = ts.transpileModule(readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const requireFixture = (id: string) => {
      if (id === 'react') return react;
      if (id === 'react-native') return { Platform: { OS: 'ios' } };
      if (id === 'expo-constants') return { expoConfig: { version: '0.0.0' } };
      if (id.includes('startup-logging')) return { logStartupModuleStarted() {}, logStartupModuleCompleted() {}, logStartupModuleFailed() {} };
      if (id.endsWith('/useAdminSession') || id === './useAdminSession') return { getAdminSessionRevision: () => revision };
      if (id.startsWith('.')) return loadModule(path.resolve(path.dirname(absolute), `${id}.ts`));
      if (id === '@/hooks/useLatestRef') return loadModule(path.join(APP, 'hooks/useLatestRef.ts'));
      throw new Error(`Unexpected isolated module: ${id}`);
    };
    const run = vm.runInContext(`(function(require, module, exports) { ${code}\n})`, context, { filename: absolute });
    run(requireFixture, sourceModule, sourceModule.exports); return sourceModule.exports;
  }
  const api = loadModule(path.join(APP, 'lib/api.ts')) as {
    setApiBaseUrl: (base: string) => void; setAdminToken: (token: string | null) => void;
  };
  api.setApiBaseUrl(BASE); api.setAdminToken('isolated-admin-token');
  const { useTaxPayrollOverview: runHook } = loadModule(path.join(APP, 'hooks/useTaxPayrollOverview.ts')) as {
    useTaxPayrollOverview: (id: string) => Hook;
  };
  let value: Hook;
  function render(): Hook {
    if (!mounted) return value;
    let attempts = 0;
    do {
      dirty = false; cursor = 0; effects = []; value = runHook(companyId);
      for (const effect of effects) effect();
      if (++attempts > 12) throw new Error('Hook did not settle');
    } while (dirty);
    return value;
  }
  render();
  return {
    requests, render,
    handle(next: typeof handler) { handler = next; },
    changeScope(next: { baseUrl?: string; token?: string | null; companyId?: string }, shouldRender = true) {
      if (next.baseUrl !== undefined) api.setApiBaseUrl(next.baseUrl);
      if ('token' in next) api.setAdminToken(next.token ?? null);
      if (next.companyId !== undefined) companyId = next.companyId;
      revision += 1; if (shouldRender) render();
    },
    changeCompany(id: string) { companyId = id; render(); },
    unmount() { mounted = false; for (const hook of hooks) hook.cleanup?.(); },
  };
}

describe('Tax & Payroll overview through the real hook and isolated API transport', () => {
  it('renders only a valid confirmed overview for the selected company', async () => {
    const h = harness(); await h.render().load();
    expect(h.render().overview).toEqual(overview());
    expect(h.render().overview?.registrationStatuses.map((row) => row.taxService)).toEqual(['corporation_tax', 'vat', 'paye']);
    expect(h.render().error).toBeNull(); expect(h.render().loading).toBe(false);
    expect(h.requests[0]).toMatchObject({ url: `${BASE}/api/admin/tax/companies/${COMPANY}/overview`, authorization: 'Bearer isolated-admin-token' });
  });

  it('rejects 200 HTML and permits a deliberate retry without fabricating status rows', async () => {
    const h = harness(); h.handle(async () => new Response('<html>Deployment login</html>', { headers: { 'Content-Type': 'text/html' } }));
    await h.render().load();
    expect(h.render().overview).toBeNull(); expect(h.render().error).toContain('profile is saved'); expect(h.render().error).toContain('invalid');
    h.handle(async () => json(overview())); await h.render().load();
    expect(h.render().overview).toEqual(overview()); expect(h.render().error).toBeNull();
  });

  it.each([
    {}, { ok: true }, { ...overview(), company: null }, { ...overview(), company: { ...profile, legalName: undefined } },
    { ...overview(), company: { ...profile, id: OTHER_COMPANY } },
    { ...overview(), registrationStatuses: null }, { ...overview(), registrationStatuses: [] },
    { ...overview(), registrationStatuses: [...overview().registrationStatuses, overview().registrationStatuses[0]] },
    { ...overview(), registrationStatuses: Array(3).fill(overview().registrationStatuses[0]) },
    { ...overview(), registrationStatuses: [{ taxService: 'income_tax', status: 'registered', declaredAt: null }, ...overview().registrationStatuses.slice(1)] },
    { ...overview(), registrationStatuses: [{ taxService: 'vat', status: 'pending', declaredAt: null }, ...overview().registrationStatuses.slice(1)] },
    { ...overview(), registrationStatuses: [{ ...overview().registrationStatuses[0], declaredAt: '2026-10-20' }, ...overview().registrationStatuses.slice(1)] },
    { ...overview(), setupComplete: 'yes' }, { ...overview(), payrollAvailable: undefined },
    { ...overview(), capabilities: ['tax.read', 'unexpected.root'] }, { ...overview(), capabilities: ['tax.read', 'tax.read'] },
    { ...overview(), payrollSummary: undefined },
    { ...overview(), payrollSummary: { isActivated: false } },
    { ...overview(), payrollAvailable: true, payrollSummary: null },
  ])('rejects malformed or mismatched 200 JSON without exposing it to map: %j', async (payload) => {
    const h = harness(); h.handle(async () => json(payload)); await h.render().load();
    expect(h.render().overview).toBeNull(); expect(h.render().error).toContain('invalid'); expect(h.render().loading).toBe(false);
  });

  it('validates the payroll summary before exposing an activated schedule', async () => {
    const h = harness(); const valid = { ...overview(), payrollAvailable: true,
      capabilities: [...overview().capabilities, 'payroll.read'], payrollSummary: {
        isActivated: true, payFrequency: 'weekly', scheduleLabel: 'Weekly', activeEmployeeCount: 2, draftRunCount: 1, settingsVersion: 1,
      } };
    h.handle(async () => json(valid)); await h.render().load();
    expect(h.render().overview?.payrollSummary).toEqual(valid.payrollSummary);
    for (const patch of [{ activeEmployeeCount: -1 }, { draftRunCount: 1.5 }, { settingsVersion: 0 }, { payFrequency: 'daily' }, { scheduleLabel: {} }]) {
      h.handle(async () => json({ ...valid, payrollSummary: { ...valid.payrollSummary, ...patch } }));
      await h.render().load(); expect(h.render().overview).toBeNull(); expect(h.render().error).toContain('invalid');
    }
  });

  it.each([404, 405])('keeps the saved profile and gives recovery steps without diagnosing an unknown 404/405 as a missing server feature (%s)', async (status) => {
    const h = harness(); h.handle(async () => new Response('<html>Missing route</html>', { status, headers: { 'Content-Type': 'text/html' } }));
    await h.render().load(); expect(h.render().overview).toBeNull();
    expect(h.render().error).toContain('profile is saved'); expect(h.render().error).toContain('check your company access');
    expect(h.render().error).not.toContain('server update');
  });

  it('preserves the login and offers retry after 401 or a transport failure', async () => {
    const h = harness(); h.handle(async () => json({ error: 'Unauthorized' }, 401)); await h.render().load();
    expect(h.render().error).toContain('Please retry');
    h.handle(async () => { throw new TypeError('Isolated connection lost'); }); await h.render().load();
    expect(h.render().overview).toBeNull(); expect(h.render().error).toContain('profile is saved');
    h.handle(async () => json(overview())); await h.render().load();
    expect(h.render().overview).toEqual(overview());
    expect(h.requests.every((request) => request.authorization === 'Bearer isolated-admin-token')).toBe(true);
  });

  it('ignores an older result that arrives after a newer successful refresh', async () => {
    const h = harness(); const old = deferred<Response>(); h.handle(async () => old.promise);
    const earlier = h.render().load(); h.handle(async () => json(overview())); await h.render().load();
    old.resolve(json({ ok: true })); await earlier;
    expect(h.render().overview).toEqual(overview()); expect(h.render().error).toBeNull();
  });

  it('aborts a switched project request and rejects its late result even if fetch ignores abort', async () => {
    const h = harness(); const old = deferred<Response>(); h.handle(async () => old.promise);
    const earlier = h.render().load(); h.changeScope({ baseUrl: 'https://other-overview-fixture.invalid', token: 'other-admin-token' });
    expect(h.requests[0].signal?.aborted).toBe(true); expect(h.render().overview).toBeNull();
    h.handle(async () => json(overview())); await h.render().load(); old.resolve(json(overview())); await earlier;
    expect(h.requests[1]).toMatchObject({ url: `https://other-overview-fixture.invalid/api/admin/tax/companies/${COMPANY}/overview`, authorization: 'Bearer other-admin-token' });
    expect(h.render().overview).toEqual(overview()); expect(h.render().error).toBeNull();
  });

  it('does not allow a stale session response to update state before React rerenders', async () => {
    const h = harness(); const old = deferred<Response>(); h.handle(async () => old.promise);
    const earlier = h.render().load(); h.changeScope({ token: 'new-admin-token' }, false);
    old.resolve(json(overview())); await earlier;
    expect(h.render().overview).toBeNull(); expect(h.render().error).toBeNull();
  });

  it('clears one company before loading another, including late old-company responses', async () => {
    const h = harness(); await h.render().load(); const old = deferred<Response>(); h.handle(async () => old.promise);
    const earlier = h.render().load(); h.changeCompany(OTHER_COMPANY); expect(h.render().overview).toBeNull();
    h.handle(async () => json(overview(OTHER_COMPANY))); await h.render().load();
    old.resolve(json(overview())); await earlier;
    expect(h.render().overview?.company.id).toBe(OTHER_COMPANY);
  });

  it('aborts on unmount and refuses saved callbacks or invalid company identifiers', async () => {
    const h = harness(); const old = deferred<Response>(); h.handle(async () => old.promise);
    const callback = h.render().load; const pending = callback(); h.unmount();
    expect(h.requests[0].signal?.aborted).toBe(true); old.resolve(json(overview())); await pending; await callback();
    expect(h.requests).toHaveLength(1);
    const invalid = harness(); invalid.changeCompany('../other-company'); await invalid.render().load();
    expect(invalid.requests).toHaveLength(0); expect(invalid.render().error).toContain('selected company');
  });
});
