import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { normalizeAssistedChatTyreSize } from '@/lib/assisted-chat-workflow';
import { ASSISTED_CHAT_PRICING_CONTEXT } from '@/lib/pricing-context';
import type {
  AssistedChatDraft,
  AssistedChatLocationMethod,
  AssistedChatQuoteBreakdown,
  QuickBookCreateResponse,
  QuickBookGetResponse,
  SendLinkResponse,
} from '@/types/assisted-chat';

const PLACEHOLDER_NAME = 'Walk-in customer';
const PLACEHOLDER_PHONE = '0000000000';

export type LocationShareMethod = 'copy' | 'whatsapp' | 'sms' | 'email';

export interface LocationShareMessage {
  kind: 'ok' | 'err' | 'info' | 'warn';
  text: string;
}

export interface LocationShareProgress {
  isPolling: boolean;
  lastPollAt: number | null;
  lastPollingError: string | null;
  staleReason: string | null;
}

interface UseAssistedChatLocationShareArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

function quoteFromBooking(booking: QuickBookCreateResponse['booking']): AssistedChatQuoteBreakdown | null {
  if (!booking.priceBreakdown) return null;
  return {
    subtotal: booking.priceBreakdown.subtotal,
    vatAmount: booking.priceBreakdown.vatAmount,
    total: booking.priceBreakdown.total,
    lineItems: booking.priceBreakdown.lineItems,
    serviceOrigin: booking.priceBreakdown.serviceOrigin ?? null,
    distanceKm: booking.distanceKm ? Number(booking.distanceKm) : null,
    distanceMiles: booking.priceBreakdown.distanceMiles ?? null,
    fittingPrice: booking.priceBreakdown.fittingPrice ?? null,
    tyrePrice: booking.priceBreakdown.tyrePrice ?? null,
    totalPrice: booking.priceBreakdown.totalPrice ?? null,
  };
}

export function useAssistedChatLocationShare({ draft, update }: UseAssistedChatLocationShareArgs) {
  const [busy, setBusy] = useState<LocationShareMethod | null>(null);
  const [message, setMessage] = useState<LocationShareMessage | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const [lastPollingError, setLastPollingError] = useState<string | null>(null);
  const [staleReason, setStaleReason] = useState<string | null>(null);

  const applyBooking = useCallback(
    (booking: QuickBookCreateResponse['booking'], extra?: Partial<AssistedChatDraft['location']>) => {
      const lat = booking.locationLat ? Number(booking.locationLat) : null;
      const lng = booking.locationLng ? Number(booking.locationLng) : null;
      const quote = quoteFromBooking(booking);
      update({
        quickBookingId: booking.id,
        location: {
          ...draft.location,
          ...extra,
          address: booking.locationAddress ?? extra?.address ?? draft.location.address,
          lat,
          lng,
          postcode: booking.locationPostcode ?? extra?.postcode ?? draft.location.postcode,
          status: lat != null && lng != null ? 'received' : extra?.status ?? draft.location.status,
        },
        quote: quote ?? draft.quote,
        priceNeedsRefresh: false,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
    },
    [draft.location, draft.quote, update],
  );

  const ensureQuickBooking = useCallback(
    async (method: AssistedChatLocationMethod): Promise<{ id: string; locationLink: string | null; whatsappLink: string | null }> => {
      if (draft.quickBookingId) {
        return {
          id: draft.quickBookingId,
          locationLink: draft.location.link,
          whatsappLink: draft.location.whatsappLink,
        };
      }
      const created = await api.post<QuickBookCreateResponse>('/api/admin/quick-book', {
        customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
        customerPhone: draft.customer.phone.trim() || PLACEHOLDER_PHONE,
        customerEmail: draft.customer.email.trim() || undefined,
        locationMethod: method,
        locationAddress: method === 'address' ? draft.location.address : undefined,
        locationLat: method === 'address' && draft.location.lat != null ? draft.location.lat : undefined,
        locationLng: method === 'address' && draft.location.lng != null ? draft.location.lng : undefined,
        serviceType: 'fit',
        tyreSize: normalizeAssistedChatTyreSize(draft.tyre.size) ?? undefined,
        tyreCount: draft.tyre.quantity,
        pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
        notes: draft.note || undefined,
      });
      applyBooking(created.booking, {
        method,
        link: created.locationLink,
        whatsappLink: created.whatsappLink,
        status: method === 'link' ? 'pending' : created.booking.locationLat ? 'received' : 'idle',
      });
      return {
        id: created.booking.id,
        locationLink: created.locationLink,
        whatsappLink: created.whatsappLink,
      };
    },
    [applyBooking, draft],
  );

  const requestLink = useCallback(
    async (method: LocationShareMethod) => {
      setMessage(null);
      setLastPollingError(null);
      setStaleReason(null);
      setBusy(method);
      try {
        const ensured = await ensureQuickBooking('link');
        const result = await api.post<SendLinkResponse>('/api/admin/quick-book/send-link', {
          quickBookingId: ensured.id,
          method,
        });
        if (!result.ok && result.error) {
          setMessage({ kind: 'err', text: result.error });
          return;
        }

        const rawLocationLink = method === 'copy' ? result.link ?? ensured.locationLink : ensured.locationLink;
        const whatsappLink = method === 'whatsapp' ? result.link ?? ensured.whatsappLink : ensured.whatsappLink;
        update({
          location: {
            ...draft.location,
            method: 'link',
            link: rawLocationLink,
            whatsappLink,
            status: 'pending',
          },
          ...(draft.quote || draft.priceNeedsRefresh
            ? { quote: null, priceNeedsRefresh: true, paymentChoice: null, paymentLink: null, dispatchedRefNumber: null, dispatchedBookingId: null }
            : {}),
        });

        const linkToCopy = rawLocationLink ?? result.link ?? '';
        if (method === 'copy') {
          const ok = await copyToClipboard(result.message ?? result.link ?? '');
          setMessage({ kind: ok ? 'ok' : 'err', text: ok ? 'Location message copied.' : 'Could not copy location message.' });
        } else if (method === 'whatsapp' && result.link) {
          const copied = linkToCopy ? await copyToClipboard(linkToCopy) : false;
          await Linking.openURL(result.link);
          setMessage({ kind: 'ok', text: copied ? 'WhatsApp opened and link copied.' : 'WhatsApp opened.' });
        } else if (method === 'sms') {
          const copied = linkToCopy ? await copyToClipboard(linkToCopy) : false;
          setMessage({ kind: 'ok', text: copied ? `${result.message ?? 'SMS sent successfully.'} Link copied.` : result.message ?? 'SMS sent successfully.' });
        } else if (method === 'email') {
          const copied = linkToCopy ? await copyToClipboard(linkToCopy) : false;
          setMessage({ kind: 'ok', text: copied ? `${result.message ?? 'Email sent successfully.'} Link copied.` : result.message ?? 'Email sent successfully.' });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setIsPolling(false);
          setStaleReason('Request expired or no longer available.');
          update({
            quickBookingId: null,
            location: {
              ...draft.location,
              link: null,
              whatsappLink: null,
              status: 'idle',
            },
            savedQuoteId: null,
            savedQuoteRef: null,
            quote: null,
            priceNeedsRefresh: false,
            paymentChoice: null,
            paymentLink: null,
            dispatchedRefNumber: null,
            dispatchedBookingId: null,
          });
          setMessage({
            kind: 'err',
            text: 'This quick booking session expired. Tap the action again to start a new one.',
          });
        } else {
          setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Location link action failed.' });
        }
      } finally {
        setBusy(null);
      }
    },
    [draft.location, draft.priceNeedsRefresh, draft.quote, ensureQuickBooking, update],
  );

  useEffect(() => {
    if (draft.location.method !== 'link' || draft.location.status !== 'pending' || !draft.quickBookingId) {
      setIsPolling(false);
      return;
    }
    let cancelled = false;
    setIsPolling(true);
    setLastPollingError(null);
    const interval = setInterval(async () => {
      setLastPollAt(Date.now());
      try {
        const data = await api.get<QuickBookGetResponse>(`/api/admin/quick-book/${draft.quickBookingId}`);
        if (cancelled) return;
        if (data.booking.locationLat && data.booking.locationLng) {
          setIsPolling(false);
          setLastPollingError(null);
          setStaleReason(null);
          applyBooking(data.booking, { method: 'link' });
          setMessage({ kind: 'ok', text: 'Location shared by customer.' });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          if (cancelled) return;
          clearInterval(interval);
          setIsPolling(false);
          setStaleReason('Request expired or no longer available.');
          update({
            quickBookingId: null,
            location: {
              ...draft.location,
              link: null,
              whatsappLink: null,
              status: 'idle',
            },
            savedQuoteId: null,
            savedQuoteRef: null,
            quote: null,
            priceNeedsRefresh: false,
            paymentChoice: null,
            paymentLink: null,
            dispatchedRefNumber: null,
            dispatchedBookingId: null,
          });
          setMessage({
            kind: 'err',
            text: 'This quick booking session expired. Send a new location link.',
          });
        } else {
          setLastPollingError('Could not check the location just now. We will keep listening.');
        }
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applyBooking, draft.location, draft.quickBookingId, update]);

  return {
    busy,
    message,
    isPolling,
    lastPollAt,
    lastPollingError,
    staleReason,
    setMessage,
    requestLink,
  };
}
