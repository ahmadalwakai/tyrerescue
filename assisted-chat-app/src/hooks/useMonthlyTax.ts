import { useCallback, useEffect, useRef, useState } from 'react';
import { parseMonthlyTaxSummary } from '@/lib/monthly-tax-response';
import { newTaxRequestKey, taxRequestMessage, taxRecord, TAX_UUID } from '@/lib/tax-input';
import type { MonthlyTaxSummary } from '@/types/monthly-tax';
import { useTaxApiScope } from './useTaxApiScope';

export function useMonthlyTax(companyId: string, date: string) {
  const { scope, call, isCurrent } = useTaxApiScope(`monthly:${companyId}:${date}`);
  const [state, setState] = useState<{ scope: object; data: MonthlyTaxSummary | null; loading: boolean; error: string | null }>({ scope, data: null, loading: true, error: null });
  const [write, setWrite] = useState<{ scope: object; busy: boolean; error: string | null; notice: string | null }>({ scope, busy: false, error: null, notice: null });
  const activeWrite = useRef<object | null>(null); const reads = useRef(0);
  // Declared before the callbacks that reset it (record, voidRecord).
  const key = useRef<{ body: string; value: string } | null>(null);
  useEffect(() => { activeWrite.current = null; reads.current += 1; }, [scope]);
  const load = useCallback(async () => {
    const request = ++reads.current;
    if (!isCurrent() || !TAX_UUID.test(companyId)) return;
    setState({ scope, data: null, loading: true, error: null });
    try {
      const data = await call('GET', `/api/admin/tax/companies/${companyId}/payroll/monthly-liability?date=${encodeURIComponent(date)}`, undefined, (value) => parseMonthlyTaxSummary(value, companyId, date));
      if (isCurrent() && request === reads.current) setState({ scope, data, loading: false, error: null });
    } catch (error) { if (isCurrent() && request === reads.current) setState({ scope, data: null, loading: false, error: taxRequestMessage(error) }); }
  }, [scope, call, isCurrent, companyId, date]);
  const record = useCallback(async (kind: 'payments' | 'adjustments', input: Record<string, unknown>) => {
    if (!isCurrent() || activeWrite.current || state.scope !== scope || !state.data) return false;
    if (kind === 'payments' ? !state.data.canRecordPayments : !state.data.canRecordAdjustments) return false;
    const operation = {}; activeWrite.current = operation;
    setWrite({ scope, busy: true, error: null, notice: null });
    try {
      await call('POST', `/api/admin/tax/companies/${companyId}/payroll/monthly-liability/${kind}`, input, (value) => {
        const row = taxRecord(value);
        if (!row || typeof row.id !== 'string' || !TAX_UUID.test(row.id) || row.amountPence !== input.amountPence
          || typeof row.recordedAt !== 'string' || !Number.isFinite(Date.parse(row.recordedAt))
          || (kind === 'payments' ? row.paidOn !== input.paidOn || row.reference !== input.reference : row.reason !== input.reason)) {
          throw new Error('The server did not confirm this record. Refresh the history before retrying.');
        }
        return row;
      });
      if (!isCurrent() || activeWrite.current !== operation) return false;
      key.current = null;
      setWrite({ scope, busy: true, error: null, notice: 'Record saved. This records a payment or adjustment; it does not send money to HMRC.' });
      await load();
      return isCurrent();
    } catch (error) {
      if (isCurrent() && activeWrite.current === operation) setWrite({ scope, busy: true, error: taxRequestMessage(error), notice: null });
      return false;
    } finally { if (activeWrite.current === operation) { activeWrite.current = null; if (isCurrent()) setWrite((previous) => ({ ...previous, busy: false })); } }
  }, [scope, isCurrent, call, companyId, state, load]);
  // A callback (not a plain function) so the compiler knows the ref is only
  // written from event handlers, never during render.
  const requestKey = useCallback((body: Record<string, unknown>) => {
    const encoded = JSON.stringify({ companyId, backend: scope.baseUrl, revision: scope.revision, ...body });
    if (key.current?.body !== encoded) key.current = { body: encoded, value: newTaxRequestKey() };
    return key.current!.value;
  }, [companyId, scope.baseUrl, scope.revision]);
  const voidRecord = useCallback(async (kind: 'payments' | 'adjustments', id: string, reason: string, idempotencyKey: string) => {
    if (!isCurrent() || activeWrite.current || !TAX_UUID.test(id) || reason.trim().length < 5 || state.scope !== scope || !state.data) return false;
    if (kind === 'payments' ? !state.data.canRecordPayments : !state.data.canRecordAdjustments) return false;
    const original = state.data[kind].find((record) => record.id === id && record.voidedAt === null);
    if (!original) return false;
    const operation = {}; activeWrite.current = operation;
    setWrite({ scope, busy: true, error: null, notice: null });
    try {
      await call('POST', `/api/admin/tax/companies/${companyId}/payroll/monthly-liability/${kind}/${id}/void`, { reason: reason.trim(), idempotencyKey }, (value) => {
        const row = taxRecord(value);
        if (!row || row.id !== id || row.amountPence !== original.amountPence || row.recordedAt !== original.recordedAt
          || typeof row.voidedAt !== 'string' || !Number.isFinite(Date.parse(row.voidedAt)) || row.voidReason !== reason.trim()
          || ('reference' in original ? row.reference !== original.reference || row.paidOn !== original.paidOn : row.reason !== original.reason)) throw new Error('The correction was not confirmed. Refresh the record before retrying.');
        return true;
      });
      if (!isCurrent() || activeWrite.current !== operation) return false;
      key.current = null;
      setWrite({ scope, busy: true, error: null, notice: 'Record voided. Its original details remain in the audit history; no bank transaction was changed.' });
      await load(); return isCurrent();
    } catch (error) { if (isCurrent() && activeWrite.current === operation) setWrite({ scope, busy: true, error: taxRequestMessage(error), notice: null }); return false; }
    finally { if (activeWrite.current === operation) { activeWrite.current = null; if (isCurrent()) setWrite((previous) => ({ ...previous, busy: false })); } }
  }, [scope, isCurrent, call, companyId, load, state]);
  return { data: state.scope === scope ? state.data : null, loading: state.scope === scope ? state.loading : true,
    error: state.scope === scope ? state.error : null, busy: write.scope === scope && write.busy,
    writeError: write.scope === scope ? write.error : null, notice: write.scope === scope ? write.notice : null,
    load, record, voidRecord, requestKey, formScope: scope };
}
