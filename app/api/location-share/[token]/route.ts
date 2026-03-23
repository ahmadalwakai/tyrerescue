import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { calculateDistance, SHOP_LOCATION } from '@/lib/distance';
import { getPricingConfig, isNightWindow } from '@/lib/pricing-config';
import { calculateDynamicSurchargeBreakdown } from '@/lib/pricing-engine';

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

  // Calculate distance from shop to customer
  let distanceKm: number | null = null;
  try {
    const result = await calculateDistance(
      { lat: parsed.data.lat, lng: parsed.data.lng },
      SHOP_LOCATION
    );
    distanceKm = result.drivingKm ?? result.straightLineKm;
  } catch {
    // Fallback: use haversine already in calculateDistance
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
      status: 'location_received',
      updatedAt: new Date(),
    })
    .where(eq(quickBookings.id, booking.id));

  return NextResponse.json({ success: true, distanceKm });
}
