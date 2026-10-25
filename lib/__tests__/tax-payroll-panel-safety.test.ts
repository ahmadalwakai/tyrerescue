/* eslint-disable @typescript-eslint/no-explicit-any -- executes real React Native components in an isolated JSX/React fixture */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseEmployeeTaxSetup, assertEmployeeTaxSetupSaved, parseCompanyPayrollAccess, assertCompanyPayrollAccessSaved,
  grantedPayrollCapabilities, editablePayrollSetupAmount } from '../../assisted-chat-app/src/lib/payroll-panel-response';
const APP = path.resolve('assisted-chat-app/src'); const BASE = 'https://panel-fixture.invalid'; const OTHER_BASE = 'https://other-panel-fixture.invalid';
const COMPANY='11111111-1111-4111-8111-111111111111', EMPLOYEE='22222222-2222-4222-8222-222222222222',
  FOUNDER='33333333-3333-4333-8333-333333333333', MEMBER='44444444-4444-4444-8444-444444444444';
const WHEN='2026-10-21T12:00:00.000Z';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve)); async function settle(){for(let i=0;i<4;i++) await tick();}
function deferred<T>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(yes=>{resolve=yes;}); return {promise,resolve}; }
function setup() { return { employeeId:EMPLOYEE,companyId:COMPANY,expectedVersion:1,isDirector:false,directorFullTaxYearConfirmed:false,
  taxCode:'S1257L',taxCodeBasis:'cumulative',taxCodeSource:'starter_checklist',taxCodeEffectiveDate:'2026-04-06',niCategory:'A',niMethod:'periodic',
  pensionHandling:'none_confirmed',sourceType:'first_payroll_this_tax_year',openingYtdTaxYear:'2026-27',openingYtdEffectiveDate:'2026-04-06',
  openingYtdGrossPay:'0.0000',openingYtdTaxPaid:'0.0000',openingYtdNiEmployee:'0.0000',openingYtdNiEmployer:'0.0000',
  openingYtdStudentLoanDeductions:'0.0000',openingYtdPensionEmployee:'0.0000',openingYtdPensionEmployer:'0.0000',
  p45TotalPayPrevEmployment:null,p45TotalTaxPrevEmployment:null,openingYtdCompleteness:'complete',studentLoanPlans:[],
  postgraduateLoan:false,studentLoanUnknown:false,recordedAt:WHEN }; }
function access(withMember=false) { return {canManage:true,members:[{userId:FOUNDER,name:'Founder',email:'founder@fixture.invalid',
  capabilities:['tax.read','tax.company.write','tax.audit.read'],isFounder:true}, ...(withMember?[{userId:MEMBER,name:'Reviewer',email:'reviewer@fixture.invalid',
  capabilities:[...grantedPayrollCapabilities],isFounder:false}]:[])]}; }
function confirmed(body:unknown) { const row=body as Record<string,unknown>; return {...setup(),...row,expectedVersion:Number(row.expectedVersion)+1,openingYtdCompleteness:'complete',recordedAt:WHEN}; }
function confirmFacts(h:ReturnType<typeof harness>) {
  h.press('I have checked the employee'); h.press('I confirm no pension deductions'); h.press('I confirm no earlier payroll');
}
type RequestFixture = { method: string; url: string; body: unknown; signal?: AbortSignal | null };
type Slot = { value?: unknown; deps?: unknown[]; callback?: unknown; cleanup?: (() => void) | void };

// Execute the real hook, response decoder and API transport. Only React/native
// infrastructure and fetch are replaced; no request can leave this fixture.
function harness(kind: 'employee' | 'access' = 'employee', initial = setup()) {
  let saved = 0; const props = { companyId: COMPANY, employeeId: EMPLOYEE, onSaved: () => { saved += 1; } };
  const alerts: Array<Array<{ text: string; onPress?: () => void }>> = [];
  const hooks: Slot[] = [];
  let cursor = 0;
  let dirty = false;
  let mounted = true;
  let sessionRevision = 1;
  let effects: Array<() => void> = [];
  const requests: RequestFixture[] = [];
  let handler: (request: RequestFixture) => Promise<Response> = async () => json(kind === 'employee' ? { setup: initial } : access());
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
      fileName: absolute,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const requireFixture = (id: string) => {
      if (id === 'react') return react;
      if (id === 'react-native') return { Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value: unknown) => value }, Alert: { alert: (_title: string, _text: string, buttons: Array<{text:string;onPress?:()=>void}>) => alerts.push(buttons) } };
      if (id === 'react/jsx-runtime') return { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'Fragment' };
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
  const name = kind === 'employee' ? 'EmployeeTaxSetupPanel' : 'CompanyPayrollAccessPanel';
  const runHook = loadModule(path.join(APP, `components/payroll/${name}.tsx`))[name] as (props: unknown) => any;
  let value: any;
  function render(): any {
    if (!mounted) return value;
    let attempts = 0;
    do {
      dirty = false; cursor = 0; effects = [];
      value = runHook(props);
      for (const effect of effects) effect();
      attempts += 1;
      if (attempts > 12) throw new Error('Hook did not settle');
    } while (dirty);
    return value;
  }
  function plain(value: any): string {
    if(value===null||value===undefined||typeof value==='boolean') return '';
    if(typeof value==='string'||typeof value==='number') return String(value);
    if(Array.isArray(value)) return value.map(plain).join('');
    return plain(value.props?.children);
  }
  function nodes() {
    const output: Array<{type:string;props:any}>=[];
    function walk(value:any) {
      if(!value||typeof value!=='object') return;
      if(Array.isArray(value)) { value.forEach(walk); return; }
      if(typeof value.type==='function') { walk(value.type(value.props)); return; }
      output.push(value); walk(value.props?.children);
    }
    walk(value); return output;
  }
  render();
  return {
    requests, render,
    handle(next: typeof handler) { handler = next; },
    async flush() { await settle(); render(); await settle(); return render(); },
    nodes,
    text() { return nodes().filter((node)=>node.type==='Text').map(node=>plain(node.props.children)).join(' '); },
    type(label: string, value: string) { const node=nodes().find(node=>node.type==='TextInput'&&node.props.accessibilityLabel===label); if(!node) throw new Error(`Missing input ${label}`); node.props.onChangeText(value); render(); },
    button(label: string) { const node=nodes().find(node=>node.type==='Pressable'&&plain(node.props.children).includes(label)); if(!node) throw new Error(`Missing control ${label}`); return node.props; },
    press(label: string) { const node=nodes().find(node=>node.type==='Pressable'&&plain(node.props.children).includes(label)); if(!node) throw new Error(`Missing control ${label}`); if(node.props.disabled) throw new Error(`Disabled control ${label}`); node.props.onPress(); render(); },
    confirm() { const buttons=alerts.pop(); const action=buttons?.find(button=>button.text!=='Cancel'); if(!action?.onPress) throw new Error('No confirmation'); action.onPress(); render(); },
    saved() { return saved; },
    changeScope(next: { baseUrl?: string; token?: string | null }, shouldRender = true) {
      if (next.baseUrl !== undefined) api.setApiBaseUrl(next.baseUrl);
      if ('token' in next) api.setAdminToken(next.token ?? null);
      sessionRevision += 1;
      if (shouldRender) render();
    },
    unmount() { mounted = false; for (const hook of hooks) hook.cleanup?.(); },
  };
}

describe('canonical payroll setup and access confirmation', () => {
  it('accepts canonical stored setup and exact confirmed version/field changes with decimal normalization', () => {
    const before=parseEmployeeTaxSetup({setup:setup()},COMPANY,EMPLOYEE);
    const body={...setup(),taxCode:'BR',openingYtdGrossPay:'0.00'};
    expect(()=>assertEmployeeTaxSetupSaved(parseEmployeeTaxSetup({setup:confirmed(body)},COMPANY,EMPLOYEE),before,body)).not.toThrow();
  });
  it.each([{expectedVersion:1},{expectedVersion:3},{taxCode:'BR'},{openingYtdTaxPaid:'1.0000'},
    {studentLoanPlans:['2']},{postgraduateLoan:true},{studentLoanUnknown:true},{directorFullTaxYearConfirmed:true}])('rejects a stale or mismatched tax-setup success %j',patch=>{
    const before=parseEmployeeTaxSetup({setup:setup()},COMPANY,EMPLOYEE);
    expect(()=>assertEmployeeTaxSetupSaved(parseEmployeeTaxSetup({setup:{...confirmed(setup()),...patch}},COMPANY,EMPLOYEE),before,setup())).toThrow();
  });
  it.each([{studentLoanPlans:['bogus']},{postgraduateLoan:'false'},{taxCodeBasis:'unknown'},{openingYtdTaxPaid:-1},{recordedAt:'invalid'}])('rejects invalid financial metadata %j',patch=>{
    expect(()=>parseEmployeeTaxSetup({setup:{...setup(),...patch}},COMPANY,EMPLOYEE)).toThrow();
  });
  it('removes extra database decimal zeroes without rounding imported pay history',()=>{
    expect(editablePayrollSetupAmount('123.4500')).toBe('123.45');
    expect(editablePayrollSetupAmount('123.4567')).toBe('123.4567');
  });
  it('requires the returned access feed to prove the requested grant or removal',()=>{
    const before=parseCompanyPayrollAccess(access()),after=parseCompanyPayrollAccess(access(true));
    expect(()=>assertCompanyPayrollAccessSaved(after,before,'reviewer@fixture.invalid','grant_payroll')).not.toThrow();
    expect(()=>assertCompanyPayrollAccessSaved(before,before,'reviewer@fixture.invalid','grant_payroll')).toThrow();
    expect(()=>assertCompanyPayrollAccessSaved(before,after,'reviewer@fixture.invalid','revoke')).not.toThrow();
    expect(()=>assertCompanyPayrollAccessSaved(after,after,'reviewer@fixture.invalid','revoke')).toThrow();
  });
  it('rejects duplicate users, unknown capabilities and a missing/replaced founder',()=>{
    const duplicated=access();duplicated.members.push({...duplicated.members[0]});
    expect(()=>parseCompanyPayrollAccess(duplicated)).toThrow();
    expect(()=>parseCompanyPayrollAccess({canManage:true,members:[]})).toThrow();
    const malformed=access();malformed.members[0].capabilities.push('server.root');
    expect(()=>parseCompanyPayrollAccess(malformed)).toThrow();
  });
});

describe('real employee setup component with isolated API transport',()=>{
  it('saves only after confirming facts and receiving an exact new-version response',async()=>{
    const h=harness();await h.flush();h.type('Tax code','BR');confirmFacts(h);
    h.handle(async request=>json({setup:confirmed(request.body)}));
    h.press('Save confirmed tax setup');await h.flush();
    expect(h.saved()).toBe(1);expect(h.text()).toContain('Tax setup saved');
    expect(h.requests.filter(request=>request.method==='PATCH')).toHaveLength(1);
  });
  it.each(['old','wrong-code','html'])('does not announce a fake %s PATCH success',async kind=>{
    const h=harness();await h.flush();h.type('Tax code','BR');confirmFacts(h);
    h.handle(async request=>kind==='html'?new Response('<html>Login</html>',{headers:{'Content-Type':'text/html'}})
      :json({setup:kind==='old'?setup():{...confirmed(request.body),taxCode:'S1257L'}}));
    h.press('Save confirmed tax setup');await h.flush();
    expect(h.saved()).toBe(0);expect(h.text()).not.toContain('Tax setup saved');expect(h.text()).toContain('Reload');
  });
  it('prevents repeated PATCH requests before React rerenders',async()=>{
    const h=harness();await h.flush();confirmFacts(h);const waiting=deferred<Response>();h.handle(async()=>waiting.promise);
    const press=h.button('Save confirmed tax setup').onPress;press();press();await h.flush();
    expect(h.requests.filter(request=>request.method==='PATCH')).toHaveLength(1);
    const body=h.requests.find(request=>request.method==='PATCH')!.body;waiting.resolve(json({setup:confirmed(body)}));await h.flush();expect(h.saved()).toBe(1);
  });
  it.each(['project','logout','unmount'])('suppresses an old tax setup completion after %s',async change=>{
    const h=harness();await h.flush();confirmFacts(h);const waiting=deferred<Response>();
    h.handle(async request=>request.method==='PATCH'?waiting.promise:json({setup:setup()}));h.press('Save confirmed tax setup');await settle();
    if(change==='unmount')h.unmount();else if(change==='logout')h.changeScope({token:null});else h.changeScope({baseUrl:OTHER_BASE});
    waiting.resolve(json({setup:confirmed(setup())}));await h.flush();expect(h.saved()).toBe(0);expect(h.text()).not.toContain('Tax setup saved');
  });
  it('requires explicit full-tax-year director confirmation before sending any annual NI setup',async()=>{
    const h=harness('employee',{...setup(),isDirector:true,niMethod:'director_annual'});await h.flush();confirmFacts(h);
    h.press('Save confirmed tax setup');await h.flush();expect(h.requests.filter(request=>request.method==='PATCH')).toHaveLength(0);
    expect(h.text()).toContain('full tax year');
    h.press('I confirm this employee was a director');
    h.handle(async request=>json({setup:{...confirmed(request.body),isDirector:true}}));h.press('Save confirmed tax setup');await h.flush();
    expect((h.requests.find(request=>request.method==='PATCH')!.body as any).directorFullTaxYearConfirmed).toBe(true);expect(h.saved()).toBe(1);
  });
});

describe('real payroll access component with canonical permission feeds',()=>{
  it('does not accept an unchanged valid feed as proof of a new grant',async()=>{
    const h=harness('access');await h.flush();h.type('Existing administrator email','reviewer@fixture.invalid');h.handle(async()=>json(access()));
    h.press('Grant payroll access');h.confirm();await h.flush();
    expect(h.text()).not.toContain('Payroll access was granted');expect(h.text()).toContain('did not confirm');
  });
  it('confirms a verified grant after refreshing the canonical founder/member feed',async()=>{
    const h=harness('access');await h.flush();h.type('Existing administrator email','reviewer@fixture.invalid');
    h.handle(async request=>json(request.method==='PATCH'?access(true):access()));h.press('Grant payroll access');h.confirm();await h.flush();
    expect(h.requests.map(request=>request.method)).toEqual(['GET','GET','PATCH']);expect(h.text()).toContain('Payroll access was granted');expect(h.text()).toContain('Reviewer');
  });
  it('refuses a permission change when founder access was lost while the confirmation was open',async()=>{
    const h=harness('access');await h.flush();h.type('Existing administrator email','reviewer@fixture.invalid');h.press('Grant payroll access');
    h.handle(async()=>json({canManage:false,members:[]}));h.confirm();await h.flush();expect(h.requests.filter(request=>request.method==='PATCH')).toHaveLength(0);
  });
  it('requires a removal feed to actually omit the selected member',async()=>{
    const h=harness('access');h.handle(async()=>json(access(true)));await h.flush();h.press('Refresh access');await h.flush();
    h.press('Remove this company access');h.confirm();await h.flush();expect(h.text()).not.toContain('company access was removed');expect(h.text()).toContain('did not confirm');
  });
  it('does not modify permissions after an account/backend switch while a confirmation is open',async()=>{
    const h=harness('access');await h.flush();h.type('Existing administrator email','reviewer@fixture.invalid');h.press('Grant payroll access');
    h.changeScope({baseUrl:OTHER_BASE});h.confirm();await h.flush();expect(h.requests.filter(request=>request.method==='PATCH')).toHaveLength(0);
  });
});

