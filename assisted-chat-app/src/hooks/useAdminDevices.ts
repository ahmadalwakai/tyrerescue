import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { AppState } from 'react-native';
import { api, getAdminToken, getApiBaseUrl } from '@/lib/api';
import { getAdminSessionRevision } from './useAdminSession';
import {
  fetchAdminDevices, removeAdminDeviceWithConfirmation,
  type AdminDeviceSession, type AdminDevicesFeed,
} from '@/types/admin-devices';

const EMPTY: AdminDevicesFeed = { currentSessionId: null, items: [] };

export function useAdminDevices(visible: boolean, onCurrentDeviceRemoved: () => Promise<void> | void) {
  const token = getAdminToken();
  const baseUrl = getApiBaseUrl();
  const sessionRevision = getAdminSessionRevision();
  const scope = useMemo(() => ({ token, baseUrl, sessionRevision }), [token, baseUrl, sessionRevision]);
  const activeScope = useLatestRef(scope);
  const mounted = useRef(false);
  const visibleRef = useLatestRef(visible);
  const busyRef = useRef(false);
  const loadingRef = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const sequence = useRef(0);
  const [state, setState] = useState({ scope, feed: EMPTY });
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const validScope = useCallback(() => mounted.current && visibleRef.current && activeScope.current === scope
    && Boolean(scope.token) && getAdminToken() === scope.token && getApiBaseUrl() === scope.baseUrl
    && getAdminSessionRevision() === scope.sessionRevision, [scope]);

  const refresh = useCallback(async () => {
    if (!validScope() || busyRef.current || loadingRef.current) return;
    const request = ++sequence.current;
    const controller = new AbortController(); controllers.current.add(controller);
    loadingRef.current = true; setLoading(true);
    try {
      const feed = await fetchAdminDevices(api, controller.signal);
      if (validScope() && !controller.signal.aborted && request === sequence.current) { setState({ scope, feed }); setError(null); }
    } catch (cause) {
      if (validScope() && !controller.signal.aborted && request === sequence.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load devices. Please retry.');
      }
    } finally {
      controllers.current.delete(controller);
      if (validScope() && request === sequence.current) { loadingRef.current = false; setLoading(false); }
    }
  }, [scope, validScope]);

  useEffect(() => {
    mounted.current = true; busyRef.current = false; loadingRef.current = false; setBusyId(null); setLoading(false); setError(null);
    setState({ scope, feed: EMPTY });
    const activeControllers = controllers.current;
    if (visible && scope.token) void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && visibleRef.current) void refresh();
    });
    const timer = visible ? setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30_000) : undefined;
    return () => {
      mounted.current = false; sequence.current += 1;
      if (timer) clearInterval(timer);
      subscription.remove();
      activeControllers.forEach((controller) => controller.abort()); activeControllers.clear();
    };
  }, [visible, scope, refresh]);

  const remove = useCallback(async (item: AdminDeviceSession, confirm: (target: AdminDeviceSession) => Promise<boolean>) => {
    if (!validScope() || busyRef.current || loadingRef.current || item.revokedAt) return;
    busyRef.current = true; setBusyId(item.id); setError(null); sequence.current += 1;
    const controller = new AbortController(); controllers.current.add(controller);
    let refreshAfter = false;
    try {
      const result = await removeAdminDeviceWithConfirmation(api, item.id, validScope, confirm, onCurrentDeviceRemoved, controller.signal);
      refreshAfter = result.removed && !result.removedCurrent;
    } catch (cause) {
      if (validScope() && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not remove this session. Please retry.');
    } finally {
      controllers.current.delete(controller);
      if (validScope()) { busyRef.current = false; setBusyId(null); }
    }
    if (refreshAfter && validScope()) await refresh();
  }, [onCurrentDeviceRemoved, refresh, validScope]);

  return { feed: state.scope === scope ? state.feed : EMPTY, loading, busyId, error, refresh, remove };
}
