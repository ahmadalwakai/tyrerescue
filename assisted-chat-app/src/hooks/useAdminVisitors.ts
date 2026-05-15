import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

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
  const fullTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFull = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const data = await api.get<{
        visitors: VisitorItem[];
        stats: VisitorStats;
        page: number;
        totalCount: number;
      }>(`/api/mobile/admin/visitors?period=${period}&limit=50`);
      setVisitors(data.visitors);
      setStats(data.stats);
      setTotalCount(data.totalCount);
      setError(null);
    } catch {
      setError('Failed to load visitors');
    } finally {
      setLoading(false);
    }
  }, [enabled, period]);

  const fetchLive = useCallback(async () => {
    if (!enabled) return;
    try {
      const since = sinceRef.current;
      const data = await api.get<{ visitors: LiveVisitorItem[] }>(
        `/api/mobile/admin/visitors/live?since=${encodeURIComponent(since)}`
      );
      if (data.visitors.length > 0) {
        sinceRef.current = new Date().toISOString();
        setNewArrivals((prev) => [...data.visitors, ...prev].slice(0, 5));
        // Also refresh full stats
        void fetchFull();
      }
    } catch {
      // silent — live poll failures don't need UI error
    }
  }, [enabled, fetchFull]);

  // Initial load + full refresh every 30s
  useEffect(() => {
    if (!enabled) return;
    sinceRef.current = new Date().toISOString();
    void fetchFull();
    fullTimerRef.current = setInterval(fetchFull, 30_000);
    return () => {
      if (fullTimerRef.current) clearInterval(fullTimerRef.current);
    };
  }, [enabled, fetchFull]);

  // Live polling every 5s
  useEffect(() => {
    if (!enabled) return;
    liveTimerRef.current = setInterval(fetchLive, 5_000);
    return () => {
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, [enabled, fetchLive]);

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
    refresh: fetchFull,
  };
}
