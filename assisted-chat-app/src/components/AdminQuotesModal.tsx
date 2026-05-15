import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { formatGbp } from '@/lib/money';
import type {
  AdminQuote,
  AdminQuoteListResponse,
  AdminQuotePaymentOption,
  AdminQuoteResponse,
  AdminQuoteStatus,
  ConfirmAdminQuoteResponse,
} from '@/types/admin-quotes';
import { AppButton, FieldLabel, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';

type QuoteMode = 'recent' | 'today' | 'pending' | 'expired';

interface Props {
  visible: boolean;
  onClose: () => void;
  onUseQuote: (quote: AdminQuote) => void;
}

const MODE_LABELS: Record<QuoteMode, string> = {
  recent: 'Recent quotes',
  today: "Today's quotes",
  pending: 'Pending confirmation',
  expired: 'Expired quotes',
};

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

function buildListPath(mode: QuoteMode, search: string): string {
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: AdminQuoteStatus): string {
  if (status === 'EXPIRED' || status === 'CANCELLED') return colors.danger;
  if (status === 'CONFIRMED_BY_PHONE' || status === 'PAYMENT_PENDING' || status === 'PAID') return colors.accent;
  return colors.muted;
}

function isConfirmedStatus(status: AdminQuoteStatus): boolean {
  return status === 'CONFIRMED_BY_PHONE' || status === 'PAYMENT_PENDING' || status === 'PAID';
}

function formatPence(pence: number): string {
  return formatGbp(pence / 100);
}

function depositSummary(priceAmount: number): { depositAmountPence: number; remainingBalancePence: number } {
  const depositAmountPence = Math.round((priceAmount * 15) / 100);
  return { depositAmountPence, remainingBalancePence: priceAmount - depositAmountPence };
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Session expired. Please log in again.';
    if (err.status === 409) return err.message || 'Quote cannot be confirmed in its current state.';
  }
  return err instanceof Error ? err.message : fallback;
}

export function AdminQuotesModal({ visible, onClose, onUseQuote }: Props) {
  const [mode, setMode] = useState<QuoteMode>('recent');
  const [search, setSearch] = useState('');
  const [quotes, setQuotes] = useState<AdminQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminQuote | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<'notes' | 'confirm' | 'refresh' | 'copy' | 'instruction' | 'payment' | 'sms' | null>(null);
  const [paymentOption, setPaymentOption] = useState<AdminQuotePaymentOption>('FULL_PAYMENT');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmAdminQuoteResponse | null>(null);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await api.get<AdminQuoteListResponse>(buildListPath(mode, search));
      setQuotes(response.quotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quotes.');
    } finally {
      setLoading(false);
    }
  }, [mode, search]);

  useEffect(() => {
    if (visible) {
      void loadQuotes();
    }
  }, [loadQuotes, visible]);

  const removeStaleQuote = useCallback((id: string) => {
    setQuotes((items) => items.filter((item) => item.id !== id));
    setSelected(null);
    setConfirmationResult(null);
    setDetailError('Quote not found. It was removed from the local list.');
  }, []);

  const openQuote = useCallback(async (quote: AdminQuote) => {
    setSelected(quote);
    setPaymentOption(quote.selectedPaymentOption ?? 'FULL_PAYMENT');
    setConfirmationResult(null);
    setNotesDraft(quote.internalNotes ?? '');
    setDetailLoading(true);
    setDetailError(null);
    setSuccess(null);
    try {
      const response = await api.get<AdminQuoteResponse>(`/api/admin/quotes/${quote.id}`);
      setSelected(response.quote);
      setPaymentOption(response.quote.selectedPaymentOption ?? 'FULL_PAYMENT');
      setNotesDraft(response.quote.internalNotes ?? '');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        removeStaleQuote(quote.id);
      } else {
        setDetailError(err instanceof Error ? err.message : 'Failed to load quote.');
      }
    } finally {
      setDetailLoading(false);
    }
  }, [removeStaleQuote]);

  const updateSelected = useCallback((quote: AdminQuote) => {
    setSelected(quote);
    if (quote.selectedPaymentOption) setPaymentOption(quote.selectedPaymentOption);
    setNotesDraft(quote.internalNotes ?? '');
    setQuotes((items) => items.map((item) => (item.id === quote.id ? quote : item)));
  }, []);

  const saveNotes = useCallback(async () => {
    if (!selected) return;
    setActionBusy('notes');
    setDetailError(null);
    setSuccess(null);
    try {
      const response = await api.patch<AdminQuoteResponse>(`/api/admin/quotes/${selected.id}`, {
        internalNotes: notesDraft,
      });
      updateSelected(response.quote);
      setSuccess('Quote notes saved.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) removeStaleQuote(selected.id);
      else setDetailError(getErrorMessage(err, 'Failed to save notes.'));
    } finally {
      setActionBusy(null);
    }
  }, [notesDraft, removeStaleQuote, selected, updateSelected]);

  const confirmQuote = useCallback(async () => {
    if (!selected) return;
    setActionBusy('confirm');
    setDetailError(null);
    setSuccess(null);
    try {
      const response = await api.post<ConfirmAdminQuoteResponse>(`/api/admin/quotes/${selected.id}/confirm`, {
        selectedPaymentOption: paymentOption,
        operatorNote: notesDraft || null,
      });
      updateSelected(response.quote);
      setConfirmationResult(response);
      setSuccess(
        response.alreadyConfirmed
          ? `Quote ${response.quote.quoteRef} was already confirmed.`
          : `Quote ${response.quote.quoteRef} confirmed by phone.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) removeStaleQuote(selected.id);
      else setDetailError(getErrorMessage(err, 'Failed to confirm quote.'));
    } finally {
      setActionBusy(null);
    }
  }, [notesDraft, paymentOption, removeStaleQuote, selected, updateSelected]);

  const refreshQuote = useCallback(async () => {
    if (!selected) return;
    setActionBusy('refresh');
    setDetailError(null);
    setSuccess(null);
    try {
      const response = await api.patch<AdminQuoteResponse>(`/api/admin/quotes/${selected.id}`, {
        refreshPrice: true,
      });
      updateSelected(response.quote);
      setConfirmationResult(null);
      setSuccess(`Quote ${response.quote.quoteRef} refreshed for 2 hours.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) removeStaleQuote(selected.id);
      else setDetailError(getErrorMessage(err, 'Failed to recalculate quote.'));
    } finally {
      setActionBusy(null);
    }
  }, [removeStaleQuote, selected, updateSelected]);

  const copyMessage = useCallback(async () => {
    if (!selected) return;
    setActionBusy('copy');
    setDetailError(null);
    setSuccess(null);
    const message = confirmationResult?.whatsappMessage ?? selected.confirmationWhatsAppMessages[paymentOption] ?? selected.whatsappMessage;
    const ok = await copyToClipboard(message);
    setSuccess(ok ? 'WhatsApp quote message copied.' : null);
    if (!ok) setDetailError('Could not copy WhatsApp message.');
    setActionBusy(null);
  }, [confirmationResult, paymentOption, selected]);

  const copyPaymentInstruction = useCallback(async () => {
    if (!selected) return;
    const instruction = confirmationResult?.paymentInstruction ?? (
      paymentOption === 'PAYMENT_LINK' ? selected.confirmationWhatsAppMessages.PAYMENT_LINK : null
    );
    if (!instruction) {
      setDetailError('Payment instructions are only available for the payment link option.');
      return;
    }
    setActionBusy('instruction');
    setDetailError(null);
    setSuccess(null);
    const ok = await copyToClipboard(instruction);
    setSuccess(ok ? 'Payment instructions copied.' : null);
    if (!ok) setDetailError('Could not copy payment instructions.');
    setActionBusy(null);
  }, [confirmationResult, paymentOption, selected]);

  const startPayment = useCallback(async () => {
    const paymentUrl = confirmationResult?.paymentHandoff.paymentUrl;
    if (!paymentUrl) {
      setDetailError(confirmationResult?.paymentHandoff.message ?? 'Start Payment is not connected for this quote yet.');
      return;
    }
    setActionBusy('payment');
    setDetailError(null);
    try {
      await Linking.openURL(paymentUrl);
    } catch {
      setDetailError('Could not open payment.');
    } finally {
      setActionBusy(null);
    }
  }, [confirmationResult]);

  const sendSms = useCallback(async () => {
    if (!selected) return;
    setActionBusy('sms');
    setDetailError(null);
    setSuccess(null);
    try {
      await api.post(`/api/admin/quotes/${selected.id}/send-sms`);
      setSuccess(`SMS sent for quote ${selected.quoteRef}.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) removeStaleQuote(selected.id);
      else setDetailError(getErrorMessage(err, 'SMS send failed.'));
    } finally {
      setActionBusy(null);
    }
  }, [removeStaleQuote, selected]);

  const visibleQuotes = useMemo(() => quotes, [quotes]);
  const selectedDeposit = selected ? depositSummary(selected.priceAmount) : null;
  const canStartPayment = Boolean(confirmationResult?.paymentHandoff.canStartPayment && confirmationResult.paymentHandoff.paymentUrl);
  const paymentInstructionAvailable = Boolean(
    confirmationResult?.paymentInstruction || (selected && paymentOption === 'PAYMENT_LINK'),
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Quotes</Text>
            <Text style={styles.subtitle}>Search saved operator quotes</Text>
          </View>
          <AppButton label="Close" variant="ghost" onPress={onClose} style={styles.closeBtn} />
        </View>

        <View style={styles.searchCard}>
          <View style={styles.modeRow}>
            {(Object.keys(MODE_LABELS) as QuoteMode[]).map((item) => (
              <Pressable
                key={item}
                onPress={() => setMode(item)}
                style={[styles.modePill, mode === item && styles.modePillActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item }}
              >
                <Text style={[styles.modeText, mode === item && styles.modeTextActive]}>{MODE_LABELS[item]}</Text>
              </Pressable>
            ))}
          </View>
          <FieldLabel>Phone or quote reference</FieldLabel>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="TRQ-1048 or 07700"
            placeholderTextColor={colors.subtle}
            style={styles.input}
            autoCapitalize="characters"
          />
          <AppButton label="Search" onPress={loadQuotes} loading={loading} disabled={loading} fullWidth />
        </View>

        {error ? <StatusBanner kind="err" message={error} /> : null}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.stateText}>Loading quotes...</Text>
            </View>
          ) : visibleQuotes.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={styles.stateText}>No saved quotes found.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {visibleQuotes.map((quote) => (
                <Pressable key={quote.id} onPress={() => openQuote(quote)} style={styles.card} accessibilityRole="button">
                  <View style={styles.cardTopRow}>
                    <Text style={styles.quoteRef}>{quote.quoteRef}</Text>
                    <Text style={[styles.status, { color: statusColor(quote.quoteStatus) }]}>{quote.quoteStatus}</Text>
                  </View>
                  <Text style={styles.cardLine}>{quote.customerPhone ?? 'No phone'} · {quote.tyreSize ?? 'No tyre size'} x {quote.quantity}</Text>
                  <Text style={styles.price}>{formatGbp(quote.priceAmount / 100)}</Text>
                  <Text style={styles.meta}>Created {formatDateTime(quote.createdAt)} · Expires {formatDateTime(quote.expiresAt)}</Text>
                  {quote.internalNotes ? <Text style={styles.notesPreview} numberOfLines={2}>{quote.internalNotes}</Text> : null}
                </Pressable>
              ))}
            </View>
          )}

          {selected ? (
            <View style={styles.detailCard}>
              <View style={styles.cardTopRow}>
                <Text style={styles.detailTitle}>{selected.quoteRef}</Text>
                <Text style={[styles.status, { color: statusColor(selected.quoteStatus) }]}>{selected.quoteStatus}</Text>
              </View>
              {detailLoading ? <ActivityIndicator color={colors.accent} /> : null}
              <Text style={styles.detailLine}>Phone: {selected.customerPhone ?? 'Not set'}</Text>
              <Text style={styles.detailLine}>Name: {selected.customerName ?? 'Not set'}</Text>
              <Text style={styles.detailLine}>Address: {selected.address ?? 'Not set'}</Text>
              <Text style={styles.detailLine}>Tyre: {selected.tyreSize ?? 'Not set'} x {selected.quantity}</Text>
              <Text style={styles.detailLine}>Price: {formatGbp(selected.priceAmount / 100)}</Text>
              <Text style={styles.detailLine}>Expires: {formatDateTime(selected.expiresAt)}</Text>
              <FieldLabel>Internal notes</FieldLabel>
              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                placeholder="Internal notes"
                placeholderTextColor={colors.subtle}
                style={[styles.input, styles.notesInput]}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.confirmPanel}>
                <Text style={styles.panelTitle}>Confirm Quote</Text>
                <View style={styles.confirmSummary}>
                  <Text style={styles.detailLine}>Quote ref: {selected.quoteRef}</Text>
                  <Text style={styles.detailLine}>Full price: {formatPence(selected.priceAmount)}</Text>
                  <Text style={styles.detailLine}>Expiry status: {selected.isExpired ? 'Expired' : 'Valid'}</Text>
                  <Text style={styles.detailLine}>Current status: {selected.quoteStatus}</Text>
                  <Text style={styles.detailLine}>Selected payment option: {PAYMENT_OPTIONS.find((item) => item.value === paymentOption)?.label ?? paymentOption}</Text>
                  {paymentOption === 'DEPOSIT_15' && selectedDeposit ? (
                    <>
                      <Text style={styles.detailLine}>Deposit 15%: {formatPence(selectedDeposit.depositAmountPence)}</Text>
                      <Text style={styles.detailLine}>Remaining balance: {formatPence(selectedDeposit.remainingBalancePence)}</Text>
                    </>
                  ) : null}
                  {confirmationResult ? (
                    <Text style={styles.detailLine}>Next action: {NEXT_ACTION_LABELS[confirmationResult.nextAction] ?? confirmationResult.nextAction}</Text>
                  ) : null}
                </View>
                <View style={styles.optionList}>
                  {PAYMENT_OPTIONS.map((item) => (
                    <Pressable
                      key={item.value}
                      onPress={() => setPaymentOption(item.value)}
                      style={[styles.optionButton, paymentOption === item.value && styles.optionButtonActive]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.optionText, paymentOption === item.value && styles.optionTextActive]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.detailActions}>
                  <AppButton
                    label="Confirm Quote"
                    onPress={confirmQuote}
                    loading={actionBusy === 'confirm'}
                    disabled={actionBusy !== null || selected.isExpired || selected.quoteStatus === 'CANCELLED'}
                    fullWidth
                  />
                  <AppButton label="Copy WhatsApp Message" variant="secondary" onPress={copyMessage} loading={actionBusy === 'copy'} disabled={actionBusy !== null} fullWidth />
                  {paymentInstructionAvailable ? (
                    <AppButton label="Copy Payment Instructions" variant="secondary" onPress={copyPaymentInstruction} loading={actionBusy === 'instruction'} disabled={actionBusy !== null} fullWidth />
                  ) : null}
                  {canStartPayment ? (
                    <AppButton label="Start Payment" onPress={startPayment} loading={actionBusy === 'payment'} disabled={actionBusy !== null} fullWidth />
                  ) : null}
                </View>
                {isConfirmedStatus(selected.quoteStatus) || selected.confirmedAt ? (
                  <StatusBanner kind="info" message="This quote already has a confirmation state. Reconfirming returns the saved state without creating a booking." />
                ) : null}
                {confirmationResult?.paymentHandoff.message ? (
                  <StatusBanner kind="info" message={confirmationResult.paymentHandoff.message} />
                ) : null}
              </View>
              <View style={styles.detailActions}>
                <AppButton label="Save notes" variant="secondary" onPress={saveNotes} loading={actionBusy === 'notes'} disabled={actionBusy !== null} fullWidth />
                <AppButton label="Recalculate Price" variant="secondary" onPress={refreshQuote} loading={actionBusy === 'refresh'} disabled={actionBusy !== null || !selected.quickBookingId} fullWidth />
                <AppButton label="Send SMS" variant="secondary" onPress={sendSms} loading={actionBusy === 'sms'} disabled={actionBusy !== null || !selected.smsAvailable} fullWidth />
                <AppButton label="Use quote in draft" variant="ghost" onPress={() => onUseQuote(selected)} disabled={actionBusy !== null} fullWidth />
              </View>
              {!selected.smsAvailable && selected.smsUnavailableReason ? <StatusBanner kind="info" message={selected.smsUnavailableReason} /> : null}
              {selected.isExpired ? <StatusBanner kind="warn" message="This quote is expired. Recalculate it before confirming." /> : null}
              {success ? <StatusBanner kind="ok" message={success} /> : null}
              {detailError ? <StatusBanner kind="err" message={detailError} /> : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 14, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10 },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, marginTop: 2 },
  closeBtn: { minWidth: 92 },
  searchCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 10,
  },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: fontSize.md,
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modePill: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700', textAlign: 'center' },
  modeTextActive: { color: colors.accentText },
  content: { paddingBottom: 30, gap: 12 },
  centerState: { padding: 24, alignItems: 'center', gap: 10 },
  stateText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: '600' },
  list: { gap: 10 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 6,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  quoteRef: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  status: { fontSize: fontSize.xs, fontWeight: '800' },
  cardLine: { color: colors.muted, fontSize: fontSize.sm },
  price: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  meta: { color: colors.subtle, fontSize: fontSize.xs },
  notesPreview: { color: colors.text, fontSize: fontSize.sm, marginTop: 4 },
  detailCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 10,
  },
  detailTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  detailLine: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  notesInput: { minHeight: 86, paddingTop: 10 },
  confirmPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 10,
    gap: 10,
  },
  panelTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  confirmSummary: { gap: 3 },
  optionList: { gap: 8 },
  optionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  optionButtonActive: { borderColor: colors.accent, backgroundColor: colors.infoBg },
  optionText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  optionTextActive: { color: colors.accent },
  detailActions: { gap: 8 },
});