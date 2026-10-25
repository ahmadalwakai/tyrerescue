/* eslint-disable @typescript-eslint/no-explicit-any -- isolated actual React Native screens and financial API transport */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parsePayrollReview } from '../../assisted-chat-app/src/lib/payroll-workspace-response';
const APP=path.resolve('assisted-chat-app/src'), BASE='https://self-review-fixture.invalid';
const COMPANY='11111111-1111-4111-8111-111111111111', RUN='22222222-2222-4222-8222-222222222222', EMPLOYEE='33333333-3333-4333-8333-333333333333',
  RECORD='44444444-4444-4444-8444-444444444444', ACTOR='55555555-5555-4555-8555-555555555555', OTHER='66666666-6666-4666-8666-666666666666';
const WHEN='2026-10-21T12:00:00.000Z';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
type RequestFixture={method:string;url:string;body:any;authorization:string|null;signal?:AbortSignal|null};
type Slot={value?:any;deps?:any[];cleanup?:(()=>void)|void};
function payRun(status='draft',version=2){return{id:RUN,companyId:COMPANY,settingsId:RECORD,periodStart:'2026-10-01',periodEnd:'2026-10-31',intendedPaymentDate:'2026-10-31',runStatus:status,employeeCount:1,latestPreview:null,version,createdAt:WHEN,
  lines:[{id:RECORD,runId:RUN,employeeId:EMPLOYEE,payTermsId:null,lineType:'fixed_period',workedMinutes:null,hourlyRateOverride:null,fixedAmount:'2500.0000',description:null,enteredByUserId:ACTOR,createdAt:WHEN}]};}
function calculation(status='ready',version=2){return{runId:RUN,companyId:COMPANY,status,runVersion:version,paymentDate:'2026-10-31',taxYear:'2026-27',rulesetVersion:'hmrc-2026-27-v1',calculatedAt:WHEN,issues:[],
  employeeResults:[{employeeId:EMPLOYEE,legalFirstName:'Synthetic',legalSurname:'Employee',taxCode:'S1257L',niCategory:'A',taxYear:'2026-27',periodNumber:7,calculationStatus:'calculated',warnings:[],grossPayPounds:'2500.00',taxForPeriodPounds:'200.00',employeeNiPounds:'100.00',employerNiPounds:'150.00',studentLoanPounds:'0.00',netPayPounds:'2200.00',totalDeductionsPounds:'300.00'}],
  totals:{grossPayPounds:'2500.00',taxPounds:'200.00',employeeNiPounds:'100.00',employerNiPounds:'150.00',studentLoanPounds:'0.00',netPayPounds:'2200.00',hmrcLiabilityPounds:'450.00'}};}
function review(status='pending',reviewedBy=ACTOR){return{id:RECORD,companyId:COMPANY,entityId:RUN,entityType:'payroll_run',submittedByUserId:ACTOR,reviewedByUserId:status==='pending'?null:reviewedBy,status,notes:null,submittedAt:WHEN,reviewedAt:status==='pending'?null:WHEN,version:status==='pending'?1:2};}
function fixture(initial='draft',actor=ACTOR,canApprove=true){
  let status=initial,version=2;const requests:RequestFixture[]=[];
  let failure: {status:number;body:unknown}|null=null;
  return{requests,failApproval(next:{status:number;body:unknown}){failure=next;},async reply(request:RequestFixture){
    requests.push(request);if(request.authorization!=='Bearer isolated-admin')return json({error:'Unauthorized'},401);
    if(request.url.endsWith('/settings'))return json({id:RECORD,companyId:COMPANY,scheduleLabel:'Synthetic monthly',payFrequency:'monthly',scheduleAnchorDate:null,monthlyPayDay:28,timezone:'Europe/London',version:1,activatedByUserId:ACTOR,createdAt:WHEN,updatedAt:WHEN,payrollSetup:{state:'active',canRead:true,canEditSettings:canApprove,canActivate:false}});
    if(request.method==='GET')return request.url.endsWith('/calculation')?json(calculation(status==='finalised'?'finalised':'ready',version))
      :request.url.endsWith('/review')?json({review:status==='draft'?null:review(status==='submitted_for_review'?'pending':status==='rejected'?'rejected':'approved',actor)}):json(payRun(status,version));
    if(request.method==='POST'&&request.url.endsWith('/review')){if(status!=='draft')throw new Error('Unexpected submit');status='submitted_for_review';version+=1;return json({review:review()},201);}
    if(request.method==='PATCH'&&request.url.endsWith('/review')){
      if(failure)return json(failure.body,failure.status);
      if(!canApprove)return json({error:'Payroll settings permission required',code:'FORBIDDEN'},403);
      if(status!=='submitted_for_review'||request.body.expectedVersion!==1)throw new Error('Unexpected approval version');
      status=request.body.action==='approve'?'approved':'rejected';version+=1;return json({review:review(status,actor)});
    }
    if(request.method==='POST'&&request.url.endsWith('/finalise')){
      if(status!=='approved'||request.body.expectedVersion!==version)throw new Error('Finalisation must follow confirmed approval');
      status='finalised';version+=1;const c=calculation('finalised',version),r=payRun(status,version);
      return json({runId:RUN,companyId:COMPANY,finalised:true,periodStart:r.periodStart,periodEnd:r.periodEnd,intendedPaymentDate:r.intendedPaymentDate,finalisedAt:WHEN,rulesetVersion:c.rulesetVersion,employeeResults:c.employeeResults,totalGrossPounds:c.totals.grossPayPounds,totalTaxPounds:c.totals.taxPounds,totalEmployeeNiPounds:c.totals.employeeNiPounds,totalEmployerNiPounds:c.totals.employerNiPounds,totalStudentLoanPounds:c.totals.studentLoanPounds,totalNetPayPounds:c.totals.netPayPounds,totalHmrcLiabilityPounds:c.totals.hmrcLiabilityPounds});
    }
    throw new Error(`Unexpected request ${request.method} ${request.url}`);
  }};
}
function harness(reply:(request:RequestFixture)=>Promise<Response>,actor=ACTOR,legacy=false){
  let cursor=0,dirty=false,revision=1,mounted=true,effects:Array<()=>void>=[],handler=reply;const hooks:Slot[]=[],cache=new Map<string,{exports:any}>(),alerts:Array<{title:string;message:string;buttons:any[]}>=[];
  const requests:RequestFixture[]=[];
  const changed=(a:any[]|undefined,b:any[]|undefined)=>!a||!b||a.length!==b.length||b.some((v,i)=>v!==a[i]);
  const memo=(fn:()=>any,deps?:any[])=>{const i=cursor++;if(!hooks[i]||changed(hooks[i].deps,deps))hooks[i]={value:fn(),deps};return hooks[i].value;};
  const react={useLayoutEffect(effect:()=>unknown){effect();},useState(initial:any){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};return[hooks[i].value,(next:any)=>{const value=typeof next==='function'?next(hooks[i].value):next;if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true;}}];},useRef(initial:any){const i=cursor++;if(!hooks[i])hooks[i]={value:{current:initial}};return hooks[i].value;},useMemo:memo,useCallback:(fn:any,deps?:any[])=>memo(()=>fn,deps),useEffect(fn:()=>void|(()=>void),deps?:any[]){const i=cursor++;if(!hooks[i]||changed(hooks[i].deps,deps))effects.push(()=>{hooks[i]?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}};
  const context=vm.createContext({Error,TypeError,RangeError,Promise,AbortController,URL,Response,Headers,__DEV__:false,process:{env:{NODE_ENV:'production'}},console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,setInterval,clearInterval,
    fetch:async(url:string,init:RequestInit={})=>{const request={url,method:init.method??'GET',body:init.body?JSON.parse(String(init.body)):undefined,authorization:new Headers(init.headers).get('authorization'),signal:init.signal};requests.push(request);return handler(request);}});
  function loadModule(filename:string):any{
    const absolute=path.resolve(filename),cached=cache.get(absolute);if(cached)return cached.exports;const sourceModule={exports:{}};cache.set(absolute,sourceModule);
    const code=ts.transpileModule(readFileSync(absolute,'utf8'),{fileName:absolute,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    function requireFixture(id:string):any{
      if(id==='react')return react;if(id==='react/jsx-runtime')return{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props}),Fragment:'Fragment'};
      if(id==='react-native')return{Platform:{OS:'ios'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},ActivityIndicator:'ActivityIndicator',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:(x:any)=>x},Alert:{alert:(title:string,message:string,buttons:any[])=>alerts.push({title,message,buttons})}};
      if(id==='expo-router')return{useLocalSearchParams:()=>({companyId:COMPANY,runId:RUN}),useRouter:()=>({push(){}}),useFocusEffect:(callback:()=>void)=>react.useEffect(callback,[callback])};
      if(id==='./PayrollEarningsEditor')return{PayrollEarningsEditor:()=>null};
      if(id==='expo-constants')return{expoConfig:{version:'0.0.0'}};
      if(id.includes('startup-logging'))return{logStartupModuleStarted(){},logStartupModuleCompleted(){},logStartupModuleFailed(){}};
      if(id.endsWith('/useAdminSession')||id==='./useAdminSession')return{getAdminSessionRevision:()=>revision,useAdminSession:()=>({user:{id:actor}})};
      const base=id.startsWith('@/')?path.join(APP,id.slice(2)):id.startsWith('.')?path.resolve(path.dirname(absolute),id):null;
      if(base)return loadModule(existsSync(`${base}.ts`)?`${base}.ts`:`${base}.tsx`);throw new Error(`Unexpected module ${id}`);
    }
    vm.runInContext(`(function(require,module,exports){${code}\n})`,context,{filename:absolute})(requireFixture,sourceModule,sourceModule.exports);return sourceModule.exports;
  }
  const api=loadModule(path.join(APP,'lib/api.ts'));api.setApiBaseUrl(BASE);api.setAdminToken('isolated-admin');
  const component=legacy?loadModule(path.resolve('assisted-chat-app/app/tax-payroll/payroll/runs/[runId]/review.tsx')).default:()=>loadModule(path.join(APP,'components/payroll/PayrollWorkspaceScreen.tsx')).PayrollWorkspaceScreen({companyId:COMPANY,runId:RUN});
  let value:any;function render(){if(!mounted)return value;let count=0;do{dirty=false;cursor=0;effects=[];value=component();while(typeof value?.type==='function')value=value.type(value.props);effects.forEach(fn=>fn());if(++count>20)throw new Error('Unsettled screen');}while(dirty);return value;}
  const plain=(v:any):string=>v==null||typeof v==='boolean'?'':typeof v==='string'||typeof v==='number'?String(v):Array.isArray(v)?v.map(plain).join(''):plain(v.props?.children);
  function nodes(){const output:any[]=[];function walk(v:any){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}if(typeof v.type==='function'){walk(v.type(v.props));return;}output.push(v);walk(v.props?.children);}walk(value);return output;}
  const button=(label:string)=>nodes().find(n=>n.type==='Pressable'&&plain(n.props.children)===label)?.props;
  render();return{requests,alerts,render,async flush(){for(let i=0;i<6;i++){await tick();render();}return value;},text:()=>nodes().filter(n=>n.type==='Text').map(n=>plain(n.props.children)).join(' '),button,
    press(label:string){const props=button(label);if(!props||props.disabled)throw new Error(`Missing/disabled ${label}`);props.onPress();render();},
    confirm(label:string){const alert=alerts.pop(),choice=alert?.buttons.find(b=>b.text===label);if(!choice?.onPress)throw new Error(`Missing confirmation ${label}`);choice.onPress();render();},
    cancel(){alerts.pop()?.buttons.find(b=>b.text==='Cancel')?.onPress?.();render();},handle(next:typeof reply){handler=next;},logout(){api.setAdminToken(null);revision+=1;render();},unmount(){mounted=false;hooks.forEach(h=>h.cleanup?.());}};
}

describe('actual payroll workspace self-review and approval confirmations',()=>{
  it.each([false,true])('keeps submit, explicit self-approval and finalisation separate (legacy review link=%s)',async legacy=>{
    const f=fixture();const h=harness(f.reply,ACTOR,legacy);await h.flush();expect(f.requests.every(r=>r.method==='GET')).toBe(true);
    h.press('Submit calculated payroll for review');await h.flush();expect(h.text()).toContain('Review your payroll');expect(h.button('Approve reviewed figures').disabled).toBe(false);expect(f.requests.filter(r=>r.method==='PATCH')).toHaveLength(0);
    h.press('Approve reviewed figures');expect(h.alerts.at(-1)?.message).toContain('You are approving the payroll you submitted');expect(f.requests.filter(r=>r.method==='PATCH')).toHaveLength(0);h.cancel();expect(f.requests.filter(r=>r.method==='PATCH')).toHaveLength(0);
    h.press('Approve reviewed figures');h.confirm('I reviewed these figures');await h.flush();expect(h.text()).toContain('approved');expect(f.requests.filter(r=>r.method==='PATCH')).toHaveLength(1);expect(f.requests.filter(r=>r.url.endsWith('/finalise'))).toHaveLength(0);
    h.press('Finalise approved payroll');expect(h.alerts.at(-1)?.title).toBe('Finalise reviewed payroll?');expect(f.requests.filter(r=>r.url.endsWith('/finalise'))).toHaveLength(0);h.confirm('Finalise payroll');await h.flush();expect(h.text()).toContain('Payroll finalised');expect(f.requests.filter(r=>r.url.endsWith('/finalise'))).toHaveLength(1);
  });
  it('keeps approval by a different authorised administrator with the same explicit confirmation',async()=>{
    const f=fixture('submitted_for_review',OTHER);const h=harness(f.reply,OTHER);await h.flush();expect(h.text()).toContain('Payroll review');expect(h.button('Approve reviewed figures').disabled).toBe(false);
    h.press('Approve reviewed figures');expect(h.alerts.at(-1)?.message).not.toContain('payroll you submitted');expect(f.requests.filter(r=>r.method==='PATCH')).toHaveLength(0);h.confirm('I reviewed these figures');await h.flush();expect(h.text()).toContain('approved');
  });
  it('requires protected server confirmation of payroll settings permission for self-approval',async()=>{
    const f=fixture('submitted_for_review',ACTOR,false);const h=harness(f.reply);await h.flush();expect(h.button('Approve reviewed figures').disabled).toBe(true);expect(h.button('Reject and return to draft').disabled).toBe(true);expect(h.text()).toContain('Payroll settings permission is required');expect(f.requests.every(r=>r.method==='GET')).toBe(true);
  });
  it.each([{status:403,body:{error:'Payroll permission was revoked.',code:'FORBIDDEN'}},{status:409,body:{error:'Payroll inputs changed after submission.',code:'CONFLICT_VERSION'}},{status:422,body:{error:'Resolve the payroll calculation issues before approval.',code:'VALIDATION_ERROR'}}])('never announces success after an approval permission/hash/stale error %j',async failure=>{
    const f=fixture('submitted_for_review');f.failApproval(failure);const h=harness(f.reply);await h.flush();h.press('Approve reviewed figures');h.confirm('I reviewed these figures');await h.flush();expect(h.text()).toContain(failure.body.error);expect(h.button('Finalise approved payroll')).toBeUndefined();expect(f.requests.filter(r=>r.url.endsWith('/finalise'))).toHaveLength(0);
  });
  it('does not send an approval from a confirmation left open across logout',async()=>{
    const f=fixture('submitted_for_review');const h=harness(f.reply);await h.flush();h.press('Approve reviewed figures');h.logout();h.confirm('I reviewed these figures');await h.flush();expect(f.requests.filter(r=>r.method==='PATCH')).toHaveLength(0);expect(h.text()).not.toContain('Payroll approved');
  });
  it('does not enable approval when settings permission comes from HTML instead of a verified DTO',async()=>{
    const f=fixture('submitted_for_review');const h=harness(async r=>r.url.endsWith('/settings')?new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}}):f.reply(r));await h.flush();expect(h.button('Approve reviewed figures').disabled).toBe(true);
  });
});

describe('review identity validation with user-authorised self-review',()=>{
  it.each(['approved','rejected'])('accepts same-actor %s while retaining UUID/status/version/timestamp validation',status=>{
    const row=review(status);expect(parsePayrollReview({review:row},RUN)?.reviewedByUserId).toBe(ACTOR);
    for(const patch of [{reviewedByUserId:null},{reviewedByUserId:'bad'},{version:0},{reviewedAt:null},{entityId:OTHER},{status:'made-up'}])expect(()=>parsePayrollReview({review:{...row,...patch}},RUN)).toThrow();
  });
});
