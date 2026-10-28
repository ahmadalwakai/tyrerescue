import { useCallback, useState } from 'react';
import { api, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from './useAdminSession';
import { usePolling } from './usePolling';

export interface CustomerSummary {
  checkedAt: string;
  stats: {
    customers: number;
    verifiedCustomers: number;
    unverifiedCustomers: number;
    customersToday: number;
    customersLast7Days: number;
    customersLast30Days: number;
  };
}

export interface AppDownloadSummary {
  appId: '6782555222';
  metric: 'first_time_downloads';
  status: 'ready' | 'pending' | 'not_configured' | 'unavailable';
  firstTimeDownloads: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  checkedAt: string;
  lastReportDate: string | null;
  message: string;
  stale: boolean;
  coverage: 'available_period' | 'all_time';
}

interface Feed<T> {
  key: string;
  data: T | null;
  loading: boolean;
  error: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseCustomerSummary(value: unknown): CustomerSummary {
  const body = record(value);
  const stats = record(body?.stats);
  const keys = ['customers', 'verifiedCustomers', 'unverifiedCustomers', 'customersToday', 'customersLast7Days', 'customersLast30Days'] as const;
  if (!body || !stats || typeof body.checkedAt !== 'string' || !Number.isFinite(Date.parse(body.checkedAt))
    || keys.some((key) => !Number.isSafeInteger(stats[key]) || (stats[key] as number) < 0)) {
    throw new Error('The customer count could not be read. Please refresh.');
  }
  const result: CustomerSummary = {
    checkedAt: body.checkedAt,
    stats: Object.fromEntries(keys.map((key) => [key, stats[key]])) as CustomerSummary['stats'],
  };
  if (result.stats.verifiedCustomers + result.stats.unverifiedCustomers !== result.stats.customers
    || result.stats.customersToday > result.stats.customersLast7Days
    || result.stats.customersLast7Days > result.stats.customersLast30Days
    || result.stats.customersLast30Days > result.stats.customers) {
    throw new Error('The customer totals could not be verified. Please refresh.');
  }
  return result;
}

function calendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseAppDownloadSummary(value: unknown): AppDownloadSummary {
  const body = record(value);
  if (!body || body.appId !== '6782555222' || body.metric !== 'first_time_downloads'
    || !['ready', 'pending', 'not_configured', 'unavailable'].includes(body.status as string)
    || !['available_period', 'all_time'].includes(body.coverage as string)
    || typeof body.checkedAt !== 'string' || !Number.isFinite(Date.parse(body.checkedAt))
    || typeof body.message !== 'string' || body.message.length > 1000 || typeof body.stale !== 'boolean'
    || (body.lastReportDate !== null && !calendarDate(body.lastReportDate))
    || (body.periodStart !== null && !calendarDate(body.periodStart))
    || (body.periodEnd !== null && !calendarDate(body.periodEnd))) {
    throw new Error('The App Store download report could not be read. Please refresh.');
  }
  if (body.status === 'ready') {
    if (!Number.isSafeInteger(body.firstTimeDownloads) || (body.firstTimeDownloads as number) < 0
      || !body.periodEnd || (body.coverage !== 'all_time' && !body.periodStart)
      || (body.periodStart && body.periodStart > (body.periodEnd as string))) {
      throw new Error('The App Store reporting period could not be verified. Please refresh.');
    }
  } else if (body.firstTimeDownloads !== null) {
    throw new Error('An unavailable App Store report must not contain a download total.');
  }
  return body as unknown as AppDownloadSummary;
}

export function useCustomerAudience(enabled: boolean, projectId?: string | null) {
  const apiRevision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  const authenticated = api.hasAdminToken;
  const active = enabled && authenticated;
  const downloadsEnabled = projectId == null || projectId === 'tyrerescue';
  const key = `${projectId ?? 'tyrerescue'}:${apiRevision}:${sessionRevision}`;
  const [customerFeed, setCustomerFeed] = useState<Feed<CustomerSummary> | null>(null);
  const [downloadFeed, setDownloadFeed] = useState<Feed<AppDownloadSummary> | null>(null);

  const loadCustomers = useCallback(async (signal: AbortSignal) => {
    const current = () => !signal.aborted && api.hasAdminToken
      && getApiContextRevision() === apiRevision && getAdminSessionRevision() === sessionRevision;
    if (!current()) return;
    setCustomerFeed((previous) => ({ key, data: previous?.key === key ? previous.data : null, loading: true, error: null }));
    try {
      const response = await api.get<unknown>('/api/mobile/admin/customers/summary', { signal, timeoutMs: 15_000 });
      if (!current()) return;
      setCustomerFeed({ key, data: parseCustomerSummary(response), loading: false, error: null });
    } catch {
      if (!current()) return;
      setCustomerFeed((previous) => ({ key, data: previous?.key === key ? previous.data : null, loading: false, error: 'Customer count unavailable. Tap Refresh to try again.' }));
    }
  }, [apiRevision, key, sessionRevision]);

  const refreshCustomers = usePolling(loadCustomers, { enabled: active, intervalMs: 60_000, key });
  const loadDownloads = useCallback(async (signal: AbortSignal) => {
    const current = () => !signal.aborted && api.hasAdminToken
      && getApiContextRevision() === apiRevision && getAdminSessionRevision() === sessionRevision;
    if (!current()) return;
    setDownloadFeed((previous) => ({ key, data: previous?.key === key ? previous.data : null, loading: true, error: null }));
    try {
      const response = await api.get<unknown>('/api/mobile/admin/app-downloads', { signal, timeoutMs: 15_000 });
      if (!current()) return;
      setDownloadFeed({ key, data: parseAppDownloadSummary(response), loading: false, error: null });
    } catch {
      if (!current()) return;
      setDownloadFeed((previous) => ({ key, data: previous?.key === key ? previous.data : null, loading: false, error: 'App Store report unavailable. Tap Refresh to try again.' }));
    }
  }, [apiRevision, key, sessionRevision]);
  const refreshDownloads = usePolling(loadDownloads, { enabled: active && downloadsEnabled, intervalMs: 60_000, key });
  const refresh = useCallback(async () => { await Promise.allSettled([refreshCustomers(), refreshDownloads()]); }, [refreshCustomers, refreshDownloads]);
  const customers = active && customerFeed?.key === key ? customerFeed : null;
  const downloads = active && downloadsEnabled && downloadFeed?.key === key ? downloadFeed : null;

  return {
    customers: {
      data: customers?.data ?? null,
      loading: active && (customers?.loading ?? true),
      error: !enabled ? null : !authenticated ? 'Sign in to view registered customers.' : customers?.error ?? null,
      refresh: refreshCustomers,
    },
    downloads: {
      visible: downloadsEnabled,
      data: downloads?.data ?? null,
      loading: active && downloadsEnabled && (downloads?.loading ?? true),
      error: !enabled || !downloadsEnabled ? null : !authenticated ? 'Sign in to view App Store downloads.' : downloads?.error ?? null,
      refresh: refreshDownloads,
    },
    refresh,
  };
}
