import { useState, useCallback, useEffect, useRef } from 'react';
import { useTaxApiScope } from './useTaxApiScope';
import { assertPayrollSavedFields, parsePayrollRunList, parsePayrollRunSummary, payrollSetupError } from '../lib/payroll-setup-response';
import { newTaxRequestKey, taxRequestMessage } from '../lib/tax-input';
import type { PayrollRunSummaryDto, CreatePayrollRunRequest, TaxApiError } from '../types/tax-payroll';

export function usePayrollDrafts(companyId:string){
  const {scope,isCurrent,call}=useTaxApiScope(`payroll-drafts:${companyId}`);
  const [state,setState]=useState<{scope:object;runs:PayrollRunSummaryDto[]|null;loading:boolean;error:string|null}>({scope,runs:null,loading:false,error:null});
  const [write,setWrite]=useState<{scope:object;creating:boolean;error:TaxApiError|null}>({scope,creating:false,error:null});
  const pending=useRef<object|null>(null),reads=useRef(0),retry=useRef<{scope:object;payload:string;key:string}|null>(null);
  useEffect(()=>{pending.current=null;reads.current+=1;retry.current=null;},[scope]);
  const path=`/api/admin/tax/companies/${companyId}/payroll/runs`;
  const load=useCallback(async()=>{
    if(!isCurrent()||pending.current)return;
    const sequence=++reads.current;setState({scope,runs:null,loading:true,error:null});
    try{const runs=await call('GET',path,undefined,value=>parsePayrollRunList(value,companyId));
      if(isCurrent()&&sequence===reads.current)setState({scope,runs,loading:false,error:null});
    }catch(error){if(isCurrent()&&sequence===reads.current)setState({scope,runs:null,loading:false,error:taxRequestMessage(error)});}
  },[scope,isCurrent,call,path,companyId]);
  const createRun=useCallback(async(input:CreatePayrollRunRequest)=>{
    if(!isCurrent()||pending.current)return null;
    const operation={};pending.current=operation;reads.current+=1;setWrite({scope,creating:true,error:null});
    const payload=JSON.stringify(input);
    if(retry.current?.scope!==scope||retry.current.payload!==payload)retry.current={scope,payload,key:input.idempotencyKey??newTaxRequestKey()};
    const body={...input,idempotencyKey:retry.current.key};
    try{const result=await call('POST',path,body,value=>{const run=parsePayrollRunSummary(value,companyId);assertPayrollSavedFields(run,input);return run;});
      if(!isCurrent()||pending.current!==operation)return null;retry.current=null;
      setState(previous=>({scope,runs:previous.scope===scope&&previous.runs?[result,...previous.runs.filter(run=>run.id!==result.id)]:null,loading:false,error:null}));return result;
    }catch(error){if(isCurrent()&&pending.current===operation)setWrite({scope,creating:true,error:payrollSetupError(error)});return null;}
    finally{if(pending.current===operation){pending.current=null;if(isCurrent())setWrite(previous=>({...previous,creating:false}));}}
  },[scope,isCurrent,call,path,companyId]);
  const visible=state.scope===scope?state:null;
  return {runs:visible?.runs??null,loading:visible?.loading??false,error:visible?.error??null,
    creating:write.scope===scope&&write.creating,createError:write.scope===scope?write.error:null,load,createRun};
}
