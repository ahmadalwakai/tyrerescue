import { useState, useCallback, useEffect, useRef } from 'react';
import { useTaxApiScope } from './useTaxApiScope';
import { assertPayrollSavedFields, parsePayrollSettings, payrollSetupError } from '../lib/payroll-setup-response';
import { taxRecord, taxRequestMessage } from '../lib/tax-input';
import { inactivePayrollResponse, parsePayrollSetup } from '../lib/payroll-readiness-response';
import type { PayrollSettingsDto, PayrollSetupDto, ActivatePayrollRequest, UpdatePayrollSettingsRequest, TaxApiError } from '../types/tax-payroll';

export function usePayrollSettings(companyId: string) {
  const {scope,isCurrent,call}=useTaxApiScope(`payroll-settings:${companyId}`);
  const [state,setState]=useState<{scope:object;data:PayrollSettingsDto|null;setup:PayrollSetupDto|null;loading:boolean;error:string|null}>({scope,data:null,setup:null,loading:true,error:null});
  const [write,setWrite]=useState<{scope:object;saving:boolean;error:TaxApiError|null;notice:string|null}>({scope,saving:false,error:null,notice:null});
  const pending=useRef<object|null>(null); const reads=useRef(0);
  useEffect(()=>{pending.current=null;reads.current+=1;},[scope]);
  const path=`/api/admin/tax/companies/${companyId}/payroll/settings`;
  const load=useCallback(async()=>{
    if(!isCurrent()||pending.current)return;
    const sequence=++reads.current;setState({scope,data:null,setup:null,loading:true,error:null});
    try {const result=await call('GET',path,undefined,value=>{
      const data=parsePayrollSettings(value,companyId),raw=taxRecord(value);
      const setup=raw?.payrollSetup===undefined?null:parsePayrollSetup(raw.payrollSetup);
      if(setup&&setup.state!=='active')throw new Error('The payroll settings do not match their activation status. Refresh before continuing.');
      return {data,setup};
    });
      if(isCurrent()&&sequence===reads.current)setState({scope,...result,loading:false,error:null});
    }catch(error){if(isCurrent()&&sequence===reads.current){
      try {
        const setup=inactivePayrollResponse(error);
        setState({scope,data:null,setup,loading:false,error:setup?null:taxRequestMessage(error)});
      }catch(validationError){setState({scope,data:null,setup:null,loading:false,error:taxRequestMessage(validationError)});}
    }}
  },[scope,isCurrent,call,path,companyId]);
  const save=useCallback(async(method:'POST'|'PATCH',input:ActivatePayrollRequest|UpdatePayrollSettingsRequest)=>{
    if(!isCurrent()||pending.current)return null;
    const operation={};pending.current=operation;reads.current+=1;setWrite({scope,saving:true,error:null,notice:null});
    try {const data=await call(method,path,input,value=>{const result=parsePayrollSettings(value,companyId);assertPayrollSavedFields(result,input);return result;});
      if(!isCurrent()||pending.current!==operation)return null;
      setState(previous=>({scope,data,setup:method==='POST'&&previous.scope===scope&&previous.setup?.canActivate
        ?{state:'active',canActivate:false,canRead:true,canEditSettings:true}:previous.scope===scope?previous.setup:null,loading:false,error:null}));
      setWrite({scope,saving:true,error:null,notice:method==='POST'?'Payroll activated. Next, add employees and complete their tax setup before creating a pay run.':'Payroll schedule saved.'});return data;
    }catch(error){if(isCurrent()&&pending.current===operation)setWrite({scope,saving:true,error:payrollSetupError(error),notice:null});return null;}
    finally{if(pending.current===operation){pending.current=null;if(isCurrent())setWrite(previous=>({...previous,saving:false}));}}
  },[scope,isCurrent,call,path,companyId]);
  const activatePayroll=useCallback((input:ActivatePayrollRequest)=>save('POST',input),[save]);
  const updateSettings=useCallback((input:UpdatePayrollSettingsRequest)=>save('PATCH',input),[save]);
  const visible=state.scope===scope?state:null;
  return {settings:visible?.data??null,isActivated:visible?.data!=null,loading:visible?.loading??true,error:visible?.error??null,
    setup:visible?.setup??null,saving:write.scope===scope&&write.saving,saveError:write.scope===scope?write.error:null,
    saveNotice:write.scope===scope?write.notice:null,load,activatePayroll,updateSettings};
}
