import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';
import { formatGbp } from '@/lib/money';
import type { AssistedChatDraft } from '@/types/assisted-chat';
import type {
  AdminQuote,
  AdminQuotePaymentOption,
  AdminQuoteResponse,
  ConfirmAdminQuoteResponse,
  CreateAdminQuoteInput,
  UpdateAdminQuoteInput,
} from '@/types/admin-quotes';
import { AppButton, SectionCard, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';

interface Props {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  effectiveTotal: number;
  lockingNutCharge: number;
}

const PAYMENT_OPTIONS: ReadonlyArray<{ value: AdminQuotePaymentOption; label: string }> = [
  { value: 'FULL_PAYMENT', label: 'Full payment' },
  { value: 'DEPOSIT_20', label: 'Deposit 20%' },
  { value: 'CASH_ON_ARRIVAL', label: 'Cash on arrival' },
  { value: 'PAYMENT_LINK', label: 'Send payment link' },
];

function formatPence(pence: number): string {
  return formatGbp(pence / 100);
}

function depositSummary(priceAmount: number): { depositAmountPence: number; remainingBalancePence: number } {
  const depositAmountPence = Math.round((priceAmount * 20) / 100);
  return { depositAmountPence, remainingBalancePence: priceAmount - depositAmountPence };
}

function normalizePaymentOption(option: AdminQuotePaymentOption): AdminQuotePaymentOption {
  return option === 'DEPOSIT_15' ? 'DEPOSIT_20' : option;
}

function isDepositPaymentOption(option: AdminQuotePaymentOption): boolean {
  return option === 'DEPOSIT_20' || option === 'DEPOSIT_15';
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

export function QuoteDraftActions({ draft, update, effectiveTotal, lockingNutCharge }: Props) {
  const [busy, setBusy] = useState<'save' | 'send' | 'confirm' | 'copy' | 'instruction' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [currentQuote, setCurrentQuote] = useState<AdminQuote | null>(null);
  const [paymentOption, setPaymentOption] = useState<AdminQuotePaymentOption>('FULL_PAYMENT');
  const [confirmResult, setConfirmResult] = useState<ConfirmAdminQuoteResponse | null>(null);

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

  const persistQuote = useCallback(
    (quote: AdminQuote) => {
      setCurrentQuote(quote);
      if (quote.selectedPaymentOption) setPaymentOption(normalizePaymentOption(quote.selectedPaymentOption));
      update({ savedQuoteId: quote.id, savedQuoteRef: quote.quoteRef });
    },
    [update],
  );

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

  const handleSendQuote = useCallback(async () => {
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

  const handleConfirm = useCallback(async () => {
    setBusy('confirm');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const response = await api.post<ConfirmAdminQuoteResponse>(`/api/admin/quotes/${quote.id}/confirm`, {
        selectedPaymentOption: paymentOption,
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
  }, [ensureSavedQuote, paymentOption, persistQuote, update]);

  const handleCopyConfirmedMessage = useCallback(async () => {
    setBusy('copy');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const text = confirmResult?.whatsappMessage ?? quote.confirmationWhatsAppMessages[paymentOption];
      const ok = await copyToClipboard(text);
      setMessage(ok ? { kind: 'ok', text: 'Confirmed quote message copied.' } : { kind: 'err', text: 'Could not copy WhatsApp message.' });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to copy message.' });
    } finally {
      setBusy(null);
    }
  }, [confirmResult, ensureSavedQuote, paymentOption]);

  const handleCopyPaymentInstruction = useCallback(async () => {
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

  const savedLabel = currentQuote?.quoteRef ?? draft.savedQuoteRef;
  const quotePricePence = currentQuote?.priceAmount ?? Math.round(effectiveTotal * 100);
  const deposit = depositSummary(quotePricePence);
  const quoteStatus = currentQuote?.quoteStatus ?? 'DRAFT';
  const expiryStatus = currentQuote?.isExpired ? 'Expired' : currentQuote ? 'Valid' : 'Save quote first';

  return (
    <SectionCard title="Saved quote">
      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>{savedLabel ? `Quote ${savedLabel} saved` : 'Quote not saved'}</Text>
        <Text style={styles.statusMeta}>Current quote total: {formatGbp(effectiveTotal)}</Text>
      </View>
      <View style={styles.confirmBox}>
        <Text style={styles.confirmTitle}>Confirm Quote</Text>
        <Text style={styles.statusMeta}>Quote ref: {savedLabel ?? 'Not saved yet'}</Text>
        <Text style={styles.statusMeta}>Full price: {formatPence(quotePricePence)}</Text>
        <Text style={styles.statusMeta}>Expiry status: {expiryStatus}</Text>
        <Text style={styles.statusMeta}>Current quote status: {quoteStatus}</Text>
        <Text style={styles.statusMeta}>Selected payment option: {PAYMENT_OPTIONS.find((item) => item.value === normalizePaymentOption(paymentOption))?.label ?? paymentOption}</Text>
        {isDepositPaymentOption(paymentOption) ? (
          <>
            <Text style={styles.statusMeta}>Deposit 20%: {formatPence(deposit.depositAmountPence)}</Text>
            <Text style={styles.statusMeta}>Remaining balance: {formatPence(deposit.remainingBalancePence)}</Text>
          </>
        ) : null}
        <View style={styles.optionList}>
          {PAYMENT_OPTIONS.map((item) => (
            <AppButton
              key={item.value}
              label={item.label}
              variant={normalizePaymentOption(paymentOption) === item.value ? 'primary' : 'secondary'}
              onPress={() => setPaymentOption(item.value)}
              disabled={busy !== null}
              fullWidth
            />
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <AppButton
          label={busy === 'save' ? 'Saving quote...' : 'Save Quote'}
          onPress={handleSave}
          loading={busy === 'save'}
          disabled={!draft.quote || busy !== null}
          fullWidth
        />
        <AppButton
          label="Send Quote"
          variant="secondary"
          onPress={handleSendQuote}
          loading={busy === 'send'}
          disabled={!draft.quote || busy !== null}
          fullWidth
        />
        <AppButton
          label="Confirm Quote"
          variant="secondary"
          onPress={handleConfirm}
          loading={busy === 'confirm'}
          disabled={!draft.quote || busy !== null || currentQuote?.isExpired === true || currentQuote?.quoteStatus === 'CANCELLED'}
          fullWidth
        />
        <AppButton
          label="Copy WhatsApp Message"
          variant="secondary"
          onPress={handleCopyConfirmedMessage}
          loading={busy === 'copy'}
          disabled={!draft.quote || busy !== null}
          fullWidth
        />
        {paymentOption === 'PAYMENT_LINK' || confirmResult?.paymentInstruction ? (
          <AppButton
            label="Copy Payment Instructions"
            variant="secondary"
            onPress={handleCopyPaymentInstruction}
            loading={busy === 'instruction'}
            disabled={!draft.quote || busy !== null}
            fullWidth
          />
        ) : null}
      </View>
      {confirmResult?.paymentHandoff.message ? (
        <View style={{ marginTop: 10 }}>
          <StatusBanner kind="info" message={confirmResult.paymentHandoff.message} />
        </View>
      ) : null}
      {message ? (
        <View style={{ marginTop: 10 }}>
          <StatusBanner kind={message.kind === 'ok' ? 'ok' : message.kind === 'err' ? 'err' : 'info'} message={message.text} />
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  statusBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 10,
  },
  statusLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  statusMeta: { color: colors.subtle, fontSize: fontSize.xs, marginTop: 4 },
  confirmBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 10,
  },
  confirmTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800', marginBottom: 4 },
  optionList: { gap: 8, marginTop: 10 },
  actions: { gap: 8, marginTop: 10 },
});
