import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBookingTyreLine, ensureBookingTyreLines } from '@/lib/assisted-chat-workflow';
import type { AssistedChatDraft, AssistedChatTyreSelection } from '@/types/assisted-chat';

// Bumped key because old persisted drafts carried fields this streamlined
// phone-led flow no longer uses. Restore only the current draft shape.
const STORAGE_KEY = 'assistedChat.draft.v4';
const LEGACY_KEYS = ['assistedChat.draft.v3', 'assistedChat.draft.v2', 'assistedChat.draft.v1'] as const;
// Mirrors the web hook so a stale draft doesn't carry forward across days.
const STALE_AFTER_MS = 1000 * 60 * 60 * 12;

export const EMPTY_DRAFT: AssistedChatDraft = {
  customer: { phone: '', name: '', email: '' },
  location: {
    method: 'address',
    address: '',
    lat: null,
    lng: null,
    postcode: null,
    link: null,
    whatsappLink: null,
    status: 'idle',
  },
  tyreLines: [createBookingTyreLine({ id: 'tyre-1' })],
  lockingNut: { answer: 'unknown', chargeGbp: null },
  quickBookingId: null,
  savedQuoteId: null,
  savedQuoteRef: null,
  note: '',
  quote: null,
  priceNeedsRefresh: false,
  manualPriceGbp: null,
  paymentChoice: null,
  paymentLink: null,
  dispatchedRefNumber: null,
  dispatchedBookingId: null,
  customerEmailMode: 'walk_in_customer',
  updatedAt: 0,
};

export function useAssistedChatDraft() {
  const [draft, setDraft] = useState<AssistedChatDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Try v3 first; fall back through legacy keys so an in-flight
        // operator's draft is not lost on the version bump. Any legacy
        // payload found is migrated through the sanitizer below and the
        // legacy key is deleted.
        let raw = await AsyncStorage.getItem(STORAGE_KEY);
        let usedLegacyKey: string | null = null;
        if (!raw) {
          for (const key of LEGACY_KEYS) {
            const legacy = await AsyncStorage.getItem(key);
            if (legacy) {
              raw = legacy;
              usedLegacyKey = key;
              break;
            }
          }
        }
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<AssistedChatDraft> & {
            updatedAt?: number;
            tyre?: Partial<AssistedChatTyreSelection>;
          };
          if (parsed.updatedAt && Date.now() - parsed.updatedAt < STALE_AFTER_MS) {
            const migratedTyreLines = Array.isArray(parsed.tyreLines)
              ? ensureBookingTyreLines(parsed.tyreLines)
              : ensureBookingTyreLines([
                  createBookingTyreLine({
                    id: 'tyre-1',
                    size: typeof parsed.tyre?.size === 'string' ? parsed.tyre.size : '',
                    quantity:
                      typeof parsed.tyre?.quantity === 'number' && Number.isFinite(parsed.tyre.quantity)
                        ? parsed.tyre.quantity
                        : 1,
                  }),
                ]);
            const merged: AssistedChatDraft = {
              ...EMPTY_DRAFT,
              customer: { ...EMPTY_DRAFT.customer, ...parsed.customer },
              location: { ...EMPTY_DRAFT.location, ...parsed.location },
              tyreLines: migratedTyreLines,
              lockingNut: { ...EMPTY_DRAFT.lockingNut, ...parsed.lockingNut },
              quickBookingId: typeof parsed.quickBookingId === 'string' ? parsed.quickBookingId : null,
              savedQuoteId: typeof parsed.savedQuoteId === 'string' ? parsed.savedQuoteId : null,
              savedQuoteRef: typeof parsed.savedQuoteRef === 'string' ? parsed.savedQuoteRef : null,
              note: typeof parsed.note === 'string' ? parsed.note : EMPTY_DRAFT.note,
              quote: parsed.quote ?? null,
              priceNeedsRefresh: Boolean(parsed.priceNeedsRefresh),
              manualPriceGbp:
                typeof parsed.manualPriceGbp === 'number' && Number.isFinite(parsed.manualPriceGbp)
                  ? parsed.manualPriceGbp
                  : null,
              paymentChoice: parsed.paymentChoice ?? null,
              paymentLink: parsed.paymentLink ?? null,
              dispatchedRefNumber: parsed.dispatchedRefNumber ?? null,
              dispatchedBookingId: typeof parsed.dispatchedBookingId === 'string' ? parsed.dispatchedBookingId : null,
              customerEmailMode:
                parsed.customerEmailMode === 'send_customer_confirmation'
                  ? 'send_customer_confirmation'
                  : 'walk_in_customer',
              updatedAt: parsed.updatedAt,
            };
            setDraft(merged);
            if (usedLegacyKey) {
              AsyncStorage.removeItem(usedLegacyKey).catch(() => {});
            }
          }
        }
      } catch {
        // ignore corrupt draft
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: AssistedChatDraft) => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
        // best-effort; ignore quota errors
      });
    }, 200);
  }, []);

  const update = useCallback(
    (patch: Partial<AssistedChatDraft>) => {
      setDraft((prev) => {
        const next: AssistedChatDraft = { ...prev, ...patch, updatedAt: Date.now() };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const replace = useCallback(
    (next: AssistedChatDraft) => {
      const stamped: AssistedChatDraft = { ...next, updatedAt: Date.now() };
      setDraft(stamped);
      persist(stamped);
    },
    [persist],
  );

  const clear = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  return { draft, hydrated, update, replace, clear };
}
