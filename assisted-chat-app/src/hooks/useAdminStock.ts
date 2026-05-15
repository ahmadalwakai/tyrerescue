import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

export type StockSeason = 'allseason' | 'summer' | 'winter';

export interface StockItem {
  id: string;
  catalogueId: string | null;
  brand: string;
  pattern: string | null;
  width: number;
  aspect: number;
  rim: number;
  sizeDisplay: string;
  season: StockSeason;
  priceNew: number | null;
  stockNew: number;
  stockOrdered: number;
  isLocalStock: boolean;
  availableNew: boolean;
  featured: boolean;
  slug: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StockStats {
  total: number;
  active: number;
  inactive: number;
  totalStock: number;
}

export interface AddStockForm {
  sizeDisplay: string;
  brand: string;
  pattern: string;
  season: StockSeason;
  stockNew: string;
  priceNew: string;
}

export interface EditStockForm {
  brand: string;
  sizeDisplay: string;
  season: StockSeason;
  priceNew: string;
  stockNew: string;
  stockOrdered: string;
  availableNew: boolean;
  isLocalStock: boolean;
}

export type SortOption = 'size' | 'stock' | 'price' | 'type' | 'season_type';

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAdminStock(enabled: boolean) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [stats, setStats] = useState<StockStats>({ total: 0, active: 0, inactive: 0, totalStock: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterWidth, setFilterWidth] = useState('');
  const [filterRim, setFilterRim] = useState('');
  const [filterAvailable, setFilterAvailable] = useState(''); // '' | 'true' | 'false'
  const [sort, setSort] = useState<SortOption>('size');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const doFetch = useCallback(
    async (
      pg: number,
      q: string,
      w: string,
      r: string,
      avail: string,
      s: SortOption,
    ) => {
      if (!enabled) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(pg), sort: s });
        if (q) params.set('search', q);
        if (w) params.set('width', w);
        if (r) params.set('rim', r);
        if (avail) params.set('available', avail);
        const data = await api.get<{
          items: StockItem[];
          totalCount: number;
          totalPages: number;
          page: number;
          stats: StockStats;
        }>(`/api/mobile/admin/stock?${params}`);
        setItems(data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setPage(data.page ?? 1);
        setStats(data.stats ?? { total: 0, active: 0, inactive: 0, totalStock: 0 });
        setError(null);
      } catch {
        setError('Failed to load stock');
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (enabled) void doFetch(1, search, filterWidth, filterRim, filterAvailable, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function refresh() {
    void doFetch(page, search, filterWidth, filterRim, filterAvailable, sort);
  }

  function applySearch(q: string) {
    setSearch(q);
    setPage(1);
    void doFetch(1, q, filterWidth, filterRim, filterAvailable, sort);
  }

  function applyFilters(w: string, r: string, avail: string) {
    setFilterWidth(w);
    setFilterRim(r);
    setFilterAvailable(avail);
    setPage(1);
    void doFetch(1, search, w, r, avail, sort);
  }

  function applySort(s: SortOption) {
    setSort(s);
    setPage(1);
    void doFetch(1, search, filterWidth, filterRim, filterAvailable, s);
  }

  function goPage(p: number) {
    setPage(p);
    void doFetch(p, search, filterWidth, filterRim, filterAvailable, sort);
  }

  async function doAdd(form: AddStockForm): Promise<string | null> {
    // Parse size like "205/55/R16"
    const match = form.sizeDisplay.trim().match(/^(\d{3})\/(\d{2,3})\/[Rr](\d{2})$/);
    if (!match) return 'Invalid size format. Use e.g. 205/55/R16';
    const [, w, a, r] = match;
    setActionLoading('add');
    try {
      await api.post('/api/mobile/admin/stock', {
        sizeDisplay: form.sizeDisplay.trim().toUpperCase().replace(/r/i, 'R'),
        width: parseInt(w),
        aspect: parseInt(a),
        rim: parseInt(r),
        stockNew: parseInt(form.stockNew) || 0,
        priceNew: form.priceNew ? parseFloat(form.priceNew) : null,
        brand: form.brand || 'Budget',
        pattern: form.pattern || 'All-Season',
        season: form.season,
      });
      showToast(`${form.sizeDisplay} added to stock`, true);
      void doFetch(1, search, filterWidth, filterRim, filterAvailable, sort);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'Failed to add';
    } finally {
      setActionLoading(null);
    }
  }

  async function doUpdate(id: string, form: EditStockForm): Promise<string | null> {
    setActionLoading(id);
    try {
      await api.patch(`/api/mobile/admin/stock/${id}`, {
        brand: form.brand,
        sizeDisplay: form.sizeDisplay,
        season: form.season,
        priceNew: form.priceNew ? parseFloat(form.priceNew) : null,
        stockNew: parseInt(form.stockNew) || 0,
        stockOrdered: parseInt(form.stockOrdered) || 0,
        availableNew: form.availableNew,
        isLocalStock: form.isLocalStock,
      });
      showToast('Saved', true);
      void doFetch(page, search, filterWidth, filterRim, filterAvailable, sort);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'Failed to save';
    } finally {
      setActionLoading(null);
    }
  }

  async function doToggleAvailable(item: StockItem) {
    setActionLoading(item.id);
    try {
      await api.patch(`/api/mobile/admin/stock/${item.id}`, { availableNew: !item.availableNew });
      showToast(item.availableNew ? 'Deactivated' : 'Activated', true);
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, availableNew: !it.availableNew } : it)),
      );
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Action failed', false);
    } finally {
      setActionLoading(null);
    }
  }

  async function doDelete(id: string) {
    setActionLoading(id);
    try {
      await api.del(`/api/mobile/admin/stock/${id}`);
      showToast('Removed', true);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setStats((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to remove', false);
    } finally {
      setActionLoading(null);
    }
  }

  return {
    items, stats, totalCount, totalPages, page,
    search, filterWidth, filterRim, filterAvailable, sort,
    loading, error, actionLoading, toast,
    refresh, applySearch, applyFilters, applySort, goPage,
    doAdd, doUpdate, doToggleAvailable, doDelete,
  };
}
