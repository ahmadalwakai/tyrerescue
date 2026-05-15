'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistedChatDraft } from '@/types/admin-assisted-chat';

const STORAGE_KEY = 'admin.assistedChat.draft.v1';
/** Drop drafts older than 24h to avoid leaking stale customer data. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const EMPTY_DRAFT: AssistedChatDraft = {
  quickBookingId: null,
  savedQuoteId: null,
  savedQuoteRef: null,
  customer: { phone: '', name: '' },
  location: { label: '', lat: null, lng: null, postcode: null },
  tyre: { size: '', quantity: 1 },
  lockingNut: { answer: 'unknown', chargeGbp: null },
  note: '',
  quote: null,
  paymentChoice: null,
  dispatchedRefNumber: null,
  updatedAt: 0,
};

function loadInitial(): AssistedChatDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<AssistedChatDraft> & { updatedAt?: number };
    if (!parsed || typeof parsed !== 'object') return EMPTY_DRAFT;
    if (typeof parsed.updatedAt === 'number' && Date.now() - parsed.updatedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return EMPTY_DRAFT;
    }
    return { ...EMPTY_DRAFT, ...parsed } as AssistedChatDraft;
  } catch {
    return EMPTY_DRAFT;
  }
}

/**
 * Session-scoped draft for the assisted chat. Persists across admin route
 * changes (sessionStorage) but not across browser sessions, and self-expires
 * after 24h. Stripe secrets / payment-intent secrets are intentionally NEVER
 * stored — only the operational fields needed to resume the wizard.
 */
export function useAssistedChatDraft(): {
  draft: AssistedChatDraft;
  hydrated: boolean;
  update: (patch: Partial<AssistedChatDraft>) => void;
  replace: (next: AssistedChatDraft) => void;
  clear: () => void;
} {
  const [draft, setDraft] = useState<AssistedChatDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const ref = useRef(draft);

  useEffect(() => {
    const initial = loadInitial();
    ref.current = initial;
    setDraft(initial);
    setHydrated(true);
  }, []);

  const persist = useCallback((next: AssistedChatDraft) => {
    ref.current = next;
    setDraft(next);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage full / disabled — silently ignore */
      }
    }
  }, []);

  const update = useCallback(
    (patch: Partial<AssistedChatDraft>) => {
      const next: AssistedChatDraft = {
        ...ref.current,
        ...patch,
        updatedAt: Date.now(),
      };
      persist(next);
    },
    [persist],
  );

  const replace = useCallback(
    (next: AssistedChatDraft) => {
      persist({ ...next, updatedAt: Date.now() });
    },
    [persist],
  );

  const clear = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    ref.current = EMPTY_DRAFT;
    setDraft(EMPTY_DRAFT);
  }, []);

  return { draft, hydrated, update, replace, clear };
}
