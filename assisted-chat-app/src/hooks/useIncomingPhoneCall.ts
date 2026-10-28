import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, ApiError, getApiContextRevision } from '@/lib/api';
import { IncomingPhoneCallFeed, parseIncomingPhoneCalls, type IncomingPhoneCall } from '@/lib/incoming-phone-call';
import { getAdminSessionRevision } from './useAdminSession';
import { useLatestRef } from './useLatestRef';
import { usePolling } from './usePolling';

interface IncomingPhoneCallOptions {
  enabled: boolean;
  projectId?: string | null;
  onCall: (call: IncomingPhoneCall) => void;
  onReset?: () => void;
}

const ENDPOINT = '/api/mobile/admin/phone/incoming-call';
const RETRY_AFTER_UNAVAILABLE_MS = 30_000;

/** Receive caller numbers only while the operator can see the booking form. */
export function useIncomingPhoneCall({ enabled, projectId, onCall, onReset }: IncomingPhoneCallOptions): void {
  const [foreground, setForeground] = useState(() => Platform.OS === 'web' || AppState.currentState === 'active');
  const feed = useRef(new IncomingPhoneCallFeed());
  const generation = useRef(0);
  const retryAt = useRef(0);
  const onCallRef = useLatestRef(onCall);
  const onResetRef = useLatestRef(onReset);
  const apiRevision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  const scope = `${projectId ?? 'tyrerescue'}:${apiRevision}:${sessionRevision}`;
  const authenticated = api.hasAdminToken;
  const active = enabled && foreground && authenticated;

  useEffect(() => {
    generation.current += 1;
    feed.current.reset();
    retryAt.current = 0;
    onResetRef.current?.();
  }, [authenticated, scope, onResetRef]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      // Invalidate in-flight responses before the render that aborts polling.
      // Keep the cursor/dedupe: iOS may briefly suspend us for the bOnline
      // incoming-call overlay, and the ringing call must still fill on return.
      generation.current += 1;
      retryAt.current = 0;
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  usePolling(async (signal) => {
    if (Date.now() < retryAt.current || !api.hasAdminToken
      || (Platform.OS !== 'web' && AppState.currentState !== 'active')) return;
    const startedGeneration = generation.current;
    const isCurrent = () => !signal.aborted && startedGeneration === generation.current
      && apiRevision === getApiContextRevision() && sessionRevision === getAdminSessionRevision()
      && api.hasAdminToken && (Platform.OS === 'web' || AppState.currentState === 'active');
    const cursor = feed.current.cursor;
    try {
      const response = await api.get<unknown>(`${ENDPOINT}${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`, {
        signal,
        timeoutMs: 8_000,
      });
      if (!isCurrent()) return;
      const batch = parseIncomingPhoneCalls(response);
      if (!batch) {
        retryAt.current = Date.now() + RETRY_AFTER_UNAVAILABLE_MS;
        return;
      }
      const call = feed.current.accept(batch);
      if (!batch.enabled) retryAt.current = Date.now() + RETRY_AFTER_UNAVAILABLE_MS;
      if (call) onCallRef.current(call);
    } catch (error) {
      if (!isCurrent()) return;
      // Older business backends need no setup or repeated error banners.
      const unsupported = error instanceof ApiError && [401, 403, 404, 501].includes(error.status);
      retryAt.current = Date.now() + (unsupported ? RETRY_AFTER_UNAVAILABLE_MS : 5_000);
    }
  }, { enabled: active, intervalMs: 1_500, key: scope });
}
