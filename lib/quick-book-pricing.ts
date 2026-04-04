import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankHolidays, pricingRules, tyreProducts } from '@/lib/db/schema';
import {
  calculatePricing,
  parsePricingRules,
  type PricingBreakdown,
  type PricingLineItem,
  type TyreSelection,
} from '@/lib/pricing-engine';
import { normalizeTyreSize } from '@/lib/inventory/tyre-size';

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
  if (!Number.isFinite(unitPrice)) {
    return null;
  }

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

  // Remove any old Admin adjustment line items (legacy cleanup)
  breakdown.lineItems = breakdown.lineItems.filter((line) => {
    if (line.label !== 'Admin adjustment' && !line.label.startsWith('Admin adjustment - ')) {
      return true;
    }
    return false;
  });

  if (normalizedAdjustment !== 0) {
    // Find the service fee line item to merge adjustment into (Fitting fee or Repair fee)
    // This hides the admin adjustment from customers by rolling it into the service fee
    const serviceFeeIndex = breakdown.lineItems.findIndex(
      (line) => line.label === 'Fitting fee' || line.label === 'Repair fee'
    );

    if (serviceFeeIndex >= 0) {
      // Merge admin adjustment into the existing service fee
      const serviceFee = breakdown.lineItems[serviceFeeIndex];
      serviceFee.amount = Math.round((serviceFee.amount + normalizedAdjustment) * 100) / 100;
      
      // Update unitPrice if it exists (for proper display)
      if (serviceFee.unitPrice !== undefined && serviceFee.quantity) {
        serviceFee.unitPrice = Math.round((serviceFee.amount / serviceFee.quantity) * 100) / 100;
      }
    } else {
      // Fallback: if no service fee found, add adjustment to first 'service' type line or as hidden surcharge
      const serviceIndex = breakdown.lineItems.findIndex((line) => line.type === 'service');
      if (serviceIndex >= 0) {
        breakdown.lineItems[serviceIndex].amount = Math.round(
          (breakdown.lineItems[serviceIndex].amount + normalizedAdjustment) * 100
        ) / 100;
      }
      // If no service line at all, adjustment still affects totals below
    }

    // Update totals
    breakdown.subtotal = Math.round((breakdown.subtotal + normalizedAdjustment) * 100) / 100;
    breakdown.total = Math.round((breakdown.total + normalizedAdjustment) * 100) / 100;

    if (normalizedAdjustment >= 0) {
      breakdown.totalSurcharges = Math.round((breakdown.totalSurcharges + normalizedAdjustment) * 100) / 100;
    } else {
      breakdown.discountAmount = Math.round((breakdown.discountAmount + Math.abs(normalizedAdjustment)) * 100) / 100;
    }
  }

  // Update subtotal and total line items
  for (const line of breakdown.lineItems) {
    if (line.type === 'subtotal') line.amount = breakdown.subtotal;
    if (line.type === 'total') line.amount = breakdown.total;
  }

  return breakdown;
}

export async function calculateQuickBookPricing(
  input: QuickBookPricingInput
): Promise<QuickBookPricingResult> {
  const bookingDate = input.bookingDate ?? new Date();
  const normalizedTyreSize = input.tyreSize?.trim() ? normalizeTyreSize(input.tyreSize) : null;
  const resolveTyreFromSize = input.resolveTyreFromSize !== false;
  const requireTyreForFit = input.requireTyreForFit ?? false;

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
  const breakdown = calculatePricing(
    {
      tyreSelections,
      distanceMiles: input.distanceMiles,
      bookingType: 'emergency',
      bookingDate,
      isBankHoliday: holidayRows.length > 0,
      serviceType: input.serviceType,
      tyreQuantity: input.tyreCount,
    },
    rules,
    true,
  );

  if (!breakdown.isValid) {
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
