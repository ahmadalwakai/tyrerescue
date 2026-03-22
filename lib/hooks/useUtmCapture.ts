'use client';

import { useEffect } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

const UTM_STORAGE_KEY = 'tr_utm';

const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'gbraid',
  'wbraid',
] as const;

export function useUtmCapture() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const hasUtm = UTM_PARAMS.some((p) => searchParams.get(p));
    if (!hasUtm) return;

    const data: Record<string, string> = {};
    UTM_PARAMS.forEach((p) => {
      const val = searchParams.get(p);
      if (val) data[p] = val;
    });

    data.landing_page = pathname;
    data.referrer = document.referrer || '';
    data.captured_at = new Date().toISOString();

    // First-touch attribution — don't overwrite existing UTM data
    const existing = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!existing) {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(data));
    }
  }, [searchParams, pathname]);
}

export function getStoredUtm(): Record<string, string> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
