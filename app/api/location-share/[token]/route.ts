import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { resolveDistance } from '@/lib/mapbox';
import { loadAvailableDriverDistanceCandidates } from '@/lib/driver-distance-candidates';
import {
  calculateQuickBookPricing,
  extractQuickBookTyreSnapshot,
  type QuickBookServiceType,
} from '@/lib/quick-book-pricing';

const submitSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().optional(),
});

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
  
  try {
    const driverCandidates = await loadAvailableDriverDistanceCandidates();
    const result = await resolveDistance(
      { lat: parsed.data.lat, lng: parsed.data.lng },
      driverCandidates,
    );
    distanceKm = Math.round(result.distanceMiles * 1.60934 * 100) / 100;
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

  const distanceMiles = distanceKm != null ? distanceKm * 0.621371 : 5;
  const serviceType = (booking.serviceType ?? 'fit') as QuickBookServiceType;

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
      tyreSize: booking.tyreSize ?? null,
      tyreCount: booking.tyreCount ?? 1,
      distanceMiles,
      selectedTyreSnapshot: tyreSnapshot,
      resolveTyreFromSize: !tyreSnapshot && Boolean(booking.tyreSize?.trim()),
      requireTyreForFit: false, // Don't fail if tyre not found - keep existing pricing
      adminAdjustmentAmount: Number(booking.adminAdjustmentAmount ?? 0),
      adminAdjustmentReason: booking.adminAdjustmentReason,
    });

    basePrice = priced.breakdown.subtotal;
    totalPrice = priced.breakdown.total;
    priceBreakdown = {
      ...priced.breakdown,
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
