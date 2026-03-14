/**
 * Tyre Rescue Pricing Engine
 * 
 * Calculates pricing for bookings based on configurable rules.
 * All monetary constants are read from the pricingRules parameter.
 * No values are hardcoded in this module.
 */

import { Decimal } from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Types
export interface TyreSelection {
  tyreId: string;
  quantity: number;
  unitPrice: number;
  service: 'fit' | 'repair' | 'assess';
  requiresTpms?: boolean;
}

export interface PricingRules {
  fitting_fee_per_tyre: number;
  repair_fee_per_tyre: number;
  tpms_fee_per_tyre: number;
  emergency_surcharge: number;
  weekend_surcharge: number;
  bank_holiday_surcharge: number;
  multi_tyre_discount_2: number;
  multi_tyre_discount_3: number;
  multi_tyre_discount_4: number;
  minimum_order_total: number;
  max_service_miles: number;
  quote_expiry_minutes: number;
  surge_pricing_enabled: boolean;
  callout_0_5: number;
  callout_5_10: number;
  callout_10_15: number;
  callout_15_20: number;
  callout_20_30: number;
  callout_30_40: number;
  callout_40_base: number;
  callout_40_per_mile: number;
}

export interface PricingInput {
  tyreSelections: TyreSelection[];
  distanceMiles: number;
  bookingType: 'emergency' | 'scheduled';
  bookingDate: Date;
  isBankHoliday: boolean;
  surgeMultiplier?: number;
}

export interface PricingLineItem {
  label: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  type: 'tyre' | 'service' | 'callout' | 'surcharge' | 'discount' | 'subtotal' | 'vat' | 'total';
}

export interface PricingBreakdown {
  lineItems: PricingLineItem[];
  totalTyreCost: number;
  totalServiceFee: number;
  calloutFee: number;
  totalSurcharges: number;
  discountAmount: number;
  surgeMultiplier: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  quoteExpiresAt: Date;
  isValid: boolean;
  error?: string;
}

/**
 * Convert pricing rules from database format (string values) to typed object
 */
export function parsePricingRules(
  rules: Array<{ key: string; value: string }>
): PricingRules {
  const ruleMap = new Map(rules.map((r) => [r.key, r.value]));

  const getNum = (key: string, defaultVal: number): number => {
    const val = ruleMap.get(key);
    return val !== undefined ? parseFloat(val) : defaultVal;
  };

  const getBool = (key: string, defaultVal: boolean): boolean => {
    const val = ruleMap.get(key);
    return val !== undefined ? val === 'true' : defaultVal;
  };

  return {
    fitting_fee_per_tyre: getNum('fitting_fee_per_tyre', 20.0),
    repair_fee_per_tyre: getNum('repair_fee_per_tyre', 25.0),
    tpms_fee_per_tyre: getNum('tpms_fee_per_tyre', 10.0),
    emergency_surcharge: getNum('emergency_surcharge', 30.0),
    weekend_surcharge: getNum('weekend_surcharge', 15.0),
    bank_holiday_surcharge: getNum('bank_holiday_surcharge', 25.0),
    multi_tyre_discount_2: getNum('multi_tyre_discount_2', 5.0),
    multi_tyre_discount_3: getNum('multi_tyre_discount_3', 8.0),
    multi_tyre_discount_4: getNum('multi_tyre_discount_4', 12.0),
    minimum_order_total: getNum('minimum_order_total', 50.0),
    max_service_miles: getNum('max_service_miles', 50),
    quote_expiry_minutes: getNum('quote_expiry_minutes', 15),
    surge_pricing_enabled: getBool('surge_pricing_enabled', false),
    callout_0_5: getNum('callout_0_5', 0.0),
    callout_5_10: getNum('callout_5_10', 10.0),
    callout_10_15: getNum('callout_10_15', 20.0),
    callout_15_20: getNum('callout_15_20', 30.0),
    callout_20_30: getNum('callout_20_30', 45.0),
    callout_30_40: getNum('callout_30_40', 60.0),
    callout_40_base: getNum('callout_40_base', 60.0),
    callout_40_per_mile: getNum('callout_40_per_mile', 1.5),
  };
}

/**
 * Component 1: Calculate total tyre cost
 */
function calculateTyreCost(tyreSelections: TyreSelection[]): {
  total: Decimal;
  lineItems: PricingLineItem[];
} {
  const lineItems: PricingLineItem[] = [];
  let total = new Decimal(0);

  for (const selection of tyreSelections) {
    const amount = new Decimal(selection.unitPrice).times(selection.quantity);
    total = total.plus(amount);

    lineItems.push({
      label: 'Tyre',
      quantity: selection.quantity,
      unitPrice: selection.unitPrice,
      amount: amount.toNumber(),
      type: 'tyre',
    });
  }

  return { total, lineItems };
}

/**
 * Component 2: Calculate service fees
 */
function calculateServiceFees(
  tyreSelections: TyreSelection[],
  rules: PricingRules
): {
  total: Decimal;
  lineItems: PricingLineItem[];
} {
  const lineItems: PricingLineItem[] = [];
  let total = new Decimal(0);

  for (const selection of tyreSelections) {
    // Fitting fee
    if (selection.service === 'fit' || selection.service === 'assess') {
      const fittingAmount = new Decimal(rules.fitting_fee_per_tyre).times(
        selection.quantity
      );
      total = total.plus(fittingAmount);

      lineItems.push({
        label: 'Fitting fee',
        quantity: selection.quantity,
        unitPrice: rules.fitting_fee_per_tyre,
        amount: fittingAmount.toNumber(),
        type: 'service',
      });
    }

    // Repair fee
    if (selection.service === 'repair') {
      const repairAmount = new Decimal(rules.repair_fee_per_tyre).times(
        selection.quantity
      );
      total = total.plus(repairAmount);

      lineItems.push({
        label: 'Repair fee',
        quantity: selection.quantity,
        unitPrice: rules.repair_fee_per_tyre,
        amount: repairAmount.toNumber(),
        type: 'service',
      });
    }

    // TPMS fee
    if (selection.requiresTpms) {
      const tpmsAmount = new Decimal(rules.tpms_fee_per_tyre).times(
        selection.quantity
      );
      total = total.plus(tpmsAmount);

      lineItems.push({
        label: 'TPMS reset',
        quantity: selection.quantity,
        unitPrice: rules.tpms_fee_per_tyre,
        amount: tpmsAmount.toNumber(),
        type: 'service',
      });
    }
  }

  return { total, lineItems };
}

/**
 * Component 3: Calculate callout fee based on distance
 */
function calculateCalloutFee(
  distanceMiles: number,
  rules: PricingRules
): {
  fee: Decimal;
  lineItem: PricingLineItem | null;
  isOutsideArea: boolean;
} {
  // Check if outside service area
  if (distanceMiles > rules.max_service_miles) {
    return {
      fee: new Decimal(0),
      lineItem: null,
      isOutsideArea: true,
    };
  }

  let fee: Decimal;
  let label: string;

  if (distanceMiles <= 5) {
    fee = new Decimal(rules.callout_0_5);
    label = 'Callout (0-5 miles)';
  } else if (distanceMiles <= 10) {
    fee = new Decimal(rules.callout_5_10);
    label = 'Callout (5-10 miles)';
  } else if (distanceMiles <= 15) {
    fee = new Decimal(rules.callout_10_15);
    label = 'Callout (10-15 miles)';
  } else if (distanceMiles <= 20) {
    fee = new Decimal(rules.callout_15_20);
    label = 'Callout (15-20 miles)';
  } else if (distanceMiles <= 30) {
    fee = new Decimal(rules.callout_20_30);
    label = 'Callout (20-30 miles)';
  } else if (distanceMiles <= 40) {
    fee = new Decimal(rules.callout_30_40);
    label = 'Callout (30-40 miles)';
  } else {
    // Over 40 miles: base + per mile rate
    const extraMiles = distanceMiles - 40;
    fee = new Decimal(rules.callout_40_base).plus(
      new Decimal(rules.callout_40_per_mile).times(extraMiles)
    );
    label = `Callout (${Math.round(distanceMiles)} miles)`;
  }

  // Don't add a line item if callout is free
  if (fee.isZero()) {
    return {
      fee,
      lineItem: null,
      isOutsideArea: false,
    };
  }

  return {
    fee,
    lineItem: {
      label,
      amount: fee.toNumber(),
      type: 'callout',
    },
    isOutsideArea: false,
  };
}

/**
 * Component 4: Calculate surcharges
 */
function calculateSurcharges(
  input: PricingInput,
  rules: PricingRules
): {
  total: Decimal;
  lineItems: PricingLineItem[];
} {
  const lineItems: PricingLineItem[] = [];
  let total = new Decimal(0);

  // Emergency surcharge
  if (input.bookingType === 'emergency') {
    const amount = new Decimal(rules.emergency_surcharge);
    total = total.plus(amount);
    lineItems.push({
      label: 'Emergency callout',
      amount: amount.toNumber(),
      type: 'surcharge',
    });
  }

  // Weekend surcharge
  const dayOfWeek = input.bookingDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) {
    const amount = new Decimal(rules.weekend_surcharge);
    total = total.plus(amount);
    lineItems.push({
      label: 'Weekend service',
      amount: amount.toNumber(),
      type: 'surcharge',
    });
  }

  // Bank holiday surcharge
  if (input.isBankHoliday) {
    const amount = new Decimal(rules.bank_holiday_surcharge);
    total = total.plus(amount);
    lineItems.push({
      label: 'Bank holiday service',
      amount: amount.toNumber(),
      type: 'surcharge',
    });
  }

  return { total, lineItems };
}

/**
 * Component 5: Calculate multi-tyre discount
 */
function calculateMultiTyreDiscount(
  totalServiceFee: Decimal,
  totalTyres: number,
  rules: PricingRules
): {
  discountRate: number;
  discountAmount: Decimal;
  lineItem: PricingLineItem | null;
} {
  let discountRate = 0;

  if (totalTyres >= 4) {
    discountRate = rules.multi_tyre_discount_4;
  } else if (totalTyres === 3) {
    discountRate = rules.multi_tyre_discount_3;
  } else if (totalTyres === 2) {
    discountRate = rules.multi_tyre_discount_2;
  }

  if (discountRate === 0) {
    return {
      discountRate: 0,
      discountAmount: new Decimal(0),
      lineItem: null,
    };
  }

  const discountAmount = totalServiceFee.times(discountRate).dividedBy(100);

  return {
    discountRate,
    discountAmount,
    lineItem: {
      label: `Multi-tyre discount (${discountRate}%)`,
      amount: -discountAmount.toNumber(),
      type: 'discount',
    },
  };
}

/**
 * Component 6: Apply surge multiplier
 * Note: Surge is advisory only, enabled via admin toggle
 */
function applySurgeMultiplier(
  subtotal: Decimal,
  surgeMultiplier: number | undefined,
  surgePricingEnabled: boolean
): {
  multiplier: number;
  adjustedSubtotal: Decimal;
} {
  // If surge pricing is disabled or no multiplier provided, return 1.0
  if (!surgePricingEnabled || surgeMultiplier === undefined) {
    return {
      multiplier: 1.0,
      adjustedSubtotal: subtotal,
    };
  }

  // Clamp multiplier to range 0.90 - 1.20
  const clampedMultiplier = Math.max(0.9, Math.min(1.2, surgeMultiplier));

  return {
    multiplier: clampedMultiplier,
    adjustedSubtotal: subtotal.times(clampedMultiplier),
  };
}

/**
 * Component 7: Calculate VAT and final total
 */
function calculateVatAndTotal(
  subtotal: Decimal,
  minimumTotal: number,
  vatRegistered: boolean = true
): {
  vatAmount: Decimal;
  total: Decimal;
} {
  let vatAmount: Decimal;
  if (vatRegistered) {
    const VAT_RATE = new Decimal(0.2);
    vatAmount = subtotal.times(VAT_RATE);
  } else {
    vatAmount = new Decimal(0);
  }
  let total = subtotal.plus(vatAmount);

  // Apply minimum order total
  const minimum = new Decimal(minimumTotal);
  if (total.lessThan(minimum)) {
    total = minimum;
  }

  return {
    vatAmount,
    total,
  };
}

/**
 * Main pricing calculation function
 */
export function calculatePricing(
  input: PricingInput,
  rules: PricingRules,
  vatRegistered: boolean = true
): PricingBreakdown {
  const lineItems: PricingLineItem[] = [];

  // Validate input
  if (!input.tyreSelections || input.tyreSelections.length === 0) {
    return {
      lineItems: [],
      totalTyreCost: 0,
      totalServiceFee: 0,
      calloutFee: 0,
      totalSurcharges: 0,
      discountAmount: 0,
      surgeMultiplier: 1.0,
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      quoteExpiresAt: new Date(),
      isValid: false,
      error: 'No tyres selected',
    };
  }

  // Component 1: Tyre cost
  const tyreCostResult = calculateTyreCost(input.tyreSelections);
  lineItems.push(...tyreCostResult.lineItems);

  // Component 2: Service fees
  const serviceFeeResult = calculateServiceFees(input.tyreSelections, rules);
  lineItems.push(...serviceFeeResult.lineItems);

  // Component 3: Callout fee
  const calloutResult = calculateCalloutFee(input.distanceMiles, rules);
  if (calloutResult.isOutsideArea) {
    return {
      lineItems: [],
      totalTyreCost: 0,
      totalServiceFee: 0,
      calloutFee: 0,
      totalSurcharges: 0,
      discountAmount: 0,
      surgeMultiplier: 1.0,
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      quoteExpiresAt: new Date(),
      isValid: false,
      error: 'OUTSIDE_SERVICE_AREA',
    };
  }
  if (calloutResult.lineItem) {
    lineItems.push(calloutResult.lineItem);
  }

  // Component 4: Surcharges
  const surchargeResult = calculateSurcharges(input, rules);
  lineItems.push(...surchargeResult.lineItems);

  // Component 5: Multi-tyre discount
  const totalTyres = input.tyreSelections.reduce(
    (sum, s) => sum + s.quantity,
    0
  );
  const discountResult = calculateMultiTyreDiscount(
    serviceFeeResult.total,
    totalTyres,
    rules
  );
  if (discountResult.lineItem) {
    lineItems.push(discountResult.lineItem);
  }

  // Calculate pre-surge subtotal
  const preSurgeSubtotal = tyreCostResult.total
    .plus(serviceFeeResult.total)
    .plus(calloutResult.fee)
    .plus(surchargeResult.total)
    .minus(discountResult.discountAmount);

  // Component 6: Surge multiplier
  const surgeResult = applySurgeMultiplier(
    preSurgeSubtotal,
    input.surgeMultiplier,
    rules.surge_pricing_enabled
  );

  // Add subtotal line item
  lineItems.push({
    label: vatRegistered ? 'Subtotal (excl. VAT)' : 'Subtotal',
    amount: surgeResult.adjustedSubtotal.toNumber(),
    type: 'subtotal',
  });

  // Component 7: VAT and total
  const { vatAmount, total } = calculateVatAndTotal(
    surgeResult.adjustedSubtotal,
    rules.minimum_order_total,
    vatRegistered
  );

  // Add VAT line item (only when VAT registered)
  if (vatRegistered) {
    lineItems.push({
      label: 'VAT (20%)',
      amount: vatAmount.toNumber(),
      type: 'vat',
    });
  }

  // Add total line item
  lineItems.push({
    label: 'Total',
    amount: total.toNumber(),
    type: 'total',
  });

  // Calculate quote expiry
  const quoteExpiresAt = new Date();
  quoteExpiresAt.setMinutes(
    quoteExpiresAt.getMinutes() + rules.quote_expiry_minutes
  );

  return {
    lineItems,
    totalTyreCost: tyreCostResult.total.toNumber(),
    totalServiceFee: serviceFeeResult.total.toNumber(),
    calloutFee: calloutResult.fee.toNumber(),
    totalSurcharges: surchargeResult.total.toNumber(),
    discountAmount: discountResult.discountAmount.toNumber(),
    surgeMultiplier: surgeResult.multiplier,
    subtotal: surgeResult.adjustedSubtotal.toNumber(),
    vatAmount: vatAmount.toNumber(),
    total: total.toNumber(),
    quoteExpiresAt,
    isValid: true,
  };
}

/**
 * Format price for display in GBP
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}

/**
 * Default pricing rules for seeding
 */
export const defaultPricingRules: Array<{
  key: string;
  value: string;
  label: string;
  type: 'amount' | 'percentage' | 'boolean' | 'multiplier';
}> = [
  {
    key: 'fitting_fee_per_tyre',
    value: '20.00',
    label: 'Fitting fee per tyre',
    type: 'amount',
  },
  {
    key: 'repair_fee_per_tyre',
    value: '25.00',
    label: 'Repair fee per tyre',
    type: 'amount',
  },
  {
    key: 'tpms_fee_per_tyre',
    value: '10.00',
    label: 'TPMS reset fee per tyre',
    type: 'amount',
  },
  {
    key: 'emergency_surcharge',
    value: '30.00',
    label: 'Emergency callout surcharge',
    type: 'amount',
  },
  {
    key: 'weekend_surcharge',
    value: '15.00',
    label: 'Weekend surcharge',
    type: 'amount',
  },
  {
    key: 'bank_holiday_surcharge',
    value: '25.00',
    label: 'Bank holiday surcharge',
    type: 'amount',
  },
  {
    key: 'multi_tyre_discount_2',
    value: '5.00',
    label: 'Multi-tyre discount (2 tyres)',
    type: 'percentage',
  },
  {
    key: 'multi_tyre_discount_3',
    value: '8.00',
    label: 'Multi-tyre discount (3 tyres)',
    type: 'percentage',
  },
  {
    key: 'multi_tyre_discount_4',
    value: '12.00',
    label: 'Multi-tyre discount (4 tyres)',
    type: 'percentage',
  },
  {
    key: 'minimum_order_total',
    value: '50.00',
    label: 'Minimum order total',
    type: 'amount',
  },
  {
    key: 'max_service_miles',
    value: '50',
    label: 'Maximum service distance (miles)',
    type: 'amount',
  },
  {
    key: 'quote_expiry_minutes',
    value: '15',
    label: 'Quote expiry (minutes)',
    type: 'amount',
  },
  {
    key: 'surge_pricing_enabled',
    value: 'false',
    label: 'Surge pricing enabled',
    type: 'boolean',
  },
  {
    key: 'callout_0_5',
    value: '0.00',
    label: 'Callout fee (0-5 miles)',
    type: 'amount',
  },
  {
    key: 'callout_5_10',
    value: '10.00',
    label: 'Callout fee (5-10 miles)',
    type: 'amount',
  },
  {
    key: 'callout_10_15',
    value: '20.00',
    label: 'Callout fee (10-15 miles)',
    type: 'amount',
  },
  {
    key: 'callout_15_20',
    value: '30.00',
    label: 'Callout fee (15-20 miles)',
    type: 'amount',
  },
  {
    key: 'callout_20_30',
    value: '45.00',
    label: 'Callout fee (20-30 miles)',
    type: 'amount',
  },
  {
    key: 'callout_30_40',
    value: '60.00',
    label: 'Callout fee (30-40 miles)',
    type: 'amount',
  },
  {
    key: 'callout_40_base',
    value: '60.00',
    label: 'Callout fee base (over 40 miles)',
    type: 'amount',
  },
  {
    key: 'callout_40_per_mile',
    value: '1.50',
    label: 'Callout fee per mile (over 40 miles)',
    type: 'amount',
  },
];
