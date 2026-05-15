'use client';

import { useCallback, useState } from 'react';
import { Box, Button, HStack, Input, Spinner, Stack, Text, Textarea, type ButtonProps } from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps } from '@/lib/design-tokens';
import type { AssistedChatDraft } from '@/types/admin-assisted-chat';
import type {
  AdminQuote,
  AdminQuoteListResponse,
  AdminQuotePaymentOption,
  AdminQuoteResponse,
  AdminQuoteStatus,
  ConfirmAdminQuoteResponse,
  CreateAdminQuoteInput,
  UpdateAdminQuoteInput,
} from '@/types/admin-quotes';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const baseButton: Pick<ButtonProps, 'h' | 'borderRadius' | 'fontWeight' | '_focus' | '_focusVisible'> = {
  h: '40px',
  borderRadius: '8px',
  fontWeight: '600',
  _focus: { boxShadow: 'none', outline: 'none' },
  _focusVisible: {
    boxShadow: `0 0 0 2px ${c.bg}, 0 0 0 4px ${c.accent}`,
    outline: 'none',
  },
};

const primaryButton: ButtonProps = {
  ...baseButton,
  bg: c.accent,
  color: '#09090B',
  borderWidth: '1px',
  borderColor: c.accent,
  _hover: { bg: c.accentHover, borderColor: c.accentHover },
};

const secondaryButton: ButtonProps = {
  ...baseButton,
  bg: c.card,
  color: c.text,
  borderWidth: '1px',
  borderColor: c.border,
  _hover: { bg: '#2F2F33', borderColor: '#52525B' },
};

type QuoteMode = 'recent' | 'today' | 'pending' | 'expired';

const PAYMENT_OPTIONS: ReadonlyArray<{ value: AdminQuotePaymentOption; label: string }> = [
  { value: 'FULL_PAYMENT', label: 'Full payment' },
  { value: 'DEPOSIT_15', label: 'Deposit 15%' },
  { value: 'CASH_ON_ARRIVAL', label: 'Cash on arrival' },
  { value: 'PAYMENT_LINK', label: 'Send payment link' },
];

const NEXT_ACTION_LABELS: Record<string, string> = {
  TAKE_FULL_PAYMENT: 'Take full payment',
  TAKE_DEPOSIT: 'Take deposit',
  MARK_CASH_PENDING: 'Cash pending',
  SEND_PAYMENT_LINK: 'Send payment link',
  ALREADY_CONFIRMED: 'Already confirmed',
  RECALCULATE_REQUIRED: 'Recalculate required',
};

interface Props {
  draft: AssistedChatDraft;
  effectiveTotal: number;
  lockingNutCharge: number;
  update: (patch: Partial<AssistedChatDraft>) => void;
  onApplyQuote: (quote: AdminQuote) => void;
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  return fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, `Request failed (${response.status})`));
  }
  return payload as T;
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function buildQuoteInput(draft: AssistedChatDraft, effectiveTotal: number, lockingNutCharge: number): CreateAdminQuoteInput {
  return {
    quickBookingId: draft.quickBookingId,
    customerName: draft.customer.name || null,
    customerPhone: draft.customer.phone || null,
    address: draft.location.label || null,
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

function buildListUrl(mode: QuoteMode, search: string): string {
  const params = new URLSearchParams({ limit: '30' });
  const trimmed = search.trim();
  if (trimmed) {
    if (/^TRQ-/i.test(trimmed)) params.set('quoteRef', trimmed);
    else params.set('phone', trimmed);
  }
  if (mode === 'today') params.set('todayOnly', 'true');
  if (mode === 'pending') params.set('status', 'QUOTED');
  if (mode === 'expired') params.set('status', 'EXPIRED');
  return `/api/admin/quotes?${params.toString()}`;
}

function statusTone(status: AdminQuoteStatus): string {
  if (status === 'EXPIRED' || status === 'CANCELLED') return 'red.300';
  if (status === 'CONFIRMED_BY_PHONE' || status === 'PAYMENT_PENDING' || status === 'PAID') return c.accent;
  return c.muted;
}

function formatPence(pence: number): string {
  return GBP.format(pence / 100);
}

function depositSummary(priceAmount: number): { depositAmountPence: number; remainingBalancePence: number } {
  const depositAmountPence = Math.round((priceAmount * 15) / 100);
  return { depositAmountPence, remainingBalancePence: priceAmount - depositAmountPence };
}

export function AdminQuotePanel({ draft, effectiveTotal, lockingNutCharge, update, onApplyQuote }: Props) {
  const [busy, setBusy] = useState<'save' | 'send' | 'confirm' | 'search' | 'notes' | 'refresh' | 'instruction' | 'payment' | 'sms' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [activeQuote, setActiveQuote] = useState<AdminQuote | null>(null);
  const [paymentOption, setPaymentOption] = useState<AdminQuotePaymentOption>('FULL_PAYMENT');
  const [confirmResult, setConfirmResult] = useState<ConfirmAdminQuoteResponse | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<QuoteMode>('recent');
  const [quotes, setQuotes] = useState<AdminQuote[]>([]);
  const [notesDraft, setNotesDraft] = useState('');

  const currentQuoteRef = activeQuote?.quoteRef ?? draft.savedQuoteRef;

  const saveQuote = useCallback(async (): Promise<AdminQuote> => {
    if (!draft.quote) throw new Error('Get price before saving a quote.');
    const input = buildQuoteInput(draft, effectiveTotal, lockingNutCharge);
    if (draft.savedQuoteId) {
      const patch: UpdateAdminQuoteInput = { ...input };
      const response = await requestJson<AdminQuoteResponse>(`/api/admin/quotes/${draft.savedQuoteId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return response.quote;
    }
    const response = await requestJson<AdminQuoteResponse>('/api/admin/quotes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.quote;
  }, [draft, effectiveTotal, lockingNutCharge]);

  const handleSave = useCallback(async () => {
    setBusy('save');
    setMessage({ kind: 'info', text: 'Saving quote...' });
    try {
      const quote = await saveQuote();
      update({ savedQuoteId: quote.id, savedQuoteRef: quote.quoteRef });
      setActiveQuote(quote);
      if (quote.selectedPaymentOption) setPaymentOption(quote.selectedPaymentOption);
      setNotesDraft(quote.internalNotes ?? '');
      setMessage({ kind: 'ok', text: `Quote ${quote.quoteRef} saved.` });
    } catch (error) {
      if (draft.savedQuoteId && error instanceof Error && /not found/i.test(error.message)) {
        update({ savedQuoteId: null, savedQuoteRef: null });
      }
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to save quote.' });
    } finally {
      setBusy(null);
    }
  }, [draft.savedQuoteId, saveQuote, update]);

  const ensureSavedQuote = useCallback(async (): Promise<AdminQuote> => {
    if (activeQuote) return activeQuote;
    const quote = await saveQuote();
    update({ savedQuoteId: quote.id, savedQuoteRef: quote.quoteRef });
    setActiveQuote(quote);
    if (quote.selectedPaymentOption) setPaymentOption(quote.selectedPaymentOption);
    setNotesDraft(quote.internalNotes ?? '');
    return quote;
  }, [activeQuote, saveQuote, update]);

  const handleCopyMessage = useCallback(async () => {
    setBusy('send');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const text = confirmResult?.whatsappMessage ?? quote.confirmationWhatsAppMessages[paymentOption];
      const ok = await writeToClipboard(text);
      setMessage(ok ? { kind: 'ok', text: 'WhatsApp quote message copied.' } : { kind: 'err', text: 'Could not copy WhatsApp message.' });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to copy message.' });
    } finally {
      setBusy(null);
    }
  }, [confirmResult, ensureSavedQuote, paymentOption]);

  const handleConfirm = useCallback(async () => {
    setBusy('confirm');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const response = await requestJson<ConfirmAdminQuoteResponse>(`/api/admin/quotes/${quote.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ selectedPaymentOption: paymentOption }),
      });
      setActiveQuote(response.quote);
      setConfirmResult(response);
      update({ savedQuoteId: response.quote.id, savedQuoteRef: response.quote.quoteRef });
      setMessage({
        kind: 'ok',
        text: response.alreadyConfirmed
          ? `Quote ${response.quote.quoteRef} was already confirmed.`
          : `Quote ${response.quote.quoteRef} confirmed by phone.`,
      });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to confirm quote.' });
    } finally {
      setBusy(null);
    }
  }, [ensureSavedQuote, paymentOption, update]);

  const handleCopyPaymentInstruction = useCallback(async () => {
    setBusy('instruction');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const text = confirmResult?.paymentInstruction ?? quote.confirmationWhatsAppMessages.PAYMENT_LINK;
      const ok = await writeToClipboard(text);
      setMessage(ok ? { kind: 'ok', text: 'Payment instructions copied.' } : { kind: 'err', text: 'Could not copy payment instructions.' });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to copy payment instructions.' });
    } finally {
      setBusy(null);
    }
  }, [confirmResult, ensureSavedQuote]);

  const handleStartPayment = useCallback(() => {
    const paymentUrl = confirmResult?.paymentHandoff.paymentUrl;
    if (!paymentUrl) {
      setMessage({ kind: 'info', text: confirmResult?.paymentHandoff.message ?? 'Start Payment is not connected for this quote yet.' });
      return;
    }
    window.open(paymentUrl, '_blank', 'noopener,noreferrer');
  }, [confirmResult]);

  const fetchQuotes = useCallback(async () => {
    setBusy('search');
    setMessage(null);
    try {
      const response = await requestJson<AdminQuoteListResponse>(buildListUrl(mode, search));
      setQuotes(response.quotes);
      if (response.quotes.length === 0) {
        setMessage({ kind: 'info', text: 'No saved quotes found.' });
      }
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to load quotes.' });
    } finally {
      setBusy(null);
    }
  }, [mode, search]);

  const saveNotes = useCallback(async () => {
    if (!activeQuote) return;
    setBusy('notes');
    setMessage(null);
    try {
      const response = await requestJson<AdminQuoteResponse>(`/api/admin/quotes/${activeQuote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ internalNotes: notesDraft }),
      });
      setActiveQuote(response.quote);
      if (response.quote.selectedPaymentOption) setPaymentOption(response.quote.selectedPaymentOption);
      setMessage({ kind: 'ok', text: 'Quote notes saved.' });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to save notes.' });
    } finally {
      setBusy(null);
    }
  }, [activeQuote, notesDraft]);

  const refreshQuote = useCallback(async () => {
    if (!activeQuote) return;
    setBusy('refresh');
    setMessage(null);
    try {
      const response = await requestJson<AdminQuoteResponse>(`/api/admin/quotes/${activeQuote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ refreshPrice: true }),
      });
      setActiveQuote(response.quote);
      setConfirmResult(null);
      setMessage({ kind: 'ok', text: `Quote ${response.quote.quoteRef} refreshed for 2 hours.` });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to refresh quote.' });
    } finally {
      setBusy(null);
    }
  }, [activeQuote]);

  const sendSms = useCallback(async () => {
    if (!activeQuote) return;
    setBusy('sms');
    setMessage(null);
    try {
      await requestJson(`/api/admin/quotes/${activeQuote.id}/send-sms`, { method: 'POST' });
      setMessage({ kind: 'ok', text: `SMS sent for quote ${activeQuote.quoteRef}.` });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'SMS send failed.' });
    } finally {
      setBusy(null);
    }
  }, [activeQuote]);

  const priceAmountPence = activeQuote?.priceAmount ?? Math.round(effectiveTotal * 100);
  const deposit = depositSummary(priceAmountPence);
  const paymentInstructionAvailable = paymentOption === 'PAYMENT_LINK' || Boolean(confirmResult?.paymentInstruction);
  const canStartPayment = Boolean(confirmResult?.paymentHandoff.canStartPayment && confirmResult.paymentHandoff.paymentUrl);

  return (
    <Box bg={c.bg} border={`1px solid ${c.border}`} borderRadius="8px" p={4}>
      <Stack gap={3}>
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
          <Box>
            <Text fontSize="11px" color={c.muted} textTransform="uppercase" letterSpacing="0.08em" fontWeight="600">
              Saved quote
            </Text>
            <Text color={c.text} fontSize="14px" mt={1}>
              {currentQuoteRef ? `Quote ${currentQuoteRef} saved` : 'Quote not saved'}
            </Text>
          </Box>
          <Button {...secondaryButton} px={4} onClick={() => setSearchOpen((value) => !value)}>
            Find Existing Quote
          </Button>
        </HStack>

        <Box border={`1px solid ${c.border}`} borderRadius="8px" bg={c.card} p={3}>
          <Stack gap={2}>
            <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
              <Box>
                <Text color={c.text} fontWeight="700">Confirm Quote</Text>
                <Text color={c.muted} fontSize="12px">Quote ref: {currentQuoteRef ?? 'Not saved yet'}</Text>
              </Box>
              <Text color={activeQuote ? statusTone(activeQuote.quoteStatus) : c.muted} fontSize="12px" fontWeight="700">
                {activeQuote?.quoteStatus ?? 'DRAFT'}
              </Text>
            </HStack>
            <Stack gap={1}>
              <Text color={c.text} fontSize="13px">Full price: {formatPence(priceAmountPence)}</Text>
              <Text color={c.muted} fontSize="12px">Expiry status: {activeQuote?.isExpired ? 'Expired' : activeQuote ? 'Valid' : 'Save quote first'}</Text>
              <Text color={c.muted} fontSize="12px">Selected payment option: {PAYMENT_OPTIONS.find((item) => item.value === paymentOption)?.label ?? paymentOption}</Text>
              {paymentOption === 'DEPOSIT_15' ? (
                <>
                  <Text color={c.text} fontSize="13px">Deposit 15%: {formatPence(deposit.depositAmountPence)}</Text>
                  <Text color={c.muted} fontSize="12px">Remaining balance: {formatPence(deposit.remainingBalancePence)}</Text>
                </>
              ) : null}
              {confirmResult ? (
                <Text color={c.muted} fontSize="12px">Next action: {NEXT_ACTION_LABELS[confirmResult.nextAction] ?? confirmResult.nextAction}</Text>
              ) : null}
            </Stack>
            <HStack gap={2} flexWrap="wrap">
              {PAYMENT_OPTIONS.map((item) => (
                <Button
                  key={item.value}
                  {...(paymentOption === item.value ? primaryButton : secondaryButton)}
                  px={3}
                  onClick={() => setPaymentOption(item.value)}
                  disabled={busy !== null}
                >
                  {item.label}
                </Button>
              ))}
            </HStack>
            {confirmResult?.paymentHandoff.message ? (
              <Text color={c.muted} fontSize="12px">{confirmResult.paymentHandoff.message}</Text>
            ) : null}
          </Stack>
        </Box>

        <HStack gap={2} flexWrap="wrap">
          <Button {...primaryButton} px={4} onClick={handleSave} disabled={!draft.quote || busy !== null}>
            {busy === 'save' ? <Spinner size="sm" /> : 'Save Quote'}
          </Button>
          <Button {...secondaryButton} px={4} onClick={handleCopyMessage} disabled={!draft.quote || busy !== null}>
            {busy === 'send' ? <Spinner size="sm" /> : 'Copy WhatsApp Message'}
          </Button>
          <Button {...secondaryButton} px={4} onClick={handleConfirm} disabled={!draft.quote || busy !== null || activeQuote?.isExpired === true || activeQuote?.quoteStatus === 'CANCELLED'}>
            {busy === 'confirm' ? <Spinner size="sm" /> : 'Confirm Quote'}
          </Button>
          {paymentInstructionAvailable ? (
            <Button {...secondaryButton} px={4} onClick={handleCopyPaymentInstruction} disabled={!draft.quote || busy !== null}>
              {busy === 'instruction' ? <Spinner size="sm" /> : 'Copy Payment Instructions'}
            </Button>
          ) : null}
          {canStartPayment ? (
            <Button {...primaryButton} px={4} onClick={handleStartPayment} disabled={busy !== null}>
              {busy === 'payment' ? <Spinner size="sm" /> : 'Start Payment'}
            </Button>
          ) : null}
        </HStack>

        {message && (
          <Text color={message.kind === 'err' ? 'red.300' : message.kind === 'ok' ? c.accent : c.muted} fontSize="13px">
            {message.text}
          </Text>
        )}

        {searchOpen && (
          <Stack gap={3} borderTop={`1px solid ${c.border}`} pt={3}>
            <HStack gap={2} flexWrap="wrap">
              {(['recent', 'today', 'pending', 'expired'] as const).map((item) => (
                <Button
                  key={item}
                  {...(mode === item ? primaryButton : secondaryButton)}
                  px={3}
                  onClick={() => setMode(item)}
                >
                  {item === 'today' ? "Today's quotes" : item === 'pending' ? 'Pending confirmation' : item === 'expired' ? 'Expired quotes' : 'Recent quotes'}
                </Button>
              ))}
            </HStack>
            <HStack gap={2} align="end">
              <Box flex={1}>
                <Text fontSize="12px" color={c.muted} mb={1}>Phone or quote ref</Text>
                <Input {...inputProps} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="TRQ-1048 or 07700" />
              </Box>
              <Button {...primaryButton} px={4} onClick={fetchQuotes} disabled={busy !== null}>
                {busy === 'search' ? <Spinner size="sm" /> : 'Search'}
              </Button>
            </HStack>

            <Stack gap={2}>
              {quotes.map((quote) => (
                <Box key={quote.id} border={`1px solid ${c.border}`} borderRadius="8px" p={3} bg={c.card}>
                  <HStack justify="space-between" gap={3} align="start">
                    <Box>
                      <Text color={c.text} fontWeight="700">{quote.quoteRef}</Text>
                      <Text color={c.muted} fontSize="13px">{quote.customerPhone ?? 'No phone'} · {quote.tyreSize ?? 'No tyre size'} x {quote.quantity}</Text>
                      <Text color={c.text} fontSize="13px">{GBP.format(quote.priceAmount / 100)}</Text>
                      <Text color={statusTone(quote.quoteStatus)} fontSize="12px">{quote.quoteStatus}</Text>
                    </Box>
                    <Button
                      {...secondaryButton}
                      px={3}
                      onClick={() => {
                        setActiveQuote(quote);
                        setPaymentOption(quote.selectedPaymentOption ?? 'FULL_PAYMENT');
                        setConfirmResult(null);
                        setNotesDraft(quote.internalNotes ?? '');
                      }}
                    >
                      Open
                    </Button>
                  </HStack>
                </Box>
              ))}
            </Stack>
          </Stack>
        )}

        {activeQuote && (
          <Stack gap={3} borderTop={`1px solid ${c.border}`} pt={3}>
            <HStack justify="space-between" align="start" gap={3}>
              <Box>
                <Text color={c.text} fontWeight="700">{activeQuote.quoteRef}</Text>
                <Text color={c.muted} fontSize="13px">{activeQuote.customerPhone ?? 'No phone'} · expires {new Date(activeQuote.expiresAt).toLocaleString('en-GB')}</Text>
                <Text color={statusTone(activeQuote.quoteStatus)} fontSize="12px">{activeQuote.quoteStatus}</Text>
              </Box>
              <Button {...secondaryButton} px={3} onClick={() => onApplyQuote(activeQuote)}>
                Use quote
              </Button>
            </HStack>
            <Textarea {...textareaProps} value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Internal notes" minH="70px" />
            <HStack gap={2} flexWrap="wrap">
              <Button {...secondaryButton} px={3} onClick={saveNotes} disabled={busy !== null}>{busy === 'notes' ? <Spinner size="sm" /> : 'Save notes'}</Button>
              <Button {...secondaryButton} px={3} onClick={refreshQuote} disabled={busy !== null || !activeQuote.quickBookingId}>{busy === 'refresh' ? <Spinner size="sm" /> : 'Recalculate Price'}</Button>
              <Button {...secondaryButton} px={3} onClick={handleConfirm} disabled={busy !== null || activeQuote.isExpired || activeQuote.quoteStatus === 'CANCELLED'}>{busy === 'confirm' ? <Spinner size="sm" /> : 'Confirm Quote'}</Button>
              <Button {...secondaryButton} px={3} onClick={handleCopyMessage} disabled={busy !== null}>{busy === 'send' ? <Spinner size="sm" /> : 'Copy WhatsApp Message'}</Button>
              {paymentInstructionAvailable ? (
                <Button {...secondaryButton} px={3} onClick={handleCopyPaymentInstruction} disabled={busy !== null}>{busy === 'instruction' ? <Spinner size="sm" /> : 'Copy Payment Instructions'}</Button>
              ) : null}
              {canStartPayment ? (
                <Button {...primaryButton} px={3} onClick={handleStartPayment} disabled={busy !== null}>{busy === 'payment' ? <Spinner size="sm" /> : 'Start Payment'}</Button>
              ) : null}
              <Button {...secondaryButton} px={3} onClick={sendSms} disabled={busy !== null || !activeQuote.smsAvailable}>{busy === 'sms' ? <Spinner size="sm" /> : 'Send SMS'}</Button>
            </HStack>
            {!activeQuote.smsAvailable && activeQuote.smsUnavailableReason ? (
              <Text color={c.muted} fontSize="12px">{activeQuote.smsUnavailableReason}</Text>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}