import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type {
  AssistedChatPaymentChoice,
  AssistedChatQuoteBreakdown,
  StripePaymentLinkState,
} from '@/types/assisted-chat';
import { AppButton, SectionCard, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';
import { formatGbp } from '@/lib/money';

interface Props {
  quote: AssistedChatQuoteBreakdown | null;
  lockingNutCharge: number;
  loading: boolean;
  stageIdx: number;
  stageLabels: readonly string[];
  error: string | null;
  onGetPrice: () => void;
  onChoosePayment: (choice: AssistedChatPaymentChoice) => void;
  paymentChoice: AssistedChatPaymentChoice | null;
  paymentBusy: boolean;
  paymentError: string | null;
  paymentLink: StripePaymentLinkState | null;
  dispatchedRefNumber: string | null;
  /** Disable Get price for blocking client-side issues (e.g. insufficient stock). */
  pricingBlocked?: boolean;
  /** Optional inline slot rendered above Get price (e.g. duplicate warning). */
  beforeGetPriceSlot?: ReactNode;
  /** True when a priced field changed after the last quote. */
  priceNeedsRefresh?: boolean;
  /** Optional slot rendered after Get price when pricing failed (recovery). */
  afterGetPriceSlot?: ReactNode;
  /** Optional slot rendered after the payment buttons (e.g. customer message card / payment recovery). */
  afterPaymentSlot?: ReactNode;
  /** Guided screens use the sticky primary CTA instead of an inline Get price button. */
  showGetPriceAction?: boolean;
  /** Guided screens render exactly one payment selector elsewhere. */
  showPaymentOptions?: boolean;
  /**
   * Manual admin price override in GBP. When set, the breakdown is
   * relabelled as a calculated reference ("Calculated breakdown") and the
   * final highlighted row shows the manual price instead.
   */
  manualPriceGbp?: number | null;
}

export function PriceSummary({
  quote,
  lockingNutCharge,
  loading,
  stageIdx,
  stageLabels,
  error,
  onGetPrice,
  onChoosePayment,
  paymentChoice,
  paymentBusy,
  paymentError,
  paymentLink,
  dispatchedRefNumber,
  pricingBlocked,
  beforeGetPriceSlot,
  priceNeedsRefresh,
  afterGetPriceSlot,
  afterPaymentSlot,
  showGetPriceAction = true,
  showPaymentOptions = true,
  manualPriceGbp = null,
}: Props) {
  const baseTotal = quote?.total ?? 0;
  const calculatedTotal = baseTotal + lockingNutCharge;
  const hasManualOverride =
    typeof manualPriceGbp === 'number' && Number.isFinite(manualPriceGbp);
  // The customer-payable figure used for deposit/cash/full button labels and
  // the customer-facing sentence. Manual override wins over the engine total.
  const effectiveTotal = hasManualOverride ? (manualPriceGbp as number) : calculatedTotal;
  const depositPercent = 0.15;
  const deposit = effectiveTotal * depositPercent;
  const priceLines = quote?.lineItems.filter((line) => line.type !== 'subtotal' && line.type !== 'total') ?? [];
  const pricingSource = quote?.serviceOrigin?.source === 'driver' ? 'nearest driver' : quote?.serviceOrigin?.source === 'garage' ? 'garage' : null;
  const hasDistanceCharge = priceLines.some((line) => /callout|rural|distance/i.test(line.label));
  const hasRuralSurcharge = priceLines.some((line) => /rural/i.test(line.label));
  const customerPriceSentence = quote
    ? `Tell customer: total is ${formatGbp(effectiveTotal)} including tyre, fitting${hasDistanceCharge ? ', callout and distance charges' : ''}.`
    : null;
  const smartWarnings = [
    quote?.distanceKm != null && quote.distanceKm >= 48
      ? 'Long-distance job. The price includes extra travel distance.'
      : null,
    hasRuralSurcharge ? 'Rural surcharge is included in this quote. Mention this if the customer asks why the total is higher.' : null,
    lockingNutCharge > 0 ? 'Locking wheel nut removal is added on top of the quoted price.' : null,
  ].filter(Boolean) as string[];

  return (
    <SectionCard title={hasManualOverride ? 'Calculated breakdown' : 'Price'}>
      {beforeGetPriceSlot}
      {priceNeedsRefresh ? (
        <View style={{ marginBottom: 10 }}>
          <StatusBanner kind="warn" message="Price needs refresh. Address or tyre details changed after the last quote." />
        </View>
      ) : null}
      {showGetPriceAction ? (
        <AppButton
          label={loading ? stageLabels[Math.max(0, stageIdx)] + '…' : 'Get price'}
          onPress={onGetPrice}
          loading={loading}
          disabled={loading || pricingBlocked === true}
          fullWidth
        />
      ) : null}

      {error ? (
        <View style={{ marginTop: 10 }}>
          <StatusBanner kind="err" message={error} />
        </View>
      ) : null}
      {afterGetPriceSlot}

      {!quote && !loading && !error ? (
        <Text style={styles.emptyHint}>
          Price will appear after location and tyre details are ready.
        </Text>
      ) : null}

      {quote ? (
        <View style={styles.breakdown}>
          {priceLines.map((line, i) => (
            <View key={`${line.type}-${i}`} style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={2}>
                {line.label}
                {line.quantity && line.quantity > 1
                  ? `  × ${line.quantity}`
                  : ''}
              </Text>
              <Text style={styles.rowValue}>{formatGbp(line.amount)}</Text>
            </View>
          ))}

          {lockingNutCharge > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Locking wheel nut removal</Text>
              <Text style={styles.rowValue}>{formatGbp(lockingNutCharge)}</Text>
            </View>
          ) : null}

          {/* Show VAT only if engine returned a real positive VAT amount. */}
          {quote.vatAmount > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>VAT (incl.)</Text>
              <Text style={styles.rowValue}>{formatGbp(quote.vatAmount)}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>
              {hasManualOverride ? 'Calculated total' : 'Total'}
            </Text>
            <Text style={styles.totalValue}>{formatGbp(calculatedTotal)}</Text>
          </View>

          {hasManualOverride ? (
            <>
              <View style={styles.divider} />
              <View style={[styles.row, styles.finalRow]}>
                <Text style={styles.finalLabel}>Final quote price</Text>
                <Text style={styles.finalValue}>{formatGbp(effectiveTotal)}</Text>
              </View>
              <Text style={styles.manualNoteText}>Manual override applied</Text>
            </>
          ) : null}

          {customerPriceSentence ? (
            <View style={styles.sayBox}>
              <Text style={styles.sayText}>{customerPriceSentence}</Text>
            </View>
          ) : null}

          {quote.distanceKm != null ? (
            <Text style={styles.meta}>
              Distance used for pricing: {quote.distanceKm.toFixed(1)} km{pricingSource ? ` from ${pricingSource}` : ''}
            </Text>
          ) : (
            <Text style={styles.warnMeta}>Pricing distance unavailable. Price used the fallback distance.</Text>
          )}

          {smartWarnings.length > 0 ? (
            <View style={styles.warningStack}>
              {smartWarnings.map((warning) => (
                <StatusBanner key={warning} kind="warn" message={warning} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {quote && showPaymentOptions ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Text style={styles.payLabel}>Choose payment</Text>
          <View style={{ gap: 8 }}>
            <AppButton
              label={`Pay deposit 15% (${formatGbp(deposit)})`}
              onPress={() => onChoosePayment('deposit')}
              variant={paymentChoice === 'deposit' ? 'primary' : 'secondary'}
              loading={paymentBusy && paymentChoice === 'deposit'}
              disabled={paymentBusy || dispatchedRefNumber !== null}
              fullWidth
            />
            <AppButton
              label={`Cash (${formatGbp(effectiveTotal)})`}
              onPress={() => onChoosePayment('cash')}
              variant={paymentChoice === 'cash' ? 'primary' : 'secondary'}
              loading={paymentBusy && paymentChoice === 'cash'}
              disabled={paymentBusy || dispatchedRefNumber !== null}
              fullWidth
            />
            <AppButton
              label={`Full payment (${formatGbp(effectiveTotal)})`}
              onPress={() => onChoosePayment('full')}
              variant={paymentChoice === 'full' ? 'primary' : 'secondary'}
              loading={paymentBusy && paymentChoice === 'full'}
              disabled={paymentBusy || dispatchedRefNumber !== null}
              fullWidth
            />
          </View>
          {paymentError ? (
            <View style={{ marginTop: 6 }}>
              <StatusBanner kind="err" message={paymentError} />
            </View>
          ) : null}
          {dispatchedRefNumber ? (
            <View style={{ marginTop: 6 }}>
              <StatusBanner
                kind="ok"
                message={
                  paymentLink
                    ? `${paymentLink.kind === 'deposit' ? 'Deposit' : 'Full'} payment link ready for ${dispatchedRefNumber}.`
                    : `Booking ${dispatchedRefNumber} created.`
                }
              />
            </View>
          ) : null}
          {afterPaymentSlot}
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  breakdown: {
    marginTop: 12,
    padding: 10,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    gap: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLabel: { color: colors.text, fontSize: fontSize.sm, flexShrink: 1, paddingRight: 8 },
  rowValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  totalLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  totalValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  finalRow: {
    backgroundColor: colors.infoBg,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  finalLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  finalValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  manualNoteText: {
    marginTop: 4,
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sayBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    borderRadius: radius.md,
    backgroundColor: colors.infoBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sayText: { color: colors.info, fontSize: fontSize.sm, fontWeight: '700', lineHeight: 19 },
  meta: { marginTop: 6, color: colors.subtle, fontSize: fontSize.xs },
  warnMeta: { marginTop: 6, color: colors.warning, fontSize: fontSize.xs, fontWeight: '700' },
  emptyHint: {
    marginTop: 12,
    color: colors.muted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  warningStack: { marginTop: 8, gap: 6 },
  payLabel: { color: colors.muted, fontWeight: '700', fontSize: fontSize.xs, letterSpacing: 1 },
});
