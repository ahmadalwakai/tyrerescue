import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  buildBookingTyreLinePayload,
  primaryBookingTyreLine,
  totalBookingTyreQuantity,
  validateBookingTyreLines,
} from '@/lib/assisted-chat-workflow';
import {
  ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
  ASSISTED_CHAT_PRICING_CONTEXT,
} from '@/lib/pricing-context';
import type {
  AssistedChatDraft,
  AssistedChatQuoteBreakdown,
  QuickBookCreateResponse,
  QuickBookPatchResponse,
} from '@/types/assisted-chat';

const PLACEHOLDER_NAME = 'Walk-in customer';
const PLACEHOLDER_PHONE = '0000000000';
const LOCKING_NUT_REASON = 'Locking wheel nut removal';
const QUOTE_STAGE_LABELS = ['Checking details', 'Calculating price', 'Saving quote'] as const;
const QUOTE_STAGE_MS = 450;

export interface UseAssistedChatPriceArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

export function useAssistedChatPrice({ draft, update }: UseAssistedChatPriceArgs) {
  const [loading, setLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const runStagedDelay = useCallback(() => {
    return new Promise<void>((resolve) => {
      let stage = 0;
      setStageIdx(0);
      const tick = () => {
        stage += 1;
        if (stage >= QUOTE_STAGE_LABELS.length) {
          resolve();
          return;
        }
        setStageIdx(stage);
        setTimeout(tick, QUOTE_STAGE_MS);
      };
      setTimeout(tick, QUOTE_STAGE_MS);
    });
  }, []);

  const applyQuote = useCallback(
    (
      quickBookingId: string,
      breakdown: QuickBookCreateResponse['booking']['priceBreakdown'],
      distanceKm: string | null,
    ) => {
      if (!breakdown) {
        setError('Pricing engine returned no breakdown.');
        return;
      }

      const pricingDistanceMiles = breakdown.distanceMiles ?? breakdown.pricingDistanceMiles ?? null;
      const pricingDistanceKm =
        pricingDistanceMiles != null
          ? pricingDistanceMiles * 1.60934
          : distanceKm
          ? Number(distanceKm)
          : null;
      const quote: AssistedChatQuoteBreakdown = {
        subtotal: breakdown.subtotal,
        vatAmount: breakdown.vatAmount,
        total: breakdown.total,
        lineItems: breakdown.lineItems,
        serviceOrigin: breakdown.serviceOrigin ?? null,
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
        tyreLines: breakdown.tyreLines ?? buildBookingTyreLinePayload(draft.tyreLines),
        adminAdjustmentAmount: breakdown.adminAdjustmentAmount ?? null,
        adminAdjustmentReason: breakdown.adminAdjustmentReason ?? null,
      };

      // Note: `manualPriceGbp` is deliberately preserved across re-pricing.
      // Only EditQuotePriceModal (or a 404 reset) can change/clear it; the
      // operator's typed final price must survive a fresh engine recalc.
      update({
        quickBookingId,
        savedQuoteId: null,
        savedQuoteRef: null,
        quote,
        priceNeedsRefresh: false,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
    },
    [draft.tyreLines, update],
  );

  const getPrice = useCallback(async () => {
    if (inflight.current) return;
    setError(null);

    const serviceType = draft.serviceType ?? 'fit';
    const isInspectionOnly = serviceType === 'assess';
    const tyreError = isInspectionOnly ? null : validateBookingTyreLines(draft.tyreLines);
    if (tyreError) {
      setError(tyreError);
      return;
    }
    const primaryTyre = primaryBookingTyreLine(draft);
    const tyreLines = isInspectionOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines);
    const totalTyreCount = isInspectionOnly ? 1 : totalBookingTyreQuantity(draft.tyreLines) || primaryTyre.quantity;
    if (!isInspectionOnly && draft.lockingNut.answer === 'no') {
      const charge = draft.lockingNut.chargeGbp;
      if (charge == null || !Number.isFinite(charge) || charge < 0) {
        setError('Enter a valid GBP amount for the locking wheel nut removal charge.');
        return;
      }
    }
    if (draft.location.lat == null || draft.location.lng == null) {
      setError(
        draft.location.method === 'link'
          ? 'Wait for the customer to share their location before pricing.'
          : 'Select the customer address from the suggestions before pricing.',
      );
      return;
    }

    const lockingNutCharge =
      !isInspectionOnly && draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null
        ? draft.lockingNut.chargeGbp
        : 0;
    const adjustmentPayload =
      lockingNutCharge > 0
        ? {
            adminAdjustmentAmount: lockingNutCharge,
            adminAdjustmentReason: LOCKING_NUT_REASON,
          }
        : {
            adminAdjustmentAmount: 0,
            adminAdjustmentReason: null,
          };

    inflight.current = true;
    setLoading(true);
    setStageIdx(0);

    try {
      const apiCall = (async () => {
        if (!draft.quickBookingId) {
          const created = await api.post<QuickBookCreateResponse>('/api/admin/quick-book', {
            customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
            customerPhone: draft.customer.phone.trim() || PLACEHOLDER_PHONE,
            customerEmail: draft.customer.email.trim() || undefined,
            customerEmailMode: draft.customerEmailMode,
            locationMethod: draft.location.method,
            locationAddress: draft.location.address || undefined,
            locationLat: draft.location.lat,
            locationLng: draft.location.lng,
            serviceType,
            tyreSize: isInspectionOnly ? undefined : primaryTyre.size,
            tyreCount: totalTyreCount,
            tyreLines,
            items: tyreLines,
            ...adjustmentPayload,
            pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
            adminDistanceLimitMiles: ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
            notes: draft.note || undefined,
            virtualLandlineInteractionId: draft.virtualLandlineInteractionId ?? undefined,
          });
          return {
            quickBookingId: created.booking.id,
            breakdown: created.booking.priceBreakdown,
            distanceKm: created.booking.distanceKm,
          };
        }

        const patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${draft.quickBookingId}`, {
          customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
          customerPhone: draft.customer.phone.trim() || PLACEHOLDER_PHONE,
          customerEmail: draft.customer.email.trim() || '',
          locationLat: draft.location.lat,
          locationLng: draft.location.lng,
          locationAddress: draft.location.address || null,
          locationPostcode: draft.location.postcode || null,
          serviceType,
          tyreSize: isInspectionOnly ? null : primaryTyre.size,
          tyreCount: totalTyreCount,
          tyreLines,
          items: tyreLines,
          notes: draft.note || null,
          ...adjustmentPayload,
          pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
          adminDistanceLimitMiles: ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
        });
        return {
          quickBookingId: draft.quickBookingId,
          breakdown: patched.booking.priceBreakdown,
          distanceKm: patched.booking.distanceKm,
        };
      })();

      const [result] = await Promise.all([apiCall, runStagedDelay()]);
      applyQuote(result.quickBookingId, result.breakdown, result.distanceKm);
    } catch (err) {
      // Stale quick_booking row (deleted by another admin, expired cleanup,
      // or wiped DB in dev) — clear the saved id so the next press creates
      // a fresh one. Never crash, never loop.
      if (err instanceof ApiError && err.status === 404 && draft.quickBookingId) {
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
        setError('This quick booking session expired. Tap Get Price again to start a new one.');
      } else if (err instanceof ApiError && err.status === 422) {
        update({
          quote: null,
          priceNeedsRefresh: true,
          paymentChoice: null,
          paymentLink: null,
          dispatchedRefNumber: null,
          dispatchedBookingId: null,
        });
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
      setStageIdx(-1);
      inflight.current = false;
    }
  }, [draft, applyQuote, runStagedDelay, update]);

  return {
    getPrice,
    loading,
    stageIdx,
    stageLabels: QUOTE_STAGE_LABELS,
    error,
    setError,
  };
}
