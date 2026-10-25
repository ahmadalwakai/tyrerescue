import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, getApiContextRevision } from '@/lib/api';
import {
  ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
  ASSISTED_CHAT_PRICING_CONTEXT,
} from '@/lib/pricing-context';
import {
  buildAssistedChatVehiclePayload,
  buildBookingTyreLinePayload,
  isAssistedChatServiceOnly,
  primaryBookingTyreLine,
  quoteFromQuickBookPatch,
  totalBookingTyreQuantity,
} from '@/lib/assisted-chat-workflow';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  DepositCheckoutResponse,
  FinalizeResponse,
  AssistedChatQuoteBreakdown,
  QuickBookFinalizeRecoveryResponse,
  QuickBookPatchResponse,
  StripePaymentLinkState,
} from '@/types/assisted-chat';

const LOCKING_NUT_REASON = 'Locking wheel nut removal';
const MANUAL_PRICE_REASON = 'Manual admin price override';
const MIN_STRIPE_PAYMENT_LINK_GBP = 0.30;
const DEPOSIT_PERCENT = 0.20;

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function paymentChoiceFor(response: FinalizeResponse): AssistedChatPaymentChoice {
  return response.paymentMethod === 'cash' ? 'cash' : response.paymentMethod === 'deposit' ? 'deposit' : 'full';
}

function confirmedQuote(response: FinalizeResponse, canonicalQuote: AssistedChatQuoteBreakdown): AssistedChatQuoteBreakdown {
  if (!response.breakdown) return canonicalQuote;
  return {
    subtotal: response.breakdown.subtotal,
    vatAmount: response.breakdown.vatAmount,
    total: response.breakdown.total,
    lineItems: response.breakdown.lineItems,
    distanceKm: canonicalQuote.distanceKm,
    distanceMiles: response.breakdown.distanceMiles ?? canonicalQuote.distanceMiles ?? null,
    serviceDistanceMiles: response.breakdown.serviceDistanceMiles ?? canonicalQuote.serviceDistanceMiles ?? null,
    pricingDistanceMiles:
      response.breakdown.pricingDistanceMiles ??
      response.breakdown.distanceMiles ??
      canonicalQuote.pricingDistanceMiles ??
      canonicalQuote.distanceMiles ??
      null,
    pricingDurationMinutes: response.breakdown.pricingDurationMinutes ?? canonicalQuote.pricingDurationMinutes ?? null,
    garageDistanceMiles: response.breakdown.garageDistanceMiles ?? canonicalQuote.garageDistanceMiles ?? null,
    pricingDistanceSource: response.breakdown.pricingDistanceSource ?? canonicalQuote.pricingDistanceSource ?? null,
    distanceFloorApplied: response.breakdown.distanceFloorApplied ?? canonicalQuote.distanceFloorApplied ?? null,
    fittingPrice: response.breakdown.fittingPrice ?? canonicalQuote.fittingPrice ?? null,
    tyrePrice: response.breakdown.tyrePrice ?? canonicalQuote.tyrePrice ?? null,
    totalPrice: response.breakdown.totalPrice ?? canonicalQuote.totalPrice ?? null,
    tyreLines: response.breakdown.tyreLines ?? canonicalQuote.tyreLines ?? undefined,
    adminAdjustmentAmount: response.breakdown.adminAdjustmentAmount ?? canonicalQuote.adminAdjustmentAmount ?? null,
    adminAdjustmentReason: response.breakdown.adminAdjustmentReason ?? canonicalQuote.adminAdjustmentReason ?? null,
    serviceOrigin: response.breakdown.serviceOrigin ?? canonicalQuote.serviceOrigin ?? null,
  };
}

async function checkoutForConfirmedBooking(response: FinalizeResponse, quickBookingId: string): Promise<StripePaymentLinkState | null> {
  const choice = paymentChoiceFor(response);
  if (choice === 'cash') return null;
  if (choice === 'deposit') {
    const deposit = await api.post<DepositCheckoutResponse>(`/api/bookings/${encodeURIComponent(response.bookingId)}/deposit`, { mode: 'checkout' });
    if (!deposit.checkoutUrl) throw new Error('Stripe did not return a deposit payment link.');
    return {
      kind: 'deposit', paymentUrl: deposit.checkoutUrl,
      amountPence: deposit.depositAmountPence, remainingBalancePence: deposit.remainingBalancePence,
      bookingId: response.bookingId, refNumber: response.refNumber, createdAtIso: new Date().toISOString(),
    };
  }
  const checkout = response.paymentUrl ? null : await api.post<{ checkoutUrl: string | null }>(
    `/api/admin/quick-book/${encodeURIComponent(quickBookingId)}/checkout-session`, {},
  );
  const paymentUrl = response.paymentUrl ?? checkout?.checkoutUrl;
  if (!paymentUrl) throw new Error('Stripe did not return a payment link.');
  return {
    kind: 'full', paymentUrl,
    amountPence: Math.round((response.breakdown?.total ?? 0) * 100), remainingBalancePence: null,
    bookingId: response.bookingId, refNumber: response.refNumber, createdAtIso: new Date().toISOString(),
  };
}

export interface UseAssistedChatDispatchArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  lockingNutCharge: number;
  /**
   * Called once per successful finalize, AFTER the server confirms the real
   * booking and we've stored its `refNumber` on the draft. Use this to
   * append to local history, fire analytics, etc. Never called on
   * validation error or duplicate-tap. A confirmed booking is recorded even if
   * creating its subsequent payment link fails.
   */
  onBookingCreated?: (args: {
    response: FinalizeResponse;
    paymentChoice: AssistedChatPaymentChoice;
    effectiveTotal: number;
    paymentLink: StripePaymentLinkState | null;
  }) => void;
}

// Reuses the existing PATCH (for adminAdjustmentAmount) + POST /finalize flow.
// The explicit review confirmation calls this finalizer. Payment option cards
// only update the local choice; finalize creates the booking and transitions
// the quick_booking to dispatched.
export function useAssistedChatDispatch({
  draft,
  update,
  lockingNutCharge,
  onBookingCreated,
}: UseAssistedChatDispatchArgs) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResponse | null>(null);
  const [paymentBlockedBookingId, setPaymentBlockedBookingId] = useState<string | null>(null);
  const inflight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const confirmed = useRef<{ quickBookingId: string; response: FinalizeResponse } | null>(null);
  const notifiedBookings = useRef(new Set<string>());

  const runDispatch = useCallback(
    async (choice: AssistedChatPaymentChoice | null, recoveryOnly: boolean) => {
      if (!mounted.current || inflight.current) return false;
      setError(null);
      if (!recoveryOnly && (draft.dispatchedRefNumber || draft.dispatchedBookingId || draft.paymentLink || confirmed.current?.quickBookingId === draft.quickBookingId)) {
        setError('This booking is already created. Retry its payment link or open it from Bookings.');
        return false;
      }
      if (!draft.quickBookingId || !draft.quote) {
        setError('Generate a price first.');
        return false;
      }
      if (!recoveryOnly && draft.customerEmailMode === 'send_customer_confirmation' && !draft.customer.email.trim()) {
        setError('Enter a valid customer email before sending confirmation.');
        return false;
      }
      const quickBookingId = draft.quickBookingId;
      const revision = getApiContextRevision();
      const isCurrent = () => mounted.current && getApiContextRevision() === revision && latestDraft.current.quickBookingId === quickBookingId;
      const recover = async () => {
        try {
          return await api.get<QuickBookFinalizeRecoveryResponse>(`/api/admin/quick-book/${encodeURIComponent(quickBookingId)}/finalize`);
        } catch (readError) {
          if (readError instanceof ApiError && readError.status === 404 && !(readError.details as { code?: unknown } | undefined)?.code) {
            throw new Error('Payment recovery needs a server update. Your draft is saved; retry after the server is updated.');
          }
          throw readError;
        }
      };
      const confirmation = {
        response: null as FinalizeResponse | null,
        paymentLink: null as StripePaymentLinkState | null,
        total: draft.quote.total,
        partialBookingId: null as string | null,
        paymentBlocked: false,
      };
      const finishConfirmed = async (response: FinalizeResponse, canCollectPayment: boolean, quote: AssistedChatQuoteBreakdown) => {
        if (!isCurrent()) return false;
        const canonicalQuote = confirmedQuote(response, quote);
        const canonicalChoice = paymentChoiceFor(response);
        confirmation.response = response;
        confirmation.total = canonicalQuote.total;
        confirmed.current = { quickBookingId, response };
        setResult(response);
        // Store the server identity BEFORE the second network request. A failed
        // deposit checkout must never send the operator back to finalization.
        update({
          dispatchedRefNumber: response.refNumber, dispatchedBookingId: response.bookingId,
          paymentChoice: canonicalChoice, paymentLink: null, quote: canonicalQuote,
          priceNeedsRefresh: false, manualPriceGbp: null,
        });
        if (canonicalChoice !== 'cash' && !canCollectPayment) {
          confirmation.paymentBlocked = true;
          setPaymentBlockedBookingId(response.bookingId);
          throw new Error('This booking already has a confirmed payment or is no longer payable. Open it from Bookings to review its payment status.');
        }
        setPaymentBlockedBookingId(null);
        confirmation.paymentLink = await checkoutForConfirmedBooking({ ...response, breakdown: response.breakdown ?? canonicalQuote }, quickBookingId);
        if (!isCurrent()) return false;
        if (confirmation.paymentLink) update({ paymentLink: confirmation.paymentLink });
        return true;
      };

      const recoverAfterWriteFailure = async (writeError: unknown, canonicalQuote: AssistedChatQuoteBreakdown) => {
        if (!isCurrent()) return false;
        if (writeError instanceof ApiError && writeError.status === 409) {
          const details = writeError.details as { bookingId?: unknown } | undefined;
          if (typeof details?.bookingId === 'string' && details.bookingId) {
            // Keep even the partial server identity if the follow-up read is offline.
            confirmation.partialBookingId = details.bookingId;
            update({ dispatchedBookingId: details.bookingId, paymentChoice: null, paymentLink: null });
          }
        }
        const recovered = await recover();
        if (!isCurrent()) return false;
        if (!recovered.finalized) throw writeError;
        return await finishConfirmed(recovered.response, recovered.canCollectPayment, canonicalQuote);
      };

      inflight.current = true;
      setBusy(true);
      try {
        // Always read first: after a restart or lost finalize response, PATCH
        // must not reprice an existing booking or mutate reserved stock.
        const recovered = await recover();
        if (!isCurrent()) return false;
        if (recovered.finalized) {
          return await finishConfirmed(recovered.response, recovered.canCollectPayment, draft.quote);
        }
        if (recoveryOnly) {
          throw new Error('The existing booking could not be confirmed. Open Bookings before retrying.');
        }
        if (!choice) throw new Error('Choose a payment method before dispatching.');
        update({ paymentChoice: choice });
        let canonicalQuote = draft.quote;

        // Build the admin adjustment so the backend stores the price the
        // operator actually decided. Manual override wins over locking nut
        // because the operator's typed value is already the final charge.
        const existingAdjustmentAmount = finiteAmount(draft.quote.adminAdjustmentAmount);
        const backendBaseTotal = Math.round((draft.quote.total - existingAdjustmentAmount) * 100) / 100;
        let adjustmentAmount = 0;
        let adjustmentReason: string | null = null;
        const serviceType = draft.serviceType ?? 'fit';
        const isServiceOnly = isAssistedChatServiceOnly(serviceType);
        if (draft.manualPriceGbp != null && Number.isFinite(draft.manualPriceGbp)) {
          adjustmentAmount = Math.round((draft.manualPriceGbp - backendBaseTotal) * 100) / 100;
          adjustmentReason = MANUAL_PRICE_REASON;
        } else if (
          !isServiceOnly &&
          lockingNutCharge > 0 &&
          (
            draft.quote.adminAdjustmentReason !== LOCKING_NUT_REASON ||
            Math.round(existingAdjustmentAmount * 100) !== Math.round(lockingNutCharge * 100)
          )
        ) {
          adjustmentAmount = lockingNutCharge;
          adjustmentReason = LOCKING_NUT_REASON;
        }
        const primaryTyre = primaryBookingTyreLine(draft);
        const tyreLines = isServiceOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines);
        const customerName = draft.customer.name.trim();
        const customerPhone = draft.customer.phone.trim();
        const customerEmail = draft.customer.email.trim();
        const vehicle = buildAssistedChatVehiclePayload(draft);

        // Always sync the quick-book row before finalize. This clears stale
        // hidden admin adjustments that can survive a page reload and make
        // Stripe see a different amount than the operator sees.
        let patched: QuickBookPatchResponse;
        try {
          patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${draft.quickBookingId}`, {
            ...(customerName ? { customerName } : {}),
            ...(customerPhone ? { customerPhone } : {}),
            customerEmail,
            locationAddress: draft.location.address || null,
            locationPostcode: draft.location.postcode || null,
            serviceType,
            tyreSize: isServiceOnly ? null : primaryTyre.size,
            tyreCount: isServiceOnly
              ? 1
              : totalBookingTyreQuantity(draft.tyreLines) || primaryTyre.quantity,
            tyreLines,
            items: tyreLines,
            vehicle,
            adminAdjustmentAmount: adjustmentAmount,
            adminAdjustmentReason: adjustmentReason,
            pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
            adminDistanceLimitMiles: ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
          });
        } catch (patchError) {
          if (patchError instanceof ApiError && patchError.status === 409) {
            return await recoverAfterWriteFailure(patchError, canonicalQuote);
          }
          throw patchError;
        }
        if (!isCurrent()) return false;
        canonicalQuote = quoteFromQuickBookPatch(patched.booking.priceBreakdown, patched.booking.distanceKm);
        update({ quote: canonicalQuote, priceNeedsRefresh: false });

        const payableTotal = canonicalQuote.total;
        const stripeCharge = choice === 'deposit' ? payableTotal * DEPOSIT_PERCENT : payableTotal;
        if (
          (choice === 'full' || choice === 'deposit') &&
          (!Number.isFinite(stripeCharge) || stripeCharge < MIN_STRIPE_PAYMENT_LINK_GBP)
        ) {
          const paymentLabel = choice === 'deposit' ? 'Deposit payment link' : 'Payment link';
          setError(
            `${paymentLabel} cannot be sent for £${stripeCharge.toFixed(2)}. Stripe minimum is £${MIN_STRIPE_PAYMENT_LINK_GBP.toFixed(2)}. Edit the quote price or choose cash.`,
          );
          return false;
        }

        const paymentMethod = choice === 'cash' ? 'cash' : choice === 'deposit' ? 'deposit' : 'stripe';
        let response: FinalizeResponse;
        try {
          response = await api.post<FinalizeResponse>(`/api/admin/quick-book/${draft.quickBookingId}/finalize`, {
            paymentMethod,
            customerEmailMode: draft.customerEmailMode,
            tyreLines,
            items: tyreLines,
            ...(choice === 'deposit' ? { depositPercent: DEPOSIT_PERCENT } : {}),
          });
        } catch (finalizeError) {
          if (!isCurrent()) return false;
          return await recoverAfterWriteFailure(finalizeError, canonicalQuote);
        }
        if (!isCurrent()) return false;
        return await finishConfirmed(response, true, canonicalQuote);
      } catch (err) {
        if (!isCurrent()) return false;
        const message = err instanceof Error ? err.message : 'Unknown error';
        const bookingId = confirmation.response?.bookingId ?? confirmation.partialBookingId ?? latestDraft.current.dispatchedBookingId;
        const reference = confirmation.response?.refNumber ?? latestDraft.current.dispatchedRefNumber;
        if (confirmation.paymentBlocked) {
          setError(`Booking ${reference ?? 'already created'} is saved. ${message}`);
        } else if (bookingId) {
          setError(`Booking ${reference ?? 'already created'} is saved. Payment link is not ready: ${message} Retry the payment link for this booking; do not create another booking.`);
        } else {
          // A missing deposit/checkout endpoint never erases a confirmed booking.
          // Even an uncertain finalize keeps the same quick-book ID for recovery.
          setError(message);
        }
        return false;
      } finally {
        try {
          if (confirmation.response && isCurrent() && !notifiedBookings.current.has(confirmation.response.bookingId)) {
            notifiedBookings.current.add(confirmation.response.bookingId);
            onBookingCreated?.({ response: confirmation.response, paymentChoice: paymentChoiceFor(confirmation.response), effectiveTotal: confirmation.total, paymentLink: confirmation.paymentLink });
          }
        } finally {
          if (mounted.current) setBusy(false);
          inflight.current = false;
        }
      }
    },
    [draft, lockingNutCharge, onBookingCreated, update],
  );

  const choosePaymentAndDispatch = useCallback(
    (choice: AssistedChatPaymentChoice) => runDispatch(choice, false), [runDispatch],
  );
  const retryPaymentLink = useCallback(
    () => runDispatch(draft.paymentChoice, true), [draft.paymentChoice, runDispatch],
  );
  const canRetryPaymentLink = Boolean(
    (draft.dispatchedBookingId || draft.dispatchedRefNumber) &&
    (!paymentBlockedBookingId || paymentBlockedBookingId !== draft.dispatchedBookingId) &&
    !draft.paymentLink && draft.paymentChoice !== 'cash',
  );

  return { busy, error, result, setError, choosePaymentAndDispatch, retryPaymentLink, canRetryPaymentLink };
}
