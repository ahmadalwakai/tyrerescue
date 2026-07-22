import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { formatGbp } from '@/lib/money';
import { getQuotePriceReductionDisplay } from '@/lib/quote-price-display';
import { ActionButton } from '../ui/ActionButton';
import { colors, fontSize, radius, space } from '../theme';

export type CompactQuoteStatus =
  | 'NOT_SAVED'
  | 'SAVED'
  | 'CONFIRMED'
  | 'PAYMENT_LINK_SENT'
  | 'PAYMENT_CONFIRMED';

interface CompactQuoteCardProps {
  /** The price shown in the big tappable display, in GBP. */
  displayedPriceGbp: number;
  /** Whether the displayed price is a manual operator override. */
  isManualPrice: boolean;
  /**
   * Engine-derived calculated total in GBP (engine total + locking nut).
   * Only rendered as a small "Original calculated price" hint when a manual
   * override is in effect AND differs from the calculated value.
   */
  originalCalculatedPriceGbp?: number;
  status: CompactQuoteStatus;
  /** Optional saved quote reference, e.g. "Q-12345". Displayed next to status. */
  savedQuoteRef: string | null;
  /** Optional expiry status string, e.g. "Expires in 1h 12m". */
  expiryText: string | null;

  /** True while the operator-facing price/quote needs to be re-pulled. */
  priceNeedsRefresh: boolean;
  /** True while a price refresh is in progress. */
  priceLoading: boolean;
  /** Disable everything because we have no quick booking yet. */
  missingQuickBooking: boolean;

  saveBusy: boolean;
  payBusy: boolean;
  payLabel?: string;
  showPayAction?: boolean;

  onEditPrice: () => void;
  onSaveQuote: () => void;
  onPay: () => void;

  /** Hidden when undefined. Otherwise renders a small toggle button. */
  onToggleBreakdown?: () => void;
  breakdownVisible?: boolean;
}

const STATUS_COPY: Record<CompactQuoteStatus, { label: string; tone: 'muted' | 'info' | 'success' | 'warning' }> = {
  NOT_SAVED: { label: 'Quote not saved', tone: 'muted' },
  SAVED: { label: 'Quote saved', tone: 'info' },
  CONFIRMED: { label: 'Quote confirmed', tone: 'success' },
  PAYMENT_LINK_SENT: { label: 'Payment link sent', tone: 'info' },
  PAYMENT_CONFIRMED: { label: 'Payment confirmed', tone: 'success' },
};

const TONE_COLOR: Record<'muted' | 'info' | 'success' | 'warning', string> = {
  muted: colors.muted,
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
};

export function CompactQuoteCard({
  displayedPriceGbp,
  isManualPrice,
  originalCalculatedPriceGbp,
  status,
  savedQuoteRef,
  expiryText,
  priceNeedsRefresh,
  priceLoading,
  missingQuickBooking,
  saveBusy,
  payBusy,
  payLabel = 'Send payment link',
  showPayAction = true,
  onEditPrice,
  onSaveQuote,
  onPay,
  onToggleBreakdown,
  breakdownVisible,
}: CompactQuoteCardProps) {
  const statusInfo = STATUS_COPY[status];
  const hasPrice = displayedPriceGbp > 0;
  const priceReduction = isManualPrice
    ? getQuotePriceReductionDisplay(displayedPriceGbp, originalCalculatedPriceGbp)
    : null;

  let saveDisabledReason: string | undefined;
  if (missingQuickBooking) saveDisabledReason = 'Pull a price first.';
  else if (!hasPrice) saveDisabledReason = 'No price available yet.';
  else if (priceNeedsRefresh) saveDisabledReason = 'Refresh the price before saving.';
  else if (priceLoading) saveDisabledReason = 'Wait for the current price calculation.';

  let payDisabledReason: string | undefined;
  if (missingQuickBooking) payDisabledReason = 'Pull a price first.';
  else if (!hasPrice) payDisabledReason = 'No price available yet.';
  else if (priceNeedsRefresh) payDisabledReason = 'Refresh the price before sending payment.';
  else if (priceLoading) payDisabledReason = 'Wait for the current price calculation.';

  const saveDisabled = saveDisabledReason !== undefined;
  const payDisabled = payDisabledReason !== undefined;

  const editDisabled = missingQuickBooking || priceLoading;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Quote</Text>
        <View style={[styles.statusPill, { borderColor: TONE_COLOR[statusInfo.tone] }]}>
          <Text style={[styles.statusText, { color: TONE_COLOR[statusInfo.tone] }]}>
            {statusInfo.label}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit quote price"
        onPress={editDisabled ? undefined : onEditPrice}
        disabled={editDisabled}
        style={({ pressed }) => [
          styles.priceTouch,
          pressed && !editDisabled ? styles.priceTouchPressed : null,
          editDisabled ? styles.priceTouchDisabled : null,
        ]}
      >
        <View style={styles.priceRow}>
          <Text style={styles.priceValue}>
            {hasPrice ? formatGbp(displayedPriceGbp) : '—'}
          </Text>
          {isManualPrice ? (
            <View style={styles.manualBadge}>
              <Text style={styles.manualBadgeText}>Manual price</Text>
            </View>
          ) : null}
        </View>
        {priceReduction ? (
          <View style={styles.priceReductionPanel}>
            <Text style={styles.priceReductionComparison}>{priceReduction.comparisonLabel}</Text>
            <Text style={styles.priceReductionDiscount}>{priceReduction.discountLabel}</Text>
          </View>
        ) : null}
        <Text style={styles.priceHint}>
          {editDisabled ? 'Pull a price to enable editing.' : 'Tap price to edit'}
        </Text>
      </Pressable>

      {savedQuoteRef || expiryText ? (
        <View style={styles.metaRow}>
          {savedQuoteRef ? <Text style={styles.metaText}>Ref {savedQuoteRef}</Text> : null}
          {expiryText ? <Text style={styles.metaText}>{expiryText}</Text> : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <ActionButton
          label="Save Quote"
          variant="secondary"
          onPress={onSaveQuote}
          loading={saveBusy}
          loadingLabel="Saving..."
          disabled={saveDisabled}
          disabledReason={saveDisabledReason}
          fullWidth
        />
        {showPayAction ? (
          <ActionButton
            label={payLabel}
            variant="primary"
            onPress={onPay}
            loading={payBusy}
            loadingLabel="Opening..."
            disabled={payDisabled}
            disabledReason={payDisabledReason}
            fullWidth
          />
        ) : null}
      </View>

      {onToggleBreakdown ? (
        <Pressable onPress={onToggleBreakdown} style={styles.breakdownToggle} accessibilityRole="button">
          <Text style={styles.breakdownToggleText}>
            {breakdownVisible ? 'Hide breakdown' : 'View breakdown'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const quoteCardShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 16px 38px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.07)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.glassStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.lg,
    gap: 12,
    ...quoteCardShadow,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0 },

  priceTouch: {
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    alignItems: 'flex-start',
    gap: 4,
    ...quoteCardShadow,
  },
  priceTouchPressed: { backgroundColor: colors.panelSoft },
  priceTouchDisabled: { opacity: 0.55 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  priceValue: { color: colors.text, fontSize: 36, fontWeight: '900', letterSpacing: 0 },
  manualBadge: {
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  manualBadgeText: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '900' },
  priceReductionPanel: {
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.md,
    backgroundColor: colors.successBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    marginTop: 2,
  },
  priceReductionComparison: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
    letterSpacing: 0,
  },
  priceReductionDiscount: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 0,
  },
  priceHint: { color: colors.subtle, fontSize: fontSize.xs, fontWeight: '600' },

  metaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

  breakdownToggle: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  breakdownToggleText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
