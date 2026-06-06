import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AssistedChatDraft, LockingNutAnswer } from '@/types/assisted-chat';
import { FieldLabel, SectionCard } from './ui';
import { colors, fontSize, radius } from './theme';

interface Props {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

const OPTIONS: { value: LockingNutAnswer; label: string }[] = [
  { value: 'yes', label: 'Yes, customer has the key' },
  { value: 'no', label: 'No, key is missing' },
  { value: 'unknown', label: 'Not asked yet' },
];

export function LockingWheelNutSection({ draft, update }: Props) {
  const [chargeInput, setChargeInput] = useState(
    draft.lockingNut.chargeGbp != null ? String(draft.lockingNut.chargeGbp) : '',
  );
  // Track the last `chargeGbp` we synced from props so we can re-derive
  // `chargeInput` whenever the parent draft changes (e.g. after hydration
  // or when another control resets it). This is the React docs pattern for
  // "adjusting state when props change" without a setState-in-effect, which
  // the `react-hooks/set-state-in-effect` lint rule disallows.
  const [lastChargeGbp, setLastChargeGbp] = useState(draft.lockingNut.chargeGbp);
  if (lastChargeGbp !== draft.lockingNut.chargeGbp) {
    setLastChargeGbp(draft.lockingNut.chargeGbp);
    setChargeInput(
      draft.lockingNut.chargeGbp != null ? String(draft.lockingNut.chargeGbp) : '',
    );
  }
  const [error, setError] = useState<string | null>(null);
  const quoteRefreshPatch = draft.quote || draft.priceNeedsRefresh
    ? {
        priceNeedsRefresh: true,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      }
    : {};

  const setAnswer = (answer: LockingNutAnswer) => {
    setError(null);
    if (answer === 'no') {
      update({ lockingNut: { answer, chargeGbp: draft.lockingNut.chargeGbp }, ...quoteRefreshPatch });
    } else {
      update({ lockingNut: { answer, chargeGbp: null }, ...quoteRefreshPatch });
      setChargeInput('');
    }
  };

  const setCharge = (raw: string) => {
    setChargeInput(raw);
    setError(null);
    if (raw.trim() === '') {
      update({ lockingNut: { ...draft.lockingNut, chargeGbp: null }, ...quoteRefreshPatch });
      return;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a valid GBP amount (0 or more).');
      return;
    }
    if (parsed > 1000) {
      setError('Charge looks too high. Confirm with the manager.');
    }
    update({
      lockingNut: { ...draft.lockingNut, chargeGbp: Math.round(parsed * 100) / 100 },
      ...quoteRefreshPatch,
    });
  };

  return (
    <SectionCard title="Locking wheel nut">
      <Text style={styles.question}>Does the customer have the locking wheel nut key?</Text>
      <View style={{ gap: 8 }}>
        {OPTIONS.map((opt) => {
          const selected = draft.lockingNut.answer === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setAnswer(opt.value)}
              android_ripple={{ color: colors.ripple }}
              style={[styles.option, selected && styles.optionSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {draft.lockingNut.answer === 'no' ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.warning}>
            A removal charge will be added to the price. Confirm the amount with the customer before pricing.
          </Text>
          <FieldLabel>Locking wheel nut removal charge (GBP)</FieldLabel>
          <TextInput
            value={chargeInput}
            onChangeText={setCharge}
            placeholder="e.g. 25"
            placeholderTextColor={colors.subtle}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  question: {
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    gap: 12,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  optionLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    flexShrink: 1,
  },
  optionLabelSelected: {
    fontWeight: '700',
    color: colors.accentText,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.accentText },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentText,
  },
  input: {
    minHeight: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  error: { marginTop: 6, color: colors.danger, fontSize: fontSize.xs },
  warning: {
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: 16,
  },
});
