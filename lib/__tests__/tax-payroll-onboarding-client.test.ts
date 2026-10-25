/* eslint-disable @typescript-eslint/no-explicit-any -- real iOS screens execute in an isolated React/JSX fixture */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseMonthlyTaxSummary } from '../../assisted-chat-app/src/lib/monthly-tax-response';
import { parseTaxPayrollOverview } from '../../assisted-chat-app/src/lib/tax-payroll-overview-response';
const APP=path.resolve('assisted-chat-app/src'), BASE='https://onboarding-fixture.invalid';
const COMPANY='11111111-1111-4111-8111-111111111111', SETTINGS='22222222-2222-4222-8222-222222222222', ACTOR='33333333-3333-4333-8333-333333333333';
const WHEN='2026-10-21T12:00:00.000Z';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const company=()=>({id:COMPANY,companyNumber:'SC784534',legalName:'Synthetic Tyres Ltd',registeredAddressLine1:'1 Fixture Street',
  registeredAddressLine2:null,registeredCity:'Glasgow',registeredCountry:'Scotland',registeredPostcode:'G31 1PB',tradingName:null,tradingAddress:null,
  businessEmail:null,businessPhone:null,version:1,createdAt:WHEN,updatedAt:WHEN});
const readiness=(active=false,founder=true,writer=true)=>({state:active?'active':'not_activated',canActivate:!active&&founder,canRead:active,canEditSettings:active&&writer});
const settings=()=>({id:SETTINGS,companyId:COMPANY,scheduleLabel:'Monthly payroll',payFrequency:'monthly',scheduleAnchorDate:null,monthlyPayDay:-1,
  timezone:'Europe/London',version:1,activatedByUserId:ACTOR,createdAt:WHEN,updatedAt:WHEN});
function overview(active=false,founder=true,writer=true) { return {company:company(),setupComplete:true,registrationStatuses:['corporation_tax','vat','paye'].map(taxService=>({taxService,status:'unknown',declaredAt:null})),
  capabilities:['tax.read',...(founder?['tax.company.write']:[]),...(active?['payroll.read']:[]),...(active&&writer?['payroll.settings.write']:[])],
  payrollAvailable:active,payrollSummary:active?{isActivated:true,payFrequency:'monthly',scheduleLabel:'Monthly payroll',activeEmployeeCount:0,draftRunCount:0,settingsVersion:1}:null,
  vatAvailable:false,corporationTaxAvailable:false,documentsAvailable:false,submissionsAvailable:false,payrollSetup:readiness(active,founder,writer)}; }
function monthly(active=false,founder=true,writer=true) { return {companyId:COMPANY,currency:'GBP',source:'local_payroll_records',hmrcVerified:false,
  period:{start:'2026-10-06',end:'2026-11-05',taxYear:'2026-27',taxMonth:7,electronicDueDate:'2026-11-22',chequeDueDate:'2026-11-19',isOpen:true},
  status:'no_data',finalizedRunCount:0,pendingRunCount:0,paymentRecordCount:0,adjustmentRecordCount:0,canRecordPayments:active&&writer,canRecordAdjustments:active&&writer,
  totals:{payePence:null,employeeNiPence:null,employerNiPence:null,studentLoanPence:null,payrollLiabilityPence:null,adjustmentsPence:0,liabilityPence:null,paidPence:0,remainingPence:null,creditPence:null},
  issues:[],pendingRuns:[],payments:[],adjustments:[],payrollSetup:readiness(active,founder,writer)}; }
type RequestFixture={method:string;url:string;body:any;authorization:string|null;signal?:AbortSignal|null};
type Slot={value?:any;deps?:any[];cleanup?:(()=>void)|void};
type Page='companies'|'monthly'|'settings'|'employees';
function server(founder=true,writer=true) {
  let active=false;
  const requests:RequestFixture[]=[];
  return {requests,activate(){active=true;},async reply(request:RequestFixture) {
    requests.push(request);
    if(request.authorization!=='Bearer isolated-verified-admin')return json({error:'Unauthorized'},401);
    if(request.url.endsWith('/companies'))return json({companies:[company()],canCreate:founder});
    if(request.url.endsWith('/overview'))return json(overview(active,founder,writer));
    if(request.url.includes('/monthly-liability'))return json(monthly(active,founder,writer));
    if(request.url.endsWith('/settings')) {
      if(request.method==='GET')return active?json({...settings(),payrollSetup:readiness(true,founder,writer)})
        :json({error:'Payroll not activated',code:'NOT_FOUND',reason:'PAYROLL_NOT_ACTIVATED',payrollSetup:readiness(false,founder,writer)},404);
      if(request.method==='POST'&&founder){active=true;return json({...settings(),...request.body},201);}
      return json({error:'Only the company founder may activate payroll.',code:'FORBIDDEN'},403);
    }
    if(request.url.endsWith('/employees'))return json({employees:[]});
    if(request.url.endsWith('/runs'))return json({runs:[]});
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  }};
}
function harness(page:Page,reply:(request:RequestFixture)=>Promise<Response>) {
  let mounted=true,revision=1,focusRevision=0,cursor=0,dirty=false,effects:Array<()=>void>=[];
  const hooks:Slot[]=[],cache=new Map<string,{exports:any}>(),routes:any[]=[],requests:RequestFixture[]=[],alerts:any[]=[];
  let handler=reply;
  const changed=(a:any[]|undefined,b:any[]|undefined)=>!a||!b||a.length!==b.length||b.some((v,i)=>v!==a[i]);
  const memo=(fn:()=>any,deps?:any[])=>{const i=cursor++;if(!hooks[i]||changed(hooks[i].deps,deps))hooks[i]={value:fn(),deps};return hooks[i].value;};
  const react={useLayoutEffect(effect:()=>unknown){effect();},useState(initial:any){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};return[hooks[i].value,(next:any)=>{const value=typeof next==='function'?next(hooks[i].value):next;if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true;}}];},
    useRef(initial:any){const i=cursor++;if(!hooks[i])hooks[i]={value:{current:initial}};return hooks[i].value;},useMemo:memo,useCallback:(fn:any,deps?:any[])=>memo(()=>fn,deps),
    useEffect(fn:()=>void|(()=>void),deps?:any[]){const i=cursor++;if(!hooks[i]||changed(hooks[i].deps,deps))effects.push(()=>{hooks[i]?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}};
  const context=vm.createContext({Error,TypeError,RangeError,Promise,AbortController,URL,Response,Headers,__DEV__:false,process:{env:{NODE_ENV:'production'}},console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,setInterval,clearInterval,
    fetch:async(url:string,init:RequestInit={})=>{const request={url,method:init.method??'GET',body:init.body?JSON.parse(String(init.body)):undefined,authorization:new Headers(init.headers).get('authorization'),signal:init.signal};requests.push(request);return handler(request);}});
  function loadModule(filename:string):any {
    const absolute=path.resolve(filename),cached=cache.get(absolute);if(cached)return cached.exports;
    const sourceModule={exports:{}};cache.set(absolute,sourceModule);
    const code=ts.transpileModule(readFileSync(absolute,'utf8'),{fileName:absolute,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    function requireFixture(id:string):any {
      if(id==='react')return react;
      if(id==='react/jsx-runtime')return{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props}),Fragment:'Fragment'};
      if(id==='react-native')return{Platform:{OS:'ios'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},ActivityIndicator:'ActivityIndicator',Pressable:'Pressable',ScrollView:'ScrollView',FlatList:'FlatList',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:(x:any)=>x},Alert:{alert:(...x:any[])=>alerts.push(x)}};
      if(id==='expo-router')return{useLocalSearchParams:()=>({companyId:COMPANY,date:'2026-10-21'}),useRouter:()=>({push:(route:any)=>routes.push(route)}),useFocusEffect:(callback:()=>void)=>react.useEffect(callback,[callback,focusRevision])};
      if(id==='expo-constants')return{expoConfig:{version:'0.0.0'}};
      if(id.includes('startup-logging'))return{logStartupModuleStarted(){},logStartupModuleCompleted(){},logStartupModuleFailed(){}};
      if(id.endsWith('/useAdminSession')||id==='./useAdminSession')return{getAdminSessionRevision:()=>revision};
      const base=id.startsWith('@/')?path.join(APP,id.slice(2)):id.startsWith('.')?path.resolve(path.dirname(absolute),id):null;
      if(base)return loadModule(existsSync(`${base}.ts`)?`${base}.ts`:`${base}.tsx`);
      throw new Error(`Unexpected module: ${id}`);
    }
    vm.runInContext(`(function(require,module,exports){${code}\n})`,context,{filename:absolute})(requireFixture,sourceModule,sourceModule.exports);return sourceModule.exports;
  }
  const api=loadModule(path.join(APP,'lib/api.ts'));api.setApiBaseUrl(BASE);api.setAdminToken('isolated-verified-admin');
  const component=page==='companies'?loadModule(path.join(APP,'hooks/useTaxCompanies.ts')).useTaxCompanies
    :loadModule(path.resolve('assisted-chat-app/app/tax-payroll',page==='settings'?'payroll/settings.tsx':page==='monthly'?'monthly-tax.tsx':'employees-payroll.tsx')).default;
  let value:any;
  function render(){if(!mounted)return value;let count=0;do{dirty=false;cursor=0;effects=[];value=component();effects.forEach(fn=>fn());if(++count>20)throw new Error('Unsettled screen');}while(dirty);return value;}
  const plain=(v:any):string=>v==null||typeof v==='boolean'?'':typeof v==='string'||typeof v==='number'?String(v):Array.isArray(v)?v.map(plain).join(''):plain(v.props?.children);
  function nodes(){const output:any[]=[];function walk(v:any){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}if(typeof v.type==='function'){walk(v.type(v.props));return;}output.push(v);walk(v.props?.children);if(v.type==='FlatList')walk(v.props.ListHeaderComponent);}walk(value);return output;}
  render();
  return{requests,routes,render,async flush(){for(let i=0;i<5;i++){await tick();render();}return value;},text:()=>nodes().filter(n=>n.type==='Text').map(n=>plain(n.props.children)).join(' '),
    controls:()=>nodes().filter(n=>n.type==='Pressable').map(n=>plain(n.props.children)),
    press(label:string){const node=nodes().find(n=>n.type==='Pressable'&&plain(n.props.children).includes(label));if(!node||node.props.disabled)throw new Error(`Missing/disabled ${label}`);node.props.onPress();render();},
    type(label:string,text:string){const node=nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);if(!node||node.props.editable===false)throw new Error(`Missing/read-only ${label}`);node.props.onChangeText(text);render();},
    handle(next:typeof reply){handler=next;},focus(){focusRevision+=1;render();},logout(){api.setAdminToken(null);revision+=1;render();},unmount(){mounted=false;hooks.forEach(h=>h.cleanup?.());}};
}

describe('authenticated saved-company onboarding through real iOS screens and API transport',()=>{
  it('walks the founder from a saved profile through explicit schedule activation and back to an uncalculated monthly view',async()=>{
    const fixture=server();const companies=harness('companies',fixture.reply);await companies.render().load();expect(companies.render().companies[0]).toEqual(company());
    const month=harness('monthly',fixture.reply);await month.flush();expect(month.text()).toContain('Payroll setup required');expect(month.text()).not.toContain('Payments recorded');expect(month.text()).not.toContain('£0.00');
    month.press('Set up payroll schedule');expect(month.routes.at(-1)).toEqual({pathname:'/tax-payroll/payroll/settings',params:{companyId:COMPANY}});
    const schedule=harness('settings',fixture.reply);await schedule.flush();expect(schedule.text()).toContain('Only the company founder');expect(fixture.requests.filter(r=>r.method==='POST')).toHaveLength(0);
    schedule.type('Schedule label','Monthly payroll');schedule.press('Use last working day');schedule.press('Activate Payroll');await schedule.flush();
    expect(schedule.text()).toContain('Payroll activated. Next, add employees');schedule.press('Continue to employees');expect(schedule.routes.at(-1).pathname).toBe('/tax-payroll/employees-payroll');
    const employees=harness('employees',fixture.reply);await employees.flush();expect(employees.text()).toContain('Monthly payroll');expect(employees.text()).not.toContain('not yet activated');
    month.focus();await month.flush();expect(month.text()).not.toContain('Payroll setup required');expect(month.text()).toContain('Not calculated');
    const writes=fixture.requests.filter(r=>r.method==='POST');expect(writes).toHaveLength(1);expect(writes[0].body).toMatchObject({monthlyPayDay:-1,scheduleLabel:'Monthly payroll'});
    expect(fixture.requests.every(r=>r.authorization==='Bearer isolated-verified-admin')).toBe(true);
  });
  it('shows founder guidance without activation or zero-money rows for a nonfounder company reader',async()=>{
    const fixture=server(false);const month=harness('monthly',fixture.reply);await month.flush();expect(month.text()).toContain('Only the company founder');expect(month.controls()).not.toContain('Set up payroll schedule');expect(month.text()).not.toContain('£0.00');
    const schedule=harness('settings',fixture.reply);await schedule.flush();expect(schedule.text()).toContain('this account cannot activate payroll');expect(schedule.controls()).not.toContain('Activate Payroll');expect(fixture.requests.every(r=>r.method==='GET')).toBe(true);
  });
  it('renders a payroll reader schedule without editable fields or Save Changes',async()=>{
    const fixture=server(false,false);fixture.activate();const schedule=harness('settings',fixture.reply);await schedule.flush();expect(schedule.text()).toContain('You can view this payroll schedule');expect(schedule.controls()).not.toContain('Save Changes');expect(()=>schedule.type('Schedule label','Changed')).toThrow('read-only');
  });
  it('keeps a concealed other-company 404 as an access error, never an activation form',async()=>{
    const fixture=async()=>json({error:'Not found',code:'NOT_FOUND'},404);const schedule=harness('settings',fixture);await schedule.flush();expect(schedule.text()).toContain('check your company access');expect(schedule.controls()).not.toContain('Activate Payroll');expect(schedule.text()).not.toContain('server is updated');
    const month=harness('monthly',fixture);await month.flush();expect(month.text()).toContain('check your company access');expect(month.text()).not.toContain('Payroll setup required');
  });
  it('rejects HTML and forged setup permissions instead of rendering an activation action',async()=>{
    const html=harness('settings',async()=>new Response('<html>Deployment login</html>',{headers:{'Content-Type':'text/html'}}));await html.flush();expect(html.controls()).not.toContain('Activate Payroll');
    const malformed=harness('settings',async()=>json({error:'Payroll not activated',code:'NOT_FOUND',payrollSetup:{state:'restricted',canActivate:true,canRead:false,canEditSettings:false}},404));await malformed.flush();expect(malformed.text()).toContain('did not confirm payroll setup permissions');expect(malformed.controls()).not.toContain('Activate Payroll');
  });
  it('suppresses an old activation response after logout',async()=>{
    const fixture=server();const schedule=harness('settings',fixture.reply);await schedule.flush();schedule.type('Schedule label','Monthly payroll');schedule.press('Use last working day');
    let resolve!:(value:Response)=>void;const waiting=new Promise<Response>(yes=>{resolve=yes;});schedule.handle(async request=>request.method==='POST'?waiting:fixture.reply(request));schedule.press('Activate Payroll');schedule.logout();resolve(json(settings(),201));await schedule.flush();expect(schedule.text()).not.toContain('Payroll activated.');
  });
});

describe('additive setup permission contracts',()=>{
  it('accepts explicit founder/nonfounder setup while retaining null tax amounts',()=>{
    expect(parseTaxPayrollOverview(overview(),COMPANY).payrollSetup?.canActivate).toBe(true);
    expect(parseMonthlyTaxSummary(monthly(),COMPANY,'2026-10-21').totals.liabilityPence).toBeNull();
  });
  it.each([{canRecordPayments:true},{totals:{...monthly().totals,liabilityPence:0}},{paymentRecordCount:1},{payrollSetup:{state:'active',canActivate:true,canRead:true,canEditSettings:true}}])('rejects contradictory inactive financial/permission data %j',patch=>{
    expect(()=>parseMonthlyTaxSummary({...monthly(),...patch},COMPANY,'2026-10-21')).toThrow();
  });
  it('does not accept founder activation when overview omits the company write capability',()=>{
    expect(()=>parseTaxPayrollOverview({...overview(),capabilities:['tax.read']},COMPANY)).toThrow();
  });
  it('supports an inactive member with pregranted payroll capabilities without pretending payroll is active',()=>{
    const row=overview();row.capabilities.push('payroll.read','payroll.settings.write');
    expect(parseTaxPayrollOverview(row,COMPANY).payrollSetup?.state).toBe('not_activated');
  });
});
