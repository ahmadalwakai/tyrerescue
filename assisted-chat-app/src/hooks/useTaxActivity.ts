import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { TaxAuditEventDto, TaxAuditPageDto } from '../types/tax-payroll';

interface State {
  events: TaxAuditEventDto[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

export function useTaxActivity(companyId: string) {
  const [state, setState] = useState<State>({
    events: [],
    nextCursor: null,
    loading: false,
    loadingMore: false,
    error: null,
  });

  const load = useCallback(async () => {
    setState({ events: [], nextCursor: null, loading: true, loadingMore: false, error: null });
    try {
      const page = await api.get<TaxAuditPageDto>(
        `/api/admin/tax/companies/${companyId}/audit`,
      );
      setState({
        events: page.events,
        nextCursor: page.nextCursor,
        loading: false,
        loadingMore: false,
        error: null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load activity';
      setState({ events: [], nextCursor: null, loading: false, loadingMore: false, error: msg });
    }
  }, [companyId]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const page = await api.get<TaxAuditPageDto>(
        `/api/admin/tax/companies/${companyId}/audit?cursor=${encodeURIComponent(state.nextCursor!)}`,
      );
      setState((prev) => ({
        ...prev,
        events: [...prev.events, ...page.events],
        nextCursor: page.nextCursor,
        loadingMore: false,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load more';
      setState((prev) => ({ ...prev, loadingMore: false, error: msg }));
    }
  }, [companyId, state.nextCursor, state.loadingMore]);

  return {
    events: state.events,
    hasMore: state.nextCursor !== null,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    load,
    loadMore,
  };
}
