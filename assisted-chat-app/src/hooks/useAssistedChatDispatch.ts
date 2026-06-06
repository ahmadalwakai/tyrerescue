import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  DepositCheckoutResponse,
  FinalizeResponse,
  StripePaymentLinkState,
} from '@/types/assisted-chat';

const LOCKING_NUT_REASON = 'Locking wheel nut removal';
const MANUAL_PRICE_REASON = 'Manual admin price override';

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

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
        // Build the admin adjustment so the backend stores the price the
        // operator actually decided. Manual override wins over locking nut
        // because the operator's typed value is already the final charge.
        const existingAdjustmentAmount = finiteAmount(draft.quote.adminAdjustmentAmount);
        const backendBaseTotal = Math.round((draft.quote.total - existingAdjustmentAmount) * 100) / 100;
        let adjustmentAmount = 0;
        let adjustmentReason: string | null = null;
        if (draft.manualPriceGbp != null && Number.isFinite(draft.manualPriceGbp)) {
          adjustmentAmount = Math.round((draft.manualPriceGbp - backendBaseTotal) * 100) / 100;
          adjustmentReason = MANUAL_PRICE_REASON;
        } else if (
          lockingNutCharge > 0 &&
          (
            draft.quote.adminAdjustmentReason !== LOCKING_NUT_REASON ||
            Math.round(existingAdjustmentAmount * 100) !== Math.round(lockingNutCharge * 100)
          )
        ) {
          adjustmentAmount = lockingNutCharge;
          adjustmentReason = LOCKING_NUT_REASON;
        }
        if (adjustmentReason !== null) {
          await api.patch(`/api/admin/quick-book/${draft.quickBookingId}`, {
            adminAdjustmentAmount: adjustmentAmount,
            adminAdjustmentReason: adjustmentReason,
            pricingContext: 'assisted_chat',
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
          dispatchedBookingId: response.bookingId,
          paymentChoice: choice,
          paymentLink,
          quote: response.breakdown
            ? {
                subtotal: response.breakdown.subtotal,
                vatAmount: response.breakdown.vatAmount,
                total: response.breakdown.total,
                lineItems: response.breakdown.lineItems,
                distanceKm: draft.quote.distanceKm,
                distanceMiles: response.breakdown.distanceMiles ?? draft.quote.distanceMiles ?? null,
                fittingPrice: response.breakdown.fittingPrice ?? draft.quote.fittingPrice ?? null,
                tyrePrice: response.breakdown.tyrePrice ?? draft.quote.tyrePrice ?? null,
                totalPrice: response.breakdown.totalPrice ?? draft.quote.totalPrice ?? null,
                adminAdjustmentAmount: response.breakdown.adminAdjustmentAmount ?? draft.quote.adminAdjustmentAmount ?? null,
                adminAdjustmentReason: response.breakdown.adminAdjustmentReason ?? draft.quote.adminAdjustmentReason ?? null,
              }
            : draft.quote,
        });
        const backendTotal = response.breakdown?.total ?? draft.quote.total;
        onBookingCreated?.({
          response,
          paymentChoice: choice,
          effectiveTotal: backendTotal,
          paymentLink,
        });
      } catch (err) {
        // Stale quick_booking — wipe the dead id so the operator can
        // re-price/dispatch from a fresh session. The dispatch step itself
        // does not auto-create a new booking because totals/breakdowns must
        // be recomputed via Get Price first.
        if (err instanceof ApiError && err.status === 404) {
          update({
            quickBookingId: null,
            savedQuoteId: null,
            savedQuoteRef: null,
            quote: null,
            priceNeedsRefresh: true,
            manualPriceGbp: null,
            paymentChoice: null,
            paymentLink: null,
            dispatchedRefNumber: null,
            dispatchedBookingId: null,
          });
          setError('This quick booking session expired. Tap Get Price to start a new one before dispatching.');
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        setBusy(false);
        inflight.current = false;
      }
    },
    [draft, lockingNutCharge, onBookingCreated, update],
  );

  return { busy, error, result, setError, choosePaymentAndDispatch };
}
