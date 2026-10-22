import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, getAdminToken, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from './useAdminSession';

export interface DriverListItem {
  id: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
  status: string | null;
  currentLat: string | null;
  currentLng: string | null;
  locationAt: string | null;
  activeJobId?: string | null;
  activeJobRef?: string | null;
  latestJobId?: string | null;
  latestJobRef?: string | null;
}

export function useDriverList(enabled = true) {
  const token = getAdminToken();
  const revision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  const scope = useMemo(() => ({ token, revision, sessionRevision }), [token, revision, sessionRevision]);
  const active = useRef({ enabled, scope }); active.current = { enabled, scope };
  const sequence = useRef(0);
  const [state, setState] = useState<{ scope: typeof scope; drivers: DriverListItem[]; loading: boolean; error: string | null }>({
    scope, drivers: [], loading: false, error: null,
  });

  const load = useCallback(async () => {
    if (!enabled || !scope.token) return;
    const request = ++sequence.current;
    const current = () => active.current.enabled && active.current.scope === scope && sequence.current === request
      && getAdminToken() === scope.token && getApiContextRevision() === scope.revision
      && getAdminSessionRevision() === scope.sessionRevision;
    setState((previous) => ({ scope, drivers: previous.scope === scope ? previous.drivers : [], loading: true, error: null }));
    try {
      const data = await api.get<DriverListItem[]>('/api/admin/drivers');
      if (current()) setState({ scope, drivers: data, loading: false, error: null });
    } catch (err) {
      if (current()) setState((previous) => ({ ...previous, loading: false, error: err instanceof ApiError ? err.message : 'Failed to load drivers' }));
    }
  }, [enabled, scope]);

  useEffect(() => {
    void load();
    return () => { sequence.current += 1; };
  }, [load]);

  return {
    drivers: enabled && state.scope === scope ? state.drivers : [],
    loading: enabled && state.scope === scope ? state.loading : false,
    error: enabled && state.scope === scope ? state.error : null,
    reload: load,
  };
}
