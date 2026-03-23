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
  serviceType?: 'repair' | 'fit' | 'both' | 'assess';
  tyreQuantity?: number;
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
    max_service_miles: getNum('max_service_miles', 190),
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
 * Component 7: Calculate final total
 * NOTE: VAT has been removed from the pricing system.
 * All prices are now VAT-inclusive (or VAT-exempt).
 */
function calculateVatAndTotal(
  subtotal: Decimal,
  minimumTotal: number,
  _vatRegistered: boolean = true
): {
  vatAmount: Decimal;
  total: Decimal;
} {
  // VAT removed - vatAmount is always 0
  const vatAmount = new Decimal(0);
  let total = subtotal;

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

  // Service-only path: no tyre products selected, just service fee + callout + surcharges.
  // Supports any serviceType (repair, fit, assess, both) — used by quick-book and repair-only bookings.
  const isServiceOnly = !input.tyreSelections || input.tyreSelections.length === 0;

  // Validate input — service-only requires an explicit serviceType
  if (isServiceOnly && !input.serviceType) {
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

  let tyreCostTotal: Decimal;
  let serviceFeeTotal: Decimal;

  if (isServiceOnly) {
    // Service-only: no tyre cost, calculate service fee from quantity and type
    tyreCostTotal = new Decimal(0);
    const quantity = input.tyreQuantity || 1;

    if (input.serviceType === 'repair') {
      const repairAmount = new Decimal(rules.repair_fee_per_tyre).times(quantity);
      serviceFeeTotal = repairAmount;
      lineItems.push({
        label: `Puncture Repair \u00D7 ${quantity}`,
        quantity,
        unitPrice: rules.repair_fee_per_tyre,
        amount: repairAmount.toNumber(),
        type: 'service',
      });
    } else {
      // fit, assess, both — use fitting fee
      const fee = rules.fitting_fee_per_tyre;
      const amount = new Decimal(fee).times(quantity);
      serviceFeeTotal = amount;
      const label = input.serviceType === 'assess'
        ? `Assessment \u00D7 ${quantity}`
        : `Tyre Fitting \u00D7 ${quantity}`;
      lineItems.push({
        label,
        quantity,
        unitPrice: fee,
        amount: amount.toNumber(),
        type: 'service',
      });
    }
  } else {
    // Component 1: Tyre cost
    const tyreCostResult = calculateTyreCost(input.tyreSelections);
    lineItems.push(...tyreCostResult.lineItems);
    tyreCostTotal = tyreCostResult.total;

    // Component 2: Service fees
    const serviceFeeResult = calculateServiceFees(input.tyreSelections, rules);
    lineItems.push(...serviceFeeResult.lineItems);
    serviceFeeTotal = serviceFeeResult.total;
  }

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
  const totalTyres = isServiceOnly
    ? (input.tyreQuantity || 1)
    : input.tyreSelections.reduce((sum, s) => sum + s.quantity, 0);
  const discountResult = calculateMultiTyreDiscount(
    serviceFeeTotal,
    totalTyres,
    rules
  );
  if (discountResult.lineItem) {
    lineItems.push(discountResult.lineItem);
  }

  // Calculate pre-surge subtotal
  const preSurgeSubtotal = tyreCostTotal
    .plus(serviceFeeTotal)
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
    label: 'Subtotal',
    amount: surgeResult.adjustedSubtotal.toNumber(),
    type: 'subtotal',
  });

  // Component 7: Calculate final total (VAT removed)
  const { vatAmount, total } = calculateVatAndTotal(
    surgeResult.adjustedSubtotal,
    rules.minimum_order_total,
    vatRegistered
  );

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
    totalTyreCost: tyreCostTotal.toNumber(),
    totalServiceFee: serviceFeeTotal.toNumber(),
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

// ─── Dynamic Surcharge Layer ────────────────────────────────────────────────

export interface DynamicSurchargeInput {
  isNight: boolean;
  nightSurchargePercent: number;
  manualSurchargeActive: boolean;
  manualSurchargePercent: number;
  demandSurchargePercent: number;
  isReturningVisitor: boolean;
  cookieReturnSurchargePercent: number;
  maxTotalSurchargePercent: number;
}

export interface DynamicSurchargeBreakdown {
  nightPercent: number;
  manualPercent: number;
  demandPercent: number;
  returningVisitorPercent: number;
  totalPercent: number;
  cappedPercent: number;
  wasCapApplied: boolean;
  labels: string[];
}

/**
 * Calculate layered dynamic surcharges.
 * Returns a breakdown with the total percentage to apply on the subtotal.
 * Total is capped at maxTotalSurchargePercent to prevent runaway pricing.
 */
export function calculateDynamicSurchargeBreakdown(
  input: DynamicSurchargeInput
): DynamicSurchargeBreakdown {
  const nightPercent = input.isNight ? input.nightSurchargePercent : 0;
  const manualPercent = input.manualSurchargeActive ? input.manualSurchargePercent : 0;
  const demandPercent = input.demandSurchargePercent;
  const returningVisitorPercent = input.isReturningVisitor
    ? input.cookieReturnSurchargePercent
    : 0;

  const totalPercent = nightPercent + manualPercent + demandPercent + returningVisitorPercent;
  const cappedPercent = Math.min(totalPercent, input.maxTotalSurchargePercent);
  const wasCapApplied = totalPercent > input.maxTotalSurchargePercent;

  const labels: string[] = [];
  if (nightPercent > 0) labels.push(`Night surcharge +${nightPercent}%`);
  if (manualPercent > 0) labels.push(`Admin surcharge +${manualPercent}%`);
  if (demandPercent > 0) labels.push(`Demand surcharge +${demandPercent}%`);
  if (returningVisitorPercent > 0) labels.push(`Returning visitor +${returningVisitorPercent}%`);
  if (wasCapApplied) labels.push(`Capped at ${input.maxTotalSurchargePercent}%`);

  return {
    nightPercent,
    manualPercent,
    demandPercent,
    returningVisitorPercent,
    totalPercent,
    cappedPercent,
    wasCapApplied,
    labels,
  };
}

/**
 * Apply dynamic surcharge to a subtotal.
 * Returns the surcharge amount as a Decimal.
 */
export function applyDynamicSurcharge(
  subtotal: number,
  surchargePercent: number
): { surchargeAmount: number; adjustedSubtotal: number } {
  const sub = new Decimal(subtotal);
  const surchargeAmount = sub.times(surchargePercent).dividedBy(100);
  return {
    surchargeAmount: surchargeAmount.toNumber(),
    adjustedSubtotal: sub.plus(surchargeAmount).toNumber(),
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
    value: '190',
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

// ─── Hybrid Pricing (Weather + Demand Aware) ────────────────────────────────

export interface HybridPricingInput extends PricingInput {
  /** Weather multiplier (1.00–1.25). Defaults to 1.0 if omitted. */
  weatherMultiplier?: number;
  /** Weather reason for audit trail */
  weatherReason?: string;
  /** Demand multiplier reason for audit trail */
  demandReason?: string;
}

export interface HybridPricingBreakdown {
  // Core components (from existing engine)
  basePrice: number;
  serviceCalloutFee: number;
  emergencyFee: number;
  afterHoursFee: number;
  distanceFee: number;
  tyreServiceFee: number;

  // Multipliers
  demandMultiplier: number;
  weatherMultiplier: number;

  // Subtotals
  subtotalBeforeMultipliers: number;
  subtotalAfterMultipliers: number;

  // Final
  finalPrice: number;

  // Audit
  pricingReasons: string[];
  pricingAudit: {
    lineItems: PricingLineItem[];
    surgeMultiplier: number;
    weatherMultiplier: number;
    demandContribution: number;
    weatherContribution: number;
    minimumApplied: boolean;
    calculatedAt: string;
  };

  // Preserve existing breakdown for backward compat
  legacyBreakdown: PricingBreakdown;
}

/** Max combined multiplier for safety bounds */
const MAX_COMBINED_MULTIPLIER = 1.50;
/** Minimum final price floor */
const MIN_FINAL_PRICE = 0;

/**
 * Calculate pricing with weather and demand awareness.
 *
 * Works by:
 * 1. Running the existing deterministic calculatePricing() with surge multiplier
 * 2. Applying the weather multiplier on top
 * 3. Clamping the combined effect
 * 4. Returning enriched breakdown with full audit trail
 *
 * This NEVER replaces calculatePricing — it wraps it.
 */
export function calculateHybridPricing(
  input: HybridPricingInput,
  rules: PricingRules,
  vatRegistered: boolean = true,
): HybridPricingBreakdown {
  const weatherMult = clampWeatherMultiplier(input.weatherMultiplier ?? 1.0);
  const demandMult = input.surgeMultiplier ?? 1.0;

  // Run existing engine (handles demand/surge multiplier internally)
  const legacy = calculatePricing(input, rules, vatRegistered);

  // Extract component fees from line items for the enriched breakdown
  const emergencyFee = legacy.lineItems
    .filter(li => li.label === 'Emergency callout')
    .reduce((sum, li) => sum + li.amount, 0);

  const weekendFee = legacy.lineItems
    .filter(li => li.label === 'Weekend service')
    .reduce((sum, li) => sum + li.amount, 0);

  const bankHolidayFee = legacy.lineItems
    .filter(li => li.label === 'Bank holiday service')
    .reduce((sum, li) => sum + li.amount, 0);

  const afterHoursFee = weekendFee + bankHolidayFee;

  // Subtotal BEFORE any multipliers = raw component total
  // The legacy engine applies surge internally, so we compute pre-surge subtotal:
  const subtotalBeforeMultipliers = legacy.surgeMultiplier !== 1.0
    ? legacy.subtotal / legacy.surgeMultiplier
    : legacy.subtotal;

  // Now apply weather multiplier on top of the surge-adjusted subtotal
  const afterDemand = legacy.subtotal; // already has demand multiplier from engine
  const afterWeather = new Decimal(afterDemand).times(weatherMult);

  // Safety: clamp combined multiplier effect
  const combinedMultiplier = demandMult * weatherMult;
  let finalSubtotal: Decimal;
  if (combinedMultiplier > MAX_COMBINED_MULTIPLIER) {
    // Re-derive from pre-multiplier subtotal with capped combined
    finalSubtotal = new Decimal(subtotalBeforeMultipliers).times(MAX_COMBINED_MULTIPLIER);
  } else {
    finalSubtotal = afterWeather;
  }

  // Apply minimum order total
  const minimum = new Decimal(rules.minimum_order_total);
  const minimumApplied = finalSubtotal.lessThan(minimum) && legacy.isValid;
  if (minimumApplied) {
    finalSubtotal = minimum;
  }

  // Round once at the end
  const finalPrice = Math.round(finalSubtotal.toNumber() * 100) / 100;

  // Build reasons
  const pricingReasons: string[] = [];
  if (input.bookingType === 'emergency') pricingReasons.push('Emergency booking');
  if (afterHoursFee > 0) pricingReasons.push('After-hours surcharge applied');
  if (demandMult > 1.0) pricingReasons.push(input.demandReason || `High live demand (${demandMult}x)`);
  if (demandMult < 1.0) pricingReasons.push(`Low demand discount (${demandMult}x)`);
  if (weatherMult > 1.0) pricingReasons.push(input.weatherReason || `Adverse weather (${weatherMult}x)`);
  if (minimumApplied) pricingReasons.push('Minimum order total applied');
  if (combinedMultiplier > MAX_COMBINED_MULTIPLIER) {
    pricingReasons.push(`Combined multiplier capped at ${MAX_COMBINED_MULTIPLIER}x`);
  }
  if (!legacy.isValid) pricingReasons.push(legacy.error || 'Pricing validation failed');

  const demandContribution = afterDemand - subtotalBeforeMultipliers;
  const weatherContribution = finalPrice - afterDemand;

  return {
    basePrice: legacy.totalTyreCost,
    serviceCalloutFee: legacy.calloutFee,
    emergencyFee,
    afterHoursFee,
    distanceFee: legacy.calloutFee,
    tyreServiceFee: legacy.totalServiceFee,
    demandMultiplier: demandMult,
    weatherMultiplier: weatherMult,
    subtotalBeforeMultipliers: Math.round(subtotalBeforeMultipliers * 100) / 100,
    subtotalAfterMultipliers: Math.round(finalSubtotal.toNumber() * 100) / 100,
    finalPrice,
    pricingReasons,
    pricingAudit: {
      lineItems: legacy.lineItems,
      surgeMultiplier: demandMult,
      weatherMultiplier: weatherMult,
      demandContribution: Math.round(demandContribution * 100) / 100,
      weatherContribution: Math.round(weatherContribution * 100) / 100,
      minimumApplied,
      calculatedAt: new Date().toISOString(),
    },
    legacyBreakdown: {
      ...legacy,
      // Update total to reflect weather adjustment
      total: finalPrice,
    },
  };
}

function clampWeatherMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.max(1.0, Math.min(1.25, Math.round(value * 100) / 100));
}
