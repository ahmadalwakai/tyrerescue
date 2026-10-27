import { useCallback, useEffect, useState } from 'react';
import { api, getApiContextRevision } from '@/lib/api';
import { parseIncomingCallerHistory, type IncomingCallerHistoryResult } from '@/lib/incoming-caller-history';
import type { IncomingPhoneCall } from '@/lib/incoming-phone-call';
import { normalizeUkPhone } from '@/lib/returning-customer';
import { getAdminSessionRevision } from './useAdminSession';
import { useLatestRef } from './useLatestRef';

interface Options {
  call: IncomingPhoneCall | null;
  enabled: boolean;
  scopeKey: string;
}

const LOOKUP_TIMEOUT_MS = 3_000;

/** Independent caller lookup: booking form edits must not change the caller's identity. */
export function useIncomingCallerHistory({ call, enabled, scopeKey }: Options): IncomingCallerHistoryResult & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<(IncomingCallerHistoryResult & { requestKey: string }) | null>(null);
  const apiRevision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  const authenticated = api.hasAdminToken;
  const phone = call ? normalizeUkPhone(call.phone) : null;
  const requestKey = enabled && call
    ? JSON.stringify([call.callId, call.phone, scopeKey, apiRevision, sessionRevision, attempt]) : null;
  const latestRequestKey = useLatestRef(requestKey);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!requestKey || !phone || !authenticated) return undefined;
    let cancelled = false;
    let finished = false;
    const controller = new AbortController();
    const isCurrent = () => !cancelled && !finished && latestRequestKey.current === requestKey
      && apiRevision === getApiContextRevision() && sessionRevision === getAdminSessionRevision()
      && api.hasAdminToken;
    const finish = (result: IncomingCallerHistoryResult) => {
      if (!isCurrent()) return;
      finished = true;
      clearTimeout(timer);
      setSettled({ ...result, requestKey });
    };
    // Bound the UI wait too, even if a transport ignores abort or settles late.
    const timer = setTimeout(() => {
      finish({ status: 'unavailable', matches: [] });
      controller.abort();
    }, LOOKUP_TIMEOUT_MS);
    void api.get<unknown>(`/api/mobile/admin/customers/match?phone=${encodeURIComponent(phone)}`, {
      signal: controller.signal,
      timeoutMs: LOOKUP_TIMEOUT_MS,
    }).then((data) => {
      finish(parseIncomingCallerHistory(data, phone));
    }).catch(() => {
      finish({ status: 'unavailable', matches: [] });
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiRevision, authenticated, latestRequestKey, phone, requestKey, sessionRevision]);

  if (!requestKey) return { status: 'idle', matches: [], retry };
  if (!phone || !authenticated) return { status: 'unavailable', matches: [], retry };
  if (settled?.requestKey === requestKey) return { status: settled.status, matches: settled.matches, retry };
  return { status: 'checking', matches: [], retry };
}
