import { Decimal } from 'decimal.js';

export const FITTING_AT_LOCATION_LABEL = 'Fitting at your location';
export const FITTING_LOCATION_MANUAL_QUOTE_ERROR = 'FITTING_LOCATION_MANUAL_QUOTE_REQUIRED';
export const FITTING_LOCATION_INVALID_DISTANCE_ERROR = 'FITTING_LOCATION_INVALID_DISTANCE';

export type FittingLocationPricingUnavailableReason =
  | 'INVALID_DISTANCE'
  | 'MANUAL_QUOTE_REQUIRED';

export type FittingLocationPricingResult =
  | {
      available: true;
      distanceMiles: number;
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

export function calculateFittingAtLocationPrice(
  distanceMiles: number | null | undefined,
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

  if (distanceMiles > 100) {
    return {
      available: false,
      distanceMiles,
      fittingPrice: null,
      displayPrice: null,
      reason: 'MANUAL_QUOTE_REQUIRED',
      message: 'This fitting location is over 100 miles away and needs a manual quote.',
    };
  }

  const distance = new Decimal(distanceMiles);
  let distanceServicePrice: Decimal;

  if (distance.lte(5)) {
    distanceServicePrice = new Decimal(88).plus(distance.times(0.33));
  } else if (distance.lte(10)) {
    distanceServicePrice = new Decimal(120);
  } else if (distance.lte(20)) {
    distanceServicePrice = new Decimal(166).plus(distance.minus(10).times(1.2));
  } else if (distance.lte(40)) {
    distanceServicePrice = new Decimal(210).plus(distance.minus(20).times(1.43));
  } else {
    distanceServicePrice = new Decimal(389).plus(distance.minus(40).times(1.75));
  }

  const fittingLabourFee = distance.lte(20) ? new Decimal(33) : new Decimal(45);
  const mobileFittingBasePrice = distanceServicePrice.plus(fittingLabourFee);
  const roundedDistanceServicePrice = distanceServicePrice.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  const roundedFittingLabourFee = fittingLabourFee.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  const rounded = mobileFittingBasePrice.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  return {
    available: true,
    distanceMiles,
    distanceServicePrice: roundedDistanceServicePrice,
    fittingLabourFee: roundedFittingLabourFee,
    mobileFittingBasePrice: rounded,
    fittingPrice: rounded,
    displayPrice: formatGbp(rounded),
  };
}
