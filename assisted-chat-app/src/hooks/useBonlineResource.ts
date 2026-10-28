import { useCallback, useLayoutEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePolling } from './usePolling';
import { useBonlineRequestScope } from './useBonlineRequestScope';

/** Poll visible call data only; every result remains bound to its admin/workspace. */
export function useBonlineResource<T>(enabled: boolean, path: string) {
  const { scopeKey, captureScope, isCurrent } = useBonlineRequestScope(enabled, path);
  const [result, setResult] = useState<{ scopeKey: string; data: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Discard the previous admin/workspace response before painting a newly scoped view.
    setResult(null);
    setError(null);
    setRefreshing(false);
  }, [enabled, scopeKey]);

  const load = useCallback(async (signal: AbortSignal) => {
    const scope = captureScope();
    if (!isCurrent(scope) || signal.aborted) return;
    setRefreshing(true);
    try {
      const data = await api.get<T>(path, { signal });
      if (!signal.aborted && isCurrent(scope)) {
        setResult({ scopeKey, data });
        setError(null);
      }
    } catch (cause) {
      if (!signal.aborted && isCurrent(scope)) {
        setError(cause instanceof Error ? cause.message : 'Unable to load call information.');
      }
    } finally {
      if (!signal.aborted && isCurrent(scope)) setRefreshing(false);
    }
  }, [captureScope, isCurrent, path, scopeKey]);

  const refresh = usePolling(load, { enabled, key: scopeKey, intervalMs: 30_000 });
  const data = enabled && result?.scopeKey === scopeKey ? result.data : null;
  return { data, error, refreshing, loading: enabled && !data && !error, refresh };
}
