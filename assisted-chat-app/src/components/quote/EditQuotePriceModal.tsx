import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { formatGbp } from '@/lib/money';
import {
  ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
  ASSISTED_CHAT_PRICING_CONTEXT,
} from '@/lib/pricing-context';
import { ActionButton } from '../ui/ActionButton';
import { colors, fontSize, radius, space } from '../theme';
import type { AssistedChatQuoteBreakdown, QuickBookPatchResponse } from '@/types/assisted-chat';

const MIN_PRICE_GBP = 0.30;
const MAX_PRICE_GBP = 5000;
const MANUAL_PRICE_REASON = 'Manual admin price override';

interface EditQuotePriceModalProps {
  visible: boolean;
  /** Current displayed total in GBP (engine total + locking nut, or manual override if set). */
  currentPriceGbp: number;
  /** Engine base total in GBP (draft.quote.total) — used to compute the adminAdjustmentAmount delta. */
  engineBaseTotal: number;
  /** Existing quick_booking id; required for PATCH. Null disables editing. */
  quickBookingId: string | null;
  onClose: () => void;
  /** Called after a successful PATCH with the new manual price in GBP. */
  onSaved: (newPriceGbp: number, quote: AssistedChatQuoteBreakdown | null) => void;
}

function quoteFromQuickBookPatch(
  breakdown: QuickBookPatchResponse['booking']['priceBreakdown'],
  distanceKm: string | null,
): AssistedChatQuoteBreakdown | null {
  if (!breakdown) return null;

  const pricingDistanceMiles = breakdown.distanceMiles ?? breakdown.pricingDistanceMiles ?? null;
  const pricingDistanceKm =
    pricingDistanceMiles != null
      ? pricingDistanceMiles * 1.60934
      : distanceKm
      ? Number(distanceKm)
      : null;
  return {
    subtotal: breakdown.subtotal,
    vatAmount: breakdown.vatAmount,
    total: breakdown.total,
    lineItems: breakdown.lineItems,
    distanceKm: pricingDistanceKm,
    distanceMiles: pricingDistanceMiles,
    serviceDistanceMiles: breakdown.serviceDistanceMiles ?? null,
    pricingDistanceMiles,
    pricingDurationMinutes: breakdown.pricingDurationMinutes ?? null,
    garageDistanceMiles: breakdown.garageDistanceMiles ?? null,
    pricingDistanceSource: breakdown.pricingDistanceSource ?? null,
    distanceFloorApplied: breakdown.distanceFloorApplied ?? null,
    fittingPrice: breakdown.fittingPrice ?? null,
    tyrePrice: breakdown.tyrePrice ?? null,
    totalPrice: breakdown.totalPrice ?? null,
    tyreLines: breakdown.tyreLines ?? undefined,
    adminAdjustmentAmount: breakdown.adminAdjustmentAmount ?? null,
    adminAdjustmentReason: breakdown.adminAdjustmentReason ?? null,
    serviceOrigin: breakdown.serviceOrigin ?? null,
  };
}

function parsePrice(input: string): number | null {
  const trimmed = input.trim().replace(/[£\s,]/g, '');
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}

function validatePrice(input: string): { value: number | null; error: string | null } {
  const value = parsePrice(input);
  if (value === null) {
    return { value: null, error: 'Enter a valid amount in GBP, for example 120 or 89.50.' };
  }
  if (value <= 0) {
    return { value: null, error: 'Price must be greater than zero.' };
  }
  if (value < MIN_PRICE_GBP) {
    return { value: null, error: `Minimum price is ${formatGbp(MIN_PRICE_GBP)}.` };
  }
  if (value > MAX_PRICE_GBP) {
    return { value: null, error: `Maximum price is ${formatGbp(MAX_PRICE_GBP)}.` };
  }
  return { value, error: null };
}

export function EditQuotePriceModal({
  visible,
  currentPriceGbp,
  engineBaseTotal,
  quickBookingId,
  onClose,
  onSaved,
}: EditQuotePriceModalProps) {
  const [input, setInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      setInput(currentPriceGbp > 0 ? currentPriceGbp.toFixed(2) : '');
      setError(null);
      setSubmitError(null);
      setBusy(false);
    }
  }, [visible, currentPriceGbp]);

  const handleSubmit = async (): Promise<void> => {
    if (busy) return;
    setSubmitError(null);
    const result = validatePrice(input);
    if (result.error || result.value === null) {
      setError(result.error ?? 'Enter a valid amount.');
      return;
    }
    if (!quickBookingId) {
      setSubmitError('Manual price editing is not available in the current API response.');
      return;
    }
    setBusy(true);
    try {
      const delta = Math.round((result.value - engineBaseTotal) * 100) / 100;
      const patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${quickBookingId}`, {
        adminAdjustmentAmount: delta,
        adminAdjustmentReason: MANUAL_PRICE_REASON,
        pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
        adminDistanceLimitMiles: ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
      });
      onSaved(result.value, quoteFromQuickBookPatch(patched.booking.priceBreakdown, patched.booking.distanceKm));
      onClose();
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to update price.';
      setSubmitError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (next: string): void => {
    setInput(next);
    if (error) setError(null);
    if (submitError) setSubmitError(null);
  };

  const editingBlockedReason = !quickBookingId
    ? 'Manual price editing is not available in the current API response.'
    : null;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={styles.center}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Edit quote price</Text>
            <Text style={styles.helper}>
              Current price: <Text style={styles.helperStrong}>{formatGbp(currentPriceGbp)}</Text>
            </Text>
            <Text style={styles.helper}>
              This replaces the calculated total for this quote and is stored as an admin
              adjustment on the booking.
            </Text>

            <Text style={styles.label}>New price (GBP)</Text>
            <TextInput
              value={input}
              onChangeText={handleChange}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.subtle}
              editable={!busy && editingBlockedReason === null}
              style={styles.input}
              autoFocus
              accessibilityLabel="New quote price in GBP"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
            {editingBlockedReason ? <Text style={styles.warnText}>{editingBlockedReason}</Text> : null}

            <View style={styles.actions}>
              <ActionButton
                label="Cancel"
                variant="ghost"
                onPress={onClose}
                disabled={busy}
                fullWidth
              />
              <ActionButton
                label="Save price"
                variant="primary"
                onPress={() => { void handleSubmit(); }}
                loading={busy}
                loadingLabel="Saving..."
                disabled={editingBlockedReason !== null}
                disabledReason={editingBlockedReason ?? undefined}
                fullWidth
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'stretch',
    padding: space.md,
  },
  center: {
    width: '100%',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 10,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  helper: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 19 },
  helperStrong: { color: colors.text, fontWeight: '700' },
  label: {
    marginTop: 6,
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: fontSize.lg,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  errorText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600' },
  warnText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
