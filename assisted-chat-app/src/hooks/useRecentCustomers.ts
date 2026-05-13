import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecentCustomer } from '@/types/assisted-chat';

/**
 * Local-only "recent customers" cache so the operator can re-use details
 * (phone, address, tyre size, quantity, note, last booking ref) without
 * re-typing for repeat callers.
 *
 * Storage key: `assistedChat.recentCustomers.v1`
 *  - Newest first.
 *  - Hard cap 20.
 *  - Dedup by `customerPhone` when present, otherwise by address + tyre size.
 *  - Operational fields only — no payment secrets, no tokens, no passwords.
 *  - Only written after a successful real booking creation (callers gate
 *    the call themselves so failed actions never pollute the list).
 */

const STORAGE_KEY = 'assistedChat.recentCustomers.v3';
const MAX_ITEMS = 20;

function isRecentCustomer(value: unknown): value is RecentCustomer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.lastUsedAtIso === 'string';
}

function dedupKey(c: RecentCustomer): string {
  const phone = (c.customerPhone ?? '').replace(/\D+/g, '');
  if (phone) return `phone:${phone}`;
  const addr = (c.customerAddress ?? '').trim().toLowerCase();
  const size = (c.tyreSize ?? '').trim().toLowerCase();
  if (addr || size) return `addrsize:${addr}|${size}`;
  return `ts:${c.lastUsedAtIso}`;
}

export interface RecentCustomersState {
  hydrated: boolean;
  items: RecentCustomer[];
  /** Upsert a recent customer. Newer fields overwrite older fields. */
  saveCustomer: (item: RecentCustomer) => void;
  removeCustomer: (item: RecentCustomer) => void;
  clear: () => void;
}

export function useRecentCustomers(): RecentCustomersState {
  const [hydrated, setHydrated] = useState(false);
  const [items, setItems] = useState<RecentCustomer[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setItems(parsed.filter(isRecentCustomer).slice(0, MAX_ITEMS));
          }
        }
      } catch {
        // ignore corrupt cache
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [hydrated, items]);

  const saveCustomer = useCallback((item: RecentCustomer) => {
    if (!item.customerPhone && !item.customerAddress) return;
    setItems((prev) => {
      const key = dedupKey(item);
      const idx = prev.findIndex((p) => dedupKey(p) === key);
      if (idx >= 0) {
        const merged: RecentCustomer = { ...prev[idx], ...item };
        const next = [merged, ...prev.filter((_, i) => i !== idx)];
        return next.slice(0, MAX_ITEMS);
      }
      return [item, ...prev].slice(0, MAX_ITEMS);
    });
  }, []);

  const removeCustomer = useCallback((item: RecentCustomer) => {
    const key = dedupKey(item);
    setItems((prev) => prev.filter((p) => dedupKey(p) !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { hydrated, items, saveCustomer, removeCustomer, clear };
}
