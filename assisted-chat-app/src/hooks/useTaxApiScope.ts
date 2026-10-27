import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { api, getAdminToken, getApiBaseUrl } from '@/lib/api';
import { getAdminSessionRevision } from './useAdminSession';

export class TaxScopeChangedError extends Error {
  constructor() { super('The account, company or screen changed. Please reopen this screen.'); this.name = 'TaxScopeChangedError'; }
}

/** Every financial response belongs to one account, backend and screen. */
export function useTaxApiScope(identity: string) {
  const token = getAdminToken(); const baseUrl = getApiBaseUrl(); const revision = getAdminSessionRevision();
  const scope = useMemo(() => ({ identity, token, baseUrl, revision }), [identity, token, baseUrl, revision]);
  const active = useLatestRef(scope);
  const mounted = useRef(false); const requests = useRef(new Set<AbortController>());
  const isCurrent = useCallback(() => mounted.current && active.current === scope && Boolean(scope.token)
    && getAdminToken() === scope.token && getApiBaseUrl() === scope.baseUrl && getAdminSessionRevision() === scope.revision, [scope]);
  useEffect(() => {
    mounted.current = true;
    const pending = requests.current;
    return () => { mounted.current = false; pending.forEach((controller) => controller.abort()); pending.clear(); };
  }, [scope]);
  const call = useCallback(async <T,>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown, decode: (value: unknown) => T): Promise<T> => {
    if (!isCurrent()) throw new TaxScopeChangedError();
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const value = method === 'GET' ? await api.get<unknown>(path, { signal: controller.signal })
        : method === 'POST' ? await api.post<unknown>(path, body, { signal: controller.signal })
          : method === 'PATCH' ? await api.patch<unknown>(path, body, { signal: controller.signal }) : await api.del<unknown>(path, { signal: controller.signal });
      if (!isCurrent() || controller.signal.aborted) throw new TaxScopeChangedError();
      return decode(value);
    } catch (error) {
      if (!isCurrent() || controller.signal.aborted) throw new TaxScopeChangedError();
      throw error;
    } finally { requests.current.delete(controller); }
  }, [isCurrent]);
  return { scope, isCurrent, call };
}
