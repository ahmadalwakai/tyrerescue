/**
 * Single source of truth for the final quote price the customer is asked
 * to pay. The pricing engine still produces a calculated total, but an
 * operator-typed manual override (admin adjustment) always wins.
 *
 * Units: all values are in GBP (pounds), matching `formatGbp` and the
 * `AssistedChatDraft` shape. Conversions to/from pence happen only at the
 * API boundary, never here.
 */

export interface FinalQuotePriceInput {
  /** Engine total after locking-nut surcharge, in GBP. May be 0 if no engine quote yet. */
  engineEffectiveTotalGbp: number;
  /** Operator override in GBP; `null` when no override is in effect. */
  manualPriceGbp: number | null;
}

export interface FinalQuotePriceResult {
  /** The single customer-payable amount in GBP. */
  finalPriceGbp: number;
  /** True when a manual operator override is in effect. */
  isManual: boolean;
  /** True when a manual override exists AND differs from the calculated total. */
  showOriginalCalculated: boolean;
  /** The calculated total in GBP (for display as "Original calculated price"). */
  calculatedPriceGbp: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hasManualQuotePrice(input: Pick<FinalQuotePriceInput, 'manualPriceGbp'>): boolean {
  return isFiniteNumber(input.manualPriceGbp);
}

export function getFinalQuotePrice(input: FinalQuotePriceInput): FinalQuotePriceResult {
  const calculatedPriceGbp = isFiniteNumber(input.engineEffectiveTotalGbp)
    ? input.engineEffectiveTotalGbp
    : 0;
  const isManual = hasManualQuotePrice(input);
  const finalPriceGbp = isManual ? (input.manualPriceGbp as number) : calculatedPriceGbp;
  // Round to pence for the difference check so trivial float noise doesn't
  // trigger the "Original calculated price" hint.
  const showOriginalCalculated =
    isManual && Math.round(finalPriceGbp * 100) !== Math.round(calculatedPriceGbp * 100);
  return { finalPriceGbp, isManual, showOriginalCalculated, calculatedPriceGbp };
}
