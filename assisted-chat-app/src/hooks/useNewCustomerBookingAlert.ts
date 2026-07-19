import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError } from '@/lib/api';
import {
  addAdminNotificationReceivedListener,
  presentLocalUrgentBookingNotification,
} from '@/lib/notifications';

/**
 * Detects when a NEW booking lands on the system after the operator has
 * already opened the bookings list at least once. The "All bookings" header
 * button uses the returned `hasNewCustomerBooking` flag to enter an alert
 * state (red shimmer + "New" badge).
 *
 * Source-of-truth: the existing admin bookings endpoint
 *   GET /api/mobile/admin/bookings?page=1
 * (no new endpoint is added). The first item is the most recent booking.
 *
 * Storage key: `assistedChat.lastSeenCustomerBooking.v1`
 *  Stored shape: { id, createdAt }
 *  - id: latest booking id we've already shown to the operator.
 *  - createdAt: ISO timestamp of that booking (used to compare).
 *
 * IMPORTANT — booking source detection:
 *   `/api/mobile/admin/bookings` exposes `isCustomerOriginated` so the
 *   popup only interrupts for bookings created outside the assisted-chat
 *   operator flow. Assisted Chat / admin quick bookings are treated as
 *   already-seen operational work and never open the urgent popup.
 */

const STORAGE_KEY = 'assistedChat.lastSeenCustomerBooking.v1';
const POLL_INTERVAL_MS = 20_000;
const FOREGROUND_REMINDER_INTERVAL_MS = 60_000;

interface BookingsListItem {
  id: string;
  refNumber?: string | null;
  bookingType?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  bookingOrigin?: string | null;
  isCustomerOriginated?: boolean | null;
  scheduledAt?: string | null;
  createdAt: string | null;
}

interface BookingsListResponse {
  items: BookingsListItem[];
}

interface LastSeen {
  id: string;
  createdAt: string | null;
}

export interface BookingAlertSummary {
  id: string;
  refNumber: string | null;
  bookingType: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** May not be exposed on the list endpoint — caller renders fallback. */
  addressLine: string | null;
  /** May not be exposed on the list endpoint — caller renders fallback. */
  tyreSize: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  /**
   * `true` when this booking is treated as an urgent/customer emergency.
   * Driven by `bookingType === 'emergency'` (the only reliable signal
   * currently surfaced by the mobile bookings list response).
   */
  isUrgent: boolean;
}

function isBookingsListResponse(value: unknown): value is BookingsListResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as { items?: unknown };
  if (!Array.isArray(v.items)) return false;
  return v.items.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const it = item as { id?: unknown; createdAt?: unknown };
    return typeof it.id === 'string' && (it.createdAt === null || typeof it.createdAt === 'string');
  });
}

function isLastSeen(value: unknown): value is LastSeen {
  if (!value || typeof value !== 'object') return false;
  const v = value as { id?: unknown; createdAt?: unknown };
  return typeof v.id === 'string' && (v.createdAt === null || typeof v.createdAt === 'string');
}

function isNewerThanSeen(latest: BookingsListItem, seen: LastSeen | null): boolean {
  if (!seen) return false;
  if (latest.id === seen.id) return false;
  if (latest.createdAt && seen.createdAt) {
    const a = Date.parse(latest.createdAt);
    const b = Date.parse(seen.createdAt);
    if (Number.isFinite(a) && Number.isFinite(b)) return a > b;
  }
  return latest.id !== seen.id;
}

function isCustomerOriginatedBooking(item: BookingsListItem): boolean {
  if (typeof item.isCustomerOriginated === 'boolean') return item.isCustomerOriginated;
  if (typeof item.bookingOrigin === 'string') return item.bookingOrigin === 'customer';
  return true;
}

function toAlertSummary(item: BookingsListItem): BookingAlertSummary {
  const customerOriginated = isCustomerOriginatedBooking(item);
  return {
    id: item.id,
    refNumber: item.refNumber ?? null,
    bookingType: item.bookingType ?? null,
    customerName: item.customerName ?? null,
    customerPhone: item.customerPhone ?? null,
    // Not surfaced by the list endpoint today — UrgentBookingPopup must
    // render a "Unknown" fallback rather than fabricating data.
    addressLine: null,
    tyreSize: null,
    scheduledAt: item.scheduledAt ?? null,
    createdAt: item.createdAt ?? null,
    isUrgent: customerOriginated && (item.bookingType ?? '').toLowerCase() === 'emergency',
  };
}

export interface NewCustomerBookingAlertState {
  hasNewCustomerBooking: boolean;
  latestNewBooking: BookingAlertSummary | null;
  /** Clear the alert and persist the current latest booking as "seen". */
  markBookingsSeen: () => Promise<void>;
  /**
   * Manually fire the local urgent notification + bookkeeping for the
   * current alert. Safe to call repeatedly — it dedupes per booking id
   * and rate-limits to one reminder per 60s while the booking remains
   * unresolved.
   */
  triggerForegroundUrgentAlert: () => Promise<void>;
}

export function useNewCustomerBookingAlert(): NewCustomerBookingAlertState {
  const [hasNewCustomerBooking, setHasNewCustomerBooking] = useState(false);
  const [latestNewBooking, setLatestNewBooking] = useState<BookingAlertSummary | null>(null);
  const lastSeenRef = useRef<LastSeen | null>(null);
  const latestKnownRef = useRef<BookingsListItem | null>(null);
  const hydratedRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Per-booking dedupe: id of the booking whose sound has already played
  // at least once, plus the timestamp of the last reminder so we can
  // honour a 60s reminder cadence while the operator hasn't opened the
  // bookings modal yet.
  const lastAlertedBookingIdRef = useRef<string | null>(null);
  const lastAlertedAtRef = useRef<number>(0);

  const persistSeen = useCallback(async (item: BookingsListItem) => {
    const next: LastSeen = { id: item.id, createdAt: item.createdAt };
    lastSeenRef.current = next;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort; ignore storage failures.
    }
  }, []);

  const fetchOnce = useCallback(async () => {
    if (!api.hasAdminToken) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await api.get<unknown>('/api/mobile/admin/bookings?page=1');
      if (!mountedRef.current) return;
      if (!isBookingsListResponse(res)) return;
      const latest = res.items[0];
      if (!latest) return;
      latestKnownRef.current = latest;
      if (!hydratedRef.current) return;

      // First run after hydration with no stored value: mark current latest
      // as seen so old bookings don't trigger the alert on first install.
      if (!lastSeenRef.current) {
        await persistSeen(latest);
        return;
      }

      if (isNewerThanSeen(latest, lastSeenRef.current)) {
        if (!isCustomerOriginatedBooking(latest)) {
          await persistSeen(latest);
          setHasNewCustomerBooking(false);
          setLatestNewBooking(null);
          return;
        }
        setHasNewCustomerBooking(true);
        setLatestNewBooking(toAlertSummary(latest));
      }
    } catch (err) {
      // Silent: never surface a false alert on transient network failure.
      // Auth errors are handled globally by the api client.
      if (err instanceof ApiError && err.status === 401) return;
    } finally {
      inFlightRef.current = false;
    }
  }, [persistSeen]);

  // Hydrate last seen and run an initial fetch.
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isLastSeen(parsed)) {
            lastSeenRef.current = parsed;
          }
        }
      } catch {
        // Corrupt storage — treat as first run.
      }
      hydratedRef.current = true;
      await fetchOnce();
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce]);

  // Poll while app is active. Pauses in background to save battery/data.
  // Single interval — `inFlightRef` prevents overlapping requests.
  useEffect(() => {
    const start = () => {
      if (timerRef.current) return;
      timerRef.current = setInterval(() => {
        void fetchOnce();
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    if (appStateRef.current === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
      if (state === 'active') {
        start();
        void fetchOnce();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [fetchOnce]);

  // Reuse existing push notification stream as an instant signal: any
  // notification received while the app is foregrounded flips the alert
  // immediately. Polling stays as the safety net for missed pushes.
  // Web has no expo-notifications push surface, so skip the listener there.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = addAdminNotificationReceivedListener(() => {
      if (!mountedRef.current) return;
      void fetchOnce();
    });
    return () => sub?.remove();
  }, [fetchOnce]);

  const markBookingsSeen = useCallback(async () => {
    setHasNewCustomerBooking(false);
    setLatestNewBooking(null);
    lastAlertedBookingIdRef.current = null;
    lastAlertedAtRef.current = 0;
    const latest = latestKnownRef.current;
    if (latest) {
      await persistSeen(latest);
    }
  }, [persistSeen]);

  const triggerForegroundUrgentAlert = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const booking = latestKnownRef.current;
    if (!booking) return;
    if (!isCustomerOriginatedBooking(booking)) return;
    const isUrgent = (booking.bookingType ?? '').toLowerCase() === 'emergency';
    if (!isUrgent) return;

    const now = Date.now();
    const sameBooking = lastAlertedBookingIdRef.current === booking.id;
    const cooldownActive =
      sameBooking && now - lastAlertedAtRef.current < FOREGROUND_REMINDER_INTERVAL_MS;
    if (cooldownActive) return;

    lastAlertedBookingIdRef.current = booking.id;
    lastAlertedAtRef.current = now;
    await presentLocalUrgentBookingNotification({
      bookingId: booking.id,
      title: 'Emergency booking received',
      body: booking.customerName
        ? `New emergency booking from ${booking.customerName}`
        : 'Open Assisted Chat now',
    });
  }, []);

  return {
    hasNewCustomerBooking,
    latestNewBooking,
    markBookingsSeen,
    triggerForegroundUrgentAlert,
  };
}
