import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { geocodeAddress, resolveDistance } from '@/lib/mapbox';
import {
  calculateQuickBookPricing,
  QuickBookPricingError,
} from '@/lib/quick-book-pricing';
import { loadAvailableDriverDistanceCandidates } from '@/lib/driver-distance-candidates';
import {
  buildLocationWhatsAppMessage,
  buildWhatsAppUrl,
} from '@/lib/quick-book-message-templates';

const createSchema = z.object({
  customerName: z.string().min(1).max(255),
  customerPhone: z.string().min(5).max(20),
  customerEmail: z.string().email().optional().or(z.literal('')),
  locationMethod: z.enum(['link', 'address']),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  locationAddress: z.string().optional(),
  serviceType: z.enum(['fit', 'repair', 'assess']),
  tyreSize: z.string().optional(),
  tyreCount: z.number().int().min(1).max(10).default(1),
  notes: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bookings = await db
    .select()
    .from(quickBookings)
    .orderBy(desc(quickBookings.createdAt))
    .limit(50);

  return NextResponse.json({ bookings });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Generate location link token if method is 'link'
  let linkToken: string | null = null;
  let linkExpiry: Date | null = null;
  let lat: number | null = data.locationLat ?? null;
  let lng: number | null = data.locationLng ?? null;
  let resolvedAddress = data.locationAddress ?? null;
  let distanceKm: number | null = null;
  let basePrice: number | null = null;
  let totalPrice: number | null = null;
  let priceBreakdown: Awaited<ReturnType<typeof calculateQuickBookPricing>>['breakdown'] | null = null;
  let selectedTyreSnapshot: Awaited<ReturnType<typeof calculateQuickBookPricing>>['selectedTyreSnapshot'] = null;
  let normalizedTyreSize: string | null = data.tyreSize?.trim() || null;

  if (data.locationMethod === 'link') {
    linkToken = randomBytes(32).toString('hex');
    linkExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
  } else if (data.locationMethod === 'address' && data.locationAddress && !lat) {
    // Geocode the address to get coordinates
    try {
      const geocoded = await geocodeAddress(data.locationAddress);
      if (geocoded) {
        lng = geocoded.center[0];
        lat = geocoded.center[1];
        resolvedAddress = geocoded.placeName;
      }
    } catch { /* proceed without geocoding */ }
  }

  if (lat && lng) {
    try {
      const driverCandidates = await loadAvailableDriverDistanceCandidates();
      const distResult = await resolveDistance({ lat, lng }, driverCandidates);
      distanceKm = Math.round(distResult.distanceMiles * 1.60934 * 100) / 100;
    } catch { /* fallback */ }
  }

  const shouldPrice = Boolean(lat && lng) || Boolean(data.tyreSize?.trim()) || data.serviceType !== 'fit';
  if (shouldPrice) {
    try {
      const pricing = await calculateQuickBookPricing({
        serviceType: data.serviceType,
        tyreSize: data.tyreSize?.trim() || null,
        tyreCount: data.tyreCount,
        distanceMiles: (distanceKm ?? 5) * 0.621371,
        resolveTyreFromSize: Boolean(data.tyreSize?.trim()),
        requireTyreForFit: data.serviceType === 'fit' && Boolean(data.tyreSize?.trim()),
      });

      basePrice = pricing.breakdown.subtotal;
      totalPrice = pricing.breakdown.total;
      priceBreakdown = pricing.breakdown;
      selectedTyreSnapshot = pricing.selectedTyreSnapshot;
      normalizedTyreSize = pricing.normalizedTyreSize ?? normalizedTyreSize;
    } catch (error) {
      if (error instanceof QuickBookPricingError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error('[quick-book:create] pricing error', error);
      return NextResponse.json({ error: 'Failed to calculate pricing' }, { status: 500 });
    }
  }

  const initialStatus = data.locationMethod === 'link'
    ? 'pending_location'
    : (lat && lng ? 'quoted' : 'pending_location');

  const [created] = await db
    .insert(quickBookings)
    .values({
      adminId: session.user.id,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail || null,
      locationMethod: data.locationMethod,
      locationLat: lat != null ? String(lat) : null,
      locationLng: lng != null ? String(lng) : null,
      locationAddress: resolvedAddress,
      locationPostcode: null,
      locationLinkToken: linkToken,
      locationLinkExpiry: linkExpiry,
      serviceType: data.serviceType,
      tyreSize: normalizedTyreSize,
      tyreCount: data.tyreCount,
      selectedTyreProductId: selectedTyreSnapshot?.productId ?? null,
      selectedTyreUnitPrice:
        selectedTyreSnapshot?.unitPrice != null ? selectedTyreSnapshot.unitPrice.toFixed(2) : null,
      selectedTyreBrand: selectedTyreSnapshot?.brand ?? null,
      selectedTyrePattern: selectedTyreSnapshot?.pattern ?? null,
      distanceKm: distanceKm != null ? String(distanceKm) : null,
      basePrice: basePrice != null ? String(basePrice) : null,
      surchargePercent: '0.00',
      totalPrice: totalPrice != null ? String(totalPrice) : null,
      priceBreakdown: priceBreakdown,
      status: initialStatus,
      notes: data.notes ?? null,
    })
    .returning();

  const siteUrl = 'https://www.tyrerescue.uk';
  const locationLink = linkToken ? `${siteUrl}/locate/${linkToken}` : null;
  
  // Use beautiful message templates for WhatsApp
  const whatsappText = locationLink
    ? buildLocationWhatsAppMessage({
        customerName: data.customerName,
        locationLink,
        serviceType: data.serviceType,
      })
    : null;
  const whatsappLink = whatsappText
    ? buildWhatsAppUrl(data.customerPhone, whatsappText)
    : null;

  return NextResponse.json({
    booking: created,
    locationLink,
    whatsappLink,
    whatsappText,
  }, { status: 201 });
}
