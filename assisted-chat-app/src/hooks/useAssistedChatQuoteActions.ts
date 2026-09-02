import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';
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
  QuickBookPatchResponse,
} from '@/types/assisted-chat';
import type {
  AdminQuote,
  AdminQuotePaymentOption,
  AdminQuoteResponse,
  ConfirmAdminQuoteResponse,
  CreateAdminQuoteInput,
  UpdateAdminQuoteInput,
} from '@/types/admin-quotes';

interface UseAssistedChatQuoteActionsArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  effectiveTotal: number;
  lockingNutCharge: number;
}

const LOCKING_NUT_REASON = 'Locking wheel nut removal';
const MANUAL_PRICE_REASON = 'Manual admin price override';

export interface QuoteActionMessage {
  kind: 'ok' | 'err' | 'info';
  text: string;
}

function dispatchChoiceToPaymentOption(choice: AssistedChatPaymentChoice | null): AdminQuotePaymentOption | null {
  if (choice === 'deposit') return 'DEPOSIT_20';
  if (choice === 'cash') return 'CASH_ON_ARRIVAL';
  if (choice === 'full') return 'FULL_PAYMENT';
  return null;
}

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toPence(amountGbp: number): number {
  return Math.max(0, Math.round(finiteAmount(amountGbp) * 100));
}


function getBackendPriceAmountPence(draft: AssistedChatDraft, fallbackTotal: number): number {
  if (draft.manualPriceGbp != null && Number.isFinite(draft.manualPriceGbp)) {
    return toPence(draft.manualPriceGbp);
  }
  const total =
    typeof draft.quote?.total === 'number' && Number.isFinite(draft.quote.total)
      ? draft.quote.total
      : fallbackTotal;
  return toPence(total);
}

function quoteMatchesFinalPayable(quote: AdminQuote | null, finalPayablePence: number): boolean {
  if (!quote) return false;
  return Math.round(quote.priceAmount) === finalPayablePence;
}

function buildQuoteInput(draft: AssistedChatDraft, priceAmountPence: number, lockingNutCharge: number): CreateAdminQuoteInput {
  const primaryTyre = primaryBookingTyreLine(draft);
  const isServiceOnly = isAssistedChatServiceOnly(draft.serviceType);
  const tyreLines = isServiceOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines);
  const quoteLockingNutCharge = isServiceOnly ? 0 : lockingNutCharge;
  return {
    quickBookingId: draft.quickBookingId,
    customerName: draft.customer.name || null,
    customerPhone: draft.customer.phone || null,
    address: draft.location.address || null,
    postcode: draft.location.postcode,
    latitude: draft.location.lat,
    longitude: draft.location.lng,
    tyreSize: isServiceOnly ? null : primaryTyre.size || null,
    quantity: isServiceOnly ? 1 : totalBookingTyreQuantity(draft.tyreLines) || primaryTyre.quantity,
    tyreLines,
    items: tyreLines,
    lockingWheelNutStatus: isServiceOnly || draft.lockingNut.answer === 'unknown' ? null : draft.lockingNut.answer,
    lockingWheelNutChargePence: Math.round(quoteLockingNutCharge * 100),
    priceAmount: priceAmountPence,
    currency: 'GBP',
    quoteStatus: 'QUOTED',
    internalNotes: draft.note || null,
  };
}

export function useAssistedChatQuoteActions({
  draft,
  update,
  effectiveTotal,
  lockingNutCharge,
}: UseAssistedChatQuoteActionsArgs) {
  const [busy, setBusy] = useState<'save' | 'send' | 'confirm' | 'copy' | 'instruction' | null>(null);
  const [message, setMessage] = useState<QuoteActionMessage | null>(null);
  const [currentQuote, setCurrentQuote] = useState<AdminQuote | null>(null);
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<AdminQuotePaymentOption>('FULL_PAYMENT');
  const [confirmResult, setConfirmResult] = useState<ConfirmAdminQuoteResponse | null>(null);

  useEffect(() => {
    if (currentQuote?.selectedPaymentOption) return;
    const draftPaymentOption = dispatchChoiceToPaymentOption(draft.paymentChoice);
    if (draftPaymentOption && draftPaymentOption !== selectedPaymentOption) {
      setSelectedPaymentOption(draftPaymentOption);
    }
  }, [currentQuote?.selectedPaymentOption, draft.paymentChoice, selectedPaymentOption]);

  const selectPaymentOption = useCallback(
    (option: AdminQuotePaymentOption) => {
      setSelectedPaymentOption(option);
    },
    [],
  );

  const persistQuote = useCallback(
    (quote: AdminQuote) => {
      setCurrentQuote(quote);
      if (quote.selectedPaymentOption) {
        setSelectedPaymentOption(quote.selectedPaymentOption);
      }
      update({ savedQuoteId: quote.id, savedQuoteRef: quote.quoteRef });
    },
    [update],
  );

  const saveQuote = useCallback(async (): Promise<AdminQuote> => {
    if (!draft.quote) throw new Error('Get price before saving a quote.');

    let canonicalDraft = draft;
    if (draft.quickBookingId) {
      const existingAdjustmentAmount = finiteAmount(draft.quote.adminAdjustmentAmount);
      const backendBaseTotal = Math.round((draft.quote.total - existingAdjustmentAmount) * 100) / 100;
      let adjustmentAmount = 0;
      let adjustmentReason: string | null = null;
      const serviceType = draft.serviceType ?? 'fit';
      const isServiceOnly = isAssistedChatServiceOnly(serviceType);

      if (draft.manualPriceGbp != null && Number.isFinite(draft.manualPriceGbp)) {
        adjustmentAmount = Math.round((draft.manualPriceGbp - backendBaseTotal) * 100) / 100;
        adjustmentReason = MANUAL_PRICE_REASON;
      } else if (!isServiceOnly && lockingNutCharge > 0) {
        adjustmentAmount = lockingNutCharge;
        adjustmentReason = LOCKING_NUT_REASON;
      }

      const customerName = draft.customer.name.trim();
      const customerPhone = draft.customer.phone.trim();
      const customerEmail = draft.customer.email.trim();
      const primaryTyre = primaryBookingTyreLine(draft);
      const tyreLines = isServiceOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines);
      const vehicle = buildAssistedChatVehiclePayload(draft);
      const patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${draft.quickBookingId}`, {
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
      const quote = quoteFromQuickBookPatch(patched.booking.priceBreakdown, patched.booking.distanceKm);
      canonicalDraft = { ...draft, quote, priceNeedsRefresh: false };
      update({ quote, priceNeedsRefresh: false });
    }

    const input = buildQuoteInput(
      canonicalDraft,
      getBackendPriceAmountPence(canonicalDraft, effectiveTotal),
      lockingNutCharge,
    );
    if (draft.savedQuoteId) {
      const patch: UpdateAdminQuoteInput = { ...input };
      const response = await api.patch<AdminQuoteResponse>(`/api/admin/quotes/${draft.savedQuoteId}`, patch);
      return response.quote;
    }
    const response = await api.post<AdminQuoteResponse>('/api/admin/quotes', input);
    return response.quote;
  }, [draft, effectiveTotal, lockingNutCharge, update]);

  const handleSave = useCallback(async () => {
    setBusy('save');
    setMessage({ kind: 'info', text: 'Saving quote...' });
    try {
      const quote = await saveQuote();
      persistQuote(quote);
      setMessage({ kind: 'ok', text: `Quote ${quote.quoteRef} saved.` });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && draft.savedQuoteId) {
        update({ savedQuoteId: null, savedQuoteRef: null });
        setMessage({ kind: 'err', text: 'Saved quote not found. The stale reference was removed.' });
      } else {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to save quote.' });
      }
    } finally {
      setBusy(null);
    }
  }, [draft.savedQuoteId, persistQuote, saveQuote, update]);

  const ensureSavedQuote = useCallback(async (): Promise<AdminQuote> => {
    const finalPayablePence = getBackendPriceAmountPence(draft, effectiveTotal);
    if (quoteMatchesFinalPayable(currentQuote, finalPayablePence)) return currentQuote as AdminQuote;
    const quote = await saveQuote();
    persistQuote(quote);
    return quote;
  }, [currentQuote, draft, effectiveTotal, persistQuote, saveQuote]);

  const sendQuote = useCallback(async () => {
    setBusy('send');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const copied = await copyToClipboard(quote.whatsappMessage);
      const url = buildWhatsAppUrl(draft.customer.phone, quote.whatsappMessage);
      if (url) {
        await Linking.openURL(url).catch(() => undefined);
      }
      setMessage(
        copied
          ? { kind: 'ok', text: `Quote ${quote.quoteRef} message copied.` }
          : { kind: 'err', text: 'Could not copy WhatsApp message.' },
      );
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to send quote.' });
    } finally {
      setBusy(null);
    }
  }, [draft.customer.phone, ensureSavedQuote]);

  const confirmQuote = useCallback(async () => {
    setBusy('confirm');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const response = await api.post<ConfirmAdminQuoteResponse>(`/api/admin/quotes/${quote.id}/confirm`, {
        selectedPaymentOption,
        operatorNote: draft.note || null,
      });
      persistQuote(response.quote);
      setConfirmResult(response);
      setMessage({
        kind: 'ok',
        text: response.alreadyConfirmed
          ? `Quote ${response.quote.quoteRef} was already confirmed.`
          : `Quote ${response.quote.quoteRef} confirmed by phone.`,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        update({ savedQuoteId: null, savedQuoteRef: null });
        setCurrentQuote(null);
        setMessage({ kind: 'err', text: 'Quote not found. The stale reference was removed.' });
      } else {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to confirm quote.' });
      }
    } finally {
      setBusy(null);
    }
  }, [draft.note, ensureSavedQuote, persistQuote, selectedPaymentOption, update]);

  const copyConfirmedMessage = useCallback(async () => {
    setBusy('copy');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const text = confirmResult?.whatsappMessage ?? quote.confirmationWhatsAppMessages[selectedPaymentOption];
      const ok = await copyToClipboard(text);
      setMessage(ok ? { kind: 'ok', text: 'Quote message copied.' } : { kind: 'err', text: 'Could not copy WhatsApp message.' });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to copy message.' });
    } finally {
      setBusy(null);
    }
  }, [confirmResult, ensureSavedQuote, selectedPaymentOption]);

  const copyPaymentInstruction = useCallback(async () => {
    setBusy('instruction');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const text = confirmResult?.paymentInstruction ?? quote.confirmationWhatsAppMessages.PAYMENT_LINK;
      const ok = await copyToClipboard(text);
      setMessage(ok ? { kind: 'ok', text: 'Payment instructions copied.' } : { kind: 'err', text: 'Could not copy payment instructions.' });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to copy payment instructions.' });
    } finally {
      setBusy(null);
    }
  }, [confirmResult, ensureSavedQuote]);

  const acceptExternalQuote = useCallback(
    (quote: AdminQuote) => {
      setConfirmResult(null);
      setCurrentQuote(quote);
      if (quote.selectedPaymentOption) {
        setSelectedPaymentOption(quote.selectedPaymentOption);
      } else {
        setSelectedPaymentOption('FULL_PAYMENT');
      }
    },
    [],
  );

  return {
    busy,
    message,
    currentQuote,
    selectedPaymentOption,
    confirmResult,
    setMessage,
    selectPaymentOption,
    saveQuote: handleSave,
    sendQuote,
    confirmQuote,
    copyConfirmedMessage,
    copyPaymentInstruction,
    acceptExternalQuote,
  };
}
