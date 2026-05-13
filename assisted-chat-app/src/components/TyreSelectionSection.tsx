import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import type { AssistedChatDraft, TyreSizeSuggestion } from '@/types/assisted-chat';
import { AppButton, FieldLabel, SectionCard } from './ui';
import { colors, fontSize, radius } from './theme';

interface Props {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

export function TyreSelectionSection({ draft, update }: Props) {
  const [sizeInput, setSizeInput] = useState(draft.tyre.size);
  // Re-sync local input when the parent draft.tyre.size changes (e.g.
  // hydration, clear). Uses the React docs "adjust state on prop change"
  // pattern instead of a setState-in-effect (which the
  // `react-hooks/set-state-in-effect` lint rule disallows).
  const [lastSize, setLastSize] = useState(draft.tyre.size);
  if (lastSize !== draft.tyre.size) {
    setLastSize(draft.tyre.size);
    setSizeInput(draft.tyre.size);
  }
  const [suggestions, setSuggestions] = useState<TyreSizeSuggestion[]>([]);
  const [showSugs, setShowSugs] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    try {
      const data = await api.get<{ sizes?: TyreSizeSuggestion[] }>(
        `/api/tyres/sizes?q=${encodeURIComponent(q)}`,
      );
      setSuggestions(data.sizes ?? []);
      setSearched(true);
    } catch {
      setSuggestions([]);
      setSearched(true);
    }
  }, []);

  const handleChange = (value: string) => {
    setSizeInput(value);
    update({
      tyre: { ...draft.tyre, size: value },
      ...(draft.quote ? { quote: null, priceNeedsRefresh: true, paymentChoice: null, paymentLink: null, dispatchedRefNumber: null } : {}),
    });
    setShowSugs(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(value), 200);
  };

  const select = (size: string) => {
    setSizeInput(size);
    update({
      tyre: { ...draft.tyre, size },
      ...(draft.quote ? { quote: null, priceNeedsRefresh: true, paymentChoice: null, paymentLink: null, dispatchedRefNumber: null } : {}),
    });
    setSuggestions([]);
    setShowSugs(false);
  };

  const setQty = (q: number) => {
    const clamped = Math.max(1, Math.min(10, Math.round(q)));
    update({
      tyre: { ...draft.tyre, quantity: clamped },
      ...(draft.quote ? { quote: null, priceNeedsRefresh: true, paymentChoice: null, paymentLink: null, dispatchedRefNumber: null } : {}),
    });
  };

  const trimmedSize = draft.tyre.size.trim().toLowerCase();
  const matchedSuggestion = suggestions.find(
    (s) => s.size.toLowerCase() === trimmedSize,
  );
  // Stock confidence is derived from the existing `/api/tyres/sizes` API
  // which already returns `count` per size. We never invent quantities; if
  // the API stops returning `count` (level === 'unknown'), we still allow
  // pricing but tell the operator the system will confirm exact quantity.
  let stockLabel: string | null = null;
  let stockTone: 'ok' | 'warn' | 'err' | 'muted' = 'muted';
  let insufficientStock = false;
  if (matchedSuggestion) {
    const count = matchedSuggestion.count;
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      stockLabel = 'Stock match found. Exact quantity will be confirmed by the system.';
      stockTone = 'muted';
    } else if (count <= 0) {
      stockLabel = 'Not available';
      stockTone = 'err';
    } else if (count < draft.tyre.quantity) {
      stockLabel = `Only ${count} available`;
      stockTone = 'err';
      insufficientStock = true;
    } else if (count <= 2) {
      stockLabel = `Low stock (${count} available)`;
      stockTone = 'warn';
    } else {
      stockLabel = `In stock (${count} available)`;
      stockTone = 'ok';
    }
  } else if (showSugs && searched && trimmedSize.length >= 2 && suggestions.length === 0) {
    stockLabel = 'No matching in-stock size';
    stockTone = 'err';
  }

  return (
    <SectionCard title="Tyre size and quantity">
      <FieldLabel>Tyre size (in-stock only)</FieldLabel>
      <View>
        <TextInput
          value={sizeInput}
          onChangeText={handleChange}
          onFocus={() => setShowSugs(true)}
          placeholder="e.g. 205/55R16"
          placeholderTextColor={colors.subtle}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
        {showSugs && suggestions.length > 0 ? (
          <View style={styles.suggestionsBox}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.size}
                  onPress={() => select(s.size)}
                  android_ripple={{ color: colors.ripple }}
                  style={styles.suggestionItem}
                >
                  <Text style={styles.suggestionText}>
                    {s.size}
                    <Text style={styles.suggestionCount}>  {s.count} in stock</Text>
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {showSugs && searched && suggestions.length === 0 && sizeInput.length >= 2 ? (
          <Text style={styles.empty}>No in-stock tyres match that size.</Text>
        ) : null}
        {stockLabel ? (
          <Text
            style={[
              styles.stockLabel,
              stockTone === 'ok' && styles.stockOk,
              stockTone === 'warn' && styles.stockWarn,
              stockTone === 'err' && styles.stockErr,
              stockTone === 'muted' && styles.stockMuted,
            ]}
          >
            {stockLabel}
          </Text>
        ) : null}
        {insufficientStock ? (
          <Text style={styles.unavailable}>
            Lower the quantity or pick a different size before pricing.
          </Text>
        ) : null}
      </View>

      <View style={{ marginTop: 14 }}>
        <FieldLabel>Quantity</FieldLabel>
        <View style={styles.qtyRow}>
          <AppButton
            label="−"
            variant="secondary"
            onPress={() => setQty(draft.tyre.quantity - 1)}
            disabled={draft.tyre.quantity <= 1}
            style={styles.qtyBtn}
          />
          <View style={styles.qtyDisplay}>
            <Text style={styles.qtyText}>{draft.tyre.quantity}</Text>
          </View>
          <AppButton
            label="+"
            variant="secondary"
            onPress={() => setQty(draft.tyre.quantity + 1)}
            disabled={draft.tyre.quantity >= 10}
            style={styles.qtyBtn}
          />
        </View>
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 44,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  suggestionsBox: {
    marginTop: 6,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  suggestionText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  suggestionCount: { color: colors.subtle, fontWeight: '400' },
  empty: { marginTop: 6, color: colors.muted, fontSize: fontSize.xs },
  stockLabel: { marginTop: 6, fontSize: fontSize.xs, fontWeight: '600' },
  stockOk: { color: colors.success },
  stockWarn: { color: colors.warning },
  stockErr: { color: colors.danger },
  stockMuted: { color: colors.muted },
  unavailable: { marginTop: 6, color: colors.danger, fontSize: fontSize.xs, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 56 },
  qtyDisplay: {
    minWidth: 56,
    minHeight: 44,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  qtyText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
});
