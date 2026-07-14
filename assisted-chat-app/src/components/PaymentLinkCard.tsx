import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { AssistedChatDraft, StripePaymentLinkState } from '@/types/assisted-chat';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';
import { formatGbp } from '@/lib/money';
import { summarizeBookingTyreLines } from '@/lib/assisted-chat-workflow';
import { AppButton, SectionCard, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';

interface Props {
  paymentLink: StripePaymentLinkState;
  draft: AssistedChatDraft;
  effectiveTotal: number;
  /** Manual admin override in GBP. When set, a small badge tells the operator the link uses the manual price. */
  manualPriceGbp?: number | null;
}

function moneyFromPence(pence: number): string {
  return formatGbp(pence / 100);
}

function buildPaymentMessage(
  paymentLink: StripePaymentLinkState,
  draft: AssistedChatDraft,
  effectiveTotal: number,
): string {
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  lines.push(
    paymentLink.kind === 'deposit'
      ? 'Your booking is ready. Please pay the 20% deposit using this secure payment link:'
      : 'Your booking is ready. Please complete the full payment using this secure payment link:',
  );
  lines.push(paymentLink.paymentUrl);
  lines.push('');
  lines.push(`Reference: ${paymentLink.refNumber}`);
  lines.push(
    paymentLink.kind === 'deposit'
      ? `Deposit due now: ${moneyFromPence(paymentLink.amountPence)}`
      : `Amount due: ${moneyFromPence(paymentLink.amountPence)}`,
  );
  if (paymentLink.remainingBalancePence != null) {
    lines.push(`Balance due on-site: ${moneyFromPence(paymentLink.remainingBalancePence)}`);
  }
  lines.push(`Total: ${formatGbp(effectiveTotal)}`);
  if (draft.location.address) lines.push(`Address: ${draft.location.address}`);
  const tyreSummary = summarizeBookingTyreLines(draft.tyreLines);
  if (tyreSummary.length > 0) {
    lines.push('Tyres:');
    tyreSummary.forEach((line) => lines.push(`- ${line}`));
  }
  return lines.join('\n');
}

function genericWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function PaymentLinkCard({ paymentLink, draft, effectiveTotal, manualPriceGbp = null }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const message = buildPaymentMessage(paymentLink, draft, effectiveTotal);

  const handleCopy = async (): Promise<void> => {
    const ok = await copyToClipboard(paymentLink.paymentUrl);
    setCopyState(ok ? 'ok' : 'err');
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const handleOpen = async (): Promise<void> => {
    setActionMessage(null);
    try {
      await Linking.openURL(paymentLink.paymentUrl);
    } catch {
      setActionMessage('Could not open payment link.');
    }
  };

  const handleWhatsApp = async (): Promise<void> => {
    setActionMessage(null);
    const url = buildWhatsAppUrl(draft.customer.phone, message) ?? genericWhatsAppUrl(message);
    try {
      await Linking.openURL(url);
    } catch {
      const ok = await copyToClipboard(message);
      setActionMessage(
        ok
          ? 'Payment message copied. Paste it into WhatsApp.'
          : 'Could not open WhatsApp.',
      );
    }
  };

  return (
    <SectionCard title={paymentLink.kind === 'deposit' ? 'Deposit payment link' : 'Full payment link'}>
      <View style={styles.summary}>
        <Text style={styles.readyText}>
          {paymentLink.kind === 'deposit'
            ? 'Deposit payment link ready'
            : 'Full payment link ready'}
        </Text>
        <Text style={styles.metaText}>Reference: {paymentLink.refNumber}</Text>
        <Text style={styles.amountText}>
          {paymentLink.kind === 'deposit' ? 'Deposit: ' : 'Amount: '}
          {moneyFromPence(paymentLink.amountPence)}
        </Text>
        {paymentLink.remainingBalancePence != null ? (
          <Text style={styles.metaText}>
            Balance on-site: {moneyFromPence(paymentLink.remainingBalancePence)}
          </Text>
        ) : null}
        {manualPriceGbp != null && Number.isFinite(manualPriceGbp) ? (
          <Text style={styles.metaText}>Manual price used for payment</Text>
        ) : null}
      </View>
      <Text style={styles.linkText} selectable>
        {paymentLink.paymentUrl}
      </Text>
      <View style={styles.actions}>
        <AppButton label="Copy payment link" variant="secondary" onPress={handleCopy} fullWidth />
        <AppButton label="Open payment link" variant="primary" onPress={handleOpen} fullWidth />
        <AppButton label="WhatsApp payment link" variant="secondary" onPress={handleWhatsApp} fullWidth />
      </View>
      {copyState === 'ok' ? <StatusBanner kind="ok" message="Payment link copied." /> : null}
      {copyState === 'err' ? <StatusBanner kind="err" message="Could not copy payment link." /> : null}
      {actionMessage ? <StatusBanner kind="warn" message={actionMessage} /> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  summary: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 4,
  },
  readyText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  amountText: { color: colors.accent, fontSize: fontSize.md, fontWeight: '800' },
  metaText: { color: colors.muted, fontSize: fontSize.xs },
  linkText: {
    marginTop: 8,
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  actions: { gap: 8, marginTop: 10 },
});
