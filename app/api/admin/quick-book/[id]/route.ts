import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  calculateQuickBookPricing,
  extractQuickBookTyreSnapshot,
  QuickBookPricingError,
  type QuickBookServiceType,
} from '@/lib/quick-book-pricing';
import type { PricingContext } from '@/lib/pricing-engine';
import { getWeatherPricingContext, type WeatherPricingContext } from '@/lib/weather';
import { distanceResultToKm, resolveQuickBookDistance } from '@/lib/quick-book-distance';
import { GARAGE_ADDRESS } from '@/lib/garage';

const updateSchema = z.object({
  customerName: z.string().min(1).max(255).optional(),
  customerPhone: z.string().min(5).max(20).optional(),
  locationLat: z.number().nullable().optional(),
  locationLng: z.number().nullable().optional(),
  locationAddress: z.string().nullable().optional(),
  locationPostcode: z.string().nullable().optional(),
  distanceKm: z.number().nullable().optional(),
  serviceType: z.enum(['fit', 'repair', 'assess']).optional(),
  tyreSize: z.string().max(20).nullable().optional(),
  tyreCount: z.number().int().min(1).max(10).optional(),
  basePrice: z.number().optional(),
  surchargePercent: z.number().optional(),
  totalPrice: z.number().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  bookingId: z.string().uuid().optional(),
  adminAdjustmentAmount: z.number().optional(),
  adminAdjustmentReason: z.string().max(500).nullable().optional(),
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

  if (data.customerName !== undefined) updateData.customerName = data.customerName;
  if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone;
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
  const mergedTyreCount = data.tyreCount ?? existing.tyreCount ?? 1;
  const mergedTyreSize =
    data.tyreSize !== undefined
      ? (data.tyreSize?.trim() || null)
      : (existing.tyreSize ?? null);

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

  if ((hasField('locationLat') || hasField('locationLng')) && mergedLat != null && mergedLng != null && data.distanceKm === undefined) {
    try {
      const distResult = await resolveQuickBookDistance({ lat: mergedLat, lng: mergedLng });
      mergedDistanceKm = distanceResultToKm(distResult);
      updateData.distanceKm = mergedDistanceKm != null ? String(mergedDistanceKm) : null;
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

  if (durationMinutes == null) {
    const existingEta = (existingBreakdown?.serviceOrigin as { etaMinutes?: unknown } | undefined)?.etaMinutes;
    durationMinutes = typeof existingEta === 'number' && Number.isFinite(existingEta)
      ? existingEta
      : null;
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
    'serviceType',
    'locationLat',
    'locationLng',
    'distanceKm',
    'adminAdjustmentAmount',
    'pricingContext',
  ].some(hasField);

  if (shouldRecalculate) {
    const baseSnapshot = hasField('tyreSize') && !mergedTyreSize
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
        tyreSize: mergedTyreSize,
        tyreCount: mergedTyreCount,
        distanceMiles: (mergedDistanceKm ?? 5) * 0.621371,
        selectedTyreSnapshot: baseSnapshot,
        resolveTyreFromSize: Boolean(mergedTyreSize),
        requireTyreForFit: mergedServiceType === 'fit' && Boolean(mergedTyreSize),
        adminAdjustmentAmount: mergedAdminAdjustmentAmount,
        adminAdjustmentReason: mergedAdminAdjustmentReason,
        pricingContext: mergedPricingContext,
        durationMinutes,
        weatherContext,
      });

      updateData.tyreSize = priced.normalizedTyreSize;
      updateData.basePrice = priced.breakdown.subtotal.toFixed(2);
      updateData.totalPrice = priced.breakdown.total.toFixed(2);
      // Extend priceBreakdown with service origin info for map display
      updateData.priceBreakdown = {
        ...priced.breakdown,
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
