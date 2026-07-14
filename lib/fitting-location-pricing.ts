import { Decimal } from 'decimal.js';

export const FITTING_AT_LOCATION_LABEL = 'Fitting at your location';
export const FITTING_LOCATION_MANUAL_QUOTE_ERROR = 'OUTSIDE_AUTO_PRICING_AREA';
export const FITTING_LOCATION_INVALID_DISTANCE_ERROR = 'FITTING_LOCATION_INVALID_DISTANCE';

/** Backend-only origin used to resolve service distance. Never trusted from frontend. */
export const GARAGE_ORIGIN_ADDRESS = '3, 10 Gateside St, Glasgow G31 1PD';

/** Maximum distance for automatic mobile pricing. Beyond this, a manual quote is required. */
export const MOBILE_AUTO_PRICING_MAX_MILES = 100;
export const ASSISTED_CHAT_AUTO_PRICING_MAX_MILES = 250;
export const MOBILE_MAX_DISTANCE_MILES = MOBILE_AUTO_PRICING_MAX_MILES;

export type FittingLocationPricingUnavailableReason =
  | 'INVALID_DISTANCE'
  | 'MANUAL_QUOTE_REQUIRED';

export type FittingLocationPricingResult =
  | {
      available: true;
      distanceMiles: number;
      travelFee: number;
      distanceServicePrice: number;
      fittingLabourFee: number;
      mobileFittingBasePrice: number;
      fittingPrice: number;
      displayPrice: string;
    }
  | {
      available: false;
      distanceMiles: number | null;
      fittingPrice: null;
      displayPrice: null;
      reason: FittingLocationPricingUnavailableReason;
      message: string;
    };

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function formatGbp(amount: number): string {
  return gbpFormatter.format(amount);
}

/**
 * Returns the portion of distance d that falls between from and to miles.
 * Used to build continuous (no-jump) piecewise travel fee tiers.
 */
export function milesBetween(distance: number, from: number, to: number): number {
  return Math.max(0, Math.min(distance, to) - from);
}

/**
 * Continuous travel fee with no step-jumps at tier boundaries.
 * Returns null when distance exceeds the supplied automatic-pricing limit.
 *
 * Tier structure:
 *   0–3 mi:  base £24 (flat)
 *   3–10 mi: £1.70/mile
 *   10–20 mi: £2.35/mile
 *   20–40 mi: £3.00/mile
 *   40–60 mi: £3.85/mile
 *   60+ mi: £4.25/mile, capped by the active automatic-pricing limit
 */
export function normalizeMobileAutoPricingMaxMiles(value?: number | null): number {
  if (value == null || !Number.isFinite(value)) return MOBILE_AUTO_PRICING_MAX_MILES;
  return Math.min(
    ASSISTED_CHAT_AUTO_PRICING_MAX_MILES,
    Math.max(0, Math.round(value * 100) / 100),
  );
}

export function calculateTravelFee(
  distanceMiles: number,
  maxAutoPricingMiles: number = MOBILE_AUTO_PRICING_MAX_MILES,
): number | null {
  if (!Number.isFinite(distanceMiles) || distanceMiles < 0) return null;
  const maxMiles = normalizeMobileAutoPricingMaxMiles(maxAutoPricingMiles);
  if (distanceMiles > maxMiles) return null;

  const d = distanceMiles;
  const fee = new Decimal(24)
    .plus(new Decimal(milesBetween(d, 3, 10)).times(1.7))
    .plus(new Decimal(milesBetween(d, 10, 20)).times(2.35))
    .plus(new Decimal(milesBetween(d, 20, 40)).times(3.0))
    .plus(new Decimal(milesBetween(d, 40, 60)).times(3.85))
    .plus(new Decimal(milesBetween(d, 60, maxMiles)).times(4.25));

  return fee.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Calculates the v2 fitting-at-location price.
 *
 * In v2, labour is billed separately by the pricing engine.
 * This function returns only the travel (distance) component.
 * fittingLabourFee is always 0; fittingPrice equals travelFee.
 */
export function calculateFittingAtLocationPrice(
  distanceMiles: number | null | undefined,
  maxAutoPricingMiles: number = MOBILE_AUTO_PRICING_MAX_MILES,
): FittingLocationPricingResult {
  if (
    distanceMiles === null ||
    distanceMiles === undefined ||
    !Number.isFinite(distanceMiles) ||
    distanceMiles < 0
  ) {
    return {
      available: false,
      distanceMiles: null,
      fittingPrice: null,
      displayPrice: null,
      reason: 'INVALID_DISTANCE',
      message: 'Unable to calculate fitting-at-location price because the distance is invalid.',
    };
  }

  const maxMiles = normalizeMobileAutoPricingMaxMiles(maxAutoPricingMiles);
  if (distanceMiles > maxMiles) {
    return {
      available: false,
      distanceMiles,
      fittingPrice: null,
      displayPrice: null,
      reason: 'MANUAL_QUOTE_REQUIRED',
      message: `This fitting location is over ${maxMiles} miles away and needs a manual quote.`,
    };
  }

  const travelFee = calculateTravelFee(distanceMiles, maxMiles)!;

  return {
    available: true,
    distanceMiles,
    travelFee,
    distanceServicePrice: travelFee,
    fittingLabourFee: 0,
    mobileFittingBasePrice: travelFee,
    fittingPrice: travelFee,
    displayPrice: formatGbp(travelFee),
  };
}
