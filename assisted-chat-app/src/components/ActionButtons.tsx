import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type { AssistedChatDraft } from '@/types/assisted-chat';
import { AppButton, StatusBanner } from './ui';
import { copyToClipboard } from '@/lib/clipboard';
import {
  formatAssistedChatServiceType,
  hasAssistedChatTyre,
  summarizeBookingTyreLines,
} from '@/lib/assisted-chat-workflow';
import { formatGbp } from '@/lib/money';
import { colors, fontSize } from './theme';
import { useState } from 'react';

interface Props {
  draft: AssistedChatDraft;
  effectiveTotal: number;
  lockingNutCharge: number;
  onSendToDriver: () => void;
  dispatchBusy: boolean;
  dispatchError: string | null;
  /** Optional recovery panel rendered below the buttons when dispatch fails. */
  dispatchRecoverySlot?: ReactNode;
}

export function ActionButtons({
  draft,
  effectiveTotal,
  lockingNutCharge,
  onSendToDriver,
  dispatchBusy,
  dispatchError,
  dispatchRecoverySlot,
}: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  const handleCopy = async () => {
    const lines: string[] = [];
    lines.push('Tyre Rescue — Assisted Chat draft');
    lines.push(`Service: ${formatAssistedChatServiceType(draft.serviceType)}`);
    if (draft.customer.phone) lines.push(`Phone: ${draft.customer.phone}`);
    if (draft.location.address) lines.push(`Address: ${draft.location.address}`);
    if (draft.location.lat != null && draft.location.lng != null) {
      lines.push(`Coordinates: ${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
    }

    const tyreSummary = summarizeBookingTyreLines(draft.tyreLines);
    if (draft.serviceType === 'assess') {
      lines.push('Final tyre cost will be confirmed after inspection.');
    } else if (tyreSummary.length > 0) {
      lines.push('Tyres:');
      tyreSummary.forEach((line) => lines.push(`- ${line}`));
    }
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
      lines.push(`Locking wheel nut removal: ${formatGbp(lockingNutCharge)}`);
    }
    if (draft.note.trim()) lines.push(`Note: ${draft.note.trim()}`);
    if (draft.quote) {
      lines.push(`Total: ${formatGbp(effectiveTotal)}`);
    }
    if (draft.paymentChoice) {
      const map = {
        cash: `Cash (${formatGbp(effectiveTotal)})`,
        deposit: `Deposit 20% (${formatGbp(effectiveTotal * 0.20)})`,
        full: `Full payment (${formatGbp(effectiveTotal)})`,
      } as const;
      lines.push(`Payment choice: ${map[draft.paymentChoice]}`);
    }
    if (draft.paymentLink) {
      lines.push(`Payment link: ${draft.paymentLink.paymentUrl}`);
      lines.push(`Payment link amount: ${formatGbp(draft.paymentLink.amountPence / 100)}`);
      if (draft.paymentLink.remainingBalancePence != null) {
        lines.push(`Balance on-site: ${formatGbp(draft.paymentLink.remainingBalancePence / 100)}`);
      }
    }
    if (draft.dispatchedRefNumber) {
      lines.push(`Booking ref: ${draft.dispatchedRefNumber}`);
    }
    const ok = await copyToClipboard(lines.join('\n'));
    setCopyState(ok ? 'ok' : 'err');
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const baseDisabled =
    dispatchBusy ||
    !hasAssistedChatTyre(draft) ||
    !draft.quote ||
    !draft.paymentChoice;
  const sendDisabled = baseDisabled;
  const sendHint = (() => {
    if (draft.dispatchedRefNumber) return null;
    if (!hasAssistedChatTyre(draft)) return 'Enter a valid tyre size or choose Unknown / inspection required before sending to driver.';
    if (!draft.quote) return 'Get the price before sending to driver.';
    if (!draft.paymentChoice) return 'Choose deposit, cash, or full payment before sending.';
    return null;
  })();

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>ACTIONS</Text>

      <AppButton label="Copy details" variant="secondary" onPress={handleCopy} fullWidth />

      <AppButton
        label={
          draft.dispatchedRefNumber
            ? `Already dispatched (${draft.dispatchedRefNumber})`
            : 'Send it to driver'
        }
        variant="primary"
        onPress={onSendToDriver}
        loading={dispatchBusy}
        disabled={sendDisabled || draft.dispatchedRefNumber !== null}
        fullWidth
      />

      {sendHint ? <Text style={styles.hint}>{sendHint}</Text> : null}

      {dispatchError ? <StatusBanner kind="err" message={dispatchError} /> : null}
      {dispatchRecoverySlot}
      {copyState === 'ok' ? <StatusBanner kind="ok" message="Details copied to clipboard." /> : null}
      {copyState === 'err' ? <StatusBanner kind="err" message="Could not copy to clipboard." /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  heading: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: '700',
    letterSpacing: 0,
  },
  hint: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
