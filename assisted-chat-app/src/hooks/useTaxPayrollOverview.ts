import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { api, getAdminToken, getApiBaseUrl } from '../lib/api';
import { getAdminSessionRevision } from './useAdminSession';
import { isTaxOverviewCompanyId, parseTaxPayrollOverview, taxPayrollOverviewRequestError } from '../lib/tax-payroll-overview-response';
import type { TaxPayrollOverviewDto } from '../types/tax-payroll';

interface State {
  scope: Scope;
  data: TaxPayrollOverviewDto | null;
  loading: boolean;
  error: string | null;
}

interface Scope { token: string | null; baseUrl: string; revision: number; companyId: string }

export function useTaxPayrollOverview(companyId: string) {
  const token = getAdminToken();
  const baseUrl = getApiBaseUrl();
  const revision = getAdminSessionRevision();
  const scope = useMemo(() => ({ token, baseUrl, revision, companyId }), [token, baseUrl, revision, companyId]);
  const activeScope = useLatestRef(scope);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const [state, setState] = useState<State>({ scope, data: null, loading: true, error: null });
  const isCurrent = useCallback(() => mounted.current && activeScope.current === scope && Boolean(scope.token)
    && getAdminToken() === scope.token && getApiBaseUrl() === scope.baseUrl
    && getAdminSessionRevision() === scope.revision, [scope]);

  useEffect(() => {
    mounted.current = true;
    setState({ scope, data: null, loading: true, error: null });
    const activeControllers = controllers.current;
    return () => {
      mounted.current = false; sequence.current += 1;
      activeControllers.forEach((controller) => controller.abort()); activeControllers.clear();
    };
  }, [scope]);

  const load = useCallback(async () => {
    if (!isCurrent()) return;
    if (!isTaxOverviewCompanyId(companyId)) {
      setState({ scope, data: null, loading: false, error: 'Could not verify the selected company. Return to Tax & Payroll and retry.' });
      return;
    }
    const request = ++sequence.current;
    const controller = new AbortController(); controllers.current.add(controller);
    setState({ scope, data: null, loading: true, error: null });
    try {
      const payload = await api.get<unknown>(
        `/api/admin/tax/companies/${companyId}/overview`,
        { signal: controller.signal },
      );
      if (!isCurrent() || controller.signal.aborted || sequence.current !== request) return;
      const data = parseTaxPayrollOverview(payload, companyId);
      setState({ scope, data, loading: false, error: null });
    } catch (err: unknown) {
      if (!isCurrent() || controller.signal.aborted || sequence.current !== request) return;
      setState({ scope, data: null, loading: false, error: taxPayrollOverviewRequestError(err) });
    } finally { controllers.current.delete(controller); }
  }, [companyId, scope, isCurrent]);

  const visible = state.scope === scope ? state : null;
  return {
    overview: visible?.data ?? null,
    loading: visible?.loading ?? true,
    error: visible?.error ?? null,
    load,
  };
}
