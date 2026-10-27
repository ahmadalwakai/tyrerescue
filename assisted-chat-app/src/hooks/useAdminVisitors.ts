import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';

// ── Types ──────────────────────────────────────────────────────────────────

export interface VisitorStats {
  totalVisitors: number;
  liveCount: number;
  avgSessionDuration: number;
  trendPct: number;
  mobilePct: number;
  deviceBreakdown: Array<{ device: string | null; count: number }>;
  referrerBreakdown: Array<{ referrer: string | null; count: number }>;
  cityBreakdown: Array<{ city: string | null; count: number }>;
  ageBreakdown: Array<{ ageGroup: string | null; count: number }>;
  genderBreakdown: Array<{ gender: string | null; count: number }>;
  buttonBreakdown: Array<{ buttonText: string; count: number }>;
  topPages: Array<{ path: string; count: number }>;
  dailyTrend: Array<{ day: string; visitors: number }>;
  monthlyTrend: Array<{ month: string; visitors: number }>;
  browserBreakdown: Array<{ browser: string | null; count: number }>;
  engineBreakdown: Array<{ engine: string | null; count: number }>;
  topKeywords: Array<{ keyword: string | null; count: number }>;
  returningVisitors: number;
}

export interface VisitorItem {
  id: string;
  sourceApp: string | null;
  sourceLabel: string | null;
  city: string | null;
  country: string | null;
  ipHash: string | null;
  device: string | null;
  browser: string | null;
  referrer: string | null;
  searchEngine: string | null;
  searchKeyword: string | null;
  sessionDuration: number | null;
  consentGiven: boolean | null;
  ageGroup: string | null;
  gender: string | null;
  interests: unknown[] | null;
  isOnline: boolean | null;
  createdAt: string | null;
  exitedAt: string | null;
  visitCount: number | null;
  pagesVisited: Array<{ path: string; title: string | null; timestamp: string | null }>;
  buttonsClicked: Array<{ buttonText: string; path: string | null; timestamp: string | null }>;
}

export interface LiveVisitorItem {
  id: string;
  sourceApp: string | null;
  sourceLabel: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  referrer: string | null;
  searchKeyword: string | null;
  searchEngine: string | null;
  visitCount: number | null;
  createdAt: string | null;
}

export type VisitorPeriod = 'today' | 'week' | 'month';

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAdminVisitors(period: VisitorPeriod, enabled: boolean) {
  const [visitors, setVisitors] = useState<VisitorItem[]>([]);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newArrivals, setNewArrivals] = useState<LiveVisitorItem[]>([]);

  const sinceRef = useRef(new Date().toISOString());

  const fetchFull = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    try {
      setLoading(true);
      const data = await api.get<{
        visitors: VisitorItem[];
        stats: VisitorStats;
        page: number;
        totalCount: number;
      }>(`/api/mobile/admin/visitors?period=${period}&limit=50`, { signal });
      if (signal?.aborted) return;
      setVisitors(data.visitors);
      setStats(data.stats);
      setTotalCount(data.totalCount);
      setError(null);
    } catch {
      if (signal?.aborted) return;
      setError('Failed to load visitors');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled, period]);

  // Initial load + full refresh every 30s. Keyed by period so switching
  // period drops a late response for the previous one.
  const refreshFull = usePolling(fetchFull, { enabled, intervalMs: 30_000, key: period });

  const fetchLive = useCallback(async (signal: AbortSignal) => {
    try {
      const since = sinceRef.current;
      const data = await api.get<{ visitors: LiveVisitorItem[] }>(
        `/api/mobile/admin/visitors/live?since=${encodeURIComponent(since)}`,
        { signal },
      );
      if (signal.aborted) return;
      if (data.visitors.length > 0) {
        sinceRef.current = new Date().toISOString();
        setNewArrivals((prev) => [...data.visitors, ...prev].slice(0, 5));
        // Also refresh full stats
        void refreshFull();
      }
    } catch {
      // silent — live poll failures don't need UI error
    }
  }, [refreshFull]);

  useEffect(() => {
    if (enabled) sinceRef.current = new Date().toISOString();
  }, [enabled]);

  // Live polling every 5s
  usePolling(fetchLive, { enabled, intervalMs: 5_000 });

  const dismissArrival = useCallback((id: string) => {
    setNewArrivals((prev) => prev.filter((v) => v.id !== id));
  }, []);

  return {
    visitors,
    stats,
    totalCount,
    loading,
    error,
    newArrivals,
    dismissArrival,
    refresh: refreshFull,
  };
}
