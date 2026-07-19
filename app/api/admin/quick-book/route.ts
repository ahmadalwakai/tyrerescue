import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { geocodeAddress } from '@/lib/mapbox';
import { getOutboundUrl } from '@/lib/config/site';
import {
  calculateQuickBookPricing,
  QuickBookPricingError,
  type QuickBookTyreLineInput,
} from '@/lib/quick-book-pricing';
import type { PricingContext } from '@/lib/pricing-engine';
import { getWeatherPricingContext, type WeatherPricingContext } from '@/lib/weather';
import { distanceResultToKm, resolveQuickBookDistance } from '@/lib/quick-book-distance';
import {
  buildLocationWhatsAppMessage,
  buildWhatsAppUrl,
} from '@/lib/quick-book-message-templates';
import { validateRecipientEmail } from '@/lib/email/validate-recipient';
import { ASSISTED_CHAT_AUTO_PRICING_MAX_MILES } from '@/lib/fitting-location-pricing';
import { normalizeCustomerPhoneInput, normalizeRecipientEmailInput } from '@/lib/contact-normalization';

export type CustomerEmailMode = 'walk_in_customer' | 'send_customer_confirmation';

function normalizeOptionalEmailInput(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  return normalizeRecipientEmailInput(input);
}

const tyreLineSchema = z.object({
  id: z.string().optional(),
  size: z.string().max(30),
  quantity: z.number().int().min(1).max(10),
  brand: z.string().nullable().optional(),
  pattern: z.string().nullable().optional(),
  season: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
});

const createSchema = z.object({
  customerName: z.string().min(1).max(255),
  customerPhone: z.preprocess(normalizeCustomerPhoneInput, z.string().min(5).max(20)),
  customerEmail: z.preprocess(
    normalizeOptionalEmailInput,
    z.string().email().optional().or(z.literal('')),
  ),
  customerEmailMode: z.enum(['walk_in_customer', 'send_customer_confirmation']).optional(),
  locationMethod: z.enum(['link', 'address']),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  locationAddress: z.string().optional(),
  serviceType: z.enum(['fit', 'repair', 'assess']),
  tyreSize: z.string().optional(),
  tyreCount: z.number().int().min(1).max(10).default(1),
  tyreLines: z.array(tyreLineSchema).optional(),
  items: z.array(tyreLineSchema).optional(),
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
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminMobile(request);
  } catch {
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
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldMessages = Object.entries(flat.fieldErrors)
      .map(([field, msgs]) => `${field}: ${(msgs as string[] | undefined)?.[0] ?? 'invalid'}`)
      .join('; ');
    const message = flat.formErrors[0] || fieldMessages || 'Invalid request';
    return NextResponse.json(
      { error: message, details: flat },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const tyreLines: QuickBookTyreLineInput[] = (
    data.tyreLines?.length
      ? data.tyreLines
      : data.items?.length
      ? data.items
      : data.tyreSize?.trim()
      ? [{ id: 'tyre-1', size: data.tyreSize.trim(), quantity: data.tyreCount }]
      : []
  ).map((line, index) => ({
    id: line.id || `tyre-${index + 1}`,
    size: line.size.trim(),
    quantity: line.quantity,
    brand: line.brand ?? null,
    pattern: line.pattern ?? null,
    season: line.season ?? null,
    source: line.source ?? null,
    price: line.price ?? null,
  }));
  const primaryTyreLine = tyreLines[0] ?? null;
  const primaryTyreSize = primaryTyreLine?.size ?? data.tyreSize?.trim() ?? null;
  const primaryTyreCount = primaryTyreLine?.quantity ?? data.tyreCount;

  // تطبيق سياسة البريد الإلكتروني — الافتراضي walk_in_customer لا يتطلب بريدًا
  const emailMode: CustomerEmailMode = data.customerEmailMode ?? 'walk_in_customer';
  if (emailMode === 'send_customer_confirmation') {
    if (!data.customerEmail) {
      return NextResponse.json(
        { error: 'Customer email is required when email mode is send_customer_confirmation' },
        { status: 400 },
      );
    }
    const emailCheck = validateRecipientEmail(data.customerEmail);
    if (!emailCheck.ok) {
      return NextResponse.json(
        { error: `Invalid customer email: ${emailCheck.reason}` },
        { status: 400 },
      );
    }
  }

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
  let normalizedTyreSize: string | null = primaryTyreSize;
  let weatherContext: WeatherPricingContext | null = null;
  const pricingContext: PricingContext = data.pricingContext ?? 'admin_quick_book';

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

  // Track service origin for map display
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

  if (lat && lng) {
    try {
      const distResult = await resolveQuickBookDistance({ lat, lng });
      distanceKm = distanceResultToKm(distResult);
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
    } catch { /* fallback */ }

    try {
      weatherContext = await getWeatherPricingContext({
        latitude: lat,
        longitude: lng,
      });
    } catch {
      weatherContext = null;
    }
  }

  const shouldPrice = Boolean(lat && lng) || Boolean(primaryTyreSize) || data.serviceType !== 'fit';
  if (shouldPrice) {
    try {
      const pricing = await calculateQuickBookPricing({
        serviceType: data.serviceType,
        tyreSize: primaryTyreSize,
        tyreCount: primaryTyreCount,
        tyreLines,
        distanceMiles: pricingDistanceMiles ?? (distanceKm ?? 5) * 0.621371,
        resolveTyreFromSize: Boolean(primaryTyreSize),
        requireTyreForFit: data.serviceType === 'fit' && Boolean(primaryTyreSize),
        adminAdjustmentAmount: data.adminAdjustmentAmount ?? 0,
        adminAdjustmentReason: data.adminAdjustmentReason,
        adminDistanceLimitMiles: data.adminDistanceLimitMiles,
        pricingContext,
        durationMinutes: pricingDurationMinutes,
        weatherContext,
      });

      basePrice = pricing.breakdown.subtotal;
      totalPrice = pricing.breakdown.total;
      // Extend priceBreakdown with service origin info for map display
      priceBreakdown = {
        ...pricing.breakdown,
        tyreLines: pricing.tyreLineSelections,
        pricingContext,
        ...(data.adminDistanceLimitMiles != null
          ? { adminDistanceLimitMiles: data.adminDistanceLimitMiles }
          : {}),
        serviceDistanceMiles,
        pricingDistanceMiles: pricing.breakdown.distanceMiles,
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

  // Ensure service origin is stored even if pricing was skipped
  if (!priceBreakdown && serviceOriginLat && serviceOriginLng) {
    priceBreakdown = {
      lineItems: [],
      pricingContext,
      tyreLines,
      pricingEngineVersion: 'canonical-context-weather-traffic-v1',
      ...(data.adminDistanceLimitMiles != null
        ? { adminDistanceLimitMiles: data.adminDistanceLimitMiles }
        : {}),
      totalTyreCost: 0,
      totalServiceFee: 0,
      calloutFee: 0,
      totalSurcharges: 0,
      discountAmount: 0,
      surgeMultiplier: 1,
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      quoteExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      isValid: true,
      serviceDistanceMiles,
      pricingDistanceMiles,
      pricingDurationMinutes,
      garageDistanceMiles,
      pricingDistanceSource,
      distanceFloorApplied,
      serviceOrigin: {
        lat: serviceOriginLat,
        lng: serviceOriginLng,
        source: serviceOriginSource,
        driverId: serviceOriginDriverId,
        etaMinutes: durationMinutes,
      },
    };
  }

  if (!priceBreakdown && data.adminDistanceLimitMiles != null) {
    priceBreakdown = {
      lineItems: [],
      pricingContext,
      tyreLines,
      pricingEngineVersion: 'canonical-context-weather-traffic-v1',
      adminDistanceLimitMiles: data.adminDistanceLimitMiles,
      totalTyreCost: 0,
      totalServiceFee: 0,
      calloutFee: 0,
      totalSurcharges: 0,
      discountAmount: 0,
      surgeMultiplier: 1,
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      quoteExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      isValid: true,
      serviceOrigin: null,
    };
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
      tyreCount: primaryTyreCount,
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
      adminAdjustmentAmount: data.adminAdjustmentAmount != null ? String(data.adminAdjustmentAmount) : '0.00',
      adminAdjustmentReason: data.adminAdjustmentReason ?? null,
      status: initialStatus,
      notes: data.notes ?? null,
    })
    .returning();

  // Use env-aware origin so local-dev API emits localhost links the
  // assisted-chat-app can poll, while production keeps emitting SITE_URL.
  const siteUrl = getOutboundUrl();
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
