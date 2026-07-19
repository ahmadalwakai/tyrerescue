import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { distanceResultToKm, resolveQuickBookDistance } from '@/lib/quick-book-distance';
import {
  calculateQuickBookPricing,
  extractQuickBookTyreSnapshot,
  type QuickBookServiceType,
} from '@/lib/quick-book-pricing';
import type { PricingContext } from '@/lib/pricing-engine';
import { getWeatherPricingContext, type WeatherPricingContext } from '@/lib/weather';
import {
  checkRateLimit,
  getClientIp,
  logSecurityRejection,
  RATE_LIMITS,
  rateLimitedResponse,
} from '@/lib/security';

const submitSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(300).optional(),
});

const PRICING_CONTEXTS = new Set<PricingContext>([
  'scheduled_mobile_fitting',
  'scheduled_garage_fitting',
  'emergency_mobile_fitting',
  'admin_quick_book',
  'assisted_chat',
  'manual_quote',
]);

function isPricingContext(value: unknown): value is PricingContext {
  return typeof value === 'string' && PRICING_CONTEXTS.has(value as PricingContext);
}

function resolvePricingContext(
  booking: typeof quickBookings.$inferSelect,
  breakdown: Record<string, unknown> | null,
): PricingContext {
  if (isPricingContext(breakdown?.pricingContext)) {
    return breakdown.pricingContext;
  }

  // Legacy quick-book rows predate canonical context storage. They were admin
  // or assisted phone flows, not public emergency checkout, so keep them out of
  // the emergency context unless it was explicitly stored above.
  if (booking.serviceType === 'fit' || booking.serviceType === 'repair' || booking.serviceType === 'assess') {
    return 'admin_quick_book';
  }

  return 'admin_quick_book';
}

function getStoredDurationMinutes(breakdown: Record<string, unknown> | null): number | null {
  const serviceOrigin = breakdown?.serviceOrigin as { etaMinutes?: unknown } | undefined;
  return typeof serviceOrigin?.etaMinutes === 'number' && Number.isFinite(serviceOrigin.etaMinutes)
    ? serviceOrigin.etaMinutes
    : null;
}

function getStoredAdminDistanceLimitMiles(breakdown: Record<string, unknown> | null): number | undefined {
  const value = breakdown?.adminDistanceLimitMiles;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || token.length !== 64) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const [booking] = await db
    .select({
      id: quickBookings.id,
      customerName: quickBookings.customerName,
      locationLinkExpiry: quickBookings.locationLinkExpiry,
      locationLinkUsed: quickBookings.locationLinkUsed,
      locationLat: quickBookings.locationLat,
      locationLng: quickBookings.locationLng,
    })
    .from(quickBookings)
    .where(eq(quickBookings.locationLinkToken, token))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }

  if (booking.locationLinkUsed) {
    return NextResponse.json({ status: 'already_shared' });
  }

  if (booking.locationLinkExpiry && new Date() > new Date(booking.locationLinkExpiry)) {
    return NextResponse.json({ status: 'expired' });
  }

  return NextResponse.json({
    status: 'pending',
    customerName: booking.customerName,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // Per-IP rate limit to slow brute-forcing of share tokens.
  const ip = getClientIp(request);
  const rl = checkRateLimit(`location-share:${ip}`, RATE_LIMITS.locationShare);
  if (!rl.ok) {
    logSecurityRejection({
      req: request,
      reason: 'rate_limited',
      route: '/api/location-share',
      status: 429,
      routeKey: 'location-share',
    });
    return rateLimitedResponse(rl);
  }

  const { token } = await params;

  if (!token || token.length !== 64) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [booking] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.locationLinkToken, token))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }

  if (booking.locationLinkUsed) {
    return NextResponse.json({ error: 'Location already shared' }, { status: 409 });
  }

  if (booking.locationLinkExpiry && new Date() > new Date(booking.locationLinkExpiry)) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  // Calculate distance from nearest available driver, fallback to garage.
  let distanceKm: number | null = null;
  let serviceOriginLat: number | null = null;
  let serviceOriginLng: number | null = null;
  let serviceOriginSource: 'driver' | 'garage' | null = null;
  let serviceOriginDriverId: string | null = null;
  let durationMinutes: number | null = null;
  let serviceDistanceMiles: number | null = null;
  let pricingDistanceMiles: number | null = null;
  let pricingDurationMinutes: number | null = null;
  let garageDistanceMiles: number | null = null;
  let pricingDistanceSource: 'driver' | 'garage' | 'garage_floor' | null = null;
  let distanceFloorApplied: boolean | null = null;
  
  try {
    const result = await resolveQuickBookDistance({ lat: parsed.data.lat, lng: parsed.data.lng });
    distanceKm = distanceResultToKm(result);
    serviceDistanceMiles = result.distanceMiles;
    pricingDistanceMiles = result.pricingDistanceMiles;
    pricingDurationMinutes = result.distanceFloorApplied
      ? result.garageDurationMinutes ?? result.durationMinutes ?? null
      : result.durationMinutes ?? null;
    garageDistanceMiles = result.garageDistanceMiles;
    pricingDistanceSource = result.pricingDistanceSource;
    distanceFloorApplied = result.distanceFloorApplied;
    serviceOriginLat = result.originLat;
    serviceOriginLng = result.originLng;
    serviceOriginSource = result.distanceSource as 'driver' | 'garage';
    serviceOriginDriverId = result.selectedDriverId ?? null;
    durationMinutes = result.durationMinutes ?? null;
  } catch {
    // Keep null; pricing falls back safely.
  }

  // Recalculate pricing with actual distance
  let basePrice: number | null = booking.basePrice ? Number(booking.basePrice) : null;
  let totalPrice: number | null = booking.totalPrice ? Number(booking.totalPrice) : null;
  let priceBreakdown: Record<string, unknown> | null = booking.priceBreakdown as Record<string, unknown> | null;

  const distanceMiles = pricingDistanceMiles ?? (distanceKm != null ? distanceKm * 0.621371 : 5);
  const serviceType = (booking.serviceType ?? 'fit') as QuickBookServiceType;
  const isInspectionOnly = serviceType === 'assess';
  const pricingContext = resolvePricingContext(booking, priceBreakdown);
  const adminDistanceLimitMiles = getStoredAdminDistanceLimitMiles(priceBreakdown);
  if (durationMinutes == null) {
    durationMinutes = getStoredDurationMinutes(priceBreakdown);
  }
  if (pricingDurationMinutes == null) {
    pricingDurationMinutes = durationMinutes;
  }

  let weatherContext: WeatherPricingContext | null = null;
  try {
    weatherContext = await getWeatherPricingContext({
      latitude: parsed.data.lat,
      longitude: parsed.data.lng,
    });
  } catch {
    weatherContext = null;
  }

  try {
    const tyreSnapshot = extractQuickBookTyreSnapshot({
      selectedTyreProductId: booking.selectedTyreProductId,
      selectedTyreUnitPrice: booking.selectedTyreUnitPrice,
      selectedTyreBrand: booking.selectedTyreBrand,
      selectedTyrePattern: booking.selectedTyrePattern,
      selectedTyreSizeDisplay: booking.tyreSize,
    });

    const priced = await calculateQuickBookPricing({
      serviceType,
      tyreSize: isInspectionOnly ? null : booking.tyreSize ?? null,
      tyreCount: isInspectionOnly ? 1 : booking.tyreCount ?? 1,
      distanceMiles,
      selectedTyreSnapshot: isInspectionOnly ? null : tyreSnapshot,
      resolveTyreFromSize: !isInspectionOnly && !tyreSnapshot && Boolean(booking.tyreSize?.trim()),
      requireTyreForFit: false, // Don't fail if tyre not found - keep existing pricing
      adminAdjustmentAmount: Number(booking.adminAdjustmentAmount ?? 0),
      adminAdjustmentReason: booking.adminAdjustmentReason,
      adminDistanceLimitMiles,
      pricingContext,
      durationMinutes: pricingDurationMinutes,
      weatherContext,
    });

    basePrice = priced.breakdown.subtotal;
    totalPrice = priced.breakdown.total;
    priceBreakdown = {
      ...priced.breakdown,
      pricingContext,
      ...(adminDistanceLimitMiles != null ? { adminDistanceLimitMiles } : {}),
      weatherContext,
      durationMinutes: pricingDurationMinutes,
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
        etaMinutes: durationMinutes,
      } : null,
    };
  } catch (pricingError) {
    console.error('[location-share] pricing error, keeping existing price', pricingError);
    // Keep existing price but update service origin
    if (priceBreakdown) {
      priceBreakdown = {
        ...priceBreakdown,
        pricingContext,
        ...(adminDistanceLimitMiles != null ? { adminDistanceLimitMiles } : {}),
        weatherContext,
        durationMinutes: pricingDurationMinutes,
        serviceDistanceMiles,
        pricingDistanceMiles: priceBreakdown.pricingDistanceMiles ?? pricingDistanceMiles,
        pricingDurationMinutes,
        garageDistanceMiles,
        pricingDistanceSource,
        distanceFloorApplied,
        serviceOrigin: serviceOriginLat && serviceOriginLng ? {
          lat: serviceOriginLat,
          lng: serviceOriginLng,
          source: serviceOriginSource,
          driverId: serviceOriginDriverId,
          etaMinutes: durationMinutes,
        } : null,
      };
    }
  }

  await db
    .update(quickBookings)
    .set({
      locationLat: String(parsed.data.lat),
      locationLng: String(parsed.data.lng),
      locationAddress: parsed.data.address ?? null,
      locationLinkUsed: true,
      distanceKm: distanceKm != null ? String(distanceKm) : null,
      basePrice: basePrice != null ? basePrice.toFixed(2) : booking.basePrice,
      totalPrice: totalPrice != null ? totalPrice.toFixed(2) : booking.totalPrice,
      priceBreakdown,
      status: 'location_received',
      updatedAt: new Date(),
    })
    .where(eq(quickBookings.id, booking.id));

  return NextResponse.json({ success: true, distanceKm });
}
