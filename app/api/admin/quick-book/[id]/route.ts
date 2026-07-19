import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  calculateQuickBookPricing,
  extractQuickBookTyreLineSelections,
  extractQuickBookTyreSnapshot,
  QuickBookPricingError,
  type QuickBookTyreLineInput,
  type QuickBookServiceType,
} from '@/lib/quick-book-pricing';
import type { PricingContext } from '@/lib/pricing-engine';
import { getWeatherPricingContext, type WeatherPricingContext } from '@/lib/weather';
import { distanceResultToKm, resolveQuickBookDistance } from '@/lib/quick-book-distance';
import { GARAGE_ADDRESS } from '@/lib/garage';
import { ASSISTED_CHAT_AUTO_PRICING_MAX_MILES } from '@/lib/fitting-location-pricing';
import { normalizeCustomerPhoneInput, normalizeRecipientEmailInput } from '@/lib/contact-normalization';

function normalizeOptionalEmailInput(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  return normalizeRecipientEmailInput(input);
}

const updateSchema = z.object({
  customerName: z.string().min(1).max(255).optional(),
  customerPhone: z.preprocess(normalizeCustomerPhoneInput, z.string().min(5).max(20)).optional(),
  customerEmail: z.preprocess(
    normalizeOptionalEmailInput,
    z.string().email().optional().or(z.literal('')),
  ),
  locationLat: z.number().nullable().optional(),
  locationLng: z.number().nullable().optional(),
  locationAddress: z.string().nullable().optional(),
  locationPostcode: z.string().nullable().optional(),
  distanceKm: z.number().nullable().optional(),
  serviceType: z.enum(['fit', 'repair', 'assess']).optional(),
  tyreSize: z.string().max(20).nullable().optional(),
  tyreCount: z.number().int().min(1).max(10).optional(),
  tyreLines: z.array(z.object({
    id: z.string().optional(),
    size: z.string().max(30),
    quantity: z.number().int().min(1).max(10),
    brand: z.string().nullable().optional(),
    pattern: z.string().nullable().optional(),
    season: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    price: z.number().nullable().optional(),
  })).optional(),
  items: z.array(z.object({
    id: z.string().optional(),
    size: z.string().max(30),
    quantity: z.number().int().min(1).max(10),
    brand: z.string().nullable().optional(),
    pattern: z.string().nullable().optional(),
    season: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    price: z.number().nullable().optional(),
  })).optional(),
  basePrice: z.number().optional(),
  surchargePercent: z.number().optional(),
  totalPrice: z.number().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  bookingId: z.string().uuid().optional(),
  adminAdjustmentAmount: z.number().optional(),
  adminAdjustmentReason: z.string().max(500).nullable().optional(),
  adminDistanceLimitMiles: z.number().int().min(1).max(ASSISTED_CHAT_AUTO_PRICING_MAX_MILES).optional(),
  pricingContext: z.enum([
    'scheduled_mobile_fitting',
    'scheduled_garage_fitting',
    'emergency_mobile_fitting',
    'admin_quick_book',
    'assisted_chat',
    'manual_quote',
  ]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [booking] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, id))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ booking });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const hasField = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, key);

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (hasField('totalPrice')) {
    return NextResponse.json(
      {
        error:
          'totalPrice is derived from priceBreakdown.total. Use adminAdjustmentAmount/adminAdjustmentReason for manual price changes.',
      },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  const existingBreakdown = existing.priceBreakdown as Record<string, unknown> | null;
  const hasTyreLinesField = hasField('tyreLines') || hasField('items');
  const incomingTyreLines = hasField('tyreLines')
    ? data.tyreLines ?? []
    : hasField('items')
    ? data.items ?? []
    : null;

  if (data.customerName !== undefined) updateData.customerName = data.customerName;
  if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone;
  if (data.customerEmail !== undefined) updateData.customerEmail = data.customerEmail || null;
  if (data.locationLat !== undefined) updateData.locationLat = data.locationLat != null ? String(data.locationLat) : null;
  if (data.locationLng !== undefined) updateData.locationLng = data.locationLng != null ? String(data.locationLng) : null;
  if (data.locationAddress !== undefined) updateData.locationAddress = data.locationAddress;
  if (data.locationPostcode !== undefined) updateData.locationPostcode = data.locationPostcode;
  if (data.distanceKm !== undefined) updateData.distanceKm = data.distanceKm != null ? String(data.distanceKm) : null;
  if (data.serviceType !== undefined) updateData.serviceType = data.serviceType;
  if (data.tyreSize !== undefined) updateData.tyreSize = data.tyreSize?.trim() ? data.tyreSize.trim() : null;
  if (data.tyreCount !== undefined) updateData.tyreCount = data.tyreCount;
  if (data.basePrice != null) updateData.basePrice = String(data.basePrice);
  if (data.surchargePercent != null) updateData.surchargePercent = String(data.surchargePercent);
  if (data.status) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.bookingId) updateData.bookingId = data.bookingId;
  if (data.adminAdjustmentAmount != null) updateData.adminAdjustmentAmount = String(data.adminAdjustmentAmount);
  if (data.adminAdjustmentReason !== undefined) updateData.adminAdjustmentReason = data.adminAdjustmentReason;

  const mergedServiceType = (data.serviceType ?? existing.serviceType) as QuickBookServiceType;
  const existingTyreLineSelections = extractQuickBookTyreLineSelections({ priceBreakdown: existing.priceBreakdown });
  const mergedTyreCount = data.tyreCount ?? existing.tyreCount ?? 1;
  const mergedTyreSize =
    data.tyreSize !== undefined
      ? (data.tyreSize?.trim() || null)
      : (existing.tyreSize ?? null);
  const mergedTyreLines: QuickBookTyreLineInput[] = incomingTyreLines !== null
    ? incomingTyreLines.map((line, index) => ({
        id: line.id || `tyre-${index + 1}`,
        size: line.size.trim(),
        quantity: line.quantity,
        brand: line.brand ?? null,
        pattern: line.pattern ?? null,
        season: line.season ?? null,
        source: line.source ?? null,
        price: line.price ?? null,
      }))
    : existingTyreLineSelections.length > 0
    ? existingTyreLineSelections.map((line, index) => ({
        id: line.id || `tyre-${index + 1}`,
        size: line.normalizedSize ?? line.sizeDisplay ?? line.requestedSize,
        quantity: line.quantity,
        brand: line.brand,
        pattern: line.pattern,
        price: line.unitPrice,
      }))
    : mergedTyreSize
    ? [{ id: 'tyre-1', size: mergedTyreSize, quantity: mergedTyreCount }]
    : [];
  const primaryTyreLine = mergedTyreLines[0] ?? null;
  const primaryTyreSize = primaryTyreLine?.size ?? mergedTyreSize;
  const primaryTyreCount = primaryTyreLine?.quantity ?? mergedTyreCount;

  if (hasTyreLinesField) {
    updateData.tyreSize = primaryTyreSize;
    updateData.tyreCount = primaryTyreCount;
  }

  const mergedLat =
    data.locationLat !== undefined
      ? data.locationLat
      : (existing.locationLat ? Number(existing.locationLat) : null);
  const mergedLng =
    data.locationLng !== undefined
      ? data.locationLng
      : (existing.locationLng ? Number(existing.locationLng) : null);

  let mergedDistanceKm =
    data.distanceKm !== undefined
      ? data.distanceKm
      : (existing.distanceKm ? Number(existing.distanceKm) : null);

  // Track service origin for map display
  let serviceOriginLat: number | null = null;
  let serviceOriginLng: number | null = null;
  let serviceOriginSource: 'driver' | 'garage' | null = null;
  let serviceOriginDriverId: string | null = null;
  let durationMinutes: number | null = null;
  let serviceDistanceMiles: number | null =
    typeof existingBreakdown?.serviceDistanceMiles === 'number' && Number.isFinite(existingBreakdown.serviceDistanceMiles)
      ? existingBreakdown.serviceDistanceMiles
      : null;
  let pricingDistanceMiles: number | null =
    data.distanceKm !== undefined
      ? (data.distanceKm != null ? data.distanceKm * 0.621371 : null)
      : typeof existingBreakdown?.pricingDistanceMiles === 'number' && Number.isFinite(existingBreakdown.pricingDistanceMiles)
      ? existingBreakdown.pricingDistanceMiles
      : mergedDistanceKm != null
      ? mergedDistanceKm * 0.621371
      : null;
  let pricingDurationMinutes: number | null =
    typeof existingBreakdown?.pricingDurationMinutes === 'number' && Number.isFinite(existingBreakdown.pricingDurationMinutes)
      ? existingBreakdown.pricingDurationMinutes
      : null;
  let garageDistanceMiles: number | null =
    typeof existingBreakdown?.garageDistanceMiles === 'number' && Number.isFinite(existingBreakdown.garageDistanceMiles)
      ? existingBreakdown.garageDistanceMiles
      : null;
  let pricingDistanceSource: 'driver' | 'garage' | 'garage_floor' | null =
    existingBreakdown?.pricingDistanceSource === 'driver' ||
    existingBreakdown?.pricingDistanceSource === 'garage' ||
    existingBreakdown?.pricingDistanceSource === 'garage_floor'
      ? (existingBreakdown.pricingDistanceSource as 'driver' | 'garage' | 'garage_floor')
      : null;
  let distanceFloorApplied: boolean | null =
    typeof existingBreakdown?.distanceFloorApplied === 'boolean'
      ? existingBreakdown.distanceFloorApplied
      : null;

  if (mergedLat != null && mergedLng != null && data.distanceKm === undefined) {
    try {
      const distResult = await resolveQuickBookDistance({ lat: mergedLat, lng: mergedLng });
      mergedDistanceKm = distanceResultToKm(distResult);
      updateData.distanceKm = mergedDistanceKm != null ? String(mergedDistanceKm) : null;
      serviceDistanceMiles = distResult.distanceMiles;
      pricingDistanceMiles = distResult.pricingDistanceMiles;
      pricingDurationMinutes = distResult.distanceFloorApplied
        ? distResult.garageDurationMinutes ?? distResult.durationMinutes ?? null
        : distResult.durationMinutes ?? null;
      garageDistanceMiles = distResult.garageDistanceMiles;
      pricingDistanceSource = distResult.pricingDistanceSource;
      distanceFloorApplied = distResult.distanceFloorApplied;
      serviceOriginLat = distResult.originLat;
      serviceOriginLng = distResult.originLng;
      serviceOriginSource = distResult.distanceSource as 'driver' | 'garage';
      serviceOriginDriverId = distResult.selectedDriverId ?? null;
      durationMinutes = distResult.durationMinutes ?? null;
    } catch {
      // Keep previous distance when recalculation fails.
    }
  }

  const mergedAdminAdjustmentAmount =
    data.adminAdjustmentAmount !== undefined
      ? data.adminAdjustmentAmount
      : Number(existing.adminAdjustmentAmount ?? 0);
  const mergedAdminAdjustmentReason =
    data.adminAdjustmentReason !== undefined
      ? data.adminAdjustmentReason
      : existing.adminAdjustmentReason;
  const mergedPricingContext =
    data.pricingContext ??
    (typeof existingBreakdown?.pricingContext === 'string'
      ? (existingBreakdown.pricingContext as PricingContext)
      : 'admin_quick_book');
  const existingAdminDistanceLimitMiles =
    typeof existingBreakdown?.adminDistanceLimitMiles === 'number' && Number.isFinite(existingBreakdown.adminDistanceLimitMiles)
      ? existingBreakdown.adminDistanceLimitMiles
      : undefined;
  const mergedAdminDistanceLimitMiles = data.adminDistanceLimitMiles ?? existingAdminDistanceLimitMiles;

  if (durationMinutes == null) {
    const existingEta = (existingBreakdown?.serviceOrigin as { etaMinutes?: unknown } | undefined)?.etaMinutes;
    durationMinutes = typeof existingEta === 'number' && Number.isFinite(existingEta)
      ? existingEta
      : null;
  }
  if (pricingDurationMinutes == null) {
    pricingDurationMinutes = durationMinutes;
  }

  let weatherContext: WeatherPricingContext | null = null;
  if (mergedLat != null && mergedLng != null) {
    try {
      weatherContext = await getWeatherPricingContext({
        latitude: mergedLat,
        longitude: mergedLng,
      });
    } catch {
      weatherContext = null;
    }
  }

  const shouldRecalculate = [
    'tyreSize',
    'tyreCount',
    'tyreLines',
    'items',
    'serviceType',
    'locationLat',
    'locationLng',
    'distanceKm',
    'adminAdjustmentAmount',
    'adminDistanceLimitMiles',
    'pricingContext',
  ].some(hasField);

  if (shouldRecalculate) {
    const baseSnapshot = (hasField('tyreSize') || hasTyreLinesField) && !primaryTyreSize
      ? null
      : extractQuickBookTyreSnapshot({
          selectedTyreProductId: existing.selectedTyreProductId,
          selectedTyreUnitPrice: existing.selectedTyreUnitPrice,
          selectedTyreBrand: existing.selectedTyreBrand,
          selectedTyrePattern: existing.selectedTyrePattern,
          selectedTyreSizeDisplay: existing.tyreSize,
        });

    try {
      const priced = await calculateQuickBookPricing({
        serviceType: mergedServiceType,
        tyreSize: primaryTyreSize,
        tyreCount: primaryTyreCount,
        tyreLines: mergedTyreLines,
        distanceMiles: pricingDistanceMiles ?? (mergedDistanceKm ?? 5) * 0.621371,
        selectedTyreSnapshot: baseSnapshot,
        selectedTyreSnapshots: hasTyreLinesField ? null : existingTyreLineSelections,
        resolveTyreFromSize: hasTyreLinesField || existingTyreLineSelections.length === 0,
        requireTyreForFit: mergedServiceType === 'fit' && Boolean(primaryTyreSize),
        adminAdjustmentAmount: mergedAdminAdjustmentAmount,
        adminAdjustmentReason: mergedAdminAdjustmentReason,
        adminDistanceLimitMiles: mergedAdminDistanceLimitMiles,
        pricingContext: mergedPricingContext,
        durationMinutes: pricingDurationMinutes,
        weatherContext,
      });

      updateData.tyreSize = priced.normalizedTyreSize;
      updateData.tyreCount = primaryTyreCount;
      updateData.basePrice = priced.breakdown.subtotal.toFixed(2);
      updateData.totalPrice = priced.breakdown.total.toFixed(2);
      // Extend priceBreakdown with service origin info for map display
      updateData.priceBreakdown = {
        ...priced.breakdown,
        tyreLines: priced.tyreLineSelections,
        ...(mergedAdminDistanceLimitMiles != null
          ? { adminDistanceLimitMiles: mergedAdminDistanceLimitMiles }
          : {}),
        serviceDistanceMiles,
        pricingDistanceMiles: priced.breakdown.distanceMiles,
        pricingDurationMinutes,
        garageDistanceMiles,
        pricingDistanceSource,
        distanceFloorApplied,
        serviceOrigin: serviceOriginLat && serviceOriginLng ? {
          lat: serviceOriginLat,
          lng: serviceOriginLng,
          source: serviceOriginSource,
          driverId: serviceOriginDriverId,
          label: serviceOriginSource === 'garage' ? 'Garage' : 'Service origin',
          address: serviceOriginSource === 'garage' ? GARAGE_ADDRESS : null,
          etaMinutes: durationMinutes,
        } : existingBreakdown?.serviceOrigin ?? null,
      };
      updateData.selectedTyreProductId = priced.selectedTyreSnapshot?.productId ?? null;
      updateData.selectedTyreUnitPrice =
        priced.selectedTyreSnapshot?.unitPrice != null
          ? priced.selectedTyreSnapshot.unitPrice.toFixed(2)
          : null;
      updateData.selectedTyreBrand = priced.selectedTyreSnapshot?.brand ?? null;
      updateData.selectedTyrePattern = priced.selectedTyreSnapshot?.pattern ?? null;
    } catch (error) {
      if (error instanceof QuickBookPricingError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error('[quick-book:update] pricing error', error);
      return NextResponse.json({ error: 'Failed to recalculate pricing' }, { status: 500 });
    }
  }

  await db.update(quickBookings).set(updateData).where(eq(quickBookings.id, id));

  const [updated] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, id))
    .limit(1);

  return NextResponse.json({ booking: updated });
}
