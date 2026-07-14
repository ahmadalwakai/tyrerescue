import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import {
  compactAssistedChatTyreSize,
  createBookingTyreLine,
  ensureBookingTyreLines,
  normalizeAssistedChatTyreSize,
  summarizeBookingTyreLines,
} from '@/lib/assisted-chat-workflow';
import type { AssistedChatDraft, BookingTyreLine, TyreSizeSuggestion } from '@/types/assisted-chat';
import { AppButton, FieldLabel, SectionCard } from './ui';
import { colors, fontSize, radius, space } from './theme';

interface Props {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

interface TyreLineCardProps {
  line: BookingTyreLine;
  index: number;
  required: boolean;
  onChange: (patch: Partial<BookingTyreLine>) => void;
  onRemove?: () => void;
}

function clampQuantity(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function TyreLineCard({ line, index, required, onChange, onRemove }: TyreLineCardProps) {
  const [sizeInput, setSizeInput] = useState(line.size);
  const [lastSize, setLastSize] = useState(line.size);
  if (lastSize !== line.size) {
    setLastSize(line.size);
    setSizeInput(line.size);
  }

  const [suggestions, setSuggestions] = useState<TyreSizeSuggestion[]>([]);
  const [showSugs, setShowSugs] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

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
    onChange({ size: value });
    setShowSugs(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(value), 200);
  };

  const select = (size: string) => {
    setSizeInput(size);
    onChange({ size });
    setSuggestions([]);
    setShowSugs(false);
  };

  const setQty = (q: number) => {
    onChange({ quantity: clampQuantity(q) });
  };

  const normalizedInputSize = normalizeAssistedChatTyreSize(sizeInput);
  const compactInputSize = compactAssistedChatTyreSize(sizeInput);
  const matchedSuggestion = suggestions.find(
    (s) => compactAssistedChatTyreSize(s.size) === compactInputSize,
  );

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
    } else if (count < line.quantity) {
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
  } else if (showSugs && searched && sizeInput.trim().length >= 2 && suggestions.length === 0) {
    stockLabel = 'No matching in-stock size';
    stockTone = 'err';
  }

  return (
    <View style={styles.tyreCard}>
      <View style={styles.tyreHeader}>
        <View style={styles.tyreHeaderCopy}>
          <Text style={styles.tyreTitle}>Tyre {index + 1}</Text>
          <Text style={styles.tyreSubtitle}>{required ? 'Required' : 'Optional'}</Text>
        </View>
        {!required && onRemove ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove tyre ${index + 1}`}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
          >
            <Text style={styles.removeBtnText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

      <FieldLabel>Size</FieldLabel>
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
                  key={`${line.id}-${s.size}`}
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
        {sizeInput.trim().length > 0 && !normalizedInputSize ? (
          <Text style={styles.empty}>Enter the full tyre size before continuing.</Text>
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

      <View style={styles.quantityBlock}>
        <FieldLabel>Quantity</FieldLabel>
        <View style={styles.qtyRow}>
          <AppButton
            label="-"
            variant="secondary"
            onPress={() => setQty(line.quantity - 1)}
            disabled={line.quantity <= 1}
            style={styles.qtyBtn}
          />
          <TextInput
            value={String(line.quantity)}
            onChangeText={(value) => {
              const parsed = Number.parseInt(value, 10);
              setQty(Number.isFinite(parsed) ? parsed : 1);
            }}
            keyboardType="numeric"
            selectTextOnFocus
            style={styles.qtyInput}
            accessibilityLabel={`Tyre ${index + 1} quantity`}
          />
          <AppButton
            label="+"
            variant="secondary"
            onPress={() => setQty(line.quantity + 1)}
            disabled={line.quantity >= 10}
            style={styles.qtyBtn}
          />
        </View>
      </View>
    </View>
  );
}

export function TyreSelectionSection({ draft, update }: Props) {
  const tyreLines = ensureBookingTyreLines(draft.tyreLines);
  const summary = summarizeBookingTyreLines(tyreLines);

  const quoteResetPatch = {
    quote: null,
    priceNeedsRefresh: Boolean(draft.quote || draft.priceNeedsRefresh),
    paymentChoice: null,
    paymentLink: null,
    dispatchedRefNumber: null,
    dispatchedBookingId: null,
    savedQuoteId: null,
    savedQuoteRef: null,
  };

  const updateLines = (nextLines: BookingTyreLine[]) => {
    update({
      tyreLines: ensureBookingTyreLines(nextLines),
      ...quoteResetPatch,
    });
  };

  const updateLine = (index: number, patch: Partial<BookingTyreLine>) => {
    updateLines(
      tyreLines.map((line, i) => (
        i === index
          ? {
              ...line,
              ...patch,
              quantity:
                patch.quantity != null
                  ? clampQuantity(patch.quantity)
                  : clampQuantity(line.quantity),
            }
          : line
      )),
    );
  };

  const addLine = () => {
    updateLines([...tyreLines, createBookingTyreLine()]);
  };

  const removeLine = (index: number) => {
    if (index === 0) return;
    updateLines(tyreLines.filter((_, i) => i !== index));
  };

  return (
    <SectionCard title="Tyre sizes and quantity">
      {!tyreLines[0]?.size.trim() ? (
        <Text style={styles.empty}>Enter the first tyre size to continue. Suggestions appear as you type.</Text>
      ) : null}

      <View style={styles.cardStack}>
        {tyreLines.map((line, index) => (
          <TyreLineCard
            key={line.id}
            line={line}
            index={index}
            required={index === 0}
            onChange={(patch) => updateLine(index, patch)}
            onRemove={index === 0 ? undefined : () => removeLine(index)}
          />
        ))}
      </View>

      <View style={styles.addButtonWrap}>
        <AppButton
          label="+ Add another tyre"
          variant="secondary"
          onPress={addLine}
          fullWidth
        />
      </View>

      {summary.length > 0 ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Booking summary</Text>
          {summary.map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.summaryLine}>{line}</Text>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  cardStack: { gap: space.md },
  tyreCard: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.sm,
  },
  tyreHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  tyreHeaderCopy: { flex: 1, minWidth: 0 },
  tyreTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  tyreSubtitle: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  removeBtn: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: colors.danger, fontSize: fontSize.xs, fontWeight: '700' },
  pressed: { opacity: 0.7 },
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
  quantityBlock: { marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 56 },
  qtyInput: {
    minWidth: 64,
    flex: 1,
    minHeight: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  addButtonWrap: { marginTop: space.md },
  summaryBox: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: space.md,
    gap: 4,
  },
  summaryTitle: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryLine: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
});
