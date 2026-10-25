import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { api, getAdminToken, getApiBaseUrl } from '../lib/api';
import { getAdminSessionRevision } from './useAdminSession';
import {
  matchesTaxCompanyInput, normaliseTaxCompanyInput, parseTaxCompanyList, parseTaxCompanyProfile,
  taxCompanyRequestError, TaxCompanyResponseError,
} from '../lib/tax-company-response';
import type { CompanyListDto, CompanyProfileDto, CreateCompanyRequest, TaxApiError } from '../types/tax-payroll';

interface Scope { token: string | null; baseUrl: string; revision: number }
interface State {
  scope: Scope;
  data: CompanyListDto | null;
  loading: boolean;
  error: string | null;
  creating: boolean;
  createError: TaxApiError | null;
}

export function useTaxCompanies() {
  const token = getAdminToken();
  const baseUrl = getApiBaseUrl();
  const revision = getAdminSessionRevision();
  const scope = useMemo(() => ({ token, baseUrl, revision }), [token, baseUrl, revision]);
  const activeScope = useLatestRef(scope);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const createInFlight = useRef<object | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const verifiedList = useRef<{ scope: Scope; data: CompanyListDto } | null>(null);
  const [state, setState] = useState<State>({ scope, data: null, loading: true, error: null, creating: false, createError: null });
  const isCurrent = useCallback(() => mounted.current && activeScope.current === scope && Boolean(scope.token)
    && getAdminToken() === scope.token && getApiBaseUrl() === scope.baseUrl && getAdminSessionRevision() === scope.revision, [scope]);

  useEffect(() => {
    mounted.current = true; verifiedList.current = null; createInFlight.current = null;
    setState({ scope, data: null, loading: true, error: null, creating: false, createError: null });
    const activeControllers = controllers.current;
    return () => {
      mounted.current = false; sequence.current += 1;
      activeControllers.forEach((controller) => controller.abort()); activeControllers.clear();
    };
  }, [scope]);

  const load = useCallback(async () => {
    if (!isCurrent() || createInFlight.current) return;
    const request = ++sequence.current;
    const controller = new AbortController(); controllers.current.add(controller);
    setState((previous) => ({ ...previous, scope, loading: true, error: null }));
    try {
      const data = parseTaxCompanyList(await api.get<unknown>('/api/admin/tax/companies', { signal: controller.signal }));
      if (!isCurrent() || controller.signal.aborted || sequence.current !== request) return;
      verifiedList.current = { scope, data };
      setState({ scope, data, loading: false, error: null, creating: false, createError: null });
    } catch (error: unknown) {
      if (!isCurrent() || controller.signal.aborted || sequence.current !== request) return;
      verifiedList.current = null;
      setState({ scope, data: null, loading: false, error: taxCompanyRequestError(error).error, creating: false, createError: null });
    } finally { controllers.current.delete(controller); }
  }, [scope, isCurrent]);

  const createCompany = useCallback(async (input: CreateCompanyRequest): Promise<CompanyProfileDto | null> => {
    const initial = verifiedList.current;
    if (!isCurrent() || createInFlight.current || initial?.scope !== scope || !initial.data.canCreate) return null;
    const operation = {};
    createInFlight.current = operation; sequence.current += 1;
    const controller = new AbortController(); controllers.current.add(controller);
    setState((previous) => ({ ...previous, creating: true, createError: null }));
    const body = normaliseTaxCompanyInput(input);
    const currentOperation = () => isCurrent() && !controller.signal.aborted && createInFlight.current === operation;
    const accept = (company: CompanyProfileDto, list = initial.data) => {
      if (!matchesTaxCompanyInput(company, body)) throw new TaxCompanyResponseError('The returned company does not match the profile you submitted. Refresh before trying again.');
      const data = { ...list, companies: [company, ...list.companies.filter((entry) => entry.id !== company.id)] };
      verifiedList.current = { scope, data };
      setState({ scope, data, loading: false, error: null, creating: false, createError: null });
      return company;
    };
    try {
      const payload = await api.post<unknown>('/api/admin/tax/companies', body, { signal: controller.signal });
      if (!currentOperation()) return null;
      return accept(parseTaxCompanyProfile(payload));
    } catch (error: unknown) {
      if (!currentOperation()) return null;
      const failure = taxCompanyRequestError(error);
      // A lost response may follow a committed create. Reconcile only against
      // this account's protected list; never automatically repeat the POST.
      if (failure.code !== 'FEATURE_UNAVAILABLE' && failure.code !== 'VALIDATION_ERROR' && failure.code !== 'UNAUTHENTICATED') {
        try {
          const data = parseTaxCompanyList(await api.get<unknown>('/api/admin/tax/companies', { signal: controller.signal }));
          if (!currentOperation()) return null;
          const saved = data.companies.find((company) => matchesTaxCompanyInput(company, body));
          if (saved) return accept(saved, data);
        } catch { /* Keep the original failure and never invent a successful save. */ }
      }
      if (currentOperation()) setState((previous) => ({ ...previous, creating: false, createError: failure }));
      return null;
    } finally {
      controllers.current.delete(controller);
      if (createInFlight.current === operation) createInFlight.current = null;
    }
  }, [scope, isCurrent]);

  const visible = state.scope === scope ? state : null;
  return {
    companies: visible?.data?.companies ?? null,
    canCreate: visible?.data?.canCreate ?? false,
    loading: visible?.loading ?? true,
    error: visible?.error ?? null,
    creating: visible?.creating ?? false,
    createError: visible?.createError ?? null,
    load, createCompany,
  };
}
