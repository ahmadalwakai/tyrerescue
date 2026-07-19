import { Decimal } from 'decimal.js';
import {
  calculateTravelFee,
  FITTING_AT_LOCATION_LABEL,
  FITTING_LOCATION_INVALID_DISTANCE_ERROR,
  FITTING_LOCATION_MANUAL_QUOTE_ERROR,
} from '@/lib/fitting-location-pricing';
import type { WeatherSurchargeCode } from '@/lib/pricing/weather-modifier';
import type { TrafficSurchargeCode } from '@/lib/pricing/traffic-modifier';

export type { PricingMode } from '@/lib/pricing/weather-modifier';
import type { PricingMode } from '@/lib/pricing/weather-modifier';

export { FITTING_AT_LOCATION_LABEL };

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export const PRICING_ENGINE_VERSION = 'v2-three-mode-shared-travel-natural-hierarchy';

export type PricingContext =
  | 'scheduled_mobile_fitting'
  | 'scheduled_garage_fitting'
  | 'emergency_mobile_fitting'
  | 'admin_quick_book'
  | 'assisted_chat'
  | 'manual_quote';

export type LineItemCode =
  | 'TYRE_SUBTOTAL'
  | 'LABOUR_FIT'
  | 'LABOUR_REPAIR'
  | 'TPMS'
  | 'TRAVEL_DISTANCE'
  | 'TRAFFIC_DELAY'
  | 'WEATHER_LIGHT_RAIN'
  | 'WEATHER_HEAVY_RAIN'
  | 'WEATHER_SNOW_ICE'
  | 'EMERGENCY_PRIORITY'
  | 'CALENDAR_WEEKEND'
  | 'CALENDAR_BANK_HOLIDAY'
  | 'BUNDLE_DISCOUNT'
  | 'DYNAMIC_DEMAND'
  | 'MINIMUM_SERVICE_ADJUSTMENT'
  | 'EMERGENCY_MINIMUM_SERVICE_ADJUSTMENT'
  | 'MANUAL_QUOTE_REQUIRED'
  | 'OUT_OF_HOURS_FEE'
  | 'NIGHT_FEE'
  | 'LINE_SUBTOTAL'
  | 'LINE_TOTAL'
  | 'ADMIN_ADJUSTMENT';

export interface TyreSelection {
  tyreId: string;
  quantity: number;
  unitPrice: number;
  service: 'fit' | 'repair' | 'assess';
  requiresTpms?: boolean;
}

export interface PricingRules {
  // TPMS service fee
  tpms_fee_per_tyre: number;

  // Labour rates by mode and service type
  shop_fit_labour_per_tyre: number;
  shop_repair_labour_per_tyre: number;
  mobile_fit_labour_per_tyre: number;
  mobile_repair_labour_per_tyre: number;
  emergency_fit_labour_per_tyre: number;
  emergency_repair_labour_per_tyre: number;

  // Emergency priority fee — default 47, NEVER 0
  emergency_priority_fee: number;

  // Calendar fees by mode
  shop_weekend_fee: number;
  shop_bank_holiday_fee: number;
  mobile_weekend_fee: number;
  mobile_bank_holiday_fee: number;
  emergency_bank_holiday_fee: number;

  // Minimum service subtotals
  mobile_min_service_subtotal: number;
  emergency_min_service_subtotal: number;

  // Bundle discount rates (shop + mobile)
  multi_tyre_discount_2: number;
  multi_tyre_discount_3: number;
  multi_tyre_discount_4: number;

  // Bundle discount rates (emergency only — tighter rates)
  emergency_multi_tyre_discount_3: number;
  emergency_multi_tyre_discount_4: number;

  // System settings
  minimum_order_total: number;
  max_service_miles: number;
  quote_expiry_minutes: number;
  surge_pricing_enabled: boolean;
}

export interface PricingInput {
  tyreSelections: TyreSelection[];
  distanceMiles: number;
  bookingType: 'emergency' | 'scheduled';
  pricingContext?: PricingContext;
  mode?: PricingMode;
  bookingDate: Date;
  isBankHoliday: boolean;
  surgeMultiplier?: number;
  serviceType?: 'repair' | 'fit' | 'both' | 'assess';
  tyreQuantity?: number;
  fittingLocation?: 'shop' | 'mobile';
  /** @deprecated v2 always uses emergency_priority_fee default (55). No longer needed. */
  emergencySurchargeRulePresent?: boolean;
  weatherSurcharge?: number;
  weatherSurchargeCode?: WeatherSurchargeCode;
  weatherManualQuoteRequired?: boolean;
  trafficSurcharge?: number;
  trafficSurchargeCode?: TrafficSurchargeCode;
  trafficDelayMinutes?: number;
  /** Optional backend-controlled override for admin-assisted mobile bookings. */
  maxAutoPricingMiles?: number;
  /** Flat fee for evening out-of-hours (18:00–22:00) on emergency mobile */
  outOfHoursFee?: number;
  /** Flat fee for deep night (22:00–06:00) on emergency mobile */
  nightFee?: number;
}

export interface PricingLineItem {
  label: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  type: 'tyre' | 'service' | 'callout' | 'surcharge' | 'discount' | 'subtotal' | 'vat' | 'total';
  code: LineItemCode;
}

export interface PricingBreakdown {
  lineItems: PricingLineItem[];
  mode?: PricingMode;
  pricingContext?: PricingContext;
  pricingEngineVersion?: string;
  totalTyreCost: number;
  totalServiceFee: number;
  calloutFee: number;
  totalSurcharges: number;
  discountAmount: number;
  surgeMultiplier: number;
  subtotal: number;
  vatRate?: number;
  vatAmount: number;
  total: number;
  quoteExpiresAt: Date;
  isValid: boolean;
  error?: string;
  // v2 semantic fields
  tyreSubtotal?: number;
  serviceSubtotal?: number;
  // Legacy / backward-compat mobile fields
  distanceMiles?: number;
  distanceServicePrice?: number;
  fittingLabourFee?: number;
  mobileFittingBasePrice?: number;
  mobileFittingPrice?: number;
  emergencySurcharge?: number;
  emergencySurchargeSource?: 'pricing_rule' | 'missing_rule_default_zero' | 'not_applicable';
  weatherSurcharge?: number;
  weatherSurchargeCode?: WeatherSurchargeCode;
  weatherManualQuoteRequired?: boolean;
  trafficSurcharge?: number;
  trafficSurchargeCode?: TrafficSurchargeCode;
  trafficDelayMinutes?: number;
  maxAutoPricingMiles?: number;
  adminDistanceLimitMiles?: number;
  serviceDistanceMiles?: number | null;
  pricingDistanceMiles?: number | null;
  pricingDurationMinutes?: number | null;
  garageDistanceMiles?: number | null;
  pricingDistanceSource?: 'driver' | 'garage' | 'garage_floor' | null;
  distanceFloorApplied?: boolean | null;
  adminAdjustmentAmount?: number;
  adminAdjustmentReason?: string | null;
  fittingPrice?: number;
  tyrePrice?: number;
  totalPrice?: number;
  tyreLines?: Array<{
    id?: string | null;
    requestedSize?: string | null;
    normalizedSize?: string | null;
    sizeDisplay?: string | null;
    quantity: number;
    productId?: string | null;
    unitPrice?: number | null;
    brand?: string | null;
    pattern?: string | null;
    season?: string | null;
    source?: string | null;
    service?: 'fit' | 'repair' | 'assess';
  }>;
  serviceOrigin?: {
    lat: number;
    lng: number;
    source: 'driver' | 'garage' | null;
    driverId: string | null;
    etaMinutes: number | null;
  } | null;
}

// ─── Rule helpers ───────────────────────────────────────────────────────────

function getFitRate(mode: PricingMode, rules: PricingRules): number {
  if (mode === 'emergency_mobile') return rules.emergency_fit_labour_per_tyre;
  if (mode === 'scheduled_mobile') return rules.mobile_fit_labour_per_tyre;
  return rules.shop_fit_labour_per_tyre;
}

function getRepairRate(mode: PricingMode, rules: PricingRules): number {
  if (mode === 'emergency_mobile') return rules.emergency_repair_labour_per_tyre;
  if (mode === 'scheduled_mobile') return rules.mobile_repair_labour_per_tyre;
  return rules.shop_repair_labour_per_tyre;
}

function getAssessmentRate(mode: PricingMode, rules: PricingRules): number {
  return roundMoney(Math.max(10, getFitRate(mode, rules) * 0.5));
}

function getBundleDiscountRate(mode: PricingMode, qty: number, rules: PricingRules): number {
  if (qty < 2) return 0;
  if (mode === 'emergency_mobile') {
    if (qty >= 4) return rules.emergency_multi_tyre_discount_4;
    if (qty === 3) return rules.emergency_multi_tyre_discount_3;
    return 0;
  }
  if (qty >= 4) return rules.multi_tyre_discount_4;
  if (qty === 3) return rules.multi_tyre_discount_3;
  return rules.multi_tyre_discount_2;
}

function resolveDemandMultiplier(
  mode: PricingMode,
  surgeMultiplier: number | undefined,
  surgePricingEnabled: boolean,
): number {
  if (!surgePricingEnabled || surgeMultiplier === undefined) return 1.0;
  if (mode === 'emergency_mobile') return Math.max(1.0, Math.min(1.25, surgeMultiplier));
  if (mode === 'scheduled_mobile') return Math.max(0.95, Math.min(1.15, surgeMultiplier));
  return Math.max(0.95, Math.min(1.10, surgeMultiplier));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Mode resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the pricing mode from booking context.
 * This is the single shared function for mode resolution — all consumers must use it.
 */
export function resolvePricingMode(input: {
  pricingContext?: PricingContext;
  fittingLocation?: 'shop' | 'mobile' | null;
  bookingType?: 'emergency' | 'scheduled';
  mode?: PricingMode;
}): PricingMode {
  if (input.mode) return input.mode;
  if (
    input.pricingContext === 'scheduled_garage_fitting' ||
    input.fittingLocation === 'shop'
  ) return 'scheduled_shop';
  if (
    input.pricingContext === 'emergency_mobile_fitting' ||
    input.bookingType === 'emergency'
  ) return 'emergency_mobile';
  return 'scheduled_mobile';
}

/** @deprecated Use resolvePricingMode. Alias kept for backward compatibility. */
export const resolveMode = resolvePricingMode;

export function resolvePricingContext(input: {
  bookingType: 'emergency' | 'scheduled';
  fittingLocation?: 'shop' | 'mobile' | null;
}): PricingContext {
  if (input.bookingType === 'emergency') return 'emergency_mobile_fitting';
  if (input.fittingLocation === 'mobile') return 'scheduled_mobile_fitting';
  return 'scheduled_garage_fitting';
}

// ─── Invalid breakdown factory ────────────────────────────────────────────────

function zeroInvalidBreakdown(
  input: PricingInput,
  mode: PricingMode,
  pricingContext: PricingContext,
  error: string,
): PricingBreakdown {
  return {
    lineItems: [],
    mode,
    pricingContext,
    pricingEngineVersion: PRICING_ENGINE_VERSION,
    totalTyreCost: 0,
    totalServiceFee: 0,
    calloutFee: 0,
    totalSurcharges: 0,
    discountAmount: 0,
    surgeMultiplier: 1.0,
    subtotal: 0,
    vatRate: 0,
    vatAmount: 0,
    total: 0,
    quoteExpiresAt: new Date(),
    isValid: false,
    tyreSubtotal: 0,
    serviceSubtotal: 0,
    distanceMiles: input.distanceMiles,
    fittingPrice: undefined,
    tyrePrice: 0,
    totalPrice: 0,
    emergencySurcharge: 0,
    emergencySurchargeSource: 'not_applicable',
    weatherSurcharge: 0,
    weatherSurchargeCode: input.weatherSurchargeCode,
    weatherManualQuoteRequired: input.weatherManualQuoteRequired ?? false,
    trafficSurcharge: 0,
    trafficSurchargeCode: input.trafficSurchargeCode,
    trafficDelayMinutes: input.trafficDelayMinutes ?? 0,
    maxAutoPricingMiles: input.maxAutoPricingMiles,
    error,
  };
}

// ─── Main pricing function ────────────────────────────────────────────────────

export function calculatePricing(
  input: PricingInput,
  rules: PricingRules,
  _vatRegistered: boolean = true,
): PricingBreakdown {
  const mode = resolvePricingMode(input);
  const pricingContext = input.pricingContext ?? resolvePricingContext(input);
  const isMobile = mode !== 'scheduled_shop';

  if (isMobile && input.weatherManualQuoteRequired) {
    return zeroInvalidBreakdown(input, mode, pricingContext, 'WEATHER_MANUAL_QUOTE_REQUIRED');
  }

  const isServiceOnly = !input.tyreSelections || input.tyreSelections.length === 0;

  if (isServiceOnly && !input.serviceType) {
    return zeroInvalidBreakdown(input, mode, pricingContext, 'No tyres selected');
  }

  const lineItems: PricingLineItem[] = [];
  let tyreCostTotal = new Decimal(0);
  let labourTotal = new Decimal(0);
  let tpmsFee = new Decimal(0);
  let totalQty = 0;

  if (isServiceOnly) {
    totalQty = input.tyreQuantity || 1;
    if (input.serviceType === 'repair') {
      const rate = getRepairRate(mode, rules);
      const amount = new Decimal(rate).times(totalQty);
      labourTotal = amount;
      lineItems.push({
        label: `Puncture Repair × ${totalQty}`,
        quantity: totalQty,
        unitPrice: rate,
        amount: amount.toNumber(),
        type: 'service',
        code: 'LABOUR_REPAIR',
      });
    } else {
      const rate =
        input.serviceType === 'assess'
          ? getAssessmentRate(mode, rules)
          : getFitRate(mode, rules);
      const amount = new Decimal(rate).times(totalQty);
      labourTotal = amount;
      const label =
        input.serviceType === 'assess'
          ? `Assessment × ${totalQty}`
          : `Tyre Fitting × ${totalQty}`;
      lineItems.push({
        label,
        quantity: totalQty,
        unitPrice: rate,
        amount: amount.toNumber(),
        type: 'service',
        code: 'LABOUR_FIT',
      });
    }
  } else {
    for (const sel of input.tyreSelections) {
      const tyreAmount = new Decimal(sel.unitPrice).times(sel.quantity);
      tyreCostTotal = tyreCostTotal.plus(tyreAmount);
      lineItems.push({
        label: 'Tyre',
        quantity: sel.quantity,
        unitPrice: sel.unitPrice,
        amount: tyreAmount.toNumber(),
        type: 'tyre',
        code: 'TYRE_SUBTOTAL',
      });
      totalQty += sel.quantity;

      if (sel.service === 'repair') {
        const rate = getRepairRate(mode, rules);
        const amount = new Decimal(rate).times(sel.quantity);
        labourTotal = labourTotal.plus(amount);
        lineItems.push({
          label: `Puncture Repair × ${sel.quantity}`,
          quantity: sel.quantity,
          unitPrice: rate,
          amount: amount.toNumber(),
          type: 'service',
          code: 'LABOUR_REPAIR',
        });
      } else {
        const rate =
          sel.service === 'assess'
            ? getAssessmentRate(mode, rules)
            : getFitRate(mode, rules);
        const amount = new Decimal(rate).times(sel.quantity);
        labourTotal = labourTotal.plus(amount);
        const label =
          sel.service === 'assess'
            ? `Assessment × ${sel.quantity}`
            : `Tyre Fitting × ${sel.quantity}`;
        lineItems.push({
          label,
          quantity: sel.quantity,
          unitPrice: rate,
          amount: amount.toNumber(),
          type: 'service',
          code: 'LABOUR_FIT',
        });
      }

      if (sel.requiresTpms) {
        const tpmsAmount = new Decimal(rules.tpms_fee_per_tyre).times(sel.quantity);
        tpmsFee = tpmsFee.plus(tpmsAmount);
        lineItems.push({
          label: `TPMS reset × ${sel.quantity}`,
          quantity: sel.quantity,
          unitPrice: rules.tpms_fee_per_tyre,
          amount: tpmsAmount.toNumber(),
          type: 'service',
          code: 'TPMS',
        });
      }
    }
  }

  // Bundle discount — labour only (not TPMS, not travel)
  const discountRate = getBundleDiscountRate(mode, totalQty, rules);
  const bundleDiscount = labourTotal.times(discountRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!bundleDiscount.isZero()) {
    lineItems.push({
      label: `Multi-tyre discount (${discountRate}%)`,
      amount: bundleDiscount.negated().toNumber(),
      type: 'discount',
      code: 'BUNDLE_DISCOUNT',
    });
  }

  // Travel fee (mobile only — continuous formula, emergency × 1.15)
  let travelFee = new Decimal(0);
  if (isMobile) {
    if (!Number.isFinite(input.distanceMiles) || input.distanceMiles < 0) {
      return zeroInvalidBreakdown(input, mode, pricingContext, FITTING_LOCATION_INVALID_DISTANCE_ERROR);
    }
    const scheduledTravel = calculateTravelFee(input.distanceMiles, input.maxAutoPricingMiles);
    if (scheduledTravel === null) {
      return zeroInvalidBreakdown(input, mode, pricingContext, FITTING_LOCATION_MANUAL_QUOTE_ERROR);
    }
    const multiplier = mode === 'emergency_mobile' ? 1.15 : 1.0;
    travelFee = new Decimal(scheduledTravel).times(multiplier).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    lineItems.push({
      label: `Travel (${Math.round(input.distanceMiles)} mi.)`,
      amount: travelFee.toNumber(),
      type: 'callout',
      code: 'TRAVEL_DISTANCE',
    });
  }

  // Emergency priority fee (always emergency_priority_fee default — never 0)
  let priorityFee = new Decimal(0);
  if (mode === 'emergency_mobile') {
    priorityFee = new Decimal(rules.emergency_priority_fee);
    lineItems.push({
      label: 'Emergency priority',
      amount: priorityFee.toNumber(),
      type: 'surcharge',
      code: 'EMERGENCY_PRIORITY',
    });
  }

  // Calendar fees (mode-specific)
  let calendarFee = new Decimal(0);
  const dayOfWeek = input.bookingDate.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend && mode !== 'emergency_mobile') {
    const weekendFee = mode === 'scheduled_shop' ? rules.shop_weekend_fee : rules.mobile_weekend_fee;
    if (weekendFee > 0) {
      calendarFee = calendarFee.plus(weekendFee);
      lineItems.push({
        label: 'Weekend service',
        amount: weekendFee,
        type: 'surcharge',
        code: 'CALENDAR_WEEKEND',
      });
    }
  }
  if (input.isBankHoliday) {
    const bhFee =
      mode === 'scheduled_shop' ? rules.shop_bank_holiday_fee :
      mode === 'emergency_mobile' ? rules.emergency_bank_holiday_fee :
      rules.mobile_bank_holiday_fee;
    if (bhFee > 0) {
      calendarFee = calendarFee.plus(bhFee);
      lineItems.push({
        label: 'Bank holiday service',
        amount: bhFee,
        type: 'surcharge',
        code: 'CALENDAR_BANK_HOLIDAY',
      });
    }
  }

  // Weather surcharge (mobile only; caller passes mode-correct amount)
  const weatherFee = isMobile ? new Decimal(input.weatherSurcharge ?? 0) : new Decimal(0);
  if (!weatherFee.isZero()) {
    const wCode = input.weatherSurchargeCode;
    let weatherLabel = 'Light rain surcharge';
    let lineCode: LineItemCode = 'WEATHER_LIGHT_RAIN';
    if (wCode === 'HEAVY_RAIN') { weatherLabel = 'Heavy rain surcharge'; lineCode = 'WEATHER_HEAVY_RAIN'; }
    else if (wCode === 'SNOW_ICE') { weatherLabel = 'Snow/ice surcharge'; lineCode = 'WEATHER_SNOW_ICE'; }
    lineItems.push({ label: weatherLabel, amount: weatherFee.toNumber(), type: 'surcharge', code: lineCode });
  }

  // Traffic surcharge (mobile only; caller passes mode-correct amount)
  const trafficFee = isMobile ? new Decimal(input.trafficSurcharge ?? 0) : new Decimal(0);
  if (!trafficFee.isZero()) {
    lineItems.push({
      label: 'Traffic delay surcharge',
      amount: trafficFee.toNumber(),
      type: 'surcharge',
      code: 'TRAFFIC_DELAY',
    });
  }

  // Optional flat out-of-hours fees (only added when reliable detection exists at call site)
  const oohFee = new Decimal(input.outOfHoursFee ?? 0);
  if (!oohFee.isZero()) {
    lineItems.push({ label: 'Out-of-hours service', amount: oohFee.toNumber(), type: 'surcharge', code: 'OUT_OF_HOURS_FEE' });
  }
  const nightFeeAmount = new Decimal(input.nightFee ?? 0);
  if (!nightFeeAmount.isZero()) {
    lineItems.push({ label: 'Night-time service', amount: nightFeeAmount.toNumber(), type: 'surcharge', code: 'NIGHT_FEE' });
  }

  // Raw service subtotal (before minimums and demand)
  const rawService = labourTotal
    .minus(bundleDiscount)
    .plus(tpmsFee)
    .plus(travelFee)
    .plus(priorityFee)
    .plus(calendarFee)
    .plus(weatherFee)
    .plus(trafficFee)
    .plus(oohFee)
    .plus(nightFeeAmount);

  // Minimum service enforcement
  let serviceSubtotal = rawService;

  if (mode === 'scheduled_mobile') {
    const minService = new Decimal(rules.mobile_min_service_subtotal);
    if (rawService.lessThan(minService)) {
      const adj = minService.minus(rawService).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      serviceSubtotal = minService;
      lineItems.push({
        label: 'Minimum service charge',
        amount: adj.toNumber(),
        type: 'surcharge',
        code: 'MINIMUM_SERVICE_ADJUSTMENT',
      });
    }
  } else if (mode === 'emergency_mobile') {
    const minService = new Decimal(rules.emergency_min_service_subtotal);
    if (rawService.lessThan(minService)) {
      const adj = minService.minus(rawService).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      serviceSubtotal = minService;
      lineItems.push({
        label: 'Emergency minimum service',
        amount: adj.toNumber(),
        type: 'surcharge',
        code: 'EMERGENCY_MINIMUM_SERVICE_ADJUSTMENT',
      });
    }
  }

  // Demand multiplier on service only — tyres never multiplied
  const demandMultiplier = resolveDemandMultiplier(mode, input.surgeMultiplier, rules.surge_pricing_enabled);
  let serviceSubtotalFinal = serviceSubtotal;
  if (demandMultiplier !== 1.0) {
    const demandAmount = serviceSubtotal
      .times(demandMultiplier - 1)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    serviceSubtotalFinal = serviceSubtotal.plus(demandAmount);
    lineItems.push({
      label: `Dynamic pricing adjustment (${Math.round((demandMultiplier - 1) * 100)}%)`,
      amount: demandAmount.toNumber(),
      type: 'surcharge',
      code: 'DYNAMIC_DEMAND',
    });
  }

  // Final total
  let totalDecimal = tyreCostTotal.plus(serviceSubtotalFinal);

  // Shop: apply minimum order total to the grand total
  if (mode === 'scheduled_shop') {
    const minTotal = new Decimal(rules.minimum_order_total);
    if (totalDecimal.lessThan(minTotal)) {
      const shopAdj = minTotal.minus(totalDecimal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      totalDecimal = minTotal;
      lineItems.push({
        label: 'Minimum order charge',
        amount: shopAdj.toNumber(),
        type: 'surcharge',
        code: 'MINIMUM_SERVICE_ADJUSTMENT',
      });
    }
  }

  const total = totalDecimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  const serviceSubtotalNum = serviceSubtotalFinal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  const tyreCostNum = tyreCostTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  lineItems.push({ label: 'Subtotal', amount: total, type: 'subtotal', code: 'LINE_SUBTOTAL' });
  lineItems.push({ label: 'Total', amount: total, type: 'total', code: 'LINE_TOTAL' });

  const quoteExpiresAt = new Date();
  quoteExpiresAt.setMinutes(quoteExpiresAt.getMinutes() + rules.quote_expiry_minutes);

  const totalSurchargesNum = priorityFee
    .plus(calendarFee)
    .plus(weatherFee)
    .plus(trafficFee)
    .plus(oohFee)
    .plus(nightFeeAmount)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  return {
    lineItems,
    mode,
    pricingContext,
    pricingEngineVersion: PRICING_ENGINE_VERSION,
    totalTyreCost: tyreCostNum,
    totalServiceFee: labourTotal.plus(tpmsFee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    calloutFee: travelFee.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalSurcharges: totalSurchargesNum,
    discountAmount: bundleDiscount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    surgeMultiplier: demandMultiplier,
    subtotal: total,
    vatRate: 0,
    vatAmount: 0,
    total,
    quoteExpiresAt,
    isValid: true,
    tyreSubtotal: tyreCostNum,
    serviceSubtotal: serviceSubtotalNum,
    distanceMiles: input.distanceMiles,
    distanceServicePrice: isMobile ? travelFee.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() : undefined,
    fittingLabourFee: isMobile ? labourTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() : undefined,
    mobileFittingBasePrice: isMobile
      ? labourTotal.plus(travelFee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
      : undefined,
    mobileFittingPrice: isMobile ? serviceSubtotalNum : undefined,
    emergencySurcharge: mode === 'emergency_mobile' ? priorityFee.toNumber() : 0,
    emergencySurchargeSource: mode === 'emergency_mobile' ? 'pricing_rule' : 'not_applicable',
    weatherSurcharge: weatherFee.toNumber(),
    weatherSurchargeCode: input.weatherSurchargeCode,
    weatherManualQuoteRequired: input.weatherManualQuoteRequired ?? false,
    trafficSurcharge: trafficFee.toNumber(),
    trafficSurchargeCode: input.trafficSurchargeCode,
    trafficDelayMinutes: input.trafficDelayMinutes ?? 0,
    maxAutoPricingMiles: input.maxAutoPricingMiles,
    fittingPrice: isMobile ? serviceSubtotalNum : undefined,
    tyrePrice: tyreCostNum,
    totalPrice: total,
  };
}

// ─── parsePricingRules ────────────────────────────────────────────────────────

export function parsePricingRules(
  rules: Array<{ key: string; value: string }>,
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
    tpms_fee_per_tyre: getNum('tpms_fee_per_tyre', 10.0),
    shop_fit_labour_per_tyre: getNum('shop_fit_labour_per_tyre', 18.0),
    shop_repair_labour_per_tyre: getNum('shop_repair_labour_per_tyre', 25.0),
    mobile_fit_labour_per_tyre: getNum('mobile_fit_labour_per_tyre', 18.0),
    mobile_repair_labour_per_tyre: getNum('mobile_repair_labour_per_tyre', 25.0),
    emergency_fit_labour_per_tyre: getNum('emergency_fit_labour_per_tyre', 22.0),
    emergency_repair_labour_per_tyre: getNum('emergency_repair_labour_per_tyre', 30.0),
    emergency_priority_fee: getNum('emergency_priority_fee', 47.0),
    shop_weekend_fee: getNum('shop_weekend_fee', 10.0),
    shop_bank_holiday_fee: getNum('shop_bank_holiday_fee', 20.0),
    mobile_weekend_fee: getNum('mobile_weekend_fee', 12.0),
    mobile_bank_holiday_fee: getNum('mobile_bank_holiday_fee', 25.0),
    emergency_bank_holiday_fee: getNum('emergency_bank_holiday_fee', 45.0),
    mobile_min_service_subtotal: getNum('mobile_min_service_subtotal', 47.0),
    emergency_min_service_subtotal: getNum('emergency_min_service_subtotal', 90.0),
    multi_tyre_discount_2: getNum('multi_tyre_discount_2', 5.0),
    multi_tyre_discount_3: getNum('multi_tyre_discount_3', 8.0),
    multi_tyre_discount_4: getNum('multi_tyre_discount_4', 12.0),
    emergency_multi_tyre_discount_3: getNum('emergency_multi_tyre_discount_3', 3.0),
    emergency_multi_tyre_discount_4: getNum('emergency_multi_tyre_discount_4', 5.0),
    minimum_order_total: getNum('minimum_order_total', 50.0),
    max_service_miles: getNum('max_service_miles', 190),
    quote_expiry_minutes: getNum('quote_expiry_minutes', 15),
    surge_pricing_enabled: getBool('surge_pricing_enabled', false),
  };
}

// ─── defaultPricingRules (for seeding) ───────────────────────────────────────

export const defaultPricingRules: Array<{
  key: string;
  value: string;
  label: string;
  type: 'amount' | 'percentage' | 'boolean' | 'multiplier';
}> = [
  { key: 'tpms_fee_per_tyre', value: '10.00', label: 'TPMS reset fee per tyre', type: 'amount' },
  { key: 'shop_fit_labour_per_tyre', value: '18.00', label: 'Shop fitting labour per tyre', type: 'amount' },
  { key: 'shop_repair_labour_per_tyre', value: '25.00', label: 'Shop repair labour per tyre', type: 'amount' },
  { key: 'mobile_fit_labour_per_tyre', value: '18.00', label: 'Mobile fitting labour per tyre', type: 'amount' },
  { key: 'mobile_repair_labour_per_tyre', value: '25.00', label: 'Mobile repair labour per tyre', type: 'amount' },
  { key: 'emergency_fit_labour_per_tyre', value: '22.00', label: 'Emergency fitting labour per tyre', type: 'amount' },
  { key: 'emergency_repair_labour_per_tyre', value: '30.00', label: 'Emergency repair labour per tyre', type: 'amount' },
  { key: 'emergency_priority_fee', value: '47.00', label: 'Emergency priority fee', type: 'amount' },
  { key: 'shop_weekend_fee', value: '10.00', label: 'Shop weekend surcharge', type: 'amount' },
  { key: 'shop_bank_holiday_fee', value: '20.00', label: 'Shop bank holiday surcharge', type: 'amount' },
  { key: 'mobile_weekend_fee', value: '12.00', label: 'Mobile weekend surcharge', type: 'amount' },
  { key: 'mobile_bank_holiday_fee', value: '25.00', label: 'Mobile bank holiday surcharge', type: 'amount' },
  { key: 'emergency_bank_holiday_fee', value: '45.00', label: 'Emergency bank holiday surcharge', type: 'amount' },
  { key: 'mobile_min_service_subtotal', value: '47.00', label: 'Mobile minimum service subtotal', type: 'amount' },
  { key: 'emergency_min_service_subtotal', value: '90.00', label: 'Emergency minimum service subtotal', type: 'amount' },
  { key: 'multi_tyre_discount_2', value: '5.00', label: 'Multi-tyre discount (2 tyres) shop/mobile', type: 'percentage' },
  { key: 'multi_tyre_discount_3', value: '8.00', label: 'Multi-tyre discount (3 tyres) shop/mobile', type: 'percentage' },
  { key: 'multi_tyre_discount_4', value: '12.00', label: 'Multi-tyre discount (4 tyres) shop/mobile', type: 'percentage' },
  { key: 'emergency_multi_tyre_discount_3', value: '3.00', label: 'Multi-tyre discount (3 tyres) emergency', type: 'percentage' },
  { key: 'emergency_multi_tyre_discount_4', value: '5.00', label: 'Multi-tyre discount (4 tyres) emergency', type: 'percentage' },
  { key: 'minimum_order_total', value: '50.00', label: 'Minimum order total (shop)', type: 'amount' },
  { key: 'max_service_miles', value: '190', label: 'Maximum service distance (miles)', type: 'amount' },
  { key: 'quote_expiry_minutes', value: '15', label: 'Quote expiry (minutes)', type: 'amount' },
  { key: 'surge_pricing_enabled', value: 'false', label: 'Surge pricing enabled', type: 'boolean' },
];

// ─── Dynamic Surcharge Layer (LEGACY — do not use for live quote totals) ─────
//
// These functions are retained for backward compatibility only.
// They must NOT be called in any live customer, admin, or driver pricing path.
// Use calculatePricing exclusively for all pricing operations.

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
 * @deprecated Legacy dynamic surcharge layer. Not used by live pricing.
 * Use calculatePricing for all live pricing operations.
 */
export function calculateDynamicSurchargeBreakdown(
  input: DynamicSurchargeInput,
): DynamicSurchargeBreakdown {
  const nightPercent = input.isNight ? input.nightSurchargePercent : 0;
  const manualPercent = input.manualSurchargeActive ? input.manualSurchargePercent : 0;
  const demandPercent = input.demandSurchargePercent;
  const returningVisitorPercent = input.isReturningVisitor ? input.cookieReturnSurchargePercent : 0;

  const totalPercent = nightPercent + manualPercent + demandPercent + returningVisitorPercent;
  const cappedPercent = Math.min(totalPercent, input.maxTotalSurchargePercent);
  const wasCapApplied = totalPercent > input.maxTotalSurchargePercent;

  const labels: string[] = [];
  if (nightPercent > 0) labels.push(`Night surcharge +${nightPercent}%`);
  if (manualPercent > 0) labels.push(`Admin surcharge +${manualPercent}%`);
  if (demandPercent > 0) labels.push(`Demand surcharge +${demandPercent}%`);
  if (returningVisitorPercent > 0) labels.push(`Returning visitor +${returningVisitorPercent}%`);
  if (wasCapApplied) labels.push(`Capped at ${input.maxTotalSurchargePercent}%`);

  return { nightPercent, manualPercent, demandPercent, returningVisitorPercent, totalPercent, cappedPercent, wasCapApplied, labels };
}

/**
 * @deprecated Legacy dynamic surcharge application. Not used by live pricing.
 * Use calculatePricing for all live pricing operations.
 */
export function applyDynamicSurcharge(
  subtotal: number,
  surchargePercent: number,
): { surchargeAmount: number; adjustedSubtotal: number } {
  const sub = new Decimal(subtotal);
  const surchargeAmount = sub.times(surchargePercent).dividedBy(100);
  return {
    surchargeAmount: surchargeAmount.toNumber(),
    adjustedSubtotal: sub.plus(surchargeAmount).toNumber(),
  };
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

// ─── Display Breakdown ────────────────────────────────────────────────────────

export interface DisplayLineItem {
  label: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  type: 'tyre' | 'service' | 'callout' | 'surcharge' | 'discount' | 'subtotal' | 'vat' | 'total';
  code?: LineItemCode;
}

export interface DisplayBreakdown {
  lineItems: DisplayLineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
}

function isRuralSurcharge(item: PricingLineItem): boolean {
  return item.type === 'surcharge' && item.label.toLowerCase().includes('rural area');
}

/**
 * Returns display-friendly breakdown. In v2 no rural surcharges are generated,
 * but the folding logic is kept to handle any legacy breakdown data.
 */
export function getDisplayBreakdown(breakdown: PricingBreakdown): DisplayBreakdown {
  const ruralItems = breakdown.lineItems.filter(isRuralSurcharge);
  const ruralTotalPounds = ruralItems.reduce((sum, item) => sum + item.amount, 0);

  if (ruralTotalPounds === 0 || ruralItems.length === 0) {
    return {
      lineItems: breakdown.lineItems.filter((item) => !isRuralSurcharge(item)).map((item) => ({ ...item })),
      subtotal: breakdown.subtotal,
      vatAmount: breakdown.vatAmount,
      total: breakdown.total,
    };
  }

  const ruralTotalPence = Math.round(ruralTotalPounds * 100);
  const calloutIndex = breakdown.lineItems.findIndex((item) => item.type === 'callout');
  const displayItems: DisplayLineItem[] = [];
  let folded = false;

  for (const item of breakdown.lineItems) {
    if (isRuralSurcharge(item)) {
      if (calloutIndex === -1) displayItems.push({ ...item });
      continue;
    }
    if (item.type === 'callout' && !folded) {
      const newAmountPence = Math.round(item.amount * 100) + ruralTotalPence;
      const baseLabel = item.label.replace(/\s*\(includes long-distance fee\)\s*$/i, '');
      displayItems.push({ ...item, amount: newAmountPence / 100, label: `${baseLabel} (includes long-distance fee)` });
      folded = true;
      continue;
    }
    displayItems.push({ ...item });
  }

  if (process.env.NODE_ENV !== 'production') {
    const displayTotal = displayItems
      .filter((item) => !['subtotal', 'vat', 'total'].includes(item.type))
      .reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    const expectedTotal = breakdown.lineItems
      .filter((item) => !['subtotal', 'vat', 'total'].includes(item.type))
      .reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    if (Math.abs(displayTotal - expectedTotal) > 1) {
      throw new Error(`getDisplayBreakdown total mismatch: display=${displayTotal} pence, expected=${expectedTotal} pence`);
    }
  }

  return { lineItems: displayItems, subtotal: breakdown.subtotal, vatAmount: breakdown.vatAmount, total: breakdown.total };
}

// ─── Hybrid Pricing (LEGACY — do not use for live quote totals) ───────────────
//
// calculateHybridPricing is retained for backward compatibility only.
// It must NOT be called in any live pricing path.
// IMPORTANT: Do not pass both weatherSurcharge (flat fee) and weatherMultiplier
// to this function — calculatePricing has already applied the flat fee.

export interface HybridPricingInput extends PricingInput {
  weatherMultiplier?: number;
  weatherReason?: string;
  demandReason?: string;
}

export interface HybridPricingBreakdown {
  basePrice: number;
  serviceCalloutFee: number;
  emergencyFee: number;
  afterHoursFee: number;
  distanceFee: number;
  tyreServiceFee: number;
  demandMultiplier: number;
  weatherMultiplier: number;
  subtotalBeforeMultipliers: number;
  subtotalAfterMultipliers: number;
  finalPrice: number;
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
  legacyBreakdown: PricingBreakdown;
}

const MAX_COMBINED_MULTIPLIER = 1.50;

/**
 * @deprecated Legacy hybrid pricing wrapper. Not used by live pricing.
 * Do not call in any customer, admin, or driver pricing path.
 * calculatePricing already handles all surcharges as flat fees.
 */
export function calculateHybridPricing(
  input: HybridPricingInput,
  rules: PricingRules,
  vatRegistered: boolean = true,
): HybridPricingBreakdown {
  // Guard: if a flat weather fee was already passed, do not also apply a multiplier.
  // Applying both would double-charge weather (violates v2 flat-fee architecture).
  const weatherMult = (input.weatherSurcharge != null && input.weatherSurcharge > 0)
    ? 1.0
    : clampWeatherMultiplier(input.weatherMultiplier ?? 1.0);
  const demandMult = input.surgeMultiplier ?? 1.0;

  const legacy = calculatePricing(input, rules, vatRegistered);

  const emergencyFee = legacy.lineItems
    .filter((li) => li.label === 'Emergency priority')
    .reduce((sum, li) => sum + li.amount, 0);

  const weekendFee = legacy.lineItems
    .filter((li) => li.label === 'Weekend service')
    .reduce((sum, li) => sum + li.amount, 0);

  const bankHolidayFee = legacy.lineItems
    .filter((li) => li.label === 'Bank holiday service')
    .reduce((sum, li) => sum + li.amount, 0);

  const afterHoursFee = weekendFee + bankHolidayFee;

  const tyreCost = legacy.tyreSubtotal ?? legacy.totalTyreCost;
  const service = legacy.serviceSubtotal ?? (legacy.total - tyreCost);
  const preDemandService = demandMult !== 1.0 ? service / demandMult : service;
  const subtotalBeforeMultipliers = tyreCost + preDemandService;

  // Weather multiplier applied to service only (tyres never multiplied)
  let serviceAfterWeather = service * weatherMult;
  const combinedMultiplier = demandMult * weatherMult;
  if (combinedMultiplier > MAX_COMBINED_MULTIPLIER) {
    serviceAfterWeather = preDemandService * MAX_COMBINED_MULTIPLIER;
  }

  const finalSubtotalRaw = tyreCost + serviceAfterWeather;
  const minimumApplied = finalSubtotalRaw < rules.minimum_order_total && legacy.isValid;
  const finalSubtotal = minimumApplied ? rules.minimum_order_total : finalSubtotalRaw;
  const finalPrice = roundMoney(finalSubtotal);

  const pricingReasons: string[] = [];
  if (input.bookingType === 'emergency') pricingReasons.push('Emergency booking');
  if (afterHoursFee > 0) pricingReasons.push('After-hours surcharge applied');
  if (demandMult > 1.0) pricingReasons.push(input.demandReason || `High live demand (${demandMult}x)`);
  if (demandMult < 1.0) pricingReasons.push(`Low demand discount (${demandMult}x)`);
  if (weatherMult > 1.0) pricingReasons.push(input.weatherReason || `Adverse weather (${weatherMult}x)`);
  if (minimumApplied) pricingReasons.push('Minimum order total applied');
  if (combinedMultiplier > MAX_COMBINED_MULTIPLIER) pricingReasons.push(`Combined multiplier capped at ${MAX_COMBINED_MULTIPLIER}x`);
  if (!legacy.isValid) pricingReasons.push(legacy.error || 'Pricing validation failed');

  return {
    basePrice: tyreCost,
    serviceCalloutFee: legacy.calloutFee,
    emergencyFee,
    afterHoursFee,
    distanceFee: legacy.calloutFee,
    tyreServiceFee: legacy.totalServiceFee,
    demandMultiplier: demandMult,
    weatherMultiplier: weatherMult,
    subtotalBeforeMultipliers: roundMoney(subtotalBeforeMultipliers),
    subtotalAfterMultipliers: roundMoney(finalSubtotal),
    finalPrice,
    pricingReasons,
    pricingAudit: {
      lineItems: legacy.lineItems,
      surgeMultiplier: demandMult,
      weatherMultiplier: weatherMult,
      demandContribution: roundMoney(service - preDemandService),
      weatherContribution: roundMoney(finalPrice - service),
      minimumApplied,
      calculatedAt: new Date().toISOString(),
    },
    legacyBreakdown: { ...legacy, total: finalPrice },
  };
}

function clampWeatherMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.max(1.0, Math.min(1.25, Math.round(value * 100) / 100));
}
