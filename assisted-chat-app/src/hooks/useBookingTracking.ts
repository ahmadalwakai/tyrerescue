import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';

// Mirror of the web/admin response shapes so we don't import server types.

export type TrackingDerivedStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'expired';

export interface BookingTrackingState {
  status: TrackingDerivedStatus;
  startedAt: string | null;
  completedAt: string | null;
  lastUpdatedAt: string | null;
  driverLat: number | null;
  driverLng: number | null;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
}

export interface BookingTrackingData {
  bookingId: string;
  refNumber: string | null;
  customerAddress: string | null;
  customerLat: number | null;
  customerLng: number | null;
  customerToken: string;
  customerUrl: string;
  state: BookingTrackingState;
}

interface AdminGetResponse {
  exists: boolean;
  bookingId: string;
  refNumber?: string | null;
  customerAddress?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
  customerToken?: string;
  customerUrl?: string;
  state?: BookingTrackingState;
}

interface AdminEnsureResponse {
  bookingId: string;
  refNumber: string | null;
  customerAddress: string | null;
  customerLat: number | null;
  customerLng: number | null;
  customerToken: string;
  customerUrl: string;
  state: BookingTrackingState;
}

/** 5-second cadence per redesign spec. */
const POLL_INTERVAL_MS = 5_000;

interface Args {
  bookingId: string | null;
  /** Automatically call ensure once when bookingId becomes non-null. */
  autoEnsure?: boolean;
}

/**
 * Live tracking session for the assisted-chat operator UI.
 *
 * Lifecycle:
 *   - bookingId === null  → idle, no requests.
 *   - bookingId set + autoEnsure → POST /tracking/ensure (idempotent), then
 *     poll /tracking every {@link POLL_INTERVAL_MS}ms until completed/expired.
 *   - Polling stops automatically when the session reaches a terminal state,
 *     when the component unmounts, or when bookingId becomes null.
 *   - ensure() can be re-invoked by the UI's "Retry" button if the initial
 *     call failed (so booking creation itself never blocks).
 */
export function useBookingTracking({ bookingId, autoEnsure = true }: Args) {
  const [data, setData] = useState<BookingTrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ensureFailed, setEnsureFailed] = useState(false);

  // Use refs so the polling effect doesn't re-run on every state change.
  const bookingIdRef = useRef<string | null>(bookingId);
  bookingIdRef.current = bookingId;
  const mountedRef = useRef(true);
  const dataRef = useRef<BookingTrackingData | null>(null);
  dataRef.current = data;

  const ensure = useCallback(async () => {
    const id = bookingIdRef.current;
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AdminEnsureResponse>(`/api/admin/bookings/${id}/tracking/ensure`);
      if (!mountedRef.current) return;
      setData({
        bookingId: res.bookingId,
        refNumber: res.refNumber ?? null,
        customerAddress: res.customerAddress ?? null,
        customerLat: res.customerLat ?? null,
        customerLng: res.customerLng ?? null,
        customerToken: res.customerToken,
        customerUrl: res.customerUrl,
        state: res.state,
      });
      setEnsureFailed(false);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to create tracking links';
      setError(msg);
      setEnsureFailed(true);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const id = bookingIdRef.current;
    if (!id) return;
    try {
      const res = await api.get<AdminGetResponse>(`/api/admin/bookings/${id}/tracking`);
      if (!mountedRef.current) return;
      if (!res.exists) return;
      if (!res.customerToken || !res.customerUrl || !res.state) return;
      setData({
        bookingId: res.bookingId,
        refNumber: res.refNumber ?? null,
        customerAddress: res.customerAddress ?? null,
        customerLat: res.customerLat ?? null,
        customerLng: res.customerLng ?? null,
        customerToken: res.customerToken,
        customerUrl: res.customerUrl,
        state: res.state,
      });
      setError(null);
    } catch {
      // Polling errors are silent — next tick may succeed.
    }
  }, []);

  // Track mount lifecycle.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset state if the bookingId changes (e.g. new dispatch).
  useEffect(() => {
    if (!bookingId) {
      setData(null);
      setError(null);
      setEnsureFailed(false);
    }
  }, [bookingId]);

  // Initial ensure.
  useEffect(() => {
    if (!bookingId || !autoEnsure) return;
    void ensure();
  }, [bookingId, autoEnsure, ensure]);

  // Polling — single interval, exits early if terminal state was reached.
  useEffect(() => {
    if (!bookingId) return;
    const id = setInterval(() => {
      const status = dataRef.current?.state.status;
      if (status === 'completed' || status === 'expired') return;
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [bookingId, refresh]);

  return { data, error, busy, ensure, refresh, ensureFailed };
}
