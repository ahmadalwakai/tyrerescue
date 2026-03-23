import { Decimal } from 'decimal.js';

// ── Types ────────────────────────────────────────────────────────────

export type PriceFactors = {
  baseTyrePrice: number;
  quantity: number;
  distanceKm: number;
  timeSlot: 'standard' | 'evening' | 'weekend' | 'emergency';
  demandLevel: 'low' | 'normal' | 'high';
  weatherCondition: 'clear' | 'rain' | 'snow' | 'severe';
};

export type PriceBreakdown = {
  tyresCost: number;
  fittingFee: number;
  calloutFee: number;
  distanceSurcharge: number;
  timeSurcharge: number;
  demandAdjustment: number;
  weatherAdjustment: number;
  vatAmount: number;
  total: number;
  factors: string[];
};

// ── Constants ────────────────────────────────────────────────────────

const FITTING_FEE_PER_TYRE = new Decimal('15');
const FREE_DISTANCE_KM = new Decimal('10');
const DISTANCE_RATE_PER_KM = new Decimal('1');
const VAT_RATE = new Decimal('0.20');

const TIME_SURCHARGES: Record<PriceFactors['timeSlot'], Decimal> = {
  standard: new Decimal('0'),
  evening: new Decimal('0.20'),
  weekend: new Decimal('0.15'),
  emergency: new Decimal('0.50'),
};

const TIME_LABELS: Record<PriceFactors['timeSlot'], string> = {
  standard: '',
  evening: 'Evening booking (+20%)',
  weekend: 'Weekend booking (+15%)',
  emergency: 'Emergency booking (+50%)',
};

const DEMAND_ADJUSTMENTS: Record<PriceFactors['demandLevel'], Decimal> = {
  low: new Decimal('-0.05'),
  normal: new Decimal('0'),
  high: new Decimal('0.10'),
};

const DEMAND_LABELS: Record<PriceFactors['demandLevel'], string> = {
  low: 'Low demand (-5%)',
  normal: '',
  high: 'High demand (+10%)',
};

const WEATHER_ADJUSTMENTS: Record<PriceFactors['weatherCondition'], Decimal> = {
  clear: new Decimal('0'),
  rain: new Decimal('0.05'),
  snow: new Decimal('0.15'),
  severe: new Decimal('0.25'),
};

const WEATHER_LABELS: Record<PriceFactors['weatherCondition'], string> = {
  clear: '',
  rain: 'Heavy rain (+5%)',
  snow: 'Snow conditions (+15%)',
  severe: 'Severe weather (+25%)',
};

// ── Engine ────────────────────────────────────────────────────────────

export function calculatePrice(factors: PriceFactors): PriceBreakdown {
  const qty = new Decimal(factors.quantity);
  const baseTyre = new Decimal(factors.baseTyrePrice);
  const distance = new Decimal(factors.distanceKm);

  // Core costs
  const tyresCost = baseTyre.mul(qty);
  const fittingFee = FITTING_FEE_PER_TYRE.mul(qty);
  const calloutFee = Decimal.max(distance.minus(FREE_DISTANCE_KM), 0).mul(DISTANCE_RATE_PER_KM);

  const subtotal = tyresCost.plus(fittingFee).plus(calloutFee);

  // Percentage-based surcharges applied to subtotal
  const timeRate = TIME_SURCHARGES[factors.timeSlot];
  const timeSurcharge = subtotal.mul(timeRate);

  const demandRate = DEMAND_ADJUSTMENTS[factors.demandLevel];
  const demandAdjustment = subtotal.mul(demandRate);

  const weatherRate = WEATHER_ADJUSTMENTS[factors.weatherCondition];
  const weatherAdjustment = subtotal.mul(weatherRate);

  const preVat = subtotal.plus(timeSurcharge).plus(demandAdjustment).plus(weatherAdjustment);
  const vatAmount = preVat.mul(VAT_RATE);
  const total = preVat.plus(vatAmount);

  // Human-readable factor descriptions
  const factorsList: string[] = [];

  if (!calloutFee.isZero()) {
    factorsList.push(`Distance surcharge (${factors.distanceKm}km)`);
  }

  const timeLabel = TIME_LABELS[factors.timeSlot];
  if (timeLabel) factorsList.push(timeLabel);

  const demandLabel = DEMAND_LABELS[factors.demandLevel];
  if (demandLabel) factorsList.push(demandLabel);

  const weatherLabel = WEATHER_LABELS[factors.weatherCondition];
  if (weatherLabel) factorsList.push(weatherLabel);

  return {
    tyresCost: tyresCost.toDecimalPlaces(2).toNumber(),
    fittingFee: fittingFee.toDecimalPlaces(2).toNumber(),
    calloutFee: calloutFee.toDecimalPlaces(2).toNumber(),
    distanceSurcharge: calloutFee.toDecimalPlaces(2).toNumber(),
    timeSurcharge: timeSurcharge.toDecimalPlaces(2).toNumber(),
    demandAdjustment: demandAdjustment.toDecimalPlaces(2).toNumber(),
    weatherAdjustment: weatherAdjustment.toDecimalPlaces(2).toNumber(),
    vatAmount: vatAmount.toDecimalPlaces(2).toNumber(),
    total: total.toDecimalPlaces(2).toNumber(),
    factors: factorsList,
  };
}
