import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AssistedChatPaymentChoice } from '@/types/assisted-chat';

/**
 * Local-only "Today's bookings" history for the Assisted Chat operator UI.
 *
 * This is the SINGLE SOURCE OF TRUTH for the header counter — the count is
 * derived from `items.length`, so the badge can never drift away from the
 * list shown in the Today's Bookings modal.
 *
 * IMPORTANT: this is NOT a booking ledger. The real booking reference is
 * always `generateRefNumber()` from `lib/utils.ts` on the Next.js side,
 * returned in the finalize endpoint response as `refNumber`. We store that
 * exact value here so the operator can re-open recently-created bookings.
 *
 * Storage key: `assistedChat.todayBookings.v1`
 * Stored shape: { date: 'YYYY-MM-DD', items: TodayBookingItem[] }
 *  - Resets when the local YYYY-MM-DD changes.
 *  - Newest items first.
 *  - Deduplicated by `bookingReference` (re-saving updates the existing item
 *    in place rather than appending a duplicate).
 */

const STORAGE_KEY = 'assistedChat.todayBookings.v1';
const MAX_ITEMS = 100; // safety cap so the list can't grow unbounded

export interface TodayBookingItem {
  bookingReference: string;
  bookingId?: string;
  createdAtIso: string;
  paymentChoice: AssistedChatPaymentChoice;
  totalPence?: number;
  totalLabel?: string;
  paymentLink?: string;
  customerPhone?: string;
  customerAddress?: string;
  tyreSize?: string;
  quantity?: number;
}

interface StoredHistory {
  date: string;
  items: TodayBookingItem[];
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isTodayBookingItem(value: unknown): value is TodayBookingItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.bookingReference === 'string' &&
    v.bookingReference.length > 0 &&
    typeof v.createdAtIso === 'string' &&
    typeof v.paymentChoice === 'string'
  );
}

export interface TodayBookingsState {
  hydrated: boolean;
  items: TodayBookingItem[];
  count: number;
  /**
   * Add or upsert a booking to today's history. Idempotent per
   * `bookingReference`: if the same reference is already present the
   * existing entry is updated in place (no duplicate, no extra count).
   * No-op when `bookingReference` is empty.
   */
  addBooking: (item: TodayBookingItem) => void;
  /** Wipe today's history (not used by Clear draft / Log out). */
  clear: () => void;
}

export function useTodayBookings(): TodayBookingsState {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<StoredHistory>({
    date: todayKey(),
    items: [],
  });
  // Track in-memory the references we've already saved this render-cycle so a
  // parent re-render that re-emits the same `dispatchedRefNumber` cannot
  // double-add before the next persisted state lands.
  const seenRefs = useRef<Set<string>>(new Set());

  // Hydrate once. If the stored date is not today, reset to a fresh day.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as Partial<StoredHistory>;
          const today = todayKey();
          if (parsed?.date === today && Array.isArray(parsed.items)) {
            const items = parsed.items.filter(isTodayBookingItem).slice(0, MAX_ITEMS);
            setState({ date: today, items });
            seenRefs.current = new Set(items.map((i) => i.bookingReference));
          }
        }
      } catch {
        // ignore corrupt history
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change (best-effort; ignore quota errors).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [hydrated, state]);

  // Date-rollover safety: if the local date changes while the screen is open,
  // reset on the next render tick so the modal reflects the new day.
  useEffect(() => {
    if (!hydrated) return;
    const today = todayKey();
    if (state.date !== today) {
      setState({ date: today, items: [] });
      seenRefs.current = new Set();
    }
  }, [hydrated, state.date]);

  const addBooking = useCallback((item: TodayBookingItem) => {
    if (!item.bookingReference) return;
    setState((prev) => {
      const today = todayKey();
      // New local day → start fresh, drop any pre-existing list.
      const baseItems = prev.date === today ? prev.items : [];
      const existingIdx = baseItems.findIndex(
        (i) => i.bookingReference === item.bookingReference,
      );
      let nextItems: TodayBookingItem[];
      if (existingIdx >= 0) {
        // Upsert: merge new fields onto existing entry, keep original
        // createdAtIso so the displayed time doesn't jitter on re-saves.
        const existing = baseItems[existingIdx];
        const merged: TodayBookingItem = {
          ...existing,
          ...item,
          createdAtIso: existing.createdAtIso,
        };
        nextItems = [merged, ...baseItems.filter((_, idx) => idx !== existingIdx)];
      } else {
        nextItems = [item, ...baseItems];
      }
      if (nextItems.length > MAX_ITEMS) nextItems = nextItems.slice(0, MAX_ITEMS);
      seenRefs.current = new Set(nextItems.map((i) => i.bookingReference));
      return { date: today, items: nextItems };
    });
  }, []);

  const clear = useCallback(() => {
    setState({ date: todayKey(), items: [] });
    seenRefs.current = new Set();
  }, []);

  const count = useMemo(() => state.items.length, [state.items]);

  return { hydrated, items: state.items, count, addBooking, clear };
}
