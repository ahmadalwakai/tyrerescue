/**
 * Single source of truth for the user-facing "from" prices that appear on
 * marketing pages, hero sections, service cards, JSON-LD schemas and SEO
 * metadata.
 *
 * IMPORTANT: This file does NOT drive booking, checkout or invoice totals.
 * Real money figures come from the pricing engine in `lib/pricing-engine.ts`
 * and the live tyre catalogue. This module exists purely so display copy
 * stays consistent and is not misleading (e.g. presenting a £20 fitting
 * fee as if it were the full service price).
 */

export type ServiceKey = 'fitting' | 'emergency' | 'punctureRepair';

export interface ServicePricingEntry {
  /** Lowest realistic starting figure for this service line item, in GBP. */
  from: number;
  /**
   * Display string shown on cards / hero. Includes the "+ tyre price"
   * disclaimer where the figure is only a fee (not the full service cost).
   */
  label: string;
  /**
   * One-line clarification, suitable for a small-print footnote underneath
   * the label.
   */
  disclaimer: string;
  /**
   * Realistic typical maximum a customer would actually pay for this service
   * (used for Schema.org `priceSpecification.maxPrice`). For fee-only items
   * this represents the typical upper bound including a premium tyre.
   */
  typicalMax: number;
}

export type ServicePricing = Record<ServiceKey, ServicePricingEntry>;

export const SERVICE_PRICING: ServicePricing = {
  fitting: {
    from: 20,
    label: 'Fitting from £20 + tyre price',
    disclaimer:
      'The £20 figure is the on-site fitting fee per tyre. The tyre itself is charged separately and varies by size and brand.',
    typicalMax: 170,
  },
  emergency: {
    from: 49,
    label: 'Callout from £49 + tyre price',
    disclaimer:
      'The £49 figure is the emergency callout fee. The tyre and any additional work are charged separately.',
    typicalMax: 220,
  },
  punctureRepair: {
    from: 25,
    label: 'Repair from £25',
    disclaimer:
      'Complete on-site puncture repair price (subject to tyre being repairable).',
    typicalMax: 45,
  },
};

/**
 * Site-wide footnote shown next to the "from" price on hero / cards.
 * Keep concise — the link is rendered separately by the consuming component.
 */
export const PRICING_DISCLAIMER =
  'Tyre prices vary by size and brand — see full pricing breakdown';

/** Where the disclaimer link should point. */
export const PRICING_DISCLAIMER_HREF = '/pricing-faq';

/**
 * Returns the display string for a service. Pass `withDisclaimer: true` to
 * append the per-service clarification on a single line.
 */
export function formatPrice(
  service: ServiceKey,
  options: { withDisclaimer?: boolean } = {}
): string {
  const entry = SERVICE_PRICING[service];
  if (options.withDisclaimer) {
    return `${entry.label} — ${entry.disclaimer}`;
  }
  return entry.label;
}

/**
 * The realistic price range string for Schema.org LocalBusiness `priceRange`.
 * Reflects the lowest fee through to a fully-fitted premium tyre.
 */
export const PRICE_RANGE_DISPLAY = `£${Math.min(
  ...Object.values(SERVICE_PRICING).map((s) => s.from)
)}–£${Math.max(...Object.values(SERVICE_PRICING).map((s) => s.typicalMax))}`;
