import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { resolveDistance } from '@/lib/mapbox';
import { getPricingConfig, isNightWindow } from '@/lib/pricing-config';
import { calculateDynamicSurchargeBreakdown } from '@/lib/pricing-engine';
import { loadAvailableDriverDistanceCandidates } from '@/lib/driver-distance-candidates';

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

  // Reprice with dynamic surcharge
  let surchargePercent = 0;
  let totalPrice: number | null = null;
  const basePrice = booking.basePrice ? Number(booking.basePrice) : null;

  try {
    const config = await getPricingConfig();
    const surchargeBreakdown = calculateDynamicSurchargeBreakdown({
      isNight: isNightWindow(config),
      nightSurchargePercent: Number(config.nightSurchargePercent ?? 15),
      manualSurchargeActive: config.manualSurchargeActive ?? false,
      manualSurchargePercent: Number(config.manualSurchargePercent ?? 0),
      demandSurchargePercent: Number(config.demandSurchargePercent ?? 0),
      isReturningVisitor: false, // customer link — not visitor-tracked
      cookieReturnSurchargePercent: 0,
      maxTotalSurchargePercent: Number(config.maxTotalSurchargePercent ?? 25),
    });
    surchargePercent = surchargeBreakdown.cappedPercent;

    if (basePrice) {
      const surchargeAmount = basePrice * (surchargePercent / 100);
      totalPrice = Math.round((basePrice + surchargeAmount) * 100) / 100;
    }
  } catch { /* proceed without surcharge */ }

  // Build updated priceBreakdown with service origin
  const existingBreakdown = booking.priceBreakdown as Record<string, unknown> | null;
  const updatedPriceBreakdown = existingBreakdown ? {
    ...existingBreakdown,
    serviceOrigin: serviceOriginLat && serviceOriginLng ? {
      lat: serviceOriginLat,
      lng: serviceOriginLng,
      source: serviceOriginSource,
      driverId: serviceOriginDriverId,
      etaMinutes: durationMinutes,
    } : null,
  } : serviceOriginLat && serviceOriginLng ? {
    lineItems: [],
    totalTyreCost: 0,
    totalServiceFee: 0,
    calloutFee: 0,
    totalSurcharges: 0,
    discountAmount: 0,
    subtotal: 0,
    vatAmount: 0,
    total: 0,
    serviceOrigin: {
      lat: serviceOriginLat,
      lng: serviceOriginLng,
      source: serviceOriginSource,
      driverId: serviceOriginDriverId,
      etaMinutes: durationMinutes,
    },
  } : null;

  await db
    .update(quickBookings)
    .set({
      locationLat: String(parsed.data.lat),
      locationLng: String(parsed.data.lng),
      locationAddress: parsed.data.address ?? null,
      locationLinkUsed: true,
      distanceKm: distanceKm != null ? String(distanceKm) : null,
      surchargePercent: String(surchargePercent),
      totalPrice: totalPrice != null ? String(totalPrice) : booking.totalPrice,
      priceBreakdown: updatedPriceBreakdown,
      status: 'location_received',
      updatedAt: new Date(),
    })
    .where(eq(quickBookings.id, booking.id));

  return NextResponse.json({ success: true, distanceKm });
}
