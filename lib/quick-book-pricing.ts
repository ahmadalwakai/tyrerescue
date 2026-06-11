import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankHolidays, pricingRules, tyreProducts } from '@/lib/db/schema';
import {
  calculatePricing,
  parsePricingRules,
  resolveMode,
  type PricingContext,
  type PricingBreakdown,
  type TyreSelection,
} from '@/lib/pricing-engine';
import { normalizeTyreSize } from '@/lib/inventory/tyre-size';
import type { WeatherPricingContext } from '@/lib/weather';
import { calculateWeatherSurcharge } from '@/lib/pricing/weather-modifier';
import { calculateTrafficSurcharge } from '@/lib/pricing/traffic-modifier';
import {
  FITTING_LOCATION_MANUAL_QUOTE_ERROR,
  MOBILE_AUTO_PRICING_MAX_MILES,
} from '@/lib/fitting-location-pricing';

export type QuickBookServiceType = 'fit' | 'repair' | 'assess';

export interface QuickBookTyreSnapshot {
  productId: string;
  unitPrice: number | null;
  brand: string | null;
  pattern: string | null;
  sizeDisplay: string | null;
}

export interface QuickBookPricingInput {
  serviceType: QuickBookServiceType;
  tyreSize: string | null;
  tyreCount: number;
  distanceMiles: number;
  bookingDate?: Date;
  selectedTyreSnapshot?: QuickBookTyreSnapshot | null;
  resolveTyreFromSize?: boolean;
  requireTyreForFit?: boolean;
  fittingLocation?: 'shop' | 'mobile';
  pricingContext?: PricingContext;
  durationMinutes?: number | null;
  weatherContext?: WeatherPricingContext | null;
  adminAdjustmentAmount?: number;
  adminAdjustmentReason?: string | null;
}

export interface QuickBookPricingResult {
  breakdown: PricingBreakdown;
  tyreSelections: TyreSelection[];
  normalizedTyreSize: string | null;
  selectedTyreSnapshot: QuickBookTyreSnapshot | null;
}

export class QuickBookPricingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'QuickBookPricingError';
    this.status = status;
  }
}

export function resolveQuickBookBookingType(pricingContext: PricingContext): 'emergency' | 'scheduled' {
  if (
    pricingContext === 'emergency_mobile_fitting' ||
    pricingContext === 'admin_quick_book' ||
    pricingContext === 'assisted_chat'
  ) {
    return 'emergency';
  }

  return 'scheduled';
}

export function extractQuickBookTyreSnapshot(raw: {
  selectedTyreProductId?: string | null;
  selectedTyreUnitPrice?: string | number | null;
  selectedTyreBrand?: string | null;
  selectedTyrePattern?: string | null;
  tyreSize?: string | null;
  selectedTyreSizeDisplay?: string | null;
}): QuickBookTyreSnapshot | null {
  if (!raw.selectedTyreProductId) return null;

  const parsedPrice =
    raw.selectedTyreUnitPrice === null || raw.selectedTyreUnitPrice === undefined
      ? null
      : Number(raw.selectedTyreUnitPrice);

  return {
    productId: raw.selectedTyreProductId,
    unitPrice: Number.isFinite(parsedPrice as number) ? parsedPrice : null,
    brand: raw.selectedTyreBrand ?? null,
    pattern: raw.selectedTyrePattern ?? null,
    sizeDisplay: raw.selectedTyreSizeDisplay ?? raw.tyreSize ?? null,
  };
}

async function resolveSellableTyreBySize(tyreSize: string): Promise<QuickBookTyreSnapshot | null> {
  const normalizedSize = normalizeTyreSize(tyreSize);

  const [product] = await db
    .select({
      id: tyreProducts.id,
      priceNew: tyreProducts.priceNew,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
    })
    .from(tyreProducts)
    .where(
      and(
        eq(tyreProducts.sizeDisplay, normalizedSize),
        eq(tyreProducts.availableNew, true),
        isNotNull(tyreProducts.priceNew),
      ),
    )
    .orderBy(
      desc(tyreProducts.featured),
      desc(tyreProducts.isLocalStock),
      desc(tyreProducts.stockNew),
      asc(tyreProducts.priceNew),
    )
    .limit(1);

  if (!product) return null;

  const unitPrice = Number(product.priceNew);
  if (!Number.isFinite(unitPrice)) return null;

  return {
    productId: product.id,
    unitPrice,
    brand: product.brand,
    pattern: product.pattern,
    sizeDisplay: product.sizeDisplay,
  };
}

function applyAdminAdjustment(
  baseBreakdown: PricingBreakdown,
  adjustmentAmount: number,
  _adjustmentReason: string | null | undefined,
): PricingBreakdown {
  const breakdown: PricingBreakdown = {
    ...baseBreakdown,
    lineItems: baseBreakdown.lineItems.map((line) => ({ ...line })),
  };

  const normalizedAdjustment = Math.round(adjustmentAmount * 100) / 100;

  breakdown.lineItems = breakdown.lineItems.filter((line) => {
    return line.label !== 'Admin adjustment' && !line.label.startsWith('Admin adjustment - ');
  });

  if (normalizedAdjustment !== 0) {
    const adjustmentReason = _adjustmentReason?.trim();
    const adjustmentLine = {
      label: adjustmentReason ? `Admin adjustment - ${adjustmentReason}` : 'Admin adjustment',
      amount: normalizedAdjustment,
      type: normalizedAdjustment >= 0 ? 'surcharge' as const : 'discount' as const,
      code: 'ADMIN_ADJUSTMENT' as const,
    };
    const subtotalIndex = breakdown.lineItems.findIndex((line) => line.type === 'subtotal');
    const insertIndex = subtotalIndex >= 0 ? subtotalIndex : breakdown.lineItems.length;
    breakdown.lineItems.splice(insertIndex, 0, adjustmentLine);

    breakdown.subtotal = Math.round((breakdown.subtotal + normalizedAdjustment) * 100) / 100;
    breakdown.total = Math.round((breakdown.total + normalizedAdjustment) * 100) / 100;
    breakdown.totalPrice = breakdown.total;
    breakdown.adminAdjustmentAmount = normalizedAdjustment;
    breakdown.adminAdjustmentReason = adjustmentReason || null;

    if (normalizedAdjustment >= 0) {
      breakdown.totalSurcharges = Math.round((breakdown.totalSurcharges + normalizedAdjustment) * 100) / 100;
    } else {
      breakdown.discountAmount = Math.round((breakdown.discountAmount + Math.abs(normalizedAdjustment)) * 100) / 100;
    }
  }

  for (const line of breakdown.lineItems) {
    if (line.type === 'subtotal') line.amount = breakdown.subtotal;
    if (line.type === 'total') line.amount = breakdown.total;
  }

  return breakdown;
}

function calculateQuickBookWeatherModifier(
  weatherContext: WeatherPricingContext | null | undefined,
  mode: import('@/lib/pricing/weather-modifier').PricingMode,
) {
  if (!weatherContext) {
    return calculateWeatherSurcharge({ mode });
  }

  return calculateWeatherSurcharge({
    condition: weatherContext.conditionLabel,
    severity: weatherContext.weatherReason,
    precipitationMm: weatherContext.precipitationIntensity,
    windMph: weatherContext.windSpeed * 2.23694,
    temperatureC: weatherContext.temperature,
    mode,
  });
}

export async function calculateQuickBookPricing(
  input: QuickBookPricingInput
): Promise<QuickBookPricingResult> {
  const bookingDate = input.bookingDate ?? new Date();
  const pricingContext = input.pricingContext ?? 'admin_quick_book';
  const fittingLocation = input.fittingLocation ?? 'mobile';
  const normalizedTyreSize = input.tyreSize?.trim() ? normalizeTyreSize(input.tyreSize) : null;
  const resolveTyreFromSize = input.resolveTyreFromSize !== false;
  const requireTyreForFit = input.requireTyreForFit ?? false;

  const bookingType = resolveQuickBookBookingType(pricingContext);
  const mode = resolveMode({ pricingContext, fittingLocation, bookingType });

  let selectedTyreSnapshot = input.selectedTyreSnapshot ?? null;

  if (resolveTyreFromSize && normalizedTyreSize) {
    const resolved = await resolveSellableTyreBySize(normalizedTyreSize);
    if (resolved) {
      selectedTyreSnapshot = resolved;
    } else if (input.serviceType === 'fit' && requireTyreForFit) {
      throw new QuickBookPricingError('No active tyre product found for this size', 400);
    }
  }

  if (input.serviceType === 'fit' && requireTyreForFit && !selectedTyreSnapshot) {
    throw new QuickBookPricingError('No active tyre product found for this size', 400);
  }

  if (selectedTyreSnapshot?.unitPrice == null) {
    throw new QuickBookPricingError('Selected tyre product is missing a price snapshot', 400);
  }

  const tyreSelections: TyreSelection[] = selectedTyreSnapshot
    ? [
        {
          tyreId: selectedTyreSnapshot.productId,
          quantity: input.tyreCount,
          unitPrice: selectedTyreSnapshot.unitPrice,
          service: input.serviceType,
        },
      ]
    : [];

  const [rulesRows, holidayRows] = await Promise.all([
    db.select().from(pricingRules),
    db
      .select({ id: bankHolidays.id })
      .from(bankHolidays)
      .where(eq(bankHolidays.date, bookingDate.toISOString().split('T')[0]))
      .limit(1),
  ]);

  const rules = parsePricingRules(rulesRows.map((row) => ({ key: row.key, value: row.value })));
  const weatherModifier = calculateQuickBookWeatherModifier(input.weatherContext, mode);
  const trafficModifier = calculateTrafficSurcharge({
    distanceMiles: input.distanceMiles,
    durationMinutes: input.durationMinutes ?? null,
    mode,
  });

  const breakdown = calculatePricing(
    {
      tyreSelections,
      distanceMiles: input.distanceMiles,
      bookingType,
      pricingContext,
      mode,
      bookingDate,
      isBankHoliday: holidayRows.length > 0,
      serviceType: input.serviceType,
      tyreQuantity: input.tyreCount,
      fittingLocation,
      weatherSurcharge: weatherModifier.surcharge,
      weatherSurchargeCode: weatherModifier.code,
      weatherManualQuoteRequired: weatherModifier.manualQuoteRequired,
      trafficSurcharge: trafficModifier.surcharge,
      trafficSurchargeCode: trafficModifier.code,
      trafficDelayMinutes: trafficModifier.delayMinutes,
    },
    rules,
    true,
  );

  if (!breakdown.isValid) {
    if (breakdown.error === 'WEATHER_MANUAL_QUOTE_REQUIRED') {
      throw new QuickBookPricingError('Current weather conditions need a manual quote.', 422);
    }
    if (breakdown.error === FITTING_LOCATION_MANUAL_QUOTE_ERROR) {
      throw new QuickBookPricingError(
        `This fitting location is over ${MOBILE_AUTO_PRICING_MAX_MILES} miles away and needs a manual quote.`,
        422,
      );
    }
    if (breakdown.error === 'FITTING_LOCATION_INVALID_DISTANCE') {
      throw new QuickBookPricingError(
        'Unable to calculate fitting-at-location price because the service distance is invalid.',
        400,
      );
    }
    throw new QuickBookPricingError(`Pricing error: ${breakdown.error ?? 'Invalid pricing result'}`, 400);
  }

  const adjustedBreakdown = applyAdminAdjustment(
    breakdown,
    input.adminAdjustmentAmount ?? 0,
    input.adminAdjustmentReason,
  );

  return {
    breakdown: adjustedBreakdown,
    tyreSelections,
    normalizedTyreSize,
    selectedTyreSnapshot,
  };
}
