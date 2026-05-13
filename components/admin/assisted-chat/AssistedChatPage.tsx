'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
  Textarea,
  VStack,
  type ButtonProps,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps } from '@/lib/design-tokens';
import { QuickBookMap } from '@/components/admin/quick-book/QuickBookMap';
import { useAssistedChatDraft } from '@/lib/hooks/useAssistedChatDraft';
import type {
  AssistedChatPaymentChoice,
  AssistedChatQuoteBreakdown,
  AssistedChatQuoteLine,
  AssistedChatServiceOrigin,
  LockingNutAnswer,
} from '@/types/admin-assisted-chat';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const PLACEHOLDER_NAME = 'Walk-in customer';
const PLACEHOLDER_PHONE = '0000000000';
const LOCKING_NUT_REASON = 'Locking wheel nut removal';

const QUOTE_STAGE_LABELS: readonly string[] = [
  'Checking stock',
  'Checking distance',
  'Calculating callout',
  'Preparing quote',
];
const QUOTE_STAGE_MS = 850; // ~3.4s minimum across the four stages

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
  context?: { id: string; text: string }[];
}

interface TyreSizeSuggestion {
  size: string;
  count: number;
}

interface QuickBookCreateResponse {
  booking: {
    id: string;
    distanceKm: string | null;
    totalPrice: string | null;
    basePrice: string | null;
    priceBreakdown: {
      lineItems: AssistedChatQuoteLine[];
      subtotal: number;
      vatAmount: number;
      total: number;
      serviceOrigin?: AssistedChatServiceOrigin | null;
    } | null;
  };
}

interface QuickBookPatchResponse {
  booking: {
    id: string;
    totalPrice: string | null;
    basePrice: string | null;
    distanceKm: string | null;
    priceBreakdown: {
      lineItems: AssistedChatQuoteLine[];
      subtotal: number;
      vatAmount: number;
      total: number;
      serviceOrigin?: AssistedChatServiceOrigin | null;
    } | null;
  };
}

interface FinalizeResponse {
  bookingId: string;
  refNumber: string;
  paymentMethod: 'stripe' | 'cash' | 'deposit';
  paymentUrl: string | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
}

interface DepositResponse {
  clientSecret: string;
  depositAmount: number;
  remainingBalance: number;
}

interface SendLinkResponse {
  ok: boolean;
  method: 'sms' | 'whatsapp' | 'email' | 'copy';
  message?: string;
  link?: string;
  error?: string;
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const r = payload as Record<string, unknown>;
  if (typeof r.error === 'string' && r.error.trim()) return r.error;
  if (typeof r.message === 'string' && r.message.trim()) return r.message;
  return fallback;
}

/**
 * Mirrors lib/voodoo-sms.ts normalizeUkPhoneNumber — kept client-side so we
 * can disable the SMS button without a network round-trip.
 */
function isValidUkPhone(input: string): boolean {
  if (!input) return false;
  const digits = input.replace(/[^\d+]/g, '');
  if (/^07\d{9}$/.test(digits)) return true;
  if (/^\+447\d{9}$/.test(digits)) return true;
  if (/^447\d{9}$/.test(digits)) return true;
  if (/^0[12]\d{8,9}$/.test(digits)) return true;
  return false;
}

// ──────────────────────────────────────────────────────────
// Shared button styles — explicit hover/active/focus/disabled
// to remove the Chakra default focus ring + WebKit tap white flash.
// ──────────────────────────────────────────────────────────

const baseButtonShared: Pick<
  ButtonProps,
  'h' | 'borderRadius' | 'fontWeight' | 'transition' | '_focus' | '_focusVisible' | '_disabled'
> = {
  h: '44px',
  borderRadius: '8px',
  fontWeight: '600',
  transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  _focus: { boxShadow: 'none', outline: 'none' },
  _focusVisible: {
    boxShadow: `0 0 0 2px ${c.bg}, 0 0 0 4px ${c.accent}`,
    outline: 'none',
  },
  _disabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
    bg: c.card,
    color: c.muted,
    borderColor: c.border,
    _hover: { bg: c.card, color: c.muted, borderColor: c.border },
  },
};

const primaryButton: ButtonProps = {
  ...baseButtonShared,
  bg: c.accent,
  color: '#09090B',
  borderWidth: '1px',
  borderColor: c.accent,
  _hover: { bg: c.accentHover, color: '#09090B', borderColor: c.accentHover },
  _active: {
    bg: c.accentHover,
    color: '#09090B',
    borderColor: c.accentHover,
    transform: 'translateY(1px)',
  },
};

const secondaryButton: ButtonProps = {
  ...baseButtonShared,
  bg: c.card,
  color: c.text,
  borderWidth: '1px',
  borderColor: c.border,
  _hover: { bg: '#2F2F33', color: c.text, borderColor: '#52525B' },
  _active: { bg: c.surface, color: c.text, borderColor: c.border, transform: 'translateY(1px)' },
};

const ghostButton: ButtonProps = {
  ...baseButtonShared,
  bg: 'transparent',
  color: c.muted,
  borderWidth: '1px',
  borderColor: c.border,
  _hover: { bg: c.card, color: c.text, borderColor: '#52525B' },
  _active: { bg: c.surface, color: c.text, borderColor: c.border, transform: 'translateY(1px)' },
};

interface ChatLine {
  who: 'system' | 'admin';
  body: React.ReactNode;
}

export function AssistedChatPage() {
  const { draft, hydrated, update, clear } = useAssistedChatDraft();

  // Local UI-only state (not persisted)
  const [phoneInput, setPhoneInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [tyreSizeInput, setTyreSizeInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [lockingNutChargeInput, setLockingNutChargeInput] = useState('');
  const [locationLink, setLocationLink] = useState<string | null>(null);

  // Sync local inputs with hydrated draft (one-shot on hydrate)
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || syncedRef.current) return;
    syncedRef.current = true;
    setPhoneInput(draft.customer.phone);
    setAddressInput(draft.location.label);
    setTyreSizeInput(draft.tyre.size);
    setNoteInput(draft.note);
    if (draft.lockingNut.chargeGbp != null) {
      setLockingNutChargeInput(String(draft.lockingNut.chargeGbp));
    }
  }, [hydrated, draft]);

  // Address autocomplete
  const [addrSuggestions, setAddrSuggestions] = useState<MapboxFeature[]>([]);
  const [showAddrSuggestions, setShowAddrSuggestions] = useState(false);
  const [addrSearching, setAddrSearching] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tyre autocomplete
  const [tyreSuggestions, setTyreSuggestions] = useState<TyreSizeSuggestion[]>([]);
  const [showTyreSuggestions, setShowTyreSuggestions] = useState(false);
  const tyreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Async state
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteStageIdx, setQuoteStageIdx] = useState<number>(-1);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [lockingNutInputError, setLockingNutInputError] = useState<string | null>(null);
  const quoteInflightRef = useRef(false);

  const [linkBusy, setLinkBusy] = useState<'sms' | 'whatsapp' | 'copy' | null>(null);
  const [linkResult, setLinkResult] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<FinalizeResponse | null>(null);
  const [depositInfo, setDepositInfo] = useState<DepositResponse | null>(null);

  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  // ── Derived ──
  const lockingNutCharge =
    draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null
      ? draft.lockingNut.chargeGbp
      : 0;
  const baseQuoteTotal = draft.quote?.total ?? 0;
  const effectiveTotal = baseQuoteTotal + lockingNutCharge;
  const phoneIsValid = isValidUkPhone(phoneInput || draft.customer.phone);
  const hasAddress = draft.location.lat != null && draft.location.lng != null;

  // ── Mapbox address search ──
  const searchAddress = useCallback(async (q: string) => {
    if (!q || q.length < 3) {
      setAddrSuggestions([]);
      return;
    }
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setAddrError('Mapbox token missing');
      return;
    }
    setAddrSearching(true);
    setAddrError(null);
    try {
      const encoded = encodeURIComponent(q);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?country=gb&types=address,postcode,place&proximity=-4.2518,55.8617&language=en&limit=6&access_token=${token}`,
      );
      if (!res.ok) {
        setAddrError('Address lookup failed. Try again.');
        setAddrSuggestions([]);
        return;
      }
      const data = (await res.json()) as { features?: MapboxFeature[] };
      setAddrSuggestions(data.features ?? []);
    } catch {
      setAddrError('Address lookup failed. Check your connection.');
      setAddrSuggestions([]);
    } finally {
      setAddrSearching(false);
    }
  }, []);

  const handleAddressChange = (value: string) => {
    setAddressInput(value);
    update({ location: { label: value, lat: null, lng: null, postcode: null } });
    setLocationLink(null);
    setShowAddrSuggestions(true);
    if (addrTimer.current) clearTimeout(addrTimer.current);
    addrTimer.current = setTimeout(() => searchAddress(value), 250);
  };

  const selectAddress = (f: MapboxFeature) => {
    const [lng, lat] = f.center;
    const postcodeCtx = f.context?.find((ctx) => ctx.id.startsWith('postcode'));
    setAddressInput(f.place_name);
    update({
      location: {
        label: f.place_name,
        lat,
        lng,
        postcode: postcodeCtx?.text ?? null,
      },
    });
    setLocationLink(null);
    setAddrSuggestions([]);
    setShowAddrSuggestions(false);
  };

  // ── Tyre size search ──
  const searchTyres = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setTyreSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/tyres/sizes?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { sizes?: TyreSizeSuggestion[] };
      setTyreSuggestions(data.sizes ?? []);
    } catch {
      /* silent */
    }
  }, []);

  const handleTyreChange = (value: string) => {
    setTyreSizeInput(value);
    update({ tyre: { ...draft.tyre, size: value } });
    setShowTyreSuggestions(true);
    if (tyreTimer.current) clearTimeout(tyreTimer.current);
    tyreTimer.current = setTimeout(() => searchTyres(value), 200);
  };

  const selectTyreSize = (size: string) => {
    setTyreSizeInput(size);
    update({ tyre: { ...draft.tyre, size } });
    setTyreSuggestions([]);
    setShowTyreSuggestions(false);
  };

  // ── Phone / quantity / locking nut handlers ──
  const handlePhoneBlur = () => {
    update({ customer: { ...draft.customer, phone: phoneInput.trim() } });
  };

  const handleNoteBlur = () => {
    update({ note: noteInput });
  };

  const handleQuantity = (q: number) => {
    const clamped = Math.max(1, Math.min(10, Math.round(q)));
    update({ tyre: { ...draft.tyre, quantity: clamped } });
  };

  const handleLockingNutAnswer = (answer: LockingNutAnswer) => {
    setLockingNutInputError(null);
    if (answer === 'no') {
      update({ lockingNut: { answer, chargeGbp: draft.lockingNut.chargeGbp } });
    } else {
      update({ lockingNut: { answer, chargeGbp: null } });
      setLockingNutChargeInput('');
    }
  };

  const handleLockingNutChargeChange = (raw: string) => {
    setLockingNutChargeInput(raw);
    setLockingNutInputError(null);
    if (raw.trim() === '') {
      update({ lockingNut: { ...draft.lockingNut, chargeGbp: null } });
      return;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setLockingNutInputError('Enter a valid GBP amount (0 or more).');
      return;
    }
    if (parsed > 1000) {
      setLockingNutInputError('Charge looks too high. Confirm with the manager.');
    }
    update({
      lockingNut: { ...draft.lockingNut, chargeGbp: Math.round(parsed * 100) / 100 },
    });
  };

  // ──────────────────────────────────────────────────────────
  // Lazy quick-bookings draft creation. Reused by location-link actions
  // (so admin can copy/SMS/WA the link before pricing) and by Get Price.
  // ──────────────────────────────────────────────────────────
  const ensureQuickBookingId = useCallback(async (): Promise<string> => {
    if (draft.quickBookingId) return draft.quickBookingId;
    if (!hasAddress) {
      throw new Error('Select the customer address from the suggestions first.');
    }
    const res = await fetch('/api/admin/quick-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
        customerPhone: phoneIsValid ? (phoneInput || draft.customer.phone).trim() : PLACEHOLDER_PHONE,
        locationMethod: 'address' as const,
        locationAddress: draft.location.label,
        locationLat: draft.location.lat,
        locationLng: draft.location.lng,
        serviceType: 'fit' as const,
        tyreSize: draft.tyre.size || undefined,
        tyreCount: draft.tyre.quantity,
        notes: draft.note || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to create draft'));
    const created = data as QuickBookCreateResponse;
    update({ quickBookingId: created.booking.id });
    return created.booking.id;
  }, [
    draft.quickBookingId,
    draft.customer.name,
    draft.customer.phone,
    draft.location.label,
    draft.location.lat,
    draft.location.lng,
    draft.tyre.size,
    draft.tyre.quantity,
    draft.note,
    phoneInput,
    phoneIsValid,
    hasAddress,
    update,
  ]);

  const applyQuoteFromBreakdown = useCallback(
    (
      qbId: string,
      breakdown: QuickBookCreateResponse['booking']['priceBreakdown'],
      distanceKmStr: string | null,
    ) => {
      if (!breakdown) {
        setQuoteError('Pricing engine returned no breakdown.');
        return;
      }
      const next: AssistedChatQuoteBreakdown = {
        subtotal: breakdown.subtotal,
        vatAmount: breakdown.vatAmount,
        total: breakdown.total,
        lineItems: breakdown.lineItems,
        serviceOrigin: breakdown.serviceOrigin ?? null,
        distanceKm: distanceKmStr ? Number(distanceKmStr) : null,
      };
      update({ quickBookingId: qbId, quote: next, paymentChoice: null, dispatchedRefNumber: null });
    },
    [update],
  );

  // Drives the staged "Checking stock… Checking distance…" loader. Resolves
  // once all stages have advanced (~3.4s total).
  const runStagedDelay = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      let stage = 0;
      setQuoteStageIdx(0);
      const tick = () => {
        stage += 1;
        if (stage >= QUOTE_STAGE_LABELS.length) {
          resolve();
          return;
        }
        setQuoteStageIdx(stage);
        window.setTimeout(tick, QUOTE_STAGE_MS);
      };
      window.setTimeout(tick, QUOTE_STAGE_MS);
    });
  }, []);

  // ── Get price ──
  // Engine quote stays clean; the locking-nut charge is layered client-side
  // and only PATCHed onto the booking (via the existing adminAdjustmentAmount
  // mechanism) at finalize time, so the persisted total matches what the
  // admin saw on screen.
  const handleGetPrice = useCallback(async () => {
    if (quoteInflightRef.current) return;

    setQuoteError(null);
    setPaymentResult(null);
    setPaymentError(null);
    setDepositInfo(null);

    if (!hasAddress) {
      setQuoteError('Select the customer address from the suggestions before pricing.');
      return;
    }
    if (!draft.tyre.size.trim()) {
      setQuoteError('Choose a tyre size from the in-stock list.');
      return;
    }
    if (draft.tyre.quantity < 1) {
      setQuoteError('Quantity must be at least 1.');
      return;
    }
    if (draft.lockingNut.answer === 'no') {
      const charge = draft.lockingNut.chargeGbp;
      if (charge == null || !Number.isFinite(charge) || charge < 0) {
        setQuoteError('Enter a valid GBP amount for the locking wheel nut removal charge.');
        return;
      }
    }

    quoteInflightRef.current = true;
    setQuoteLoading(true);
    setQuoteStageIdx(0);

    try {
      const apiCall = (async () => {
        const qbId = draft.quickBookingId ?? (await ensureQuickBookingId());
        const res = await fetch(`/api/admin/quick-book/${qbId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationLat: draft.location.lat,
            locationLng: draft.location.lng,
            locationAddress: draft.location.label,
            locationPostcode: draft.location.postcode,
            tyreSize: draft.tyre.size,
            tyreCount: draft.tyre.quantity,
            notes: draft.note || null,
            // Engine breakdown is kept clean — the locking-nut charge is
            // layered client-side and only PATCHed back on finalize.
            adminAdjustmentAmount: 0,
            adminAdjustmentReason: null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to refresh quote'));
        const patched = data as QuickBookPatchResponse;
        return { qbId, patched };
      })();

      const [{ qbId, patched }] = await Promise.all([apiCall, runStagedDelay()]);
      applyQuoteFromBreakdown(qbId, patched.booking.priceBreakdown, patched.booking.distanceKm);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setQuoteLoading(false);
      setQuoteStageIdx(-1);
      quoteInflightRef.current = false;
    }
  }, [
    hasAddress,
    draft.tyre.size,
    draft.tyre.quantity,
    draft.lockingNut.answer,
    draft.lockingNut.chargeGbp,
    draft.quickBookingId,
    draft.location.lat,
    draft.location.lng,
    draft.location.label,
    draft.location.postcode,
    draft.note,
    ensureQuickBookingId,
    applyQuoteFromBreakdown,
    runStagedDelay,
  ]);

  // ──────────────────────────────────────────────────────────
  // Location link actions — beside the address field.
  // ──────────────────────────────────────────────────────────
  const fetchLocationLink = useCallback(async (): Promise<string> => {
    const qbId = await ensureQuickBookingId();
    const res = await fetch('/api/admin/quick-book/send-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quickBookingId: qbId, method: 'copy' }),
    });
    const data = (await res.json()) as SendLinkResponse;
    if (!res.ok || !data.link) {
      throw new Error(data.error ?? 'Could not generate location link');
    }
    setLocationLink(data.link);
    return data.link;
  }, [ensureQuickBookingId]);

  const writeToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handleCopyLocationLink = useCallback(async () => {
    setLinkResult(null);
    setLinkBusy('copy');
    try {
      const link = locationLink ?? (await fetchLocationLink());
      const ok = await writeToClipboard(link);
      setLinkResult(
        ok
          ? { kind: 'ok', message: 'Location link copied to clipboard' }
          : { kind: 'err', message: 'Could not copy. Use the link manually.' },
      );
    } catch (err) {
      setLinkResult({ kind: 'err', message: err instanceof Error ? err.message : 'Copy failed' });
    } finally {
      setLinkBusy(null);
    }
  }, [locationLink, fetchLocationLink, writeToClipboard]);

  const handleSendSmsLocationLink = useCallback(async () => {
    setLinkResult(null);
    if (!phoneIsValid) {
      setLinkResult({ kind: 'err', message: 'Enter a valid UK phone number first.' });
      return;
    }
    setLinkBusy('sms');
    try {
      const qbId = await ensureQuickBookingId();
      const res = await fetch('/api/admin/quick-book/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickBookingId: qbId, method: 'sms' }),
      });
      const data = (await res.json()) as SendLinkResponse;
      if (!res.ok || !data.ok) {
        setLinkResult({ kind: 'err', message: data.error ?? 'SMS send failed' });
      } else {
        setLinkResult({ kind: 'ok', message: data.message ?? 'SMS sent' });
        if (data.link) setLocationLink(data.link);
      }
    } catch (err) {
      setLinkResult({ kind: 'err', message: err instanceof Error ? err.message : 'SMS send failed' });
    } finally {
      setLinkBusy(null);
    }
  }, [phoneIsValid, ensureQuickBookingId]);

  const handleOpenWhatsAppLocationLink = useCallback(async () => {
    setLinkResult(null);
    setLinkBusy('whatsapp');
    try {
      const qbId = await ensureQuickBookingId();
      const res = await fetch('/api/admin/quick-book/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickBookingId: qbId, method: 'whatsapp' }),
      });
      const data = (await res.json()) as SendLinkResponse;
      if (!res.ok || !data.link) {
        setLinkResult({ kind: 'err', message: data.error ?? 'Could not build WhatsApp link' });
        return;
      }
      window.open(data.link, '_blank', 'noopener,noreferrer');
      setLinkResult({ kind: 'ok', message: 'WhatsApp opened in a new tab' });
    } catch (err) {
      setLinkResult({ kind: 'err', message: err instanceof Error ? err.message : 'WhatsApp failed' });
    } finally {
      setLinkBusy(null);
    }
  }, [ensureQuickBookingId]);

  // ──────────────────────────────────────────────────────────
  // Choose payment — pushes the locking-nut charge onto the booking via
  // the existing adminAdjustmentAmount mechanism just before finalize so
  // the persisted total matches the displayed total.
  // ──────────────────────────────────────────────────────────
  const handleChoosePayment = useCallback(
    async (choice: AssistedChatPaymentChoice) => {
      setPaymentError(null);
      setPaymentResult(null);
      setDepositInfo(null);
      if (!draft.quickBookingId || !draft.quote) {
        setPaymentError('Generate a price first.');
        return;
      }
      update({ paymentChoice: choice });
      setPaymentBusy(true);
      try {
        if (lockingNutCharge > 0) {
          const adjRes = await fetch(`/api/admin/quick-book/${draft.quickBookingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              adminAdjustmentAmount: lockingNutCharge,
              adminAdjustmentReason: LOCKING_NUT_REASON,
            }),
          });
          if (!adjRes.ok) {
            const adjData = await adjRes.json().catch(() => ({}));
            throw new Error(getApiErrorMessage(adjData, 'Failed to apply locking-nut charge'));
          }
        }

        const paymentMethod = choice === 'cash' ? 'cash' : choice === 'deposit' ? 'deposit' : 'stripe';
        const body: Record<string, unknown> = { paymentMethod };
        if (choice === 'deposit') body.depositPercent = 0.15;

        const res = await fetch(`/api/admin/quick-book/${draft.quickBookingId}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to finalize'));
        const fin = data as FinalizeResponse;
        setPaymentResult(fin);
        update({ dispatchedRefNumber: fin.refNumber });

        if (choice === 'full' && fin.paymentUrl) {
          window.open(fin.paymentUrl, '_blank', 'noopener,noreferrer');
        }
        if (choice === 'deposit') {
          const depRes = await fetch(`/api/bookings/${fin.bookingId}/deposit`, { method: 'POST' });
          const depData = await depRes.json();
          if (!depRes.ok) throw new Error(getApiErrorMessage(depData, 'Failed to create deposit payment'));
          setDepositInfo(depData as DepositResponse);
        }
      } catch (err) {
        setPaymentError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setPaymentBusy(false);
      }
    },
    [draft.quickBookingId, draft.quote, lockingNutCharge, update],
  );

  // ── Send to driver (idempotent) ──
  const inflightDispatchRef = useRef(false);
  const handleDispatch = useCallback(async () => {
    if (inflightDispatchRef.current) return;
    setDispatchError(null);
    if (!draft.quote) {
      setDispatchError('Generate a price first.');
      return;
    }
    if (!draft.paymentChoice) {
      setDispatchError('Choose a payment method first (cash, deposit 15%, or full payment).');
      return;
    }
    if (draft.dispatchedRefNumber) {
      setDispatchError(`Already dispatched as ${draft.dispatchedRefNumber}.`);
      return;
    }
    inflightDispatchRef.current = true;
    setDispatchBusy(true);
    try {
      if (!paymentResult) {
        await handleChoosePayment(draft.paymentChoice);
      }
    } finally {
      inflightDispatchRef.current = false;
      setDispatchBusy(false);
    }
  }, [
    draft.quote,
    draft.paymentChoice,
    draft.dispatchedRefNumber,
    paymentResult,
    handleChoosePayment,
  ]);

  // ── Copy details to clipboard (now includes location link + payment) ──
  const handleCopyDetails = useCallback(async () => {
    const lines: string[] = [];
    lines.push('Tyre Rescue — Assisted Chat draft');
    if (draft.customer.phone) lines.push(`Phone: ${draft.customer.phone}`);
    if (draft.location.label) lines.push(`Address: ${draft.location.label}`);
    if (locationLink) lines.push(`Location link: ${locationLink}`);
    if (draft.tyre.size) lines.push(`Tyre size: ${draft.tyre.size}`);
    lines.push(`Quantity: ${draft.tyre.quantity}`);
    lines.push(
      `Locking wheel nut: ${
        draft.lockingNut.answer === 'yes'
          ? 'Customer has it'
          : draft.lockingNut.answer === 'no'
          ? 'Customer does NOT have it'
          : 'Unknown'
      }`,
    );
    if (lockingNutCharge > 0) {
      lines.push(`Locking wheel nut removal: ${GBP.format(lockingNutCharge)}`);
    }
    if (draft.quote) {
      lines.push(`Total: ${GBP.format(effectiveTotal)}`);
    }
    if (draft.paymentChoice) {
      const labelMap: Record<AssistedChatPaymentChoice, string> = {
        cash: `Cash (${GBP.format(effectiveTotal)})`,
        deposit: `Deposit 15% (${GBP.format(effectiveTotal * 0.15)})`,
        full: `Full payment (${GBP.format(effectiveTotal)})`,
      };
      lines.push(`Payment choice: ${labelMap[draft.paymentChoice]}`);
    }
    const ok = await writeToClipboard(lines.join('\n'));
    setCopyState(ok ? 'ok' : 'err');
    window.setTimeout(() => setCopyState('idle'), 1800);
  }, [
    draft.customer.phone,
    draft.location.label,
    draft.tyre.size,
    draft.tyre.quantity,
    draft.lockingNut.answer,
    draft.quote,
    draft.paymentChoice,
    locationLink,
    lockingNutCharge,
    effectiveTotal,
    writeToClipboard,
  ]);

  const handleClearDraft = () => {
    clear();
    setPhoneInput('');
    setAddressInput('');
    setTyreSizeInput('');
    setNoteInput('');
    setLockingNutChargeInput('');
    setLockingNutInputError(null);
    setLocationLink(null);
    setPaymentResult(null);
    setDepositInfo(null);
    setPaymentError(null);
    setQuoteError(null);
    setLinkResult(null);
    setDispatchError(null);
    setCopyState('idle');
    syncedRef.current = false;
  };

  // ── Build chat transcript ──
  const transcript = useMemo<ChatLine[]>(() => {
    const out: ChatLine[] = [];
    out.push({
      who: 'system',
      body: (
        <Text>
          Welcome. I&apos;ll guide you through booking a fit job step by step. Customer phone is
          optional, but required to send the location link by SMS or WhatsApp.
        </Text>
      ),
    });
    if (draft.customer.phone) {
      out.push({ who: 'admin', body: <Text>Phone: {draft.customer.phone}</Text> });
    }
    if (draft.location.label) {
      out.push({
        who: 'admin',
        body: (
          <Text>
            Address: {draft.location.label}
            {!hasAddress && (
              <Text as="span" color="red.300" ml={2}>
                (not yet selected from suggestions)
              </Text>
            )}
          </Text>
        ),
      });
    }
    if (draft.tyre.size) {
      out.push({
        who: 'admin',
        body: (
          <Text>
            Tyre: {draft.tyre.size} × {draft.tyre.quantity}
          </Text>
        ),
      });
    }
    if (draft.lockingNut.answer !== 'unknown' || lockingNutCharge > 0) {
      out.push({
        who: 'admin',
        body: (
          <Text>
            Locking wheel nut:{' '}
            {draft.lockingNut.answer === 'yes'
              ? 'Customer has the key'
              : draft.lockingNut.answer === 'no'
              ? `No key — removal charge ${
                  lockingNutCharge > 0 ? GBP.format(lockingNutCharge) : 'pending'
                }`
              : 'Unknown'}
          </Text>
        ),
      });
    }
    if (draft.note.trim()) {
      out.push({ who: 'admin', body: <Text>Note: {draft.note}</Text> });
    }
    if (draft.quote) {
      out.push({
        who: 'system',
        body: (
          <PriceBreakdownView
            quote={draft.quote}
            lockingNutCharge={lockingNutCharge}
            effectiveTotal={effectiveTotal}
          />
        ),
      });
    }
    if (paymentResult) {
      out.push({
        who: 'system',
        body: (
          <Stack gap={1}>
            <Text fontWeight="600">
              Booking ref {paymentResult.refNumber} created — payment method:{' '}
              {paymentResult.paymentMethod}
            </Text>
            {paymentResult.paymentMethod === 'deposit' && depositInfo && (
              <Text>
                Deposit due now: {GBP.format(depositInfo.depositAmount)} • Balance on-site:{' '}
                {GBP.format(depositInfo.remainingBalance)}
              </Text>
            )}
            {paymentResult.paymentMethod === 'cash' && (
              <Text>Cash payment recorded. Job is dispatched to driver.</Text>
            )}
            {paymentResult.paymentMethod === 'stripe' && paymentResult.paymentUrl && (
              <Text>
                Stripe checkout opened in a new tab.{' '}
                <a
                  href={paymentResult.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: c.accent, textDecoration: 'underline' }}
                >
                  Reopen
                </a>
              </Text>
            )}
          </Stack>
        ),
      });
    }
    return out;
  }, [
    draft.customer.phone,
    draft.location.label,
    draft.tyre.size,
    draft.tyre.quantity,
    draft.lockingNut.answer,
    draft.note,
    draft.quote,
    paymentResult,
    depositInfo,
    hasAddress,
    lockingNutCharge,
    effectiveTotal,
  ]);

  // ── Map props ──
  const mapCustomerLat = draft.location.lat;
  const mapCustomerLng = draft.location.lng;
  const serviceOrigin = draft.quote?.serviceOrigin ?? null;

  return (
    <Flex direction={{ base: 'column', lg: 'row' }} gap={4} align="stretch">
      {/* ── Chat panel ── */}
      <Box flex={1} minW={0}>
        <Box
          bg={c.surface}
          border={`1px solid ${c.border}`}
          borderRadius="10px"
          p={{ base: 3, md: 5 }}
        >
          <VStack align="stretch" gap={4}>
            {transcript.map((l, i) => (
              <ChatBubble key={i} who={l.who}>
                {l.body}
              </ChatBubble>
            ))}

            {/* ── Section: Customer ── */}
            <SectionCard title="Customer">
              <Box maxW="320px">
                <FieldLabel>Customer phone (optional)</FieldLabel>
                <Input
                  {...inputProps}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onBlur={handlePhoneBlur}
                  placeholder="07… or 0141…"
                  inputMode="tel"
                />
                {phoneInput && !phoneIsValid && (
                  <Text color="red.300" fontSize="12px" mt={1}>
                    UK phone format not recognised.
                  </Text>
                )}
              </Box>
            </SectionCard>

            {/* ── Section: Address + location-link actions ── */}
            <SectionCard title="Customer address">
              <Box position="relative">
                <FieldLabel>Customer address (Mapbox)</FieldLabel>
                <Input
                  {...inputProps}
                  value={addressInput}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  onFocus={() => setShowAddrSuggestions(true)}
                  placeholder="Start typing the address or postcode"
                  autoComplete="off"
                />
                {addrSearching && (
                  <Text position="absolute" right={3} top="34px" color={c.muted} fontSize="12px">
                    searching…
                  </Text>
                )}
                {addrError && (
                  <Text color="red.300" fontSize="12px" mt={1}>
                    {addrError}{' '}
                    <button
                      type="button"
                      style={{ background: 'none', border: 0, color: c.accent, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      onClick={() => searchAddress(addressInput)}
                    >
                      Retry
                    </button>
                  </Text>
                )}
                {showAddrSuggestions && addrSuggestions.length > 0 && (
                  <Box
                    position="absolute"
                    top="100%"
                    left={0}
                    right={0}
                    mt={1}
                    bg={c.dropdown.bg}
                    border={`1px solid ${c.border}`}
                    borderRadius="6px"
                    maxH="240px"
                    overflowY="auto"
                    zIndex={20}
                  >
                    {addrSuggestions.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        style={{
                          background: 'transparent',
                          border: 0,
                          color: c.text,
                          cursor: 'pointer',
                          display: 'block',
                          padding: '8px 12px',
                          textAlign: 'left',
                          width: '100%',
                        }}
                        onClick={() => selectAddress(f)}
                      >
                        <Text fontSize="13px">{f.place_name}</Text>
                      </button>
                    ))}
                  </Box>
                )}
              </Box>

              {/* Location link actions — directly attached to address. */}
              <Box mt={3}>
                <Text fontSize="12px" color={c.muted} mb={2}>
                  Use this link when the customer cannot explain the address.
                </Text>
                <HStack gap={2} flexWrap="wrap">
                  <Button
                    {...secondaryButton}
                    px={4}
                    onClick={handleCopyLocationLink}
                    disabled={linkBusy !== null || !hasAddress}
                  >
                    {linkBusy === 'copy' ? <Spinner size="sm" /> : 'Copy location link'}
                  </Button>
                  <Button
                    {...secondaryButton}
                    px={4}
                    onClick={handleSendSmsLocationLink}
                    disabled={linkBusy !== null || !hasAddress || !phoneIsValid}
                  >
                    {linkBusy === 'sms' ? <Spinner size="sm" /> : 'Send SMS location link'}
                  </Button>
                  <Button
                    {...secondaryButton}
                    px={4}
                    onClick={handleOpenWhatsAppLocationLink}
                    disabled={linkBusy !== null || !hasAddress || !phoneIsValid}
                  >
                    {linkBusy === 'whatsapp' ? <Spinner size="sm" /> : 'Open WhatsApp link'}
                  </Button>
                </HStack>
                {locationLink && (
                  <Text fontSize="12px" color={c.muted} mt={2} wordBreak="break-all">
                    {locationLink}
                  </Text>
                )}
                {linkResult && (
                  <Text
                    color={linkResult.kind === 'ok' ? c.text : 'red.300'}
                    fontSize="13px"
                    mt={2}
                  >
                    {linkResult.message}
                  </Text>
                )}
              </Box>
            </SectionCard>

            {/* ── Section: Tyre + quantity ── */}
            <SectionCard title="Tyre">
              <Stack direction={{ base: 'column', md: 'row' }} gap={3}>
                <Box flex={2} position="relative">
                  <FieldLabel>Tyre size (in-stock only)</FieldLabel>
                  <Input
                    {...inputProps}
                    value={tyreSizeInput}
                    onChange={(e) => handleTyreChange(e.target.value)}
                    onFocus={() => setShowTyreSuggestions(true)}
                    placeholder="e.g. 205/55R16"
                    autoComplete="off"
                  />
                  {showTyreSuggestions && tyreSuggestions.length > 0 && (
                    <Box
                      position="absolute"
                      top="100%"
                      left={0}
                      right={0}
                      mt={1}
                      bg={c.dropdown.bg}
                      border={`1px solid ${c.border}`}
                      borderRadius="6px"
                      maxH="240px"
                      overflowY="auto"
                      zIndex={20}
                    >
                      {tyreSuggestions.map((s) => (
                        <button
                          key={s.size}
                          type="button"
                          style={{
                            background: 'transparent',
                            border: 0,
                            color: c.text,
                            cursor: 'pointer',
                            display: 'block',
                            padding: '8px 12px',
                            textAlign: 'left',
                            width: '100%',
                          }}
                          onClick={() => selectTyreSize(s.size)}
                        >
                          <Flex justify="space-between">
                            <Text fontSize="13px">{s.size}</Text>
                            <Text fontSize="12px" color={c.muted}>
                              {s.count} in stock
                            </Text>
                          </Flex>
                        </button>
                      ))}
                    </Box>
                  )}
                  {showTyreSuggestions &&
                    tyreSizeInput.length >= 2 &&
                    tyreSuggestions.length === 0 && (
                      <Text color="red.300" fontSize="12px" mt={1}>
                        No matching sizes in stock.
                      </Text>
                    )}
                </Box>
                <Box flex={1}>
                  <FieldLabel>Quantity</FieldLabel>
                  <Input
                    {...inputProps}
                    type="number"
                    min={1}
                    max={10}
                    value={draft.tyre.quantity}
                    onChange={(e) => handleQuantity(Number(e.target.value))}
                  />
                </Box>
              </Stack>
            </SectionCard>

            {/* ── Section: Locking wheel nut ── */}
            <SectionCard title="Locking wheel nut">
              <Text fontSize="13px" color={c.text} mb={2}>
                Does the customer have the locking wheel nut key?
              </Text>
              <HStack gap={2} flexWrap="wrap">
                <PillButton
                  active={draft.lockingNut.answer === 'yes'}
                  onClick={() => handleLockingNutAnswer('yes')}
                >
                  Yes, customer has it
                </PillButton>
                <PillButton
                  active={draft.lockingNut.answer === 'no'}
                  onClick={() => handleLockingNutAnswer('no')}
                >
                  No, customer does not have it
                </PillButton>
                <PillButton
                  active={draft.lockingNut.answer === 'unknown'}
                  onClick={() => handleLockingNutAnswer('unknown')}
                >
                  Unknown
                </PillButton>
              </HStack>
              {draft.lockingNut.answer === 'no' && (
                <Box mt={3} maxW="280px">
                  <FieldLabel>Locking wheel nut removal charge (GBP)</FieldLabel>
                  <Input
                    {...inputProps}
                    type="number"
                    step="0.01"
                    min={0}
                    value={lockingNutChargeInput}
                    onChange={(e) => handleLockingNutChargeChange(e.target.value)}
                    placeholder="e.g. 25"
                    inputMode="decimal"
                  />
                  {lockingNutInputError && (
                    <Text color="red.300" fontSize="12px" mt={1}>
                      {lockingNutInputError}
                    </Text>
                  )}
                </Box>
              )}
            </SectionCard>

            {/* ── Section: Note ── */}
            <SectionCard title="Optional note">
              <Textarea
                {...textareaProps}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onBlur={handleNoteBlur}
                placeholder="Anything the driver should know"
                minH="72px"
              />
            </SectionCard>

            {/* ── Get price ── */}
            <Box>
              <HStack gap={3} flexWrap="wrap">
                <Button
                  {...primaryButton}
                  px={6}
                  onClick={handleGetPrice}
                  disabled={quoteLoading}
                >
                  {quoteLoading ? <Spinner size="sm" /> : 'Get price'}
                </Button>
                {quoteLoading && quoteStageIdx >= 0 && (
                  <Text color={c.muted} fontSize="13px">
                    {QUOTE_STAGE_LABELS[Math.min(quoteStageIdx, QUOTE_STAGE_LABELS.length - 1)]}…
                  </Text>
                )}
              </HStack>
              {quoteError && (
                <Text color="red.300" fontSize="13px" mt={2}>
                  {quoteError}
                </Text>
              )}
            </Box>

            {/* ── Payment choices ── */}
            {draft.quote && (
              <SectionCard title="Payment choice">
                <HStack gap={3} flexWrap="wrap">
                  <Button
                    {...(draft.paymentChoice === 'deposit' ? primaryButton : secondaryButton)}
                    px={5}
                    onClick={() => handleChoosePayment('deposit')}
                    disabled={paymentBusy}
                  >
                    Pay deposit 15% ({GBP.format(effectiveTotal * 0.15)})
                  </Button>
                  <Button
                    {...(draft.paymentChoice === 'cash' ? primaryButton : secondaryButton)}
                    px={5}
                    onClick={() => handleChoosePayment('cash')}
                    disabled={paymentBusy}
                  >
                    Cash ({GBP.format(effectiveTotal)})
                  </Button>
                  <Button
                    {...(draft.paymentChoice === 'full' ? primaryButton : secondaryButton)}
                    px={5}
                    onClick={() => handleChoosePayment('full')}
                    disabled={paymentBusy}
                  >
                    Full payment ({GBP.format(effectiveTotal)})
                  </Button>
                  {paymentBusy && <Spinner size="sm" color={c.muted} />}
                </HStack>
                {paymentError && (
                  <Text color="red.300" fontSize="13px" mt={2}>
                    {paymentError}
                  </Text>
                )}
              </SectionCard>
            )}
          </VStack>
        </Box>

        {/* ── External action buttons (outside chat box) ── */}
        <Stack direction={{ base: 'column', sm: 'row' }} gap={3} mt={4} flexWrap="wrap">
          <Button {...secondaryButton} px={5} onClick={handleCopyDetails}>
            {copyState === 'ok' ? 'Copied' : copyState === 'err' ? 'Copy failed' : 'Copy details'}
          </Button>
          <Button
            {...primaryButton}
            px={6}
            onClick={handleDispatch}
            disabled={dispatchBusy || !draft.quote || !draft.paymentChoice}
          >
            {dispatchBusy ? <Spinner size="sm" /> : 'Send it to driver'}
          </Button>
          <Button {...ghostButton} px={5} onClick={handleClearDraft}>
            Clear draft
          </Button>
        </Stack>
        {dispatchError && (
          <Text color="red.300" fontSize="13px" mt={2}>
            {dispatchError}
          </Text>
        )}
        {draft.dispatchedRefNumber && !dispatchError && (
          <Text color={c.muted} fontSize="13px" mt={2}>
            Dispatched as booking {draft.dispatchedRefNumber}.
          </Text>
        )}
      </Box>

      {/* ── Persistent map panel ── */}
      <Box
        w={{ base: '100%', lg: '420px' }}
        flexShrink={0}
        bg={c.surface}
        border={`1px solid ${c.border}`}
        borderRadius="10px"
        p={3}
        position={{ base: 'static', lg: 'sticky' }}
        top={{ lg: '24px' }}
        alignSelf={{ lg: 'flex-start' }}
      >
        <Text fontSize="12px" color={c.muted} mb={2} textTransform="uppercase" letterSpacing="0.05em">
          Map
        </Text>
        {mapCustomerLat != null && mapCustomerLng != null ? (
          <Box h="380px" borderRadius="8px" overflow="hidden">
            <QuickBookMap
              customerLat={mapCustomerLat}
              customerLng={mapCustomerLng}
              serviceOriginLat={serviceOrigin?.lat ?? null}
              serviceOriginLng={serviceOrigin?.lng ?? null}
              serviceOriginSource={serviceOrigin?.source ?? null}
              showRoute
            />
          </Box>
        ) : (
          <Box
            h="380px"
            borderRadius="8px"
            border={`1px dashed ${c.border}`}
            display="flex"
            alignItems="center"
            justifyContent="center"
            p={4}
          >
            <Text color={c.muted} fontSize="13px" textAlign="center">
              Select a customer address from the suggestions to load the map.
            </Text>
          </Box>
        )}
        {draft.quote?.distanceKm != null && (
          <Text fontSize="12px" color={c.muted} mt={3}>
            Distance used by pricing: {(draft.quote.distanceKm * 0.621371).toFixed(1)} miles
            {serviceOrigin?.source === 'driver' && ' (from nearest driver)'}
            {serviceOrigin?.source === 'garage' && ' (from garage)'}
          </Text>
        )}
      </Box>
    </Flex>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box bg={c.bg} border={`1px solid ${c.border}`} borderRadius="8px" p={4}>
      <Text
        fontSize="11px"
        color={c.muted}
        textTransform="uppercase"
        letterSpacing="0.08em"
        mb={3}
        fontWeight="600"
      >
        {title}
      </Text>
      {children}
    </Box>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize="12px" color={c.muted} mb={1}>
      {children}
    </Text>
  );
}

function ChatBubble({ who, children }: { who: 'system' | 'admin'; children: React.ReactNode }) {
  const isAdmin = who === 'admin';
  return (
    <Flex justify={isAdmin ? 'flex-end' : 'flex-start'}>
      <Box
        maxW="85%"
        bg={isAdmin ? c.card : '#1A1A1B'}
        border={`1px solid ${c.border}`}
        borderRadius="10px"
        px={3}
        py={2}
        color={c.text}
        fontSize="14px"
      >
        {children}
      </Box>
    </Flex>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      bg={active ? c.accent : c.card}
      color={active ? '#09090B' : c.text}
      borderWidth="1px"
      borderColor={active ? c.accent : c.border}
      h="40px"
      px={4}
      borderRadius="20px"
      fontWeight="600"
      fontSize="13px"
      transition="background 0.15s ease, color 0.15s ease, border-color 0.15s ease"
      _hover={{
        bg: active ? c.accentHover : '#2F2F33',
        color: active ? '#09090B' : c.text,
        borderColor: active ? c.accentHover : '#52525B',
      }}
      _active={{
        bg: active ? c.accentHover : c.surface,
        color: active ? '#09090B' : c.text,
        transform: 'translateY(1px)',
      }}
      _focus={{ boxShadow: 'none', outline: 'none' }}
      _focusVisible={{
        boxShadow: `0 0 0 2px ${c.bg}, 0 0 0 4px ${c.accent}`,
        outline: 'none',
      }}
    >
      {children}
    </Button>
  );
}

function PriceBreakdownView({
  quote,
  lockingNutCharge,
  effectiveTotal,
}: {
  quote: AssistedChatQuoteBreakdown;
  lockingNutCharge: number;
  effectiveTotal: number;
}) {
  // Filter engine meta lines (subtotal/vat/total) — admin sees only real
  // charge lines plus the synthetic locking-nut row and a single Total.
  const display = quote.lineItems.filter(
    (l) => l.type !== 'subtotal' && l.type !== 'vat' && l.type !== 'total',
  );
  return (
    <Stack gap={1} fontSize="13px">
      <Text fontWeight="600">Price breakdown</Text>
      {display.map((l, i) => (
        <Flex key={`${l.label}-${i}`} justify="space-between">
          <Text color={c.text}>{l.label}</Text>
          <Text color={c.text}>{GBP.format(l.amount)}</Text>
        </Flex>
      ))}
      {lockingNutCharge > 0 && (
        <Flex justify="space-between">
          <Text color={c.text}>Locking wheel nut removal</Text>
          <Text color={c.text}>{GBP.format(lockingNutCharge)}</Text>
        </Flex>
      )}
      <Flex justify="space-between" pt={2} borderTop={`1px solid ${c.border}`} mt={1}>
        <Text fontWeight="700">Total</Text>
        <Text fontWeight="700" color={c.accent}>
          {GBP.format(effectiveTotal)}
        </Text>
      </Flex>
    </Stack>
  );
}
