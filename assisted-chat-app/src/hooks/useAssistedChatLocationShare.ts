import { getBookingTimingPayload, getBookingScheduleError, assertBookingTimingResponse, normalizeBookingTiming } from '@/lib/booking-schedule';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import {
  buildAssistedChatVehiclePayload,
  buildBookingTyreLinePayload,
  isAssistedChatServiceOnly,
  normalizeAssistedChatTyreSize,
  primaryBookingTyreLine,
  totalBookingTyreQuantity,
} from '@/lib/assisted-chat-workflow';
import {
  ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
  getAssistedChatPricingContext,
} from '@/lib/pricing-context';
import type {
  AssistedChatDraft,
  AssistedChatLocationMethod,
  AssistedChatQuoteBreakdown,
  QuickBookCreateResponse,
  QuickBookGetResponse,
  QuickBookPatchResponse,
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

export interface LocationShareContactOverride {
  phone?: string;
  email?: string;
  name?: string;
}

interface UseAssistedChatLocationShareArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

function quoteFromBooking(booking: QuickBookCreateResponse['booking']): AssistedChatQuoteBreakdown | null {
  if (!booking.priceBreakdown) return null;
  const pricingDistanceMiles = booking.priceBreakdown.distanceMiles ?? booking.priceBreakdown.pricingDistanceMiles ?? null;
  const pricingDistanceKm =
    pricingDistanceMiles != null
      ? pricingDistanceMiles * 1.60934
      : booking.distanceKm
      ? Number(booking.distanceKm)
      : null;
  return {
    bookingType: booking.priceBreakdown.bookingType,
    scheduledAt: booking.priceBreakdown.scheduledAt,
    subtotal: booking.priceBreakdown.subtotal,
    vatAmount: booking.priceBreakdown.vatAmount,
    total: booking.priceBreakdown.total,
    lineItems: booking.priceBreakdown.lineItems,
    serviceOrigin: booking.priceBreakdown.serviceOrigin ?? null,
    distanceKm: pricingDistanceKm,
    distanceMiles: pricingDistanceMiles,
    serviceDistanceMiles: booking.priceBreakdown.serviceDistanceMiles ?? null,
    pricingDistanceMiles,
    pricingDurationMinutes: booking.priceBreakdown.pricingDurationMinutes ?? null,
    garageDistanceMiles: booking.priceBreakdown.garageDistanceMiles ?? null,
    pricingDistanceSource: booking.priceBreakdown.pricingDistanceSource ?? null,
    distanceFloorApplied: booking.priceBreakdown.distanceFloorApplied ?? null,
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
      if ((draft.quickBookingId && draft.quickBookingId !== booking.id)
        || draft.bookingTimingNeedsReview || draft.dispatchedBookingId || draft.dispatchedRefNumber || draft.paymentLink) return false;
      const lat = booking.locationLat ? Number(booking.locationLat) : null;
      const lng = booking.locationLng ? Number(booking.locationLng) : null;
      const validLocation = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
      if ((booking.locationLat != null || booking.locationLng != null) && !validLocation) return false;
      const expectedTiming = getBookingTimingPayload(draft);
      const receivedTiming = normalizeBookingTiming(booking);
      const sameTiming = expectedTiming.bookingType === receivedTiming.bookingType
        && expectedTiming.scheduledAt === receivedTiming.scheduledAt;
      // A pending location link may finish after the operator changes the
      // appointment locally. Coordinates still belong to this quick booking;
      // accept them, but let Get Price sync the current appointment first.
      const quote = sameTiming ? quoteFromBooking(booking) : null;
      update({
        quickBookingId: booking.id,
        location: {
          ...draft.location,
          ...extra,
          address: booking.locationAddress ?? extra?.address ?? draft.location.address,
          lat: validLocation ? lat : null,
          lng: validLocation ? lng : null,
          postcode: booking.locationPostcode ?? extra?.postcode ?? draft.location.postcode,
          status: validLocation ? 'received' : extra?.status ?? draft.location.status,
        },
        quote: sameTiming ? quote ?? draft.quote : null,
        priceNeedsRefresh: !sameTiming,
        ...(!sameTiming ? { savedQuoteId: null, savedQuoteRef: null, manualPriceGbp: null } : {}),
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
      return true;
    },
    [draft, update],
  );

  const ensureQuickBooking = useCallback(
    async (
      method: AssistedChatLocationMethod,
      contact?: LocationShareContactOverride,
    ): Promise<{ id: string; locationLink: string | null; whatsappLink: string | null }> => {
      if (draft.bookingTimingNeedsReview) throw new Error('Open Bookings to review this booking’s appointment before changing its location.');
      const scheduleError = getBookingScheduleError(draft);
      if (scheduleError) throw new Error(scheduleError);
      const customerPhone = contact?.phone?.trim() || draft.customer.phone.trim() || PLACEHOLDER_PHONE;
      const customerEmail = contact?.email?.trim() || draft.customer.email.trim();
      const customerName = contact?.name?.trim() || draft.customer.name.trim() || PLACEHOLDER_NAME;

      if (draft.quickBookingId) {
        const patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${draft.quickBookingId}`, {
          customerName,
          customerPhone,
          customerEmail,
          vehicle: buildAssistedChatVehiclePayload(draft),
          ...getBookingTimingPayload(draft),
          pricingContext: getAssistedChatPricingContext(draft),
        });
        assertBookingTimingResponse(draft, patched.booking);
        return {
          id: draft.quickBookingId,
          locationLink: draft.location.link,
          whatsappLink: draft.location.whatsappLink,
        };
      }
      const primaryTyre = primaryBookingTyreLine(draft);
      const serviceType = draft.serviceType ?? 'fit';
      const isServiceOnly = isAssistedChatServiceOnly(serviceType);
      const tyreLines = isServiceOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines);
      const vehicle = buildAssistedChatVehiclePayload(draft);
      const created = await api.post<QuickBookCreateResponse>('/api/admin/quick-book', {
        customerName,
        customerPhone,
        customerEmail: customerEmail || undefined,
        locationMethod: method,
        locationAddress: method === 'address' ? draft.location.address : undefined,
        locationLat: method === 'address' && draft.location.lat != null ? draft.location.lat : undefined,
        locationLng: method === 'address' && draft.location.lng != null ? draft.location.lng : undefined,
        serviceType,
        tyreSize: isServiceOnly ? undefined : normalizeAssistedChatTyreSize(primaryTyre.size) ?? undefined,
        tyreCount: isServiceOnly ? 1 : totalBookingTyreQuantity(draft.tyreLines) || primaryTyre.quantity,
        tyreLines,
        items: tyreLines,
        vehicle,
        pricingContext: getAssistedChatPricingContext(draft),
        ...getBookingTimingPayload(draft),
        adminDistanceLimitMiles: ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
        notes: draft.note || undefined,
        virtualLandlineInteractionId: draft.virtualLandlineInteractionId ?? undefined,
      });
      assertBookingTimingResponse(draft, created.booking);
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
    async (method: LocationShareMethod, contact?: LocationShareContactOverride) => {
      setMessage(null);
      setLastPollingError(null);
      setStaleReason(null);
      setBusy(method);
      try {
        const ensured = await ensureQuickBooking('link', contact);
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
          ...(contact?.phone || contact?.email || contact?.name
            ? {
                customer: {
                  ...draft.customer,
                  ...(contact.name ? { name: contact.name.trim() } : {}),
                  ...(contact.phone ? { phone: contact.phone.trim() } : {}),
                  ...(contact.email ? { email: contact.email.trim() } : {}),
                },
              }
            : {}),
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
          if (draft.bookingTimingNeedsReview) {
            setMessage({ kind: 'err', text: 'Open Bookings to review this booking’s appointment.' });
            return;
          }
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
    [draft.bookingTimingNeedsReview, draft.customer, draft.location, draft.priceNeedsRefresh, draft.quote, ensureQuickBooking, update],
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
          if (!applyBooking(data.booking, { method: 'link' })) return;
          setIsPolling(false);
          setLastPollingError(null);
          setStaleReason(null);
          setMessage({ kind: 'ok', text: 'Location shared by customer.' });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          if (cancelled) return;
          clearInterval(interval);
          setIsPolling(false);
          setStaleReason('Request expired or no longer available.');
          if (draft.bookingTimingNeedsReview) {
            setMessage({ kind: 'err', text: 'Open Bookings to review this booking’s appointment.' });
            return;
          }
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
  }, [applyBooking, draft.bookingTimingNeedsReview, draft.location, draft.quickBookingId, update]);

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
