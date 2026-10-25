import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const APP = path.resolve('assisted-chat-app/src');
const BASE = 'https://tax-client-fixture.invalid';
const OTHER_BASE = 'https://other-tax-fixture.invalid';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type SetupHook = Record<string,unknown> & {
 load:()=>Promise<void>; loadPayTerms:()=>Promise<void>;
 activatePayroll:(input:unknown)=>Promise<unknown>; updateSettings:(input:unknown)=>Promise<unknown>;
 createEmployee:(input:unknown)=>Promise<unknown>; updateEmployee:(input:unknown)=>Promise<unknown>;
 addPayTerms:(input:unknown)=>Promise<unknown>; createRun:(input:unknown)=>Promise<unknown>;
};
type RequestFixture = { method: string; url: string; body: unknown; signal?: AbortSignal | null };
type Slot = { value?: unknown; deps?: unknown[]; callback?: unknown; cleanup?: (() => void) | void };

// Execute the real hook, response decoder and API transport. Only React/native
// infrastructure and fetch are replaced; no request can leave this fixture.
function harness(name: string, initialArgs: string[] = [COMPANY, EMPLOYEE]) {
  let args=initialArgs;
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
  const runHook=loadModule(path.join(APP,`hooks/${name}.ts`))[name] as (...args:string[])=>SetupHook;
  let value:SetupHook;
  function render(): SetupHook {
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
    changeArgs(next:string[]){args=next;render();},
    changeScope(next: { baseUrl?: string; token?: string | null }, shouldRender = true) {
      if (next.baseUrl !== undefined) api.setApiBaseUrl(next.baseUrl);
      if ('token' in next) api.setAdminToken(next.token ?? null);
      sessionRevision += 1;
      if (shouldRender) render();
    },
    unmount() { mounted = false; for (const hook of hooks) hook.cleanup?.(); },
  };
}


const COMPANY='11111111-1111-4111-8111-111111111111';
const OTHER_COMPANY='22222222-2222-4222-8222-222222222222';
const EMPLOYEE='33333333-3333-4333-8333-333333333333';
const TERM='44444444-4444-4444-8444-444444444444';
const RUN='55555555-5555-4555-8555-555555555555';
const SETTINGS='66666666-6666-4666-8666-666666666666';
const NOW='2026-10-21T12:00:00.000Z';
const settings=(companyId=COMPANY)=>({id:SETTINGS,companyId,scheduleLabel:'Monthly payroll',payFrequency:'monthly',scheduleAnchorDate:null,monthlyPayDay:28,
 timezone:'Europe/London',version:1,activatedByUserId:EMPLOYEE,createdAt:NOW,updatedAt:NOW});
const employee=(companyId=COMPANY)=>({id:EMPLOYEE,companyId,legalFirstName:'Synthetic',legalSurname:'Employee',employeeReference:null,
 employmentStartDate:'2026-04-06',employmentEndDate:null,isDirector:false,employeeStatus:'active',version:1,createdAt:NOW,updatedAt:NOW,
 addressLine1:null,addressLine2:null,addressCity:null,addressPostcode:null,taxCode:null,taxCodeBasis:null,taxCodeSource:null,taxCodeEffectiveDate:null,
 niCategory:null,linkedUserId:null,payrollIdMigrationRef:null,currentPayTerms:null});
const terms=(companyId=COMPANY)=>({id:TERM,employeeId:EMPLOYEE,companyId,payBasis:'hourly',hourlyRate:'15.0000',fixedPeriodGross:null,
 currency:'GBP',annualSalaryNote:null,payFrequency:'monthly',contractedHoursPerWeek:null,effectiveFrom:'2026-04-06',effectiveTo:null,sourceNote:null,version:1,createdAt:NOW});
const run=(companyId=COMPANY)=>({id:RUN,companyId,periodStart:'2026-10-01',periodEnd:'2026-10-31',intendedPaymentDate:'2026-10-28',
 runStatus:'draft',employeeCount:0,latestPreview:null,version:1,createdAt:NOW});
const inputs={settings:{scheduleLabel:'Monthly payroll',payFrequency:'monthly',monthlyPayDay:28},
 employee:{legalFirstName:'Synthetic',legalSurname:'Employee',employmentStartDate:'2026-04-06'},
 terms:{payBasis:'hourly',hourlyRate:'15.00',payFrequency:'monthly',effectiveFrom:'2026-04-06'},
 run:{periodStart:'2026-10-01',periodEnd:'2026-10-31',intendedPaymentDate:'2026-10-28'}};
const cases=[
 {hook:'usePayrollSettings',method:'activatePayroll',input:inputs.settings,response:settings,error:'saveError',busy:'saving'},
 {hook:'useEmployees',method:'createEmployee',input:inputs.employee,response:employee,error:'createError',busy:'creating'},
 {hook:'useEmployee',method:'addPayTerms',input:inputs.terms,response:terms,error:'saveError',busy:'saving'},
 {hook:'usePayrollDrafts',method:'createRun',input:inputs.run,response:run,error:'createError',busy:'creating'},
] as const;

describe.each(cases)('$hook executes the real hook, decoder and API transport',spec=>{
 it('accepts a verified write without depending on a subsequent GET',async()=>{
  const h=harness(spec.hook);h.handle(async request=>request.method==='GET'?json({error:'Read temporarily unavailable'},503):json(spec.response(),201));
  expect(await h.render()[spec.method](spec.input)).toEqual(spec.response());
  expect(h.requests).toHaveLength(1);expect(h.requests[0].method).toBe('POST');
  expect(h.render()[spec.error]).toBeNull();expect(h.render()[spec.busy]).toBe(false);
 });
 it('rejects HTTP200 HTML instead of navigating with a fabricated saved object',async()=>{
  const h=harness(spec.hook);h.handle(async()=>new Response('<html>Deployment sign-in</html>',{headers:{'Content-Type':'text/html'}}));
  expect(await h.render()[spec.method](spec.input)).toBeNull();expect(h.render()[spec.error]).toBeTruthy();
 });
 it.each([{},[],{ok:true},{companyId:COMPANY}])('rejects an incomplete successful payload %j',async payload=>{
  const h=harness(spec.hook);h.handle(async()=>json(payload));
  expect(await h.render()[spec.method](spec.input)).toBeNull();expect(h.render()[spec.error]).toBeTruthy();
 });
 it('rejects a valid object belonging to a different company',async()=>{
  const h=harness(spec.hook);h.handle(async()=>json(spec.response(OTHER_COMPANY)));
  expect(await h.render()[spec.method](spec.input)).toBeNull();expect(h.render()[spec.error]).toBeTruthy();
 });
 it('prevents two writes in the same tick before React renders saving state',async()=>{
  const h=harness(spec.hook),pending=deferred<Response>();h.handle(()=>pending.promise);
  const first=h.render()[spec.method](spec.input),second=h.render()[spec.method](spec.input);
  expect(await second).toBeNull();expect(h.requests).toHaveLength(1);
  pending.resolve(json(spec.response(),201));expect(await first).toEqual(spec.response());
 });
 it('aborts an unmounted screen and ignores a response even when fetch ignores abort',async()=>{
  const h=harness(spec.hook),pending=deferred<Response>();h.handle(()=>pending.promise);
  const write=h.render()[spec.method](spec.input);h.unmount();expect(h.requests[0].signal?.aborted).toBe(true);
  pending.resolve(json(spec.response(),201));expect(await write).toBeNull();
 });
 it('ignores a late account/backend response without requiring a React rerender',async()=>{
  const h=harness(spec.hook),pending=deferred<Response>();h.handle(()=>pending.promise);
  const write=h.render()[spec.method](spec.input);h.changeScope({baseUrl:OTHER_BASE},false);
  pending.resolve(json(spec.response(),201));expect(await write).toBeNull();
 });
 it('does not let an old write release the new company write lock or report success',async()=>{
  const h=harness(spec.hook),old=deferred<Response>(),current=deferred<Response>();
  h.handle(request=>request.url.includes(OTHER_COMPANY)?current.promise:old.promise);
  const oldWrite=h.render()[spec.method](spec.input);h.changeArgs([OTHER_COMPANY,EMPLOYEE]);
  const currentWrite=h.render()[spec.method](spec.input);old.resolve(json(spec.response()));expect(await oldWrite).toBeNull();
  expect(h.render()[spec.busy]).toBe(true);expect(await h.render()[spec.method](spec.input)).toBeNull();
  current.resolve(json(spec.response(OTHER_COMPANY)));expect(await currentWrite).toEqual(spec.response(OTHER_COMPANY));
 });
});
describe('canonical payroll setup reads and retries',()=>{
 it.each([
  {hook:'usePayrollSettings',reply:settings(),field:'settings'},
  {hook:'useEmployees',reply:{employees:[employee()]},field:'employees'},
  {hook:'useEmployee',reply:employee(),field:'employee'},
  {hook:'usePayrollDrafts',reply:{runs:[run()]},field:'runs'},
 ])('validates $hook reads and clears display for another company',async spec=>{
  const h=harness(spec.hook);h.handle(async()=>json(spec.reply));await h.render().load();expect(h.render()[spec.field]).toBeTruthy();
  h.changeArgs([OTHER_COMPANY,EMPLOYEE]);expect(h.render()[spec.field]).toBeNull();
 });
 it.each(['usePayrollSettings','useEmployees','useEmployee','usePayrollDrafts'])('rejects 200HTML from $hook reads',async hook=>{
  const h=harness(hook);h.handle(async()=>new Response('<html>Unavailable</html>',{headers:{'Content-Type':'text/html'}}));
  await h.render().load();expect(h.render().error).toBeTruthy();
 });
 it('retains a stable creation key after ambiguous employee creation so retry cannot duplicate it',async()=>{
  const h=harness('useEmployees');let calls=0;h.handle(async()=>++calls===1?new Response('<html>Unverified</html>'):json(employee(),201));
  expect(await h.render().createEmployee(inputs.employee)).toBeNull();expect(await h.render().createEmployee(inputs.employee)).toEqual(employee());
  expect((h.requests[0].body as Record<string,unknown>).idempotencyKey).toBe((h.requests[1].body as Record<string,unknown>).idempotencyKey);
 });
 it('retains a stable run creation key when a network response is lost',async()=>{
  const h=harness('usePayrollDrafts');let calls=0;h.handle(async()=>{if(++calls===1)throw new TypeError('Network unavailable');return json(run(),201);});
  expect(await h.render().createRun(inputs.run)).toBeNull();expect(await h.render().createRun(inputs.run)).toEqual(run());
  expect((h.requests[0].body as Record<string,unknown>).idempotencyKey).toBe((h.requests[1].body as Record<string,unknown>).idempotencyKey);
 });
 it('validates pay terms on GET and rejects a term owned by another employee',async()=>{
  const h=harness('useEmployee');h.handle(async()=>json({payTerms:[terms()]}));await h.render().loadPayTerms();expect(h.render().payTerms).toEqual([terms()]);
  h.handle(async()=>json({payTerms:[{...terms(),employeeId:OTHER_COMPANY}]}));await h.render().loadPayTerms();expect(h.render().payTerms).toBeNull();expect(h.render().error).toBeTruthy();
 });
 it('rejects a valid response that did not save the submitted employee fields',async()=>{
  const h=harness('useEmployee');h.handle(async()=>json(employee()));
  expect(await h.render().updateEmployee({expectedVersion:1,legalFirstName:'Changed'})).toBeNull();expect(h.render().saveError).toBeTruthy();
 });
 it('does not allow a late GET to overwrite a successfully saved settings update',async()=>{
  const h=harness('usePayrollSettings'),pending=deferred<Response>();h.handle(request=>request.method==='GET'?pending.promise:Promise.resolve(json({...settings(),scheduleLabel:'Updated',version:2})));
  const read=h.render().load();await h.render().updateSettings({expectedVersion:1,scheduleLabel:'Updated'});
  pending.resolve(json(settings()));await read;expect((h.render().settings as Record<string,unknown>).scheduleLabel).toBe('Updated');
 });
});
