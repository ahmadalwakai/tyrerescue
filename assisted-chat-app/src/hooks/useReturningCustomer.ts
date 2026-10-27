import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { buildMatchQuery } from '@/lib/returning-customer';
import type { ReturningCustomerMatch } from '@/types/assisted-chat';

const DEBOUNCE_MS = 450;

interface Options {
  phone: string;
  /** Only an address confirmed from the suggestions (it has coordinates); free text is never sent. */
  confirmedAddress: string | null;
  tyreSize: string;
  enabled: boolean;
  /** Changes when the admin session or API project changes; clears results. */
  scopeKey: string;
}

/**
 * Looks up a returning customer from a complete UK number and/or a confirmed
 * address (plus the tyre size, which raises an address match's confidence).
 * Each new query aborts the previous request, and a response for an older
 * query is never applied. Failures are silent: matching is an aid, not a gate.
 */
export function useReturningCustomer({ phone, confirmedAddress, tyreSize, enabled, scopeKey }: Options) {
  // The last settled lookup; results only ever belong to the query and scope they were fetched for.
  const [settled, setSettled] = useState<{ query: string; scopeKey: string; matches: ReturningCustomerMatch[] } | null>(null);
  const sequence = useRef(0);
  const query = enabled ? buildMatchQuery({ phone, confirmedAddress, tyreSize }) : '';

  useEffect(() => {
    const request = ++sequence.current;
    if (!query) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.get<{ matches?: ReturningCustomerMatch[] }>(`/api/mobile/admin/customers/match?${query}`, { signal: controller.signal })
        .then((data) => {
          if (request === sequence.current) setSettled({ query, scopeKey, matches: data.matches ?? [] });
        }).catch(() => {
          if (request === sequence.current) setSettled({ query, scopeKey, matches: [] });
        });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, scopeKey]);

  const current = Boolean(query && settled && settled.query === query && settled.scopeKey === scopeKey);
  return {
    /** Identifies the query; dismissals are remembered per query. */
    phone: query || null,
    matches: current && settled ? settled.matches : [],
    loading: Boolean(query) && !current,
  };
}
