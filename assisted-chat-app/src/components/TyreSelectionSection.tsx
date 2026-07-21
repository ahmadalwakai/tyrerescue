import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { api } from '@/lib/api';
import {
  ASSISTED_CHAT_SERVICE_LABELS,
  compactAssistedChatTyreSize,
  createBookingTyreLine,
  ensureBookingTyreLines,
  normalizeAssistedChatTyreSize,
  summarizeBookingTyreLines,
} from '@/lib/assisted-chat-workflow';
import type {
  AssistedChatDraft,
  AssistedChatServiceType,
  BookingTyreLine,
  TyreSizeSuggestion,
} from '@/types/assisted-chat';
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
  serviceType: AssistedChatServiceType;
  onChange: (patch: Partial<BookingTyreLine>) => void;
  onRemove?: () => void;
}

const SERVICE_OPTIONS: ReadonlyArray<{
  value: AssistedChatServiceType;
  title: string;
  subtitle: string;
}> = [
  {
    value: 'fit',
    title: 'Replacement tyre',
    subtitle: 'Stocked replacement, fitting and travel.',
  },
  {
    value: 'repair',
    title: 'Tyre repair',
    subtitle: 'Puncture repair callout, no stock hold.',
  },
  {
    value: 'assess',
    title: 'Unknown / inspection required',
    subtitle: 'Quote call-out, inspection and labour only.',
  },
];

function clampQuantity(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function TyreLineCard({ line, index, required, serviceType, onChange, onRemove }: TyreLineCardProps) {
  const isFit = serviceType === 'fit';
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
    if (!isFit) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
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
  }, [isFit]);

  const handleChange = (value: string) => {
    setSizeInput(value);
    onChange({ size: value });
    setShowSugs(isFit);
    if (timer.current) clearTimeout(timer.current);
    if (isFit) {
      timer.current = setTimeout(() => search(value), 200);
    } else {
      setSuggestions([]);
      setSearched(false);
    }
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
  if (isFit && matchedSuggestion) {
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
  } else if (isFit && showSugs && searched && sizeInput.trim().length >= 2 && suggestions.length === 0) {
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

      <FieldLabel>{isFit ? 'Size' : 'Affected tyre size'}</FieldLabel>
      <View>
        <TextInput
          value={sizeInput}
          onChangeText={handleChange}
          onFocus={() => setShowSugs(isFit)}
          placeholder={isFit ? 'e.g. 205/55R16' : 'e.g. 205/55R16 if known'}
          placeholderTextColor={colors.subtle}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
        {isFit && showSugs && suggestions.length > 0 ? (
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
        {isFit && showSugs && searched && suggestions.length === 0 && sizeInput.length >= 2 ? (
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
        <FieldLabel>{isFit ? 'Quantity' : 'Tyres to repair'}</FieldLabel>
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
  const serviceType = draft.serviceType ?? 'fit';
  const isInspectionOnly = serviceType === 'assess';
  const tyreLines = ensureBookingTyreLines(draft.tyreLines);
  const summary = isInspectionOnly ? [] : summarizeBookingTyreLines(tyreLines);

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

  const updateServiceType = (nextServiceType: AssistedChatServiceType) => {
    if (nextServiceType === serviceType) return;
    update({
      serviceType: nextServiceType,
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
    <SectionCard title="Service and tyre details">
      <View style={styles.servicePicker}>
        {SERVICE_OPTIONS.map((option) => {
          const selected = serviceType === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => updateServiceType(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.title}
              style={({ pressed }) => [
                styles.serviceOption,
                selected && styles.serviceOptionSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.serviceDot, selected && styles.serviceDotSelected]} />
              <View style={styles.serviceCopy}>
                <Text style={[styles.serviceTitle, selected && styles.serviceTitleSelected]}>
                  {option.title}
                </Text>
                <Text style={styles.serviceSubtitle}>{option.subtitle}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {isInspectionOnly ? (
        <View style={styles.inspectNotice}>
          <Text style={styles.inspectNoticeTitle}>Final tyre cost will be confirmed after inspection.</Text>
          <Text style={styles.inspectNoticeText}>
            No tyre size, tyre type, stock match or tyre price is required. The quote only includes call-out, inspection and labour.
          </Text>
        </View>
      ) : !tyreLines[0]?.size.trim() ? (
        <Text style={styles.empty}>
          {serviceType === 'fit'
            ? 'Enter the first tyre size to continue. Suggestions appear as you type.'
            : 'Enter the affected tyre size so the job details are clear for the driver.'}
        </Text>
      ) : null}

      {!isInspectionOnly ? (
        <>
          <View style={styles.cardStack}>
            {tyreLines.map((line, index) => (
              <TyreLineCard
                key={line.id}
                line={line}
                index={index}
                required={index === 0}
                serviceType={serviceType}
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
        </>
      ) : null}

      {summary.length > 0 || isInspectionOnly ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Booking summary</Text>
          <Text style={styles.summaryLine}>Service: {ASSISTED_CHAT_SERVICE_LABELS[serviceType]}</Text>
          {isInspectionOnly ? (
            <Text style={styles.summaryLine}>Final tyre cost will be confirmed after inspection.</Text>
          ) : null}
          {summary.map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.summaryLine}>{line}</Text>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

const tyreCardShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 14px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
});

const styles = StyleSheet.create({
  servicePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  serviceOption: {
    flexGrow: 1,
    flexBasis: 170,
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: space.md,
    ...tyreCardShadow,
  },
  serviceOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  serviceDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginTop: 2,
  },
  serviceDotSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  serviceTitleSelected: { color: colors.accent },
  serviceSubtitle: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: 4,
  },
  cardStack: { gap: space.md },
  tyreCard: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: space.md,
    gap: space.sm,
    ...tyreCardShadow,
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
    ...tyreCardShadow,
  },
  suggestionsBox: {
    marginTop: 6,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOverlay,
    overflow: 'hidden',
    ...tyreCardShadow,
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
  inspectNotice: {
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    padding: space.md,
    gap: 4,
  },
  inspectNoticeTitle: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  inspectNoticeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '700',
  },
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
    backgroundColor: colors.glassStrong,
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
    backgroundColor: colors.glassStrong,
    padding: space.md,
    gap: 4,
    ...tyreCardShadow,
  },
  summaryTitle: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryLine: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
});
