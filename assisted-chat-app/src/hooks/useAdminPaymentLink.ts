import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type {
  AdminPaymentLinkResponse,
  AssistedChatDraft,
  StripePaymentLinkState,
} from '@/types/assisted-chat';

export interface UseAdminPaymentLinkArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

export interface UseAdminPaymentLink {
  busy: boolean;
  error: string | null;
  /**
   * Create a Stripe payment link for the dispatched booking's outstanding
   * balance. Stores the result on `draft.paymentLink`. No-ops (returns null)
   * when there is no dispatched booking or a request is already in flight, so
   * rapid double-taps can never create duplicate links.
   */
  createForDispatchedBooking: () => Promise<StripePaymentLinkState | null>;
}

/**
 * Calls the admin-only backend endpoint that creates a Stripe Checkout link for
 * an EXISTING booking. The backend validates the amount against the outstanding
 * balance and records a pending payment; the Stripe webhook later confirms it.
 * This hook NEVER marks anything as paid client-side.
 */
export function useAdminPaymentLink({
  draft,
  update,
}: UseAdminPaymentLinkArgs): UseAdminPaymentLink {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const createForDispatchedBooking = useCallback(async () => {
    if (inflight.current) return null;
    const ref = draft.dispatchedRefNumber;
    if (!ref) {
      setError('Dispatch the booking before creating a payment link.');
      return null;
    }

    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AdminPaymentLinkResponse>(
        `/api/admin/bookings/${encodeURIComponent(ref)}/payment-link`,
        {},
      );
      const paymentLink: StripePaymentLinkState = {
        kind: 'full',
        paymentUrl: res.paymentUrl,
        amountPence: res.amountPence,
        remainingBalancePence: null,
        bookingId: res.bookingId,
        refNumber: res.refNumber,
        createdAtIso: res.createdAtIso,
      };
      update({ paymentLink });
      return paymentLink;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to create payment link.';
      setError(message);
      return null;
    } finally {
      setBusy(false);
      inflight.current = false;
    }
  }, [draft.dispatchedRefNumber, update]);

  return { busy, error, createForDispatchedBooking };
}
