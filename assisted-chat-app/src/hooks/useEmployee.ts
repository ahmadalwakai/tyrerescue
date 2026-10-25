import { useState, useCallback, useEffect, useRef } from 'react';
import { useTaxApiScope } from './useTaxApiScope';
import { assertPayrollSavedFields, parsePayrollEmployee, parsePayrollPayTerms, parsePayrollPayTermsList, payrollSetupError } from '../lib/payroll-setup-response';
import { londonTaxToday, taxRequestMessage } from '../lib/tax-input';
import type { EmployeeDetailDto, PayTermsDto, UpdateEmployeeRequest, CreatePayTermsRequest, TaxApiError } from '../types/tax-payroll';

export function useEmployee(companyId:string,employeeId:string){
  const {scope,isCurrent,call}=useTaxApiScope(`payroll-employee:${companyId}:${employeeId}`);
  const [state,setState]=useState<{scope:object;data:EmployeeDetailDto|null;loading:boolean;error:string|null}>({scope,data:null,loading:false,error:null});
  const [write,setWrite]=useState<{scope:object;saving:boolean;error:TaxApiError|null}>({scope,saving:false,error:null});
  const [terms,setTerms]=useState<{scope:object;items:PayTermsDto[]|null}>({scope,items:null});
  const pending=useRef<object|null>(null),reads=useRef(0),termsReads=useRef(0);
  useEffect(()=>{pending.current=null;reads.current+=1;termsReads.current+=1;},[scope]);
  const path=`/api/admin/tax/companies/${companyId}/employees/${employeeId}`;
  const load=useCallback(async()=>{
    if(!isCurrent()||pending.current)return;
    const sequence=++reads.current;setState({scope,data:null,loading:true,error:null});
    try{const data=await call('GET',path,undefined,value=>parsePayrollEmployee(value,companyId,employeeId));
      if(isCurrent()&&sequence===reads.current)setState({scope,data,loading:false,error:null});
    }catch(error){if(isCurrent()&&sequence===reads.current)setState({scope,data:null,loading:false,error:taxRequestMessage(error)});}
  },[scope,isCurrent,call,path,companyId,employeeId]);
  const loadPayTerms=useCallback(async()=>{
    if(!isCurrent()||pending.current)return;
    const sequence=++termsReads.current;
    try{const items=await call('GET',`${path}/pay-terms`,undefined,value=>parsePayrollPayTermsList(value,companyId,employeeId));
      if(isCurrent()&&sequence===termsReads.current)setTerms({scope,items});
    }catch(error){if(isCurrent()&&sequence===termsReads.current){setTerms({scope,items:null});setState(previous=>({...previous,scope,error:taxRequestMessage(error)}));}}
  },[scope,isCurrent,call,path,companyId,employeeId]);
  const updateEmployee=useCallback(async(patch:UpdateEmployeeRequest)=>{
    if(!isCurrent()||pending.current)return null;
    const operation={};pending.current=operation;reads.current+=1;termsReads.current+=1;setWrite({scope,saving:true,error:null});
    try{const result=await call('PATCH',path,patch,value=>{const employee=parsePayrollEmployee(value,companyId,employeeId);assertPayrollSavedFields(employee,patch);return employee;});
      if(!isCurrent()||pending.current!==operation)return null;setState({scope,data:result,loading:false,error:null});return result;
    }catch(error){if(isCurrent()&&pending.current===operation)setWrite({scope,saving:true,error:payrollSetupError(error)});return null;}
    finally{if(pending.current===operation){pending.current=null;if(isCurrent())setWrite(previous=>({...previous,saving:false}));}}
  },[scope,isCurrent,call,path,companyId,employeeId]);
  const addPayTerms=useCallback(async(input:CreatePayTermsRequest)=>{
    if(!isCurrent()||pending.current)return null;
    const operation={};pending.current=operation;reads.current+=1;termsReads.current+=1;setWrite({scope,saving:true,error:null});
    try{const result=await call('POST',`${path}/pay-terms`,input,value=>{const term=parsePayrollPayTerms(value,companyId,employeeId);assertPayrollSavedFields(term,input);return term;});
      if(!isCurrent()||pending.current!==operation)return null;
      setTerms(previous=>({scope,items:previous.scope===scope&&previous.items?[result,...previous.items.filter(term=>term.id!==result.id)]:null}));
      const today=londonTaxToday();
      setState(previous=>{
        if(previous.scope!==scope)return previous;
        const active=result.effectiveFrom<=today&&(!result.effectiveTo||result.effectiveTo>=today);
        const current=previous.data?.currentPayTerms;
        const data=previous.data&&active&&(!current||current.effectiveFrom<=result.effectiveFrom)
          ?{...previous.data,currentPayTerms:result}:previous.data;
        return {...previous,data,loading:false,error:null};
      });return result;
    }catch(error){if(isCurrent()&&pending.current===operation)setWrite({scope,saving:true,error:payrollSetupError(error)});return null;}
    finally{if(pending.current===operation){pending.current=null;if(isCurrent())setWrite(previous=>({...previous,saving:false}));}}
  },[scope,isCurrent,call,path,companyId,employeeId]);
  const visible=state.scope===scope?state:null;
  return {employee:visible?.data??null,loading:visible?.loading??false,error:visible?.error??null,
    saving:write.scope===scope&&write.saving,saveError:write.scope===scope?write.error:null,payTerms:terms.scope===scope?terms.items:null,
    load,loadPayTerms,updateEmployee,addPayTerms};
}
