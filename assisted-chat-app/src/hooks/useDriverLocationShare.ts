import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { Alert, Linking, Platform } from 'react-native';
import { api, ApiError, getAdminToken, SESSION_VERIFICATION_ERROR } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import {
  DriverLocationShareError,
  shareDriverLocation,
  type DriverLocationShareMethod,
} from '../lib/driver-location-share';

interface Input {
  bookingRef: string | null | undefined;
  bookingId?: string | null;
}

type Notice = { kind: 'ok' | 'err'; text: string };
const REQUEST_TIMEOUT_MS = 12_000;

export function useDriverLocationShare({ bookingRef, bookingId }: Input) {
  const [busy, setBusy] = useState<DriverLocationShareMethod | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const mounted = useRef(false);
  const inflight = useRef<AbortController | null>(null);
  const sessionBaseUrl = api.baseUrl;
  const sessionToken = getAdminToken();
  const currentBooking = useLatestRef({ bookingRef, bookingId });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; inflight.current?.abort(); };
  }, []);
  useEffect(() => {
    inflight.current?.abort();
    inflight.current = null;
    setBusy(null);
    setNotice(null);
  }, [bookingRef, bookingId, sessionBaseUrl, sessionToken]);

  const share = useCallback(async (method: DriverLocationShareMethod) => {
    if (inflight.current || !bookingRef) return;
    if (!api.hasAdminToken) {
      setNotice({ kind: 'err', text: 'Sign in to share the driver location.' });
      return;
    }
    const baseUrl = api.baseUrl;
    const token = getAdminToken();
    const controller = new AbortController();
    inflight.current = controller;
    let timedOut = false;
    const isCurrent = () => mounted.current && !controller.signal.aborted
      && api.baseUrl === baseUrl && getAdminToken() === token
      && currentBooking.current.bookingRef === bookingRef && currentBooking.current.bookingId === bookingId;
    setBusy(method);
    setNotice(null);
    try {
      const pin = await shareDriverLocation({ bookingRef, bookingId, method }, {
        fetchBooking: async (ref) => {
          const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
          try {
            return await api.get<unknown>(
              `/api/mobile/admin/bookings/${encodeURIComponent(ref)}?driverLocationAt=${Date.now()}`,
              { signal: controller.signal },
            );
          } finally { clearTimeout(timer); }
        },
        copy: copyToClipboard,
        openWhatsApp: async (url) => {
          try { await Linking.openURL(url); }
          catch { throw new DriverLocationShareError('whatsapp_failed', 'Could not open WhatsApp. Copy the driver location link instead.'); }
        },
        isCurrent,
        confirmLastKnown: (recordedAt) => new Promise<boolean>((resolve) => {
          const when = new Date(recordedAt).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
          });
          const warning = `Last GPS update: ${when} (UK time). The driver may have moved. Ask them to open their app for a fresh position, or share this last known pin.`;
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            resolve(window.confirm(`Share last known driver location?\n\n${warning}`));
            return;
          }
          Alert.alert('Share last known driver location?',
            warning,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Share last known pin', onPress: () => resolve(true) },
            ], { cancelable: true, onDismiss: () => resolve(false) });
        }),
      });
      if (isCurrent()) {
        setNotice({ kind: 'ok', text: method === 'copy'
          ? pin.isLastKnown ? 'Last known driver location and update time copied.' : 'Driver location link copied.'
          : 'WhatsApp opened. Review and send the driver location.' });
      }
    } catch (error) {
      const sameBooking = currentBooking.current.bookingRef === bookingRef && currentBooking.current.bookingId === bookingId;
      if (!mounted.current || !sameBooking || api.baseUrl !== baseUrl || getAdminToken() !== token) return;
      if (controller.signal.aborted && !timedOut) return;
      if (error instanceof DriverLocationShareError && error.code === 'share_cancelled') return;
      const text = error instanceof DriverLocationShareError ? error.message
        : error instanceof ApiError && error.status === 401 ? SESSION_VERIFICATION_ERROR
          : timedOut ? 'The driver location request timed out. Try again.'
            : 'Could not refresh the driver location. Try again.';
      setNotice({ kind: 'err', text });
    } finally {
      if (inflight.current === controller) {
        inflight.current = null;
        if (mounted.current) setBusy(null);
      }
    }
  }, [bookingRef, bookingId]);

  return { busy, notice, copy: () => share('copy'), whatsapp: () => share('whatsapp') };
}
