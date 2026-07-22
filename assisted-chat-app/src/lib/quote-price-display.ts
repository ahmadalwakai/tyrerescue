import { formatGbp } from './money';

const PRICE_DROP_ARROW = '\u2192';

export interface QuotePriceReductionDisplay {
  originalPriceGbp: number;
  discountedPriceGbp: number;
  discountGbp: number;
  comparisonLabel: string;
  discountLabel: string;
}

function toPence(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function getQuotePriceReductionDisplay(
  displayedPriceGbp: number,
  originalCalculatedPriceGbp?: number,
): QuotePriceReductionDisplay | null {
  const displayedPence = toPence(displayedPriceGbp);
  const originalPence = toPence(originalCalculatedPriceGbp);
  if (displayedPence == null || originalPence == null || displayedPence >= originalPence) return null;

  const originalPriceGbp = originalPence / 100;
  const discountedPriceGbp = displayedPence / 100;
  const discountGbp = (originalPence - displayedPence) / 100;

  return {
    originalPriceGbp,
    discountedPriceGbp,
    discountGbp,
    comparisonLabel: `${formatGbp(originalPriceGbp)} ${PRICE_DROP_ARROW} ${formatGbp(discountedPriceGbp)}`,
    discountLabel: `Discount: ${formatGbp(discountGbp)}`,
  };
}
