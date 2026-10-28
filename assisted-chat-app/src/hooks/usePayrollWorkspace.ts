import { useCallback, useEffect, useRef, useState } from 'react';
import { parsePayrollCalculation, parsePayrollReview, parsePayrollRun } from '@/lib/payroll-workspace-response';
import { taxRecord, taxRequestMessage } from '@/lib/tax-input';
import type { PayrollRunDto, ReviewDto } from '@/types/tax-payroll';
import type { PayrollRunCalculation } from '@/types/payroll-calculation';
import { useTaxApiScope } from './useTaxApiScope';

function earningsSignature(value: unknown): string {
  const line = taxRecord(value);
  if (!line) throw new Error('The earnings lines could not be verified. Refresh before retrying.');
  const amount = (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || !/^\d+(?:\.\d{1,4})?$/.test(value.trim())) throw new Error('The earnings amount could not be verified.');
    const [whole, fraction = ''] = value.trim().split('.');
    return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(4, '0')}`;
  };
  return JSON.stringify({
    lineType: line.lineType, workedMinutes: line.workedMinutes ?? null,
    hourlyRateOverride: amount(line.hourlyRateOverride), fixedAmount: amount(line.fixedAmount),
    payTermsId: line.payTermsId ?? null, description: typeof line.description === 'string' ? line.description.trim() : null,
  });
}

export function usePayrollWorkspace(companyId: string, runId: string) {
  const { scope, isCurrent, call } = useTaxApiScope(`payroll:${companyId}:${runId}`);
  const [state, setState] = useState<{ scope: object; run: PayrollRunDto | null; calculation: PayrollRunCalculation | null; review: ReviewDto | null; loading: boolean; error: string | null }>({ scope, run: null, calculation: null, review: null, loading: true, error: null });
  const [write, setWrite] = useState<{ scope: object; busy: boolean; error: string | null; notice: string | null }>({ scope, busy: false, error: null, notice: null });
  const pending = useRef<object | null>(null); const reads = useRef(0);
  useEffect(() => { pending.current = null; reads.current += 1; }, [scope]);
  const path = `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}`;
  const load = useCallback(async () => {
    if (!isCurrent()) return;
    const request = ++reads.current;
    setState({ scope, run: null, calculation: null, review: null, loading: true, error: null });
    try {
      const run = await call('GET', path, undefined, (value) => parsePayrollRun(value, companyId, runId));
      if (!isCurrent() || request !== reads.current) return;
      setState({ scope, run, calculation: null, review: null, loading: true, error: null });
      if (run.runStatus === 'cancelled') { setState({ scope, run, calculation: null, review: null, loading: false, error: null }); return; }
      const [calculation, review] = await Promise.all([
        call('GET', `${path}/calculation`, undefined, (value) => parsePayrollCalculation(value, companyId, runId)),
        call('GET', `${path}/review`, undefined, (value) => parsePayrollReview(value, runId)),
      ]);
      if (!isCurrent() || request !== reads.current) return;
      if (calculation.runVersion !== run.version) throw new Error('This payroll changed while loading. Refresh to review the latest figures.');
      if (calculation.paymentDate !== run.intendedPaymentDate
        || (calculation.status === 'finalised') !== (run.runStatus === 'finalised')) {
        throw new Error('This payroll calculation does not match the current pay run. Refresh before continuing.');
      }
      if (calculation.status !== 'blocked') {
        const employees = new Set(run.lines.map((line) => line.employeeId));
        if (calculation.employeeResults.length !== employees.size
          || calculation.employeeResults.some((employee) => !employees.has(employee.employeeId))) {
          throw new Error('The calculated employees do not match this pay run. Refresh before continuing.');
        }
      }
      setState({ scope, run, calculation, review, loading: false, error: null });
    } catch (error) { if (isCurrent() && request === reads.current) setState((previous) => ({ ...previous, scope, loading: false, error: taxRequestMessage(error) })); }
  }, [scope, isCurrent, call, path, companyId, runId]);
  const act = useCallback(async (action: 'lines' | 'submit' | 'approve' | 'reject' | 'finalise' | 'cancel', body: unknown) => {
    if (!isCurrent() || pending.current || state.scope !== scope || !state.run) return false;
    const operation = {}; pending.current = operation; reads.current += 1;
    setWrite({ scope, busy: true, error: null, notice: null });
    try {
      const suffix = action === 'lines' || action === 'cancel' ? '' : action === 'finalise' ? '/finalise' : '/review';
      await call(action === 'cancel' ? 'DELETE' : action === 'lines' || action === 'approve' || action === 'reject' ? 'PATCH' : 'POST', `${path}${suffix}`, body, (value) => {
        if (action === 'submit' || action === 'approve' || action === 'reject') {
          const review = parsePayrollReview(value, runId);
          if (!review || review.status !== (action === 'submit' ? 'pending' : action === 'approve' ? 'approved' : 'rejected')) throw new Error('Review was not confirmed by the server. Refresh before retrying.');
        } else if (action === 'finalise') {
          const row = taxRecord(value);
          if (!row || row.runId !== runId || row.companyId !== companyId || row.finalised !== true || !Array.isArray(row.employeeResults)
            || row.intendedPaymentDate !== state.run!.intendedPaymentDate || row.periodStart !== state.run!.periodStart || row.periodEnd !== state.run!.periodEnd) throw new Error('Finalisation was not confirmed. Refresh the pay run before retrying.');
          const confirmed = parsePayrollCalculation({ runId, companyId, status: 'finalised', runVersion: state.run!.version + 1,
            paymentDate: row.intendedPaymentDate, taxYear: state.calculation?.taxYear, rulesetVersion: row.rulesetVersion,
            calculatedAt: row.finalisedAt, employeeResults: row.employeeResults, issues: [], totals: {
              grossPayPounds: row.totalGrossPounds, taxPounds: row.totalTaxPounds, employeeNiPounds: row.totalEmployeeNiPounds,
              employerNiPounds: row.totalEmployerNiPounds, studentLoanPounds: row.totalStudentLoanPounds,
              netPayPounds: row.totalNetPayPounds, hmrcLiabilityPounds: row.totalHmrcLiabilityPounds,
            } }, companyId, runId);
          const expectedEmployees = new Set(state.run!.lines.map((line) => line.employeeId));
          if (confirmed.employeeResults.length !== expectedEmployees.size || confirmed.employeeResults.some((employee) => !expectedEmployees.has(employee.employeeId))) {
            throw new Error('Finalisation did not confirm every employee in this pay run. Refresh before retrying.');
          }
        } else if (action !== 'cancel') {
          const row = taxRecord(value);
          const submitted = taxRecord(body);
          if (!row || !submitted || !Array.isArray(row.lines) || !Array.isArray(submitted.lines)
            || row.lines.length !== submitted.lines.length || row.lines.some((raw) => {
              const line = taxRecord(raw);
              return !line || line.runId !== runId || line.employeeId !== submitted.employeeId;
            })) throw new Error('The server did not confirm the earnings lines. Refresh before retrying.');
          const combined = [...state.run!.lines.filter((line) => line.employeeId !== submitted.employeeId), ...row.lines];
          parsePayrollRun({ ...state.run, lines: combined,
            employeeCount: new Set(combined.map((line) => line.employeeId)).size }, companyId, runId);
          const expected = submitted.lines.map(earningsSignature).sort();
          const confirmed = row.lines.map(earningsSignature).sort();
          if (expected.some((line, index) => line !== confirmed[index])) {
            throw new Error('The saved earnings differ from the submitted hours, rate or amount. Refresh before retrying.');
          }
        }
        return true;
      });
      if (action === 'cancel') {
        const cancelled = await call('GET', path, undefined, (value) => parsePayrollRun(value, companyId, runId));
        if (cancelled.runStatus !== 'cancelled') throw new Error('Cancellation was not confirmed. Refresh the pay run.');
      }
      if (!isCurrent() || pending.current !== operation) return false;
      setWrite({ scope, busy: true, error: null, notice: action === 'finalise' ? 'Payroll finalised and recorded in the monthly tax summary. This does not pay wages or submit to HMRC.' : 'Changes saved. The latest calculation is being loaded.' });
      await load();
      return isCurrent();
    } catch (error) { if (isCurrent() && pending.current === operation) setWrite({ scope, busy: true, error: taxRequestMessage(error), notice: null }); return false; }
    finally { if (pending.current === operation) { pending.current = null; if (isCurrent()) setWrite((previous) => ({ ...previous, busy: false })); } }
  }, [scope, isCurrent, state, call, path, companyId, runId, load]);
  const visible = state.scope === scope ? state : null;
  return { run: visible?.run ?? null, calculation: visible?.calculation ?? null, review: visible?.review ?? null, loading: visible?.loading ?? true, error: visible?.error ?? null,
    busy: write.scope === scope && write.busy, writeError: write.scope === scope ? write.error : null, notice: write.scope === scope ? write.notice : null, load, act };
}
