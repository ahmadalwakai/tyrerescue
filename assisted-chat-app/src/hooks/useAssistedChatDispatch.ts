import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  DepositCheckoutResponse,
  FinalizeResponse,
  StripePaymentLinkState,
} from '@/types/assisted-chat';

const LOCKING_NUT_REASON = 'Locking wheel nut removal';

export interface UseAssistedChatDispatchArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  lockingNutCharge: number;
  /**
   * Called once per successful finalize, AFTER the server confirms the real
   * booking and we've stored its `refNumber` on the draft. Use this to
   * append to local history, fire analytics, etc. Never called on
   * validation error, network error, 401/403/500, or duplicate-tap.
   */
  onBookingCreated?: (args: {
    response: FinalizeResponse;
    paymentChoice: AssistedChatPaymentChoice;
    effectiveTotal: number;
    paymentLink: StripePaymentLinkState | null;
  }) => void;
}

// Reuses the existing PATCH (for adminAdjustmentAmount) + POST /finalize flow.
// Choosing a payment IS the dispatch in the existing system — there is no
// separate "send-to-driver" endpoint; finalize creates the booking and
// transitions the quick_booking to dispatched. We mirror the web app exactly.
export function useAssistedChatDispatch({
  draft,
  update,
  lockingNutCharge,
  onBookingCreated,
}: UseAssistedChatDispatchArgs) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResponse | null>(null);
  const inflight = useRef(false);

  const choosePaymentAndDispatch = useCallback(
    async (choice: AssistedChatPaymentChoice) => {
      if (inflight.current) return;
      setError(null);
      setResult(null);
      if (!draft.quickBookingId || !draft.quote) {
        setError('Generate a price first.');
        return;
      }

      inflight.current = true;
      setBusy(true);
      update({ paymentChoice: choice });

      try {
        if (lockingNutCharge > 0) {
          await api.patch(`/api/admin/quick-book/${draft.quickBookingId}`, {
            adminAdjustmentAmount: lockingNutCharge,
            adminAdjustmentReason: LOCKING_NUT_REASON,
          });
        }

        const paymentMethod = choice === 'cash' ? 'cash' : choice === 'deposit' ? 'deposit' : 'stripe';
        const response = await api.post<FinalizeResponse>(`/api/admin/quick-book/${draft.quickBookingId}/finalize`, {
          paymentMethod,
          ...(choice === 'deposit' ? { depositPercent: 0.15 } : {}),
        });

        let paymentLink: StripePaymentLinkState | null = null;
        if (choice === 'full' && response.paymentUrl) {
          paymentLink = {
            kind: 'full',
            paymentUrl: response.paymentUrl,
            amountPence: Math.round((response.breakdown?.total ?? draft.quote.total) * 100),
            remainingBalancePence: null,
            bookingId: response.bookingId,
            refNumber: response.refNumber,
            createdAtIso: new Date().toISOString(),
          };
        }

        if (choice === 'deposit') {
          const deposit = await api.post<DepositCheckoutResponse>(`/api/bookings/${response.bookingId}/deposit`, {
            mode: 'checkout',
          });
          if (deposit.checkoutUrl) {
            paymentLink = {
              kind: 'deposit',
              paymentUrl: deposit.checkoutUrl,
              amountPence: deposit.depositAmountPence,
              remainingBalancePence: deposit.remainingBalancePence,
              bookingId: response.bookingId,
              refNumber: response.refNumber,
              createdAtIso: new Date().toISOString(),
            };
          }
        }

        setResult(response);
        update({
          dispatchedRefNumber: response.refNumber,
          paymentChoice: choice,
          paymentLink,
          quote: response.breakdown
            ? {
                subtotal: response.breakdown.subtotal,
                vatAmount: response.breakdown.vatAmount,
                total: response.breakdown.total,
                lineItems: response.breakdown.lineItems,
                distanceKm: draft.quote.distanceKm,
              }
            : draft.quote,
        });
        onBookingCreated?.({
          response,
          paymentChoice: choice,
          effectiveTotal: (response.breakdown?.total ?? draft.quote.total) + lockingNutCharge,
          paymentLink,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setBusy(false);
        inflight.current = false;
      }
    },
    [draft, lockingNutCharge, onBookingCreated, update],
  );

  return { busy, error, result, setError, choosePaymentAndDispatch };
}
