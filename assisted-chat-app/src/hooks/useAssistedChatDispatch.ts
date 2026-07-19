import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
  ASSISTED_CHAT_PRICING_CONTEXT,
} from '@/lib/pricing-context';
import {
  buildBookingTyreLinePayload,
  primaryBookingTyreLine,
  totalBookingTyreQuantity,
} from '@/lib/assisted-chat-workflow';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  AssistedChatQuoteBreakdown,
  DepositCheckoutResponse,
  FinalizeResponse,
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

function quoteFromQuickBookPatch(
  breakdown: QuickBookPatchResponse['booking']['priceBreakdown'],
  distanceKm: string | null,
): AssistedChatQuoteBreakdown {
  if (!breakdown) {
    throw new Error('Pricing engine returned no breakdown.');
  }

  const pricingDistanceMiles = breakdown.distanceMiles ?? breakdown.pricingDistanceMiles ?? null;
  const pricingDistanceKm =
    pricingDistanceMiles != null
      ? pricingDistanceMiles * 1.60934
      : distanceKm
      ? Number(distanceKm)
      : null;
  return {
    subtotal: breakdown.subtotal,
    vatAmount: breakdown.vatAmount,
    total: breakdown.total,
    lineItems: breakdown.lineItems,
    distanceKm: pricingDistanceKm,
    distanceMiles: pricingDistanceMiles,
    serviceDistanceMiles: breakdown.serviceDistanceMiles ?? null,
    pricingDistanceMiles,
    pricingDurationMinutes: breakdown.pricingDurationMinutes ?? null,
    garageDistanceMiles: breakdown.garageDistanceMiles ?? null,
    pricingDistanceSource: breakdown.pricingDistanceSource ?? null,
    distanceFloorApplied: breakdown.distanceFloorApplied ?? null,
    fittingPrice: breakdown.fittingPrice ?? null,
    tyrePrice: breakdown.tyrePrice ?? null,
    totalPrice: breakdown.totalPrice ?? null,
    tyreLines: breakdown.tyreLines ?? undefined,
    adminAdjustmentAmount: breakdown.adminAdjustmentAmount ?? null,
    adminAdjustmentReason: breakdown.adminAdjustmentReason ?? null,
    serviceOrigin: breakdown.serviceOrigin ?? null,
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
      if (inflight.current) return false;
      setError(null);
      setResult(null);
      if (!draft.quickBookingId || !draft.quote) {
        setError('Generate a price first.');
        return false;
      }
      // التحقق من البريد الإلكتروني إذا طُلب إرسال تأكيد للعميل
      if (draft.customerEmailMode === 'send_customer_confirmation' && !draft.customer.email.trim()) {
        setError('Enter a valid customer email before sending confirmation.');
        return false;
      }

      inflight.current = true;
      setBusy(true);
      update({ paymentChoice: choice });

      try {
        let canonicalQuote = draft.quote;

        // Build the admin adjustment so the backend stores the price the
        // operator actually decided. Manual override wins over locking nut
        // because the operator's typed value is already the final charge.
        const existingAdjustmentAmount = finiteAmount(draft.quote.adminAdjustmentAmount);
        const backendBaseTotal = Math.round((draft.quote.total - existingAdjustmentAmount) * 100) / 100;
        let adjustmentAmount = 0;
        let adjustmentReason: string | null = null;
        const serviceType = draft.serviceType ?? 'fit';
        const isInspectionOnly = serviceType === 'assess';
        if (draft.manualPriceGbp != null && Number.isFinite(draft.manualPriceGbp)) {
          adjustmentAmount = Math.round((draft.manualPriceGbp - backendBaseTotal) * 100) / 100;
          adjustmentReason = MANUAL_PRICE_REASON;
        } else if (
          !isInspectionOnly &&
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
        const tyreLines = isInspectionOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines);
        const customerName = draft.customer.name.trim();
        const customerPhone = draft.customer.phone.trim();
        const customerEmail = draft.customer.email.trim();

        // Always sync the quick-book row before finalize. This clears stale
        // hidden admin adjustments that can survive a page reload and make
        // Stripe see a different amount than the operator sees.
        const patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${draft.quickBookingId}`, {
          ...(customerName ? { customerName } : {}),
          ...(customerPhone ? { customerPhone } : {}),
          customerEmail,
          locationAddress: draft.location.address || null,
          locationPostcode: draft.location.postcode || null,
          serviceType,
          tyreSize: isInspectionOnly ? null : primaryTyre.size,
          tyreCount: isInspectionOnly
            ? 1
            : totalBookingTyreQuantity(draft.tyreLines) || primaryTyre.quantity,
          tyreLines,
          items: tyreLines,
          adminAdjustmentAmount: adjustmentAmount,
          adminAdjustmentReason: adjustmentReason,
          pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
          adminDistanceLimitMiles: ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
        });
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
        const response = await api.post<FinalizeResponse>(`/api/admin/quick-book/${draft.quickBookingId}/finalize`, {
          paymentMethod,
          customerEmailMode: draft.customerEmailMode,
          tyreLines,
          items: tyreLines,
          ...(choice === 'deposit' ? { depositPercent: DEPOSIT_PERCENT } : {}),
        });

        let paymentLink: StripePaymentLinkState | null = null;
        if (choice === 'full' && response.paymentUrl) {
          paymentLink = {
            kind: 'full',
            paymentUrl: response.paymentUrl,
            amountPence: Math.round((response.breakdown?.total ?? canonicalQuote.total) * 100),
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
              }
            : canonicalQuote,
        });
        const backendTotal = response.breakdown?.total ?? canonicalQuote.total;
        onBookingCreated?.({
          response,
          paymentChoice: choice,
          effectiveTotal: backendTotal,
          paymentLink,
        });
        return true;
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
        return false;
      } finally {
        setBusy(false);
        inflight.current = false;
      }
    },
    [draft, lockingNutCharge, onBookingCreated, update],
  );

  return { busy, error, result, setError, choosePaymentAndDispatch };
}
