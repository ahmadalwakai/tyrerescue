import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type {
  AssistedChatDraft,
  AssistedChatQuoteBreakdown,
  QuickBookCreateResponse,
  QuickBookPatchResponse,
} from '@/types/assisted-chat';

const PLACEHOLDER_NAME = 'Walk-in customer';
const PLACEHOLDER_PHONE = '0000000000';
const QUOTE_STAGE_LABELS = ['Checking stock', 'Calculating price', 'Saving quote'] as const;
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

      const quote: AssistedChatQuoteBreakdown = {
        subtotal: breakdown.subtotal,
        vatAmount: breakdown.vatAmount,
        total: breakdown.total,
        lineItems: breakdown.lineItems,
        serviceOrigin: breakdown.serviceOrigin ?? null,
        distanceKm: distanceKm ? Number(distanceKm) : null,
      };

      update({
        quickBookingId,
        quote,
        priceNeedsRefresh: false,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
      });
    },
    [update],
  );

  const getPrice = useCallback(async () => {
    if (inflight.current) return;
    setError(null);

    if (!draft.tyre.size.trim()) {
      setError('Enter a tyre size before pricing.');
      return;
    }
    if (draft.tyre.quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    if (draft.lockingNut.answer === 'no') {
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
            locationMethod: draft.location.method,
            locationAddress: draft.location.address || undefined,
            locationLat: draft.location.lat,
            locationLng: draft.location.lng,
            serviceType: 'fit',
            tyreSize: draft.tyre.size.trim(),
            tyreCount: draft.tyre.quantity,
            notes: draft.note || undefined,
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
          locationLat: draft.location.lat,
          locationLng: draft.location.lng,
          locationAddress: draft.location.address || null,
          locationPostcode: draft.location.postcode || null,
          tyreSize: draft.tyre.size.trim(),
          tyreCount: draft.tyre.quantity,
          notes: draft.note || null,
          adminAdjustmentAmount: 0,
          adminAdjustmentReason: null,
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
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setStageIdx(-1);
      inflight.current = false;
    }
  }, [draft, applyQuote, runStagedDelay]);

  return {
    getPrice,
    loading,
    stageIdx,
    stageLabels: QUOTE_STAGE_LABELS,
    error,
    setError,
  };
}
