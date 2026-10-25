import { useCallback, useEffect, useRef, useState } from 'react';
import { stockError } from '@/stock-domain';
import { ApiError } from '@/api/client';

export function useCityResource<T>(cityId: string | null, enabled: boolean, revision: number, fetcher: (cityId: string) => Promise<{ items: T[] }>) {
  const key = JSON.stringify([cityId, enabled, revision]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const sequence = useRef(0);
  const [state, setState] = useState<{ key: string; items: T[]; loading: boolean; error: string | null; status: number | null }>({ key: '', items: [], loading: false, error: null, status: null });
  const load = useCallback(async () => {
    if (!cityId || !enabled) return;
    const requestId = ++sequence.current;
    setState((old) => ({ key, items: old.key === key ? old.items : [], loading: true, error: null, status: null }));
    try {
      const result = await fetcher(cityId);
      if (sequence.current === requestId && currentKey.current === key) setState({ key, items: result.items, loading: false, error: null, status: null });
    } catch (error) {
      if (sequence.current === requestId && currentKey.current === key) setState((old) => ({ ...old, key, loading: false, error: stockError(error), status: error instanceof ApiError ? error.status : null }));
    }
  }, [cityId, enabled, fetcher, key]);
  useEffect(() => {
    const tracker = sequence;
    void load();
    return () => { tracker.current++; };
  }, [load]);
  const current = state.key === key;
  return { items: current ? state.items : [], loading: Boolean(cityId && enabled) && (!current || state.loading), error: current ? state.error : null, status: current ? state.status : null, reload: () => { void load(); } };
}
