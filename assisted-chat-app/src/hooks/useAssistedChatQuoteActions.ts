import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';
import type { AssistedChatDraft, AssistedChatPaymentChoice } from '@/types/assisted-chat';
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

export interface QuoteActionMessage {
  kind: 'ok' | 'err' | 'info';
  text: string;
}

function paymentOptionToDispatchChoice(option: AdminQuotePaymentOption): AssistedChatPaymentChoice {
  if (option === 'DEPOSIT_15') return 'deposit';
  if (option === 'CASH_ON_ARRIVAL') return 'cash';
  return 'full';
}

function dispatchChoiceToPaymentOption(choice: AssistedChatPaymentChoice | null): AdminQuotePaymentOption | null {
  if (choice === 'deposit') return 'DEPOSIT_15';
  if (choice === 'cash') return 'CASH_ON_ARRIVAL';
  if (choice === 'full') return 'FULL_PAYMENT';
  return null;
}

function buildQuoteInput(draft: AssistedChatDraft, effectiveTotal: number, lockingNutCharge: number): CreateAdminQuoteInput {
  return {
    quickBookingId: draft.quickBookingId,
    customerName: draft.customer.name || null,
    customerPhone: draft.customer.phone || null,
    address: draft.location.address || null,
    postcode: draft.location.postcode,
    latitude: draft.location.lat,
    longitude: draft.location.lng,
    tyreSize: draft.tyre.size || null,
    quantity: draft.tyre.quantity,
    lockingWheelNutStatus: draft.lockingNut.answer,
    lockingWheelNutChargePence: Math.round(lockingNutCharge * 100),
    priceAmount: Math.round(effectiveTotal * 100),
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
      update({ paymentChoice: paymentOptionToDispatchChoice(option) });
    },
    [update],
  );

  const persistQuote = useCallback(
    (quote: AdminQuote) => {
      setCurrentQuote(quote);
      if (quote.selectedPaymentOption) {
        setSelectedPaymentOption(quote.selectedPaymentOption);
        update({
          savedQuoteId: quote.id,
          savedQuoteRef: quote.quoteRef,
          paymentChoice: paymentOptionToDispatchChoice(quote.selectedPaymentOption),
        });
        return;
      }
      update({ savedQuoteId: quote.id, savedQuoteRef: quote.quoteRef });
    },
    [update],
  );

  const saveQuote = useCallback(async (): Promise<AdminQuote> => {
    if (!draft.quote) throw new Error('Get price before saving a quote.');
    const input = buildQuoteInput(draft, effectiveTotal, lockingNutCharge);
    if (draft.savedQuoteId) {
      const patch: UpdateAdminQuoteInput = { ...input };
      const response = await api.patch<AdminQuoteResponse>(`/api/admin/quotes/${draft.savedQuoteId}`, patch);
      return response.quote;
    }
    const response = await api.post<AdminQuoteResponse>('/api/admin/quotes', input);
    return response.quote;
  }, [draft, effectiveTotal, lockingNutCharge]);

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
    if (currentQuote) return currentQuote;
    const quote = await saveQuote();
    persistQuote(quote);
    return quote;
  }, [currentQuote, persistQuote, saveQuote]);

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
      update({ paymentChoice: paymentOptionToDispatchChoice(response.selectedPaymentOption ?? selectedPaymentOption) });
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
        update({ paymentChoice: paymentOptionToDispatchChoice(quote.selectedPaymentOption) });
      } else {
        setSelectedPaymentOption('FULL_PAYMENT');
        update({ paymentChoice: null });
      }
    },
    [update],
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
