import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings, pricingRules, bankHolidays } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { geocodeAddress } from '@/lib/mapbox';
import { calculateDistance, SHOP_LOCATION } from '@/lib/distance';
import {
  calculatePricing,
  parsePricingRules,
} from '@/lib/pricing-engine';
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

  // Calculate distance + real pricing if we have coordinates
  if (lat && lng) {
    try {
      const distResult = await calculateDistance({ lat, lng }, SHOP_LOCATION);
      distanceKm = distResult.drivingKm ?? distResult.straightLineKm;
    } catch { /* fallback */ }

    // Real pricing
    try {
      const distanceMiles = (distanceKm ?? 5) * 0.621371;
      const rulesRows = await db.select().from(pricingRules);
      const rules = parsePricingRules(rulesRows.map((r) => ({ key: r.key, value: r.value })));

      const todayStr = new Date().toISOString().split('T')[0];
      const holidays = await db.select().from(bankHolidays);
      const isBankHoliday = holidays.some((h) => h.date === todayStr);

      const breakdown = calculatePricing(
        {
          tyreSelections: [],
          distanceMiles,
          bookingType: 'emergency',
          bookingDate: new Date(),
          isBankHoliday,
          serviceType: 'repair', // always use repair-only path (no tyre selections in quick-book)
          tyreQuantity: data.tyreCount,
        },
        rules,
        true,
      );

      if (breakdown.isValid) {
        // If service is fit/assess, adjust for fitting fee vs repair fee difference
        if (data.serviceType !== 'repair') {
          const fittingFee = rules.fitting_fee_per_tyre;
          const repairFee = rules.repair_fee_per_tyre;
          const diff = (fittingFee - repairFee) * data.tyreCount;
          const adjustedSubtotal = breakdown.subtotal + diff;
          // VAT removed from system - total equals subtotal
          basePrice = adjustedSubtotal;
          totalPrice = adjustedSubtotal;
        } else {
          basePrice = breakdown.subtotal;
          totalPrice = breakdown.total;
        }
      }
    } catch { /* proceed without pricing */ }
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
      tyreSize: data.tyreSize ?? null,
      tyreCount: data.tyreCount,
      distanceKm: distanceKm != null ? String(distanceKm) : null,
      basePrice: basePrice != null ? String(basePrice) : null,
      surchargePercent: '0.00',
      totalPrice: totalPrice != null ? String(totalPrice) : null,
      status: initialStatus,
      notes: data.notes ?? null,
    })
    .returning();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tyrerescue.uk';
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
