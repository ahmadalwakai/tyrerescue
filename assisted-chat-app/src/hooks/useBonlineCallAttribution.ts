import { useEffect, useRef, useState } from 'react';
import { api, ApiError, getAdminToken, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import { normalizePhoneForWhatsApp } from '@/lib/money';
import type { AssistedChatDraft } from '@/types/assisted-chat';

export function useBonlineCallAttribution(draft: AssistedChatDraft, scope: string, enabled: boolean) {
  const [error, setError] = useState<string | null>(null);
  const completed = useRef(new Set<string>());
  const source = draft.incomingCallSource;
  const quoteId = draft.savedQuoteId || undefined;
  const bookingId = draft.dispatchedBookingId || draft.paymentLink?.bookingId || undefined;
  const phone = normalizePhoneForWhatsApp(draft.customer.phone);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear feedback belonging to the previous caller or authenticated workspace.
    setError(null);
    if (!enabled || !source || source.scope !== scope || !api.hasAdminToken ||
        normalizePhoneForWhatsApp(source.phone) !== phone || !/^[a-f0-9]{64}$/.test(source.ledgerId) || (!quoteId && !bookingId)) return;
    const key = `${scope}:${source.ledgerId}:${quoteId ?? ''}:${bookingId ?? ''}`;
    if (completed.current.has(key)) return;
    const token = getAdminToken();
    const apiRevision = getApiContextRevision();
    const sessionRevision = getAdminSessionRevision();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !cancelled && token === getAdminToken() && apiRevision === getApiContextRevision()
      && sessionRevision === getAdminSessionRevision();
    const save = async (attempt: number) => {
      if (!current()) return;
      try {
        await api.post(`/api/mobile/admin/phone/calls/${source.ledgerId}/link`, { quoteId, bookingId });
        if (current()) {
          completed.current.add(key);
          if (completed.current.size > 100) completed.current.delete(completed.current.values().next().value!);
          setError(null);
        }
      } catch (failure) {
        if (!current()) return;
        if (attempt < 2 && (!(failure instanceof ApiError) || failure.status >= 500)) {
          timer = setTimeout(() => { void save(attempt + 1); }, 2000 * (attempt + 1));
        } else {
          setError('Booking saved. Call attribution could not be saved; link it from bOnline Calls.');
        }
      }
    };
    void save(0);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [bookingId, enabled, phone, quoteId, scope, source]);
  return error;
}
