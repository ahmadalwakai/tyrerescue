import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { normalizeUkPhone } from '@/lib/returning-customer';
import type { ReturningCustomerMatch } from '@/types/assisted-chat';

const DEBOUNCE_MS = 450;

interface Options {
  phone: string;
  enabled: boolean;
  /** Changes when the admin session or API project changes; clears results. */
  scopeKey: string;
}

/**
 * Looks up a returning customer once a complete UK number is typed. Each new
 * number aborts the previous request, and a response for an older number is
 * never applied. Failures are silent: matching is an aid, not a gate.
 */
export function useReturningCustomer({ phone, enabled, scopeKey }: Options) {
  // The last settled lookup; results only ever belong to the number and scope they were fetched for.
  const [settled, setSettled] = useState<{ phone: string; scopeKey: string; matches: ReturningCustomerMatch[] } | null>(null);
  const sequence = useRef(0);
  const normalized = enabled ? normalizeUkPhone(phone) : null;

  useEffect(() => {
    const request = ++sequence.current;
    if (!normalized) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.get<{ matches?: ReturningCustomerMatch[] }>(
        `/api/mobile/admin/customers/match?phone=${encodeURIComponent(normalized)}`,
        { signal: controller.signal },
      ).then((data) => {
        if (request === sequence.current) setSettled({ phone: normalized, scopeKey, matches: data.matches ?? [] });
      }).catch(() => {
        if (request === sequence.current) setSettled({ phone: normalized, scopeKey, matches: [] });
      });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [normalized, scopeKey]);

  const current = Boolean(normalized && settled && settled.phone === normalized && settled.scopeKey === scopeKey);
  return {
    phone: normalized,
    matches: current && settled ? settled.matches : [],
    loading: Boolean(normalized) && !current,
  };
}
