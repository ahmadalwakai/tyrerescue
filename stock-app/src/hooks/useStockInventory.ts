import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, stockApi } from '@/api/client';
import { stockError } from '@/stock-domain';
import type { InventoryPage, StockSeasonFilter, StockSortOption } from '@/types';

export function useStockInventory(cityId: string | null, search: string, season: StockSeasonFilter, sort: StockSortOption, revision: number, tyreProductId?: string) {
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const key = JSON.stringify([cityId, debouncedSearch, season, sort, revision, tyreProductId]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const requestNumber = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; data: InventoryPage | null; loading: boolean; loadingMore: boolean; error: string | null; status: number | null }>({ key: '', data: null, loading: false, loadingMore: false, error: null, status: null });
  const [citySummary, setCitySummary] = useState<{ cityId: string; summary: InventoryPage['summary'] } | null>(null);

  const load = useCallback(async (page = 1) => {
    if (!cityId) return;
    const requestId = ++requestNumber.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setState((old) => ({ key, data: old.key === key ? old.data : null, loading: page === 1, loadingMore: page > 1, error: null, status: null }));
    try {
      const response = await stockApi.inventory(cityId, tyreProductId ? '' : debouncedSearch, season, sort, { page, signal: nextController.signal, tyreProductId });
      if (nextController.signal.aborted || currentKey.current !== key || requestNumber.current !== requestId) return;
      if (response.summary) setCitySummary({ cityId, summary: response.summary });
      setState((old) => {
        const items = page > 1 && old.key === key
          ? Array.from(new Map([...(old.data?.items ?? []), ...response.items].map((item) => [item.balanceId, item])).values())
          : response.items;
        return { key, data: { ...response, items }, loading: false, loadingMore: false, error: null, status: null };
      });
    } catch (error) {
      if (nextController.signal.aborted || currentKey.current !== key || requestNumber.current !== requestId) return;
      setState((old) => ({ key, data: old.key === key ? old.data : null, loading: false, loadingMore: false, error: stockError(error), status: error instanceof ApiError ? error.status : null }));
    }
  }, [cityId, debouncedSearch, key, season, sort, tyreProductId]);

  useEffect(() => {
    void load();
    return () => { controller.current?.abort(); };
  }, [load]);
  const current = state.key === key;
  const data = current ? state.data : null;
  const loading = Boolean(cityId) && (!current || state.loading || search.trim() !== debouncedSearch);
  return {
    items: data?.items ?? [], summary: citySummary?.cityId === cityId ? citySummary.summary : null,
    totalCount: data?.totalCount ?? 0, hasLoaded: Boolean(data) && !loading,
    loading, loadingMore: current && state.loadingMore, error: current ? state.error : null,
    status: current ? state.status : null,
    hasMore: Boolean(data && data.page < data.totalPages),
    reload: () => { void load(); },
    loadMore: () => { if (data && data.page < data.totalPages && !loading && !state.loadingMore) void load(data.page + 1); },
  };
}
