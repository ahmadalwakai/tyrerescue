import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { CompanyProfileDto, CreateCompanyRequest } from '../../assisted-chat-app/src/types/tax-payroll';

const APP = path.resolve('assisted-chat-app/src');
const BASE = 'https://tax-client-fixture.invalid';
const OTHER_BASE = 'https://other-tax-fixture.invalid';
const ENDPOINT = '/api/admin/tax/companies';
const company: CompanyProfileDto = {
  id: '11111111-1111-4111-8111-111111111111', companyNumber: 'SC784534', legalName: 'Fixture Tyres Ltd',
  registeredAddressLine1: '1 Fixture Street', registeredAddressLine2: null, registeredCity: 'Glasgow',
  registeredCountry: 'Scotland', registeredPostcode: 'G31 1PB', tradingName: null, tradingAddress: null,
  businessEmail: null, businessPhone: null, version: 1,
  createdAt: '2026-10-21T12:00:00.000Z', updatedAt: '2026-10-21T12:00:00.000Z',
};
const input: CreateCompanyRequest = {
  companyNumber: company.companyNumber, legalName: company.legalName, registeredAddressLine1: company.registeredAddressLine1,
};
const list = (companies: CompanyProfileDto[] = [], canCreate = true) => ({ companies, canCreate });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 4; i += 1) await tick(); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type CompanyHook = {
  companies: CompanyProfileDto[] | null; canCreate: boolean; loading: boolean; error: string | null;
  creating: boolean; createError: { error: string; code: string; fieldErrors?: Record<string, string> } | null;
  load: () => Promise<unknown>; createCompany: (body: CreateCompanyRequest) => Promise<CompanyProfileDto | null>;
};
type RequestFixture = { method: string; url: string; body: unknown; signal?: AbortSignal | null };
type Slot = { value?: unknown; deps?: unknown[]; callback?: unknown; cleanup?: (() => void) | void };

// Execute the real hook, response decoder and API transport. Only React/native
// infrastructure and fetch are replaced; no request can leave this fixture.
function harness() {
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
  const { useTaxCompanies: runHook } = loadModule(path.join(APP, 'hooks/useTaxCompanies.ts')) as { useTaxCompanies: () => CompanyHook };
  let value: CompanyHook;
  function render(): CompanyHook {
    if (!mounted) return value;
    let attempts = 0;
    do {
      dirty = false; cursor = 0; effects = [];
      value = runHook();
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
    async ready(companies: CompanyProfileDto[] = [], canCreate = true) {
      handler = async () => json(list(companies, canCreate));
      await render().load(); return render();
    },
    changeScope(next: { baseUrl?: string; token?: string | null }, shouldRender = true) {
      if (next.baseUrl !== undefined) api.setApiBaseUrl(next.baseUrl);
      if ('token' in next) api.setAdminToken(next.token ?? null);
      sessionRevision += 1;
      if (shouldRender) render();
    },
    unmount() { mounted = false; for (const hook of hooks) hook.cleanup?.(); },
  };
}

describe('Tax company loading through the real hook and isolated API transport', () => {
  it('keeps Create disabled until a valid canonical company list arrives', async () => {
    const h = harness();
    expect(h.render().companies).toBeNull(); expect(h.render().canCreate).toBe(false);
    await h.ready();
    expect(h.render().companies).toEqual([]); expect(h.render().canCreate).toBe(true);
    expect(h.requests[0].url).toBe(`${BASE}${ENDPOINT}`);
  });

  it.each([{}, { companies: [] }, { companies: [], canCreate: 'true' }, { companies: [{}], canCreate: true }])('does not enable Create from an invalid 2xx list: %j', async (body) => {
    const h = harness(); h.handle(async () => json(body));
    await h.render().load();
    expect(h.render().companies).toBeNull(); expect(h.render().canCreate).toBe(false); expect(h.render().error).toBeTruthy();
  });

  it('shows a retryable load error after a 2xx HTML page instead of displaying the creation form', async () => {
    const h = harness(); h.handle(async () => new Response('<html>Sign in to deployment</html>', { headers: { 'Content-Type': 'text/html' } }));
    await h.render().load();
    expect(h.render().error).toBeTruthy(); expect(h.render().canCreate).toBe(false);
    expect(await h.render().createCompany(input)).toBeNull();
    expect(h.requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('honours denied create capability from an otherwise valid list', async () => {
    const h = harness(); await h.ready([], false);
    expect(h.render().canCreate).toBe(false);
    expect(await h.render().createCompany(input)).toBeNull();
    expect(h.requests).toHaveLength(1);
  });

  it('keeps Create disabled after a network failure and enables it only after a verified retry', async () => {
    const h = harness(); await h.render().load();
    expect(h.render().canCreate).toBe(false); expect(h.render().error).toBeTruthy();
    await h.ready();
    expect(h.render().canCreate).toBe(true); expect(h.render().error).toBeNull();
  });

  it('explains when the deployed server has no company API instead of offering a nonfunctional form', async () => {
    const h = harness(); h.handle(async () => new Response('<html>Not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }));
    await h.render().load();
    expect(h.render().canCreate).toBe(false); expect(h.render().error).toContain('server update');
    expect(await h.render().createCompany(input)).toBeNull(); expect(h.requests).toHaveLength(1);
  });
});

describe('Tax company creation with canonical server confirmation', () => {
  it.each([{}, { ok: true }, { ...company, legalName: undefined }, { ...company, id: 'not-a-company-id' }, { ...company, companyNumber: 'SC000001' }, { ...company, registeredAddressLine1: 'A different address' }])('never produces the screenshot’s false success for malformed or mismatched 2xx JSON: %j', async (body) => {
    const h = harness(); await h.ready(); h.handle(async () => json(body, 201));
    expect(await h.render().createCompany(input)).toBeNull();
    expect(h.render().createError?.error).toBeTruthy();
    expect(h.render().companies).toEqual([]);
  });

  it('rejects a 2xx HTML POST response without claiming the company was saved', async () => {
    const h = harness(); await h.ready();
    h.handle(async () => new Response('<html>Deployment login</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    expect(await h.render().createCompany(input)).toBeNull();
    expect(h.render().createError).not.toBeNull(); expect(h.render().companies).toEqual([]);
  });

  it('installs a confirmed company immediately without depending on a second GET', async () => {
    const h = harness(); await h.ready();
    h.handle(async (request) => {
      if (request.method === 'GET') throw new Error('Refresh deliberately unavailable');
      return json(company, 201);
    });
    expect(await h.render().createCompany(input)).toEqual(company);
    expect(h.render().companies).toEqual([company]); expect(h.render().createError).toBeNull();
    expect(h.requests.map((request) => request.method)).toEqual(['GET', 'POST']);
  });

  it('uses a synchronous flight lock to prevent rapid double taps before React rerenders', async () => {
    const h = harness(); await h.ready(); const pending = deferred<Response>();
    h.handle(async () => pending.promise);
    const create = h.render().createCompany;
    const first = create(input); const second = create(input);
    await settle();
    expect(h.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    pending.resolve(json(company, 201));
    const results = await Promise.all([first, second]);
    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(h.render().companies).toEqual([company]); expect(h.render().creating).toBe(false);
  });

  it('trims user input and omits empty optional fields before POST, including optional email', async () => {
    const h = harness(); await h.ready(); h.handle(async () => json(company, 201));
    await h.render().createCompany({
      ...input, companyNumber: ' sc784534 ', legalName: ' Fixture Tyres Ltd ', registeredAddressLine1: ' 1 Fixture Street ',
      registeredAddressLine2: ' ', tradingName: '', tradingAddress: '   ', businessEmail: ' ', businessPhone: '', registeredCity: ' Glasgow ',
    });
    const posted = h.requests.find((request) => request.method === 'POST')?.body as Record<string, unknown>;
    expect(posted.companyNumber).toBe(company.companyNumber); expect(posted.legalName).toBe(company.legalName);
    expect(posted.registeredAddressLine1).toBe(company.registeredAddressLine1); expect(posted.registeredCity).toBe('Glasgow');
    for (const field of ['registeredAddressLine2', 'tradingName', 'tradingAddress', 'businessEmail', 'businessPhone']) expect(posted).not.toHaveProperty(field);
  });

  it('preserves a structured validation error and unlocks the next deliberate attempt', async () => {
    const h = harness(); await h.ready();
    const detail = { error: 'Check company details', code: 'VALIDATION_ERROR', fieldErrors: { businessEmail: 'Enter a valid email' } };
    h.handle(async () => json(detail, 422));
    expect(await h.render().createCompany(input)).toBeNull(); expect(h.render().createError).toEqual(detail); expect(h.render().creating).toBe(false);
    h.handle(async () => json(company, 201));
    expect(await h.render().createCompany(input)).toEqual(company);
  });
});

describe('Company duplicate recovery stays within the current admin’s visible list', () => {
  it('recovers an already-created visible company by refreshing GET without repeating POST', async () => {
    const h = harness(); await h.ready();
    h.handle(async (request) => request.method === 'POST'
      ? json({ error: 'Company already exists', code: 'CONFLICT_DUPLICATE' }, 409)
      : json(list([company])));
    expect(await h.render().createCompany(input)).toEqual(company);
    expect(h.render().companies).toEqual([company]); expect(h.render().createError).toBeNull();
    expect(h.requests.map((request) => request.method)).toEqual(['GET', 'POST', 'GET']);
  });

  it.each([{ visible: [] }, { visible: [{ ...company, companyNumber: 'SC000001', legalName: 'Another visible company' }] }])('keeps a duplicate error when the matching company is not visible to this admin: %j', async ({ visible }) => {
    const h = harness(); await h.ready();
    h.handle(async (request) => request.method === 'POST'
      ? json({ error: 'Company already exists', code: 'CONFLICT_DUPLICATE', fieldErrors: { companyNumber: 'Already exists' } }, 409)
      : json(list(visible)));
    expect(await h.render().createCompany(input)).toBeNull(); expect(h.render().createError?.code).toBe('CONFLICT_DUPLICATE');
    expect(h.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    expect(h.requests.every((request) => request.url === `${BASE}${ENDPOINT}`)).toBe(true);
  });

  it('preserves a duplicate error when canonical recovery is unavailable', async () => {
    const h = harness(); await h.ready();
    h.handle(async (request) => {
      if (request.method === 'POST') return json({ error: 'Company already exists', code: 'CONFLICT_DUPLICATE' }, 409);
      throw new Error('List refresh unavailable');
    });
    expect(await h.render().createCompany(input)).toBeNull(); expect(h.render().createError?.code).toBe('CONFLICT_DUPLICATE');
    expect(h.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });

  it.each(['lost-response', 'invalid-json-shape'])('recovers a verified saved company after %s without retrying the write', async (failure) => {
    const h = harness(); await h.ready();
    h.handle(async (request) => {
      if (request.method === 'GET') return json(list([company]));
      if (failure === 'lost-response') throw new TypeError('Connection closed after the server committed');
      return json({ ok: true }, 201);
    });
    expect(await h.render().createCompany(input)).toEqual(company);
    expect(h.render().companies).toEqual([company]); expect(h.render().createError).toBeNull();
    expect(h.requests.map((request) => request.method)).toEqual(['GET', 'POST', 'GET']);
  });

  it('does not identify a recovered company by number alone when its legal name differs', async () => {
    const h = harness(); await h.ready();
    h.handle(async (request) => request.method === 'POST'
      ? json({ error: 'Company already exists', code: 'CONFLICT_DUPLICATE' }, 409)
      : json(list([{ ...company, legalName: 'A Different Company Ltd' }])));
    expect(await h.render().createCompany(input)).toBeNull(); expect(h.render().createError?.code).toBe('CONFLICT_DUPLICATE');
    expect(h.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });

  it('does not claim new form details were saved when the existing profile has a different address or contact', async () => {
    const h = harness(); await h.ready();
    h.handle(async (request) => request.method === 'POST'
      ? json({ error: 'Company already exists', code: 'CONFLICT_DUPLICATE' }, 409)
      : json(list([company])));
    expect(await h.render().createCompany({ ...input, registeredAddressLine1: 'A new address' })).toBeNull();
    expect(await h.render().createCompany({ ...input, businessEmail: 'new@fixture.invalid' })).toBeNull();
    expect(h.render().createError?.code).toBe('CONFLICT_DUPLICATE');
    expect(h.render().companies).toEqual([]);
  });
});

describe('Company responses cannot cross login, project or screen boundaries', () => {
  it.each(['logout', 'project', 'same-token-new-login', 'unmount'])('suppresses a late created-company result after %s', async (change) => {
    const h = harness(); await h.ready(); const pending = deferred<Response>(); h.handle(async () => pending.promise);
    const operation = h.render().createCompany(input);
    await settle();
    if (change === 'unmount') h.unmount();
    else if (change === 'project') h.changeScope({ baseUrl: OTHER_BASE });
    else if (change === 'logout') h.changeScope({ token: null });
    else h.changeScope({ token: 'isolated-admin-credential' });
    pending.resolve(json(company, 201));
    expect(await operation).toBeNull();
    if (change !== 'unmount') { expect(h.render().companies).toBeNull(); expect(h.render().canCreate).toBe(false); }
  });

  it('ignores a late list response even when the token changed before a rerender', async () => {
    const h = harness(); const pending = deferred<Response>(); h.handle(async () => pending.promise);
    const operation = h.render().load();
    h.changeScope({ token: null }, false); pending.resolve(json(list([company])));
    await operation;
    expect(h.render().companies).toBeNull(); expect(h.render().canCreate).toBe(false);
  });

  it('does not show an old request error on a different project', async () => {
    const h = harness(); await h.ready(); const pending = deferred<Response>(); h.handle(async () => pending.promise);
    const operation = h.render().createCompany(input);
    h.changeScope({ baseUrl: OTHER_BASE }); pending.reject(new Error('Old project unavailable'));
    expect(await operation).toBeNull(); expect(h.render().createError).toBeNull(); expect(h.render().error).toBeNull();
  });

  it('does not let an old project’s create finalizer unlock a newer project’s pending create', async () => {
    const h = harness(); await h.ready(); const first = deferred<Response>(); h.handle(async () => first.promise);
    const oldOperation = h.render().createCompany(input); await settle();
    h.changeScope({ baseUrl: OTHER_BASE }); await h.ready();
    const second = deferred<Response>(); h.handle(async () => second.promise);
    const newOperation = h.render().createCompany(input); await settle();
    expect(h.render().creating).toBe(true);
    first.resolve(json(company, 201)); expect(await oldOperation).toBeNull();
    expect(h.render().creating).toBe(true);
    expect(await h.render().createCompany(input)).toBeNull();
    expect(h.requests.filter((request) => request.method === 'POST')).toHaveLength(2);
    second.resolve(json(company, 201)); expect(await newOperation).toEqual(company);
    expect(h.render().creating).toBe(false); expect(h.render().companies).toEqual([company]);
  });

  it('never starts duplicate reconciliation on a switched project after a late 409', async () => {
    const h = harness(); await h.ready(); const pending = deferred<Response>(); h.handle(async () => pending.promise);
    const operation = h.render().createCompany(input); await settle();
    h.changeScope({ baseUrl: OTHER_BASE }); pending.resolve(json({ error: 'Company already exists', code: 'CONFLICT_DUPLICATE' }, 409));
    expect(await operation).toBeNull(); expect(h.requests.map((request) => request.method)).toEqual(['GET', 'POST']);
    expect(h.requests.every((request) => request.url === `${BASE}${ENDPOINT}`)).toBe(true);
    expect(h.render().companies).toBeNull(); expect(h.render().createError).toBeNull();
  });

  it('suppresses duplicate recovery when the account changes while its GET is pending', async () => {
    const h = harness(); await h.ready(); const pending = deferred<Response>();
    h.handle(async (request) => request.method === 'POST'
      ? json({ error: 'Company already exists', code: 'CONFLICT_DUPLICATE' }, 409)
      : pending.promise);
    const operation = h.render().createCompany(input); await settle();
    expect(h.requests.map((request) => request.method)).toEqual(['GET', 'POST', 'GET']);
    h.changeScope({ token: 'another-isolated-admin' }); pending.resolve(json(list([company])));
    expect(await operation).toBeNull(); expect(h.render().companies).toBeNull(); expect(h.render().createError).toBeNull();
  });
});
