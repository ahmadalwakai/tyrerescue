# Assisted Chat Pricing Full File Output

Generated: 2026-06-11

This report contains the full current contents of every touched source/config/test file for the assisted chat emergency pricing and mobile coverage change.

## Files

- app/api/bookings/quote/route.ts
- assisted-chat-app/android/app/build.gradle
- assisted-chat-app/app.json
- assisted-chat-app/src/components/ActionButtons.tsx
- assisted-chat-app/src/components/AssistedChatScreen.tsx
- assisted-chat-app/src/components/PaymentLinkCard.tsx
- assisted-chat-app/src/components/PriceSummary.tsx
- assisted-chat-app/src/components/quote/EditQuotePriceModal.tsx
- assisted-chat-app/src/hooks/useAssistedChatDispatch.ts
- assisted-chat-app/src/hooks/useAssistedChatLocationShare.ts
- assisted-chat-app/src/hooks/useAssistedChatPrice.ts
- assisted-chat-app/src/hooks/useAssistedChatQuoteActions.ts
- assisted-chat-app/src/lib/customer-message.ts
- assisted-chat-app/src/lib/pricing-context.ts
- components/admin/assisted-chat/AssistedChatPage.tsx
- components/admin/quick-book/QuickBookForm.tsx
- components/booking/StepCustomerDetails.tsx
- components/booking/StepPayment.tsx
- components/booking/StepPricing.tsx
- lib/__tests__/assisted-chat-pricing-regression.test.ts
- lib/__tests__/fitting-location-pricing.test.ts
- lib/__tests__/pricing-engine.test.ts
- lib/fitting-location-pricing.ts
- lib/quick-book-pricing.ts

---

## app/api/bookings/quote/route.ts

~~~
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  tyreProducts,
  pricingRules,
  bankHolidays,
  quotes,
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  calculatePricing,
  parsePricingRules,
  resolvePricingContext,
  resolveMode,
  type TyreSelection,
  type PricingBreakdown,
} from '@/lib/pricing-engine';
import {
  FITTING_LOCATION_MANUAL_QUOTE_ERROR,
  MOBILE_AUTO_PRICING_MAX_MILES,
} from '@/lib/fitting-location-pricing';
import type { PricingMode } from '@/lib/pricing/weather-modifier';
import {
  resolveDistance,
  type DistanceResult,
} from '@/lib/mapbox';
import { loadAvailableDriverDistanceCandidates } from '@/lib/driver-distance-candidates';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from '@neondatabase/serverless';
import { getSurgeResult } from '@/lib/surge';
import { getWeatherPricingContext, type WeatherPricingContext } from '@/lib/weather';
import { calculateWeatherSurcharge } from '@/lib/pricing/weather-modifier';
import { calculateTrafficSurcharge } from '@/lib/pricing/traffic-modifier';
import {
  buildQuoteTyreSelectionsSnapshot,
  type QuoteTyreSelectionSnapshot,
} from '@/lib/quote-snapshot';
import {
  londonDateTimeToUtcDate,
  validateScheduledSlotForBooking,
} from '@/lib/availability';
import {
  checkRateLimit,
  getClientIp,
  logSecurityRejection,
  RATE_LIMITS,
  rateLimitedResponse,
} from '@/lib/security';

const tyreSelectionSchema = z.object({
  tyreId: z.string().uuid(),
  quantity: z.number().int().min(1).max(4),
  service: z.enum(['fit', 'repair', 'assess']),
  requiresTpms: z.boolean().optional(),
  isPreOrder: z.boolean().optional(),
});

const quoteRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  addressLine: z.string().min(1).max(500),
  bookingType: z.enum(['emergency', 'scheduled']),
  serviceType: z.enum(['repair', 'fit', 'both', 'assess']),
  tyreSelections: z.array(tyreSelectionSchema).min(0).max(4),
  scheduledAt: z.string().datetime().optional(),
  quantity: z.number().int().min(1).max(4).optional().default(1),
  fulfillmentOption: z.enum(['delivery', 'fitting']).optional().nullable(),
  fittingLocation: z.enum(['shop', 'mobile']).optional().nullable(),
});

type QuoteRequest = z.infer<typeof quoteRequestSchema>;

interface QuoteResponse {
  quoteId: string;
  expiresAt: string;
  breakdown: PricingBreakdown;
  weatherContext?: WeatherPricingContext;
  demandContext?: { multiplier: number; confidence: string; reason: string; source: string };
  distanceMiles: number;
  driverEtaMinutes?: number;
  distanceMetadata?: DistanceResult;
  tyreDetails: Array<{
    tyreId: string;
    brand: string;
    pattern: string;
    sizeDisplay: string;
    quantity: number;
    unitPrice: number;
    available: boolean;
  }>;
  specialOrderRequired: boolean;
  leadTime: string | null;
}

interface ErrorResponse {
  ok?: false;
  error: string;
  code: string;
  message?: string;
  details?: unknown;
}

const SLOT_UNAVAILABLE_MESSAGE =
  'This time slot is no longer available. Please choose another time.';

function slotUnavailableResponse() {
  const body: ErrorResponse = {
    ok: false,
    error: SLOT_UNAVAILABLE_MESSAGE,
    code: 'SLOT_UNAVAILABLE',
    message: SLOT_UNAVAILABLE_MESSAGE,
  };
  return NextResponse.json(body, { status: 409 });
}

function pricingErrorResponse(breakdown: PricingBreakdown): NextResponse<ErrorResponse> {
  if (breakdown.error === 'WEATHER_MANUAL_QUOTE_REQUIRED') {
    const message =
      'Current weather conditions need a manual quote. Please call 0141 266 0690 for assistance.';
    return NextResponse.json({ ok: false, error: message, code: 'MANUAL_QUOTE_REQUIRED', message }, { status: 422 });
  }

  if (breakdown.error === FITTING_LOCATION_MANUAL_QUOTE_ERROR) {
    const message =
      `This fitting location is over ${MOBILE_AUTO_PRICING_MAX_MILES} miles away and needs a manual quote. Please call 0141 266 0690 for assistance.`;
    return NextResponse.json({ ok: false, error: message, code: 'OUTSIDE_AUTO_PRICING_AREA', message }, { status: 422 });
  }

  if (breakdown.error === 'FITTING_LOCATION_INVALID_DISTANCE') {
    const message =
      'Unable to calculate fitting-at-location price because the service distance is invalid.';
    return NextResponse.json({ ok: false, error: message, code: 'INVALID_DISTANCE', message }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: breakdown.error || 'Failed to calculate pricing',
      code: breakdown.error === 'OUTSIDE_AUTO_PRICING_AREA' || breakdown.error === 'OUTSIDE_SERVICE_AREA'
        ? 'OUTSIDE_SERVICE_AREA'
        : 'PRICING_ERROR',
    },
    { status: 400 },
  );
}

function calculateWeatherModifier(weatherContext: WeatherPricingContext, mode: PricingMode) {
  return calculateWeatherSurcharge({
    condition: weatherContext.conditionLabel,
    severity: weatherContext.weatherReason,
    precipitationMm: weatherContext.precipitationIntensity,
    windMph: weatherContext.windSpeed * 2.23694,
    temperatureC: weatherContext.temperature,
    mode,
  });
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<QuoteResponse | ErrorResponse>> {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const rl = checkRateLimit(`booking-quote:${ip}`, RATE_LIMITS.bookingQuote);
  if (!rl.ok) {
    logSecurityRejection({
      req: request,
      reason: 'rate_limited',
      route: '/api/bookings/quote',
      status: 429,
      routeKey: 'booking-quote',
    });
    return rateLimitedResponse(rl) as NextResponse<ErrorResponse>;
  }
  try {
    const body = await request.json();
    const validation = quoteRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'VALIDATION_ERROR', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const data: QuoteRequest = validation.data;
    const isRepairOnly = data.serviceType === 'repair';
    const effectiveTyreSelections = isRepairOnly ? [] : data.tyreSelections;
    const fittingLocation =
      data.bookingType === 'scheduled' ? data.fittingLocation ?? 'mobile' : 'mobile';
    const pricingContext = resolvePricingContext({ bookingType: data.bookingType, fittingLocation });
    const mode = resolveMode({ pricingContext, fittingLocation, bookingType: data.bookingType });

    if (isRepairOnly && data.tyreSelections.length > 0) {
      console.warn('[QUOTE] Ignoring tyre selections for repair quote', {
        requestedTyreCount: data.tyreSelections.length,
      });
    }

    console.log('[QUOTE START]', {
      bookingType: data.bookingType,
      serviceType: data.serviceType,
      fittingLocation,
      pricingContext,
      mode,
      tyreCount: effectiveTyreSelections.length,
      lat: data.lat,
      lng: data.lng,
    });

    const customerLocation = { lat: data.lat, lng: data.lng };

    let normalizedScheduledAt: Date | null = null;
    if (data.scheduledAt) {
      const parsedScheduledAt = new Date(data.scheduledAt);
      if (Number.isNaN(parsedScheduledAt.getTime())) {
        return NextResponse.json(
          { error: 'Invalid scheduled service time.', code: 'VALIDATION_ERROR' },
          { status: 400 },
        );
      }
      normalizedScheduledAt = parsedScheduledAt;
    }

    if (data.bookingType === 'scheduled') {
      if (!normalizedScheduledAt) {
        return NextResponse.json(
          { error: 'Scheduled bookings require a scheduled service time.', code: 'SCHEDULED_TIME_REQUIRED' },
          { status: 400 },
        );
      }

      const slotValidation = await validateScheduledSlotForBooking(normalizedScheduledAt);
      if (!slotValidation.ok) {
        return slotUnavailableResponse();
      }

      normalizedScheduledAt = londonDateTimeToUtcDate(
        slotValidation.slot.date,
        slotValidation.slot.timeStart,
      );
    } else {
      normalizedScheduledAt = null;
    }

    const bookingDate = normalizedScheduledAt ?? new Date();
    const bookingDateStr = bookingDate.toISOString().split('T')[0];

    const [rulesRows, holidayResult, driverCandidates] = await Promise.all([
      db.select().from(pricingRules),
      db.select().from(bankHolidays).where(eq(bankHolidays.date, bookingDateStr)).limit(1),
      loadAvailableDriverDistanceCandidates(),
    ]);

    const parsedRules = parsePricingRules(rulesRows.map((r) => ({ key: r.key, value: r.value })));
    const isBankHoliday = holidayResult.length > 0;

    console.log('[DISTANCE CALC]', { driverCount: driverCandidates.length });
    // Distance is always calculated server-side — never trusted from the client.
    const distanceResult = await resolveDistance(customerLocation, driverCandidates);
    const distanceMiles = distanceResult.distanceMiles;

    const driverEtaMinutes =
      data.bookingType === 'emergency' && distanceResult.distanceSource === 'driver'
        ? distanceResult.durationMinutes ?? undefined
        : undefined;

    let tyreMap = new Map<string, typeof tyreProducts.$inferSelect>();

    if (!isRepairOnly) {
      const tyreIds = effectiveTyreSelections.map((s) => s.tyreId);
      const tyres = await db.select().from(tyreProducts).where(inArray(tyreProducts.id, tyreIds));
      tyreMap = new Map(tyres.map((t) => [t.id, t]));

      for (const selection of effectiveTyreSelections) {
        const tyre = tyreMap.get(selection.tyreId);
        if (!tyre) {
          return NextResponse.json(
            { error: `Tyre not found: ${selection.tyreId}`, code: 'TYRE_NOT_FOUND' },
            { status: 400 },
          );
        }
        if (!tyre.availableNew) {
          return NextResponse.json(
            { error: `${tyre.brand} ${tyre.pattern} is not currently sellable`, code: 'TYRE_NOT_SELLABLE' },
            { status: 400 },
          );
        }
        const livePrice = tyre.priceNew == null ? NaN : Number(tyre.priceNew);
        if (!Number.isFinite(livePrice) || livePrice < 0) {
          return NextResponse.json(
            { error: `${tyre.brand} ${tyre.pattern} is missing a valid unit price`, code: 'TYRE_PRICE_MISSING' },
            { status: 400 },
          );
        }
      }
    }

    const weatherContext = await getWeatherPricingContext({
      latitude: data.lat,
      longitude: data.lng,
      scheduledAt: normalizedScheduledAt ? normalizedScheduledAt.toISOString() : null,
    });
    const weatherModifier = calculateWeatherModifier(weatherContext, mode);
    const trafficModifier = calculateTrafficSurcharge({
      distanceMiles,
      durationMinutes: distanceResult.durationMinutes,
      mode,
    });

    // Repair-only fast path
    if (isRepairOnly) {
      console.log('[PRICING CALC] repair-only path');
      const vatRule = rulesRows.find((r) => r.key === 'vat_registered');
      const vatRegistered = vatRule ? vatRule.value === 'true' : true;

      let surgeMultiplier: number | undefined;
      let demandContext: QuoteResponse['demandContext'] | undefined;
      if (parsedRules.surge_pricing_enabled) {
        const surgeResult = await getSurgeResult();
        surgeMultiplier = surgeResult.demandMultiplier;
        demandContext = {
          multiplier: surgeResult.demandMultiplier,
          confidence: surgeResult.confidence,
          reason: surgeResult.reason,
          source: surgeResult.source,
        };
      }

      const breakdown = calculatePricing(
        {
          tyreSelections: [],
          distanceMiles,
          bookingType: data.bookingType,
          pricingContext,
          mode,
          bookingDate,
          isBankHoliday,
          surgeMultiplier,
          serviceType: 'repair',
          tyreQuantity: data.quantity || 1,
          fittingLocation,
          weatherSurcharge: weatherModifier.surcharge,
          weatherSurchargeCode: weatherModifier.code,
          weatherManualQuoteRequired: weatherModifier.manualQuoteRequired,
          trafficSurcharge: trafficModifier.surcharge,
          trafficSurchargeCode: trafficModifier.code,
          trafficDelayMinutes: trafficModifier.delayMinutes,
        },
        parsedRules,
        vatRegistered,
      );

      if (!breakdown.isValid) {
        return pricingErrorResponse(breakdown);
      }

      // Dynamic layer is bypassed — calculatePricing is the sole pricing authority.
      const repairSurcharge = null;

      const quoteId = uuidv4();
      const expiresAt = new Date(breakdown.quoteExpiresAt);

      await db.insert(quotes).values({
        id: quoteId,
        lat: String(data.lat),
        lng: String(data.lng),
        addressLine: data.addressLine,
        bookingType: data.bookingType,
        serviceType: data.serviceType,
        tyreSelections: [],
        scheduledAt: normalizedScheduledAt,
        distanceMiles: String(distanceMiles),
        breakdown: breakdown as unknown as Record<string, unknown>,
        metadata: {
          ...distanceResult as unknown as Record<string, unknown>,
          fittingLocation,
          pricingContext,
          mode,
          fittingPrice: breakdown.fittingPrice ?? null,
          tyrePrice: breakdown.tyrePrice ?? breakdown.totalTyreCost,
          totalPrice: breakdown.totalPrice ?? breakdown.total,
          dynamicSurcharge: repairSurcharge,
          weatherContext: weatherContext as unknown as Record<string, unknown>,
          weatherModifier,
          trafficModifier,
          demandContext: demandContext as unknown as Record<string, unknown>,
        },
        expiresAt,
        used: false,
      });

      const quoteDurationMs = Date.now() - startTime;
      console.log('[QUOTE SUCCESS] repair-only', { quoteId, total: breakdown.total, elapsed: quoteDurationMs });
      return NextResponse.json({
        quoteId,
        expiresAt: expiresAt.toISOString(),
        breakdown,
        distanceMiles,
        driverEtaMinutes,
        distanceMetadata: distanceResult,
        weatherContext,
        demandContext,
        tyreDetails: [],
        specialOrderRequired: false,
        leadTime: null,
        debug: {
          quoteDurationMs,
          distanceProvider: distanceResult.distanceProvider,
          distanceSource: distanceResult.distanceSource,
          selectedDriverId: distanceResult.selectedDriverId,
          fallbackReason: distanceResult.fallbackReason,
        },
      });
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 8_000,
    });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = \'8s\'');
      await client.query('SET LOCAL idle_in_transaction_session_timeout = \'8s\'');

      const tyreDetails: QuoteResponse['tyreDetails'] = [];
      const pricingSelections: TyreSelection[] = [];
      const quoteSelectionSnapshots: QuoteTyreSelectionSnapshot[] = [];
      const stockErrors: string[] = [];

      const preOrderMap = new Map<string, boolean>();
      for (const selection of effectiveTyreSelections) {
        const tyre = tyreMap.get(selection.tyreId)!;
        preOrderMap.set(selection.tyreId, !tyre.isLocalStock || (selection.isPreOrder ?? false));
      }

      for (const selection of effectiveTyreSelections) {
        const tyre = tyreMap.get(selection.tyreId)!;
        const isPreOrder = preOrderMap.get(selection.tyreId)!;

        if (isPreOrder) {
          const price = tyre.priceNew == null ? NaN : parseFloat(tyre.priceNew.toString());
          if (!Number.isFinite(price)) {
            stockErrors.push(`${tyre.brand} ${tyre.pattern} is missing a valid unit price`);
            continue;
          }
          tyreDetails.push({ tyreId: tyre.id, brand: tyre.brand, pattern: tyre.pattern, sizeDisplay: tyre.sizeDisplay, quantity: selection.quantity, unitPrice: price, available: true });
          pricingSelections.push({ tyreId: tyre.id, quantity: selection.quantity, unitPrice: price, service: selection.service, requiresTpms: selection.requiresTpms });
          quoteSelectionSnapshots.push({ tyreId: tyre.id, quantity: selection.quantity, unitPrice: price, service: selection.service, sizeDisplay: tyre.sizeDisplay, brand: tyre.brand, pattern: tyre.pattern, isPreOrder: true });
          continue;
        }

        const result = await client.query(
          `SELECT id, stock_new as stock, available_new as available, price_new as price
           FROM tyre_products
           WHERE id = $1
           FOR UPDATE SKIP LOCKED`,
          [selection.tyreId]
        );

        if (result.rows.length === 0) {
          stockErrors.push(`${tyre.brand} ${tyre.pattern} is currently being reserved by another customer`);
          continue;
        }

        const row = result.rows[0];
        const physicalStock = row.stock ?? 0;
        const available = row.available;
        const price = row.price == null ? NaN : parseFloat(row.price);
        if (!Number.isFinite(price)) {
          stockErrors.push(`${tyre.brand} ${tyre.pattern} is missing a valid unit price`);
          continue;
        }

        const reservedRow = await client.query(
          `SELECT COALESCE(SUM(quantity), 0)::int AS reserved
             FROM inventory_reservations
            WHERE tyre_id = $1
              AND released = false
              AND expires_at > NOW()`,
          [selection.tyreId]
        );
        const reservedQty = reservedRow.rows[0]?.reserved ?? 0;
        const availableStock = Math.max(0, physicalStock - reservedQty);

        if (!available) {
          stockErrors.push(`${tyre.brand} ${tyre.pattern} is not currently available`);
        } else if (availableStock < selection.quantity) {
          stockErrors.push(`Insufficient stock for ${tyre.brand} ${tyre.pattern}. Requested: ${selection.quantity}, Available: ${availableStock}`);
        }

        tyreDetails.push({ tyreId: tyre.id, brand: tyre.brand, pattern: tyre.pattern, sizeDisplay: tyre.sizeDisplay, quantity: selection.quantity, unitPrice: price, available: !!available && availableStock >= selection.quantity });
        pricingSelections.push({ tyreId: tyre.id, quantity: selection.quantity, unitPrice: price, service: selection.service, requiresTpms: selection.requiresTpms });
        quoteSelectionSnapshots.push({ tyreId: tyre.id, quantity: selection.quantity, unitPrice: price, service: selection.service, sizeDisplay: tyre.sizeDisplay, brand: tyre.brand, pattern: tyre.pattern, isPreOrder: false });
      }

      if (stockErrors.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Some tyres are not available', code: 'STOCK_UNAVAILABLE', details: stockErrors },
          { status: 400 },
        );
      }

      console.log('[PRICING CALC] tyre path', { tyreCount: effectiveTyreSelections.length });
      const vatRule = rulesRows.find((r) => r.key === 'vat_registered');
      const vatRegistered = vatRule ? vatRule.value === 'true' : true;

      let surgeMultiplier: number | undefined;
      let demandContext: QuoteResponse['demandContext'] | undefined;
      if (parsedRules.surge_pricing_enabled) {
        const surgeResult = await getSurgeResult();
        surgeMultiplier = surgeResult.demandMultiplier;
        demandContext = {
          multiplier: surgeResult.demandMultiplier,
          confidence: surgeResult.confidence,
          reason: surgeResult.reason,
          source: surgeResult.source,
        };
      }

      const breakdown = calculatePricing(
        {
          tyreSelections: pricingSelections,
          distanceMiles,
          bookingType: data.bookingType,
          pricingContext,
          mode,
          bookingDate,
          isBankHoliday,
          surgeMultiplier,
          fittingLocation,
          weatherSurcharge: weatherModifier.surcharge,
          weatherSurchargeCode: weatherModifier.code,
          weatherManualQuoteRequired: weatherModifier.manualQuoteRequired,
          trafficSurcharge: trafficModifier.surcharge,
          trafficSurchargeCode: trafficModifier.code,
          trafficDelayMinutes: trafficModifier.delayMinutes,
        },
        parsedRules,
        vatRegistered,
      );

      if (!breakdown.isValid) {
        await client.query('ROLLBACK');
        return pricingErrorResponse(breakdown);
      }

      // Dynamic layer is bypassed — calculatePricing is the sole pricing authority.
      const tyreSurcharge = null;

      const quoteId = uuidv4();
      const expiresAt = new Date(breakdown.quoteExpiresAt);

      for (const selection of effectiveTyreSelections) {
        if (preOrderMap.get(selection.tyreId)) continue;
        const reservationId = uuidv4();
        await client.query(
          `INSERT INTO inventory_reservations (id, tyre_id, booking_id, quantity, expires_at, released)
           VALUES ($1, $2, NULL, $3, $4, false)`,
          [reservationId, selection.tyreId, selection.quantity, expiresAt]
        );
        await client.query(
          `INSERT INTO inventory_movements (id, tyre_id, booking_id, movement_type, quantity_delta, stock_after, actor_user_id, note)
           VALUES (gen_random_uuid(), $1, NULL, 'reserve', 0,
                   COALESCE((SELECT stock_new FROM tyre_products WHERE id = $1), 0),
                   NULL, $2)`,
          [selection.tyreId, `Quote ${quoteId}: soft-reserved ${selection.quantity}`]
        );
      }

      const snapshotSelections = buildQuoteTyreSelectionsSnapshot(quoteSelectionSnapshots);
      const hasSpecialOrder = snapshotSelections.some((s) => Boolean(s.isPreOrder));

      await client.query(
        `INSERT INTO quotes (id, lat, lng, address_line, booking_type, service_type, tyre_selections, scheduled_at, distance_miles, breakdown, metadata, expires_at, used)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)`,
        [
          quoteId,
          data.lat,
          data.lng,
          data.addressLine,
          data.bookingType,
          data.serviceType,
          JSON.stringify(snapshotSelections),
          normalizedScheduledAt,
          distanceMiles,
          JSON.stringify(breakdown),
          JSON.stringify({
            ...distanceResult,
            fittingLocation,
            pricingContext,
            mode,
            fulfillmentOption: data.fulfillmentOption ?? null,
            fittingPrice: breakdown.fittingPrice ?? null,
            tyrePrice: breakdown.tyrePrice ?? breakdown.totalTyreCost,
            totalPrice: breakdown.totalPrice ?? breakdown.total,
            dynamicSurcharge: tyreSurcharge,
            weatherContext,
            weatherModifier,
            trafficModifier,
            demandContext,
          }),
          expiresAt,
        ]
      );

      await client.query('COMMIT');

      const quoteDurationMs = Date.now() - startTime;
      console.log('[QUOTE SUCCESS]', { quoteId, total: breakdown.total, specialOrder: hasSpecialOrder, elapsed: quoteDurationMs });
      return NextResponse.json({
        quoteId,
        expiresAt: expiresAt.toISOString(),
        breakdown,
        distanceMiles,
        driverEtaMinutes,
        distanceMetadata: distanceResult,
        weatherContext,
        demandContext,
        tyreDetails,
        specialOrderRequired: hasSpecialOrder,
        leadTime: hasSpecialOrder ? '2–3 working days' : null,
        debug: {
          quoteDurationMs,
          distanceProvider: distanceResult.distanceProvider,
          distanceSource: distanceResult.distanceSource,
          selectedDriverId: distanceResult.selectedDriverId,
          fallbackReason: distanceResult.fallbackReason,
        },
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('[QUOTE ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to generate quote', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}

~~~

## assisted-chat-app/android/app/build.gradle

~~~
apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"
apply plugin: "com.google.gms.google-services"

def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

// Load local-only release signing properties (gitignored).
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

/**
 * This is the configuration block to customize your React Native Android app.
 * By default you don't need to apply any configuration, just uncomment the lines you need.
 */
react {
    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())
    reactNativeDir = new File(["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()
    hermesCommand = new File(["node", "--print", "require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"
    codegenDir = new File(["node", "--print", "require.resolve('@react-native/codegen/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()

    enableBundleCompression = (findProperty('android.enableBundleCompression') ?: false).toBoolean()
    // Use Expo CLI to bundle the app, this ensures the Metro config
    // works correctly with Expo projects.
    cliFile = new File(["node", "--print", "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })"].execute(null, rootDir).text.trim())
    bundleCommand = "export:embed"

    /* Folders */
     //   The root of your project, i.e. where "package.json" lives. Default is '../..'
    // root = file("../../")
    //   The folder where the react-native NPM package is. Default is ../../node_modules/react-native
    // reactNativeDir = file("../../node_modules/react-native")
    //   The folder where the react-native Codegen package is. Default is ../../node_modules/@react-native/codegen
    // codegenDir = file("../../node_modules/@react-native/codegen")

    /* Variants */
    //   The list of variants to that are debuggable. For those we're going to
    //   skip the bundling of the JS bundle and the assets. By default is just 'debug'.
    //   If you add flavors like lite, prod, etc. you'll have to list your debuggableVariants.
    // debuggableVariants = ["liteDebug", "prodDebug"]

    /* Bundling */
    //   A list containing the node command and its flags. Default is just 'node'.
    // nodeExecutableAndArgs = ["node"]

    //
    //   The path to the CLI configuration file. Default is empty.
    // bundleConfig = file(../rn-cli.config.js)
    //
    //   The name of the generated asset file containing your JS bundle
    // bundleAssetName = "MyApplication.android.bundle"
    //
    //   The entry file for bundle generation. Default is 'index.android.js' or 'index.js'
    // entryFile = file("../js/MyApplication.android.js")
    //
    //   A list of extra flags to pass to the 'bundle' commands.
    //   See https://github.com/react-native-community/cli/blob/main/docs/commands.md#bundle
    // extraPackagerArgs = []

    /* Hermes Commands */
    //   The hermes compiler command to run. By default it is 'hermesc'
    // hermesCommand = "$rootDir/my-custom-hermesc/bin/hermesc"
    //
    //   The list of flags to pass to the Hermes compiler. By default is "-O", "-output-source-map"
    // hermesFlags = ["-O", "-output-source-map"]

    /* Autolinking */
    autolinkLibrariesWithApp()
}

/**
 * Set this to true in release builds to optimize the app using [R8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization).
 */
def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()

/**
 * The preferred build flavor of JavaScriptCore (JSC)
 *
 * For example, to use the international variant, you can use:
 * `def jscFlavor = 'org.webkit:android-jsc-intl:+'`
 *
 * The international variant includes ICU i18n library and necessary data
 * allowing to use e.g. `Date.toLocaleString` and `String.localeCompare` that
 * give correct results when using with locales other than en-US. Note that
 * this variant is about 6MiB larger per architecture than default.
 */
def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'

android {
    ndkVersion rootProject.ext.ndkVersion

    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace 'uk.tyrerescue.assistedchat'
    defaultConfig {
        applicationId 'uk.tyrerescue.assistedchat'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 4
        versionName "1.0.2"

        buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL", "\"${findProperty('reactNativeReleaseLevel') ?: 'stable'}\""
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (keystoreProperties.containsKey('RELEASE_STORE_FILE')) {
                storeFile file(keystoreProperties['RELEASE_STORE_FILE'])
                storePassword keystoreProperties['RELEASE_STORE_PASSWORD']
                keyAlias keystoreProperties['RELEASE_KEY_ALIAS']
                keyPassword keystoreProperties['RELEASE_KEY_PASSWORD']
            }
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Local release signing: keystore.properties under android/ supplies
            // RELEASE_STORE_FILE / passwords / alias. File is gitignored.
            signingConfig keystoreProperties.containsKey('RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }
    packagingOptions {
        jniLibs {
            def enableLegacyPackaging = findProperty('expo.useLegacyPackaging') ?: 'false'
            useLegacyPackaging enableLegacyPackaging.toBoolean()
        }
    }
    androidResources {
        ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~'
    }
}

// Apply static values from `gradle.properties` to the `android.packagingOptions`
// Accepts values in comma delimited lists, example:
// android.packagingOptions.pickFirsts=/LICENSE,**/picasa.ini
["pickFirsts", "excludes", "merges", "doNotStrip"].each { prop ->
    // Split option: 'foo,bar' -> ['foo', 'bar']
    def options = (findProperty("android.packagingOptions.$prop") ?: "").split(",");
    // Trim all elements in place.
    for (i in 0..<options.size()) options[i] = options[i].trim();
    // `[] - ""` is essentially `[""].filter(Boolean)` removing all empty strings.
    options -= ""

    if (options.length > 0) {
        println "android.packagingOptions.$prop += $options ($options.length)"
        // Ex: android.packagingOptions.pickFirsts += '**/SCCS/**'
        options.each {
            android.packagingOptions[prop] += it
        }
    }
}

dependencies {
    // The version of react-native is set by the React Native Gradle Plugin
    implementation("com.facebook.react:react-android")
    implementation platform('com.google.firebase:firebase-bom:33.5.1')
    implementation 'com.google.firebase:firebase-messaging'

    def isGifEnabled = (findProperty('expo.gif.enabled') ?: "") == "true";
    def isWebpEnabled = (findProperty('expo.webp.enabled') ?: "") == "true";
    def isWebpAnimatedEnabled = (findProperty('expo.webp.animated') ?: "") == "true";

    if (isGifEnabled) {
        // For animated gif support
        implementation("com.facebook.fresco:animated-gif:${expoLibs.versions.fresco.get()}")
    }

    if (isWebpEnabled) {
        // For webp support
        implementation("com.facebook.fresco:webpsupport:${expoLibs.versions.fresco.get()}")
        if (isWebpAnimatedEnabled) {
            // Animated webp support
            implementation("com.facebook.fresco:animated-webp:${expoLibs.versions.fresco.get()}")
        }
    }

    if (hermesEnabled.toBoolean()) {
        implementation("com.facebook.react:hermes-android")
    } else {
        implementation jscFlavor
    }
}

~~~

## assisted-chat-app/app.json

~~~
{
  "expo": {
    "name": "Tyre Rescue Assisted Chat",
    "slug": "tyre-rescue-assisted-chat",
    "version": "1.0.2",
    "orientation": "portrait",
    "scheme": "tyrerescueassistedchat",
    "userInterfaceStyle": "dark",
    "icon": "./assets/icon.png",
    "platforms": [
      "android",
      "web"
    ],
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#09090B"
    },
    "android": {
      "package": "uk.tyrerescue.assistedchat",
      "versionCode": 4,
      "permissions": [
        "INTERNET",
        "POST_NOTIFICATIONS",
        "USE_FULL_SCREEN_INTENT",
        "WAKE_LOCK",
        "VIBRATE"
      ],
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1E40AF"
      }
    },
    "web": {
      "bundler": "metro",
      "backgroundColor": "#09090B",
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-notifications",
        {
          "icon": "./assets/icon.png",
          "color": "#09090B",
          "defaultChannel": "urgent_bookings_v3",
          "androidMode": "default",
          "sounds": [
            "./assets/sounds/urgent_booking.mp3"
          ]
        }
      ],
      "expo-audio"
    ],
    "extra": {
      "router": {
        "origin": false
      },
      "eas": {
        "projectId": "7b51b2be-7b4e-484e-bb94-82628e8253e5"
      }
    },
    "owner": "ahmadawadalwakai"
  }
}

~~~

## assisted-chat-app/src/components/ActionButtons.tsx

~~~
import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type { AssistedChatDraft } from '@/types/assisted-chat';
import { AppButton, StatusBanner } from './ui';
import { copyToClipboard } from '@/lib/clipboard';
import { hasAssistedChatTyre } from '@/lib/assisted-chat-workflow';
import { formatGbp } from '@/lib/money';
import { colors, fontSize } from './theme';
import { useState } from 'react';

interface Props {
  draft: AssistedChatDraft;
  effectiveTotal: number;
  lockingNutCharge: number;
  onSendToDriver: () => void;
  dispatchBusy: boolean;
  dispatchError: string | null;
  /** Optional recovery panel rendered below the buttons when dispatch fails. */
  dispatchRecoverySlot?: ReactNode;
}

export function ActionButtons({
  draft,
  effectiveTotal,
  lockingNutCharge,
  onSendToDriver,
  dispatchBusy,
  dispatchError,
  dispatchRecoverySlot,
}: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  const handleCopy = async () => {
    const lines: string[] = [];
    lines.push('Tyre Rescue — Assisted Chat draft');
    if (draft.customer.phone) lines.push(`Phone: ${draft.customer.phone}`);
    if (draft.location.address) lines.push(`Address: ${draft.location.address}`);
    if (draft.location.lat != null && draft.location.lng != null) {
      lines.push(`Coordinates: ${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
    }

    if (draft.tyre.size) lines.push(`Tyre size: ${draft.tyre.size}`);
    lines.push(`Quantity: ${draft.tyre.quantity}`);
    lines.push(
      `Locking wheel nut: ${
        draft.lockingNut.answer === 'yes'
          ? 'Customer has it'
          : draft.lockingNut.answer === 'no'
          ? 'Customer does NOT have it'
          : 'Unknown'
      }`,
    );
    if (lockingNutCharge > 0) {
      lines.push(`Locking wheel nut removal: ${formatGbp(lockingNutCharge)}`);
    }
    if (draft.note.trim()) lines.push(`Note: ${draft.note.trim()}`);
    if (draft.quote) {
      lines.push(`Total: ${formatGbp(effectiveTotal)}`);
    }
    if (draft.paymentChoice) {
      const map = {
        cash: `Cash (${formatGbp(effectiveTotal)})`,
        deposit: `Deposit 15% (${formatGbp(effectiveTotal * 0.15)})`,
        full: `Full payment (${formatGbp(effectiveTotal)})`,
      } as const;
      lines.push(`Payment choice: ${map[draft.paymentChoice]}`);
    }
    if (draft.paymentLink) {
      lines.push(`Payment link: ${draft.paymentLink.paymentUrl}`);
      lines.push(`Payment link amount: ${formatGbp(draft.paymentLink.amountPence / 100)}`);
      if (draft.paymentLink.remainingBalancePence != null) {
        lines.push(`Balance on-site: ${formatGbp(draft.paymentLink.remainingBalancePence / 100)}`);
      }
    }
    if (draft.dispatchedRefNumber) {
      lines.push(`Booking ref: ${draft.dispatchedRefNumber}`);
    }
    const ok = await copyToClipboard(lines.join('\n'));
    setCopyState(ok ? 'ok' : 'err');
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const baseDisabled =
    dispatchBusy ||
    !hasAssistedChatTyre(draft) ||
    !draft.quote ||
    !draft.paymentChoice;
  const sendDisabled = baseDisabled;
  const sendHint = (() => {
    if (draft.dispatchedRefNumber) return null;
    if (!hasAssistedChatTyre(draft)) return 'Enter a valid tyre size before sending to driver.';
    if (!draft.quote) return 'Get the price before sending to driver.';
    if (!draft.paymentChoice) return 'Choose deposit, cash, or full payment before sending.';
    return null;
  })();

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>ACTIONS</Text>

      <AppButton label="Copy details" variant="secondary" onPress={handleCopy} fullWidth />

      <AppButton
        label={
          draft.dispatchedRefNumber
            ? `Already dispatched (${draft.dispatchedRefNumber})`
            : 'Send it to driver'
        }
        variant="primary"
        onPress={onSendToDriver}
        loading={dispatchBusy}
        disabled={sendDisabled || draft.dispatchedRefNumber !== null}
        fullWidth
      />

      {sendHint ? <Text style={styles.hint}>{sendHint}</Text> : null}

      {dispatchError ? <StatusBanner kind="err" message={dispatchError} /> : null}
      {dispatchRecoverySlot}
      {copyState === 'ok' ? <StatusBanner kind="ok" message="Details copied to clipboard." /> : null}
      {copyState === 'err' ? <StatusBanner kind="err" message="Could not copy to clipboard." /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  heading: {
    fontSize: fontSize.xs,
    color: colors.muted,
    fontWeight: '700',
    letterSpacing: 1,
  },
  hint: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});

~~~

## assisted-chat-app/src/components/AssistedChatScreen.tsx

~~~
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAssistedChatDraft } from '@/hooks/useAssistedChatDraft';
import { useAssistedChatPrice } from '@/hooks/useAssistedChatPrice';
import { useAssistedChatDispatch } from '@/hooks/useAssistedChatDispatch';
import { useAdminPaymentLink } from '@/hooks/useAdminPaymentLink';
import { useAssistedChatLocationShare } from '@/hooks/useAssistedChatLocationShare';
import { useAssistedChatQuoteActions } from '@/hooks/useAssistedChatQuoteActions';
import { useTodayBookings, type TodayBookingItem } from '@/hooks/useTodayBookings';
import { useRecentCustomers } from '@/hooks/useRecentCustomers';
import { useDuplicateBookingWarning } from '@/hooks/useDuplicateBookingWarning';
import { useNewCustomerBookingAlert } from '@/hooks/useNewCustomerBookingAlert';
import { useBookingTracking } from '@/hooks/useBookingTracking';
import type { ActiveJobItem } from '@/hooks/useActiveJobs';
import { BookingTrackingCard } from './tracking/BookingTrackingCard';
import { DriverAssignSection } from './tracking/DriverAssignSection';
import { AlertActionButton } from './ui/AlertActionButton';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  RecentCustomer,
  StripePaymentLinkState,
} from '@/types/assisted-chat';
import type { AdminQuote, AdminQuotePaymentOption, AdminQuoteStatus } from '@/types/admin-quotes';
import { LocationSection } from './LocationSection';
import { TyreSelectionSection } from './TyreSelectionSection';
import { LockingWheelNutSection } from './LockingWheelNutSection';
import { PriceSummary } from './PriceSummary';
import { CompactQuoteCard, type CompactQuoteStatus } from './quote/CompactQuoteCard';
import { EditQuotePriceModal } from './quote/EditQuotePriceModal';
import { TodayBookingsModal } from './TodayBookingsModal';
import { RecentCustomersModal } from './RecentCustomersModal';
import { DuplicateBookingWarning } from './DuplicateBookingWarning';
import { AdminQuotesModal } from './AdminQuotesModal';
import { AdminBookingsModal } from './AdminBookingsModal';
import { AdminVisitorsModal } from './AdminVisitorsModal';
import { AdminInvoicesModal } from './AdminInvoicesModal';
import { AdminStockModal } from './AdminStockModal';
import { ActiveJobsModal, ActiveJobMapModal } from './ActiveJobsModal';
import { SectionCard, FieldLabel, InlineNotice, AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { api } from '@/lib/api';
import { buildCustomerMessage, buildWhatsAppUrl } from '@/lib/customer-message';
import { copyToClipboard } from '@/lib/clipboard';
import { formatGbp, isValidUkPhone } from '@/lib/money';
import {
  clearAdminBadge,
  unregisterAdminPushNotifications,
  consumePendingOpenBookings,
  setPendingOpenBookings,
  getDismissedUrgentBookingId,
  setDismissedUrgentBookingId,
  addAdminNotificationResponseListener,
  type NotificationSubscription,
} from '@/lib/notifications';
import {
  ensureUrgentAlertsArmed,
  type UrgentAlertsReadinessState,
  showLocalUrgentBookingAlert,
  isUrgentBookingNotificationData,
  clearTopicSubscriptionFlag,
  openFullScreenIntentSettings,
} from '@/lib/urgent-alerts';
import { UrgentBookingPopup } from './alerts/UrgentBookingPopup';
import { NotificationReliabilityCard } from './alerts/NotificationReliabilityCard';
import {
  getAssistedChatWorkflow,
  hasAssistedChatTyre,
  normalizeAssistedChatTyreSize,
  type AssistedChatStage,
  type AssistedChatTimelineItem,
  type AssistedChatTimelineStep,
} from '@/lib/assisted-chat-workflow';
import {
  deriveOperatorWorkflowSteps,
  deriveNextBestAction,
  stageForStepId,
} from '@/lib/operator-workflow-state';
import { OperatorStepProgress } from './workflow/OperatorStepProgress';
import { NextBestActionCard } from './workflow/NextBestActionCard';

interface ParsedCallNotes {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  locationAddress?: string;
  tyreSize?: string;
  quantity?: number;
  lockingNutAnswer?: 'yes' | 'no' | 'unknown';
  lockingNutCharge?: number | null;
  paymentChoice?: AssistedChatPaymentChoice;
  driverNote?: string;
}

interface AssistedChatScreenProps {
  user?: { name: string; email: string } | null;
  onLogout?: () => void | Promise<void>;
}

interface SheetAction {
  id: string;
  label: string;
  description?: string;
  disabledReason?: string | null;
  destructive?: boolean;
  onPress: () => void | Promise<void>;
}

interface ActionNotice {
  kind: 'ok' | 'err' | 'info' | 'warn';
  text: string;
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const PAYMENT_OPTIONS: ReadonlyArray<{ value: AdminQuotePaymentOption; label: string; description: string }> = [
  { value: 'DEPOSIT_15', label: 'Deposit 15%', description: 'Customer pays 15% now and the balance on arrival.' },
  { value: 'CASH_ON_ARRIVAL', label: 'Cash on arrival', description: 'Driver collects cash when the job is complete.' },
  { value: 'FULL_PAYMENT', label: 'Full payment', description: 'Customer completes the full Stripe payment.' },
  { value: 'PAYMENT_LINK', label: 'Send payment link', description: 'Send a secure payment link before dispatch.' },
];

const CONFIRMED_QUOTE_STATUSES: readonly AdminQuoteStatus[] = [
  'CONFIRMED_BY_PHONE',
  'PAYMENT_PENDING',
  'PAID',
];

const ALERT_ARM_RETRY_DELAYS_MS = [3000, 10000, 30000, 30000, 30000, 30000];

function normalizeTyreSizeFromText(text: string): string | undefined {
  const match = text.match(/\b(\d{3})\s*[\/ -]?\s*(\d{2})\s*(?:[\/ -]?\s*r\s*|[\/ -]+)(\d{2})\b/i);
  if (!match) return undefined;
  return normalizeAssistedChatTyreSize(`${match[1]}/${match[2]}/R${match[3]}`) ?? undefined;
}

function parseCallNotes(text: string): ParsedCallNotes {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const parsed: ParsedCallNotes = {};

  const email = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) parsed.customerEmail = email;

  const phone = normalized.match(/(?:\+44\s?\d{4}|0\d{4}|01\d{3}|02\d{3})[\d\s-]{5,12}/)?.[0];
  if (phone) parsed.customerPhone = phone.replace(/\s{2,}/g, ' ').trim();

  const name = normalized.match(/\b(?:name is|customer is|customer name is)\s+([A-Za-z][A-Za-z' -]{1,42})(?=\s+(?:phone|number|email|address|at|location|tyre|size|needs|wants|payment|cash|deposit|full|locking)\b|$)/i)?.[1];
  if (name) parsed.customerName = name.trim();

  const tyreSize = normalizeTyreSizeFromText(normalized);
  if (tyreSize) parsed.tyreSize = tyreSize;

  const quantityMatch = normalized.match(/\b(?:qty|quantity|needs?|wants?|fit)\s*(?:x\s*)?(\d{1,2})\s*(?:tyres?|tires?|x)?\b/i)
    ?? normalized.match(/\bx\s*(\d{1,2})\b/i)
    ?? normalized.match(/\b(\d{1,2})\s*(?:tyres?|tires?)\b/i);
  if (quantityMatch) {
    const quantity = Number(quantityMatch[1]);
    if (Number.isFinite(quantity)) parsed.quantity = Math.max(1, Math.min(10, Math.round(quantity)));
  }

  const address = normalized.match(/\b(?:address|location|at)\s+(.+?)(?=\s+(?:phone|number|email|tyre|tire|size|needs|wants|payment|cash|deposit|full|locking|note)\b|$)/i)?.[1];
  if (address && address.length >= 5) parsed.locationAddress = address.replace(/[,. ]+$/, '').trim();

  if (/\b(?:has|with)\s+(?:the\s+)?(?:locking\s+)?(?:wheel\s+)?nut\s+key\b/i.test(normalized)) {
    parsed.lockingNutAnswer = 'yes';
  } else if (/\b(?:no|without|lost|missing|does not have|doesn't have)\s+(?:the\s+)?(?:locking\s+)?(?:wheel\s+)?nut\s+key\b/i.test(normalized)) {
    parsed.lockingNutAnswer = 'no';
  }

  const lockingCharge = normalized.match(/\b(?:locking|nut|removal)\D{0,16}(?:£|gbp)?\s*(\d{1,4}(?:\.\d{1,2})?)\b/i)?.[1];
  if (lockingCharge) {
    const charge = Number(lockingCharge);
    if (Number.isFinite(charge) && charge >= 0) {
      parsed.lockingNutAnswer = 'no';
      parsed.lockingNutCharge = Math.round(charge * 100) / 100;
    }
  }

  if (/\bdeposit\b/.test(lower)) parsed.paymentChoice = 'deposit';
  else if (/\b(?:full payment|pay full|paid full|payment link)\b/.test(lower)) parsed.paymentChoice = 'full';
  else if (/\bcash\b/.test(lower)) parsed.paymentChoice = 'cash';

  const driverNote = normalized.match(/\b(?:driver note|note)\s*[:\-]?\s+(.+)$/i)?.[1];
  if (driverNote) parsed.driverNote = driverNote.trim();

  return parsed;
}

function formatPence(pence: number): string {
  if (!Number.isFinite(pence)) return GBP.format(0);
  return GBP.format(pence / 100);
}

function getQuotePricePence(quote: AdminQuote | null, effectiveTotal: number): number {
  return quote?.priceAmount ?? Math.round(effectiveTotal * 100);
}

function getDepositSummary(priceAmountPence: number): { depositAmountPence: number; remainingBalancePence: number } {
  const depositAmountPence = Math.round((priceAmountPence * 15) / 100);
  return { depositAmountPence, remainingBalancePence: priceAmountPence - depositAmountPence };
}

function isQuoteConfirmed(quote: AdminQuote | null): boolean {
  if (!quote) return false;
  return Boolean(
    quote.confirmedAt ||
      quote.selectedPaymentOption ||
      CONFIRMED_QUOTE_STATUSES.includes(quote.quoteStatus),
  );
}

function computeCompactQuoteStatus(args: {
  activeQuote: AdminQuote | null;
  savedQuoteRef: string | null;
  quoteConfirmed: boolean;
  paymentLink: StripePaymentLinkState | null;
}): CompactQuoteStatus {
  const { activeQuote, savedQuoteRef, quoteConfirmed, paymentLink } = args;
  if (activeQuote?.quoteStatus === 'PAID') return 'PAYMENT_CONFIRMED';
  if (paymentLink) return 'PAYMENT_LINK_SENT';
  if (quoteConfirmed) return 'CONFIRMED';
  if (savedQuoteRef) return 'SAVED';
  return 'NOT_SAVED';
}

function formatQuoteDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatQuoteExpiryStatus(quote: AdminQuote | null, hasSavedQuote: boolean): string | null {
  if (!hasSavedQuote) return null;
  if (!quote) return 'Valid until unknown';
  if (quote.isExpired) return 'Expired';
  const expiresAt = new Date(quote.expiresAt);
  const remainingMs = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || Number.isNaN(expiresAt.getTime())) return 'Valid until unknown';
  if (remainingMs <= 0) return 'Expired';
  const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000));
  if (remainingMinutes < 120) {
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return hours > 0 ? `Expires in ${hours}h ${minutes}m` : `Expires in ${minutes}m`;
  }
  return `Valid until ${formatQuoteDateTime(quote.expiresAt)}`;
}

function paymentOptionLabel(option: AdminQuotePaymentOption | null | undefined): string {
  if (!option) return 'Not selected';
  return PAYMENT_OPTIONS.find((item) => item.value === option)?.label ?? option;
}

function paymentChoiceLabel(choice: AssistedChatPaymentChoice | null): string {
  if (choice === 'deposit') return 'Deposit 15%';
  if (choice === 'cash') return 'Cash on arrival';
  if (choice === 'full') return 'Full payment link';
  return 'Not selected';
}

function hasDraftContent(draft: AssistedChatDraft): boolean {
  return Boolean(
    draft.customer.phone ||
      draft.customer.name ||
      draft.customer.email ||
      draft.location.address ||
      draft.location.lat != null ||
      draft.tyre.size ||
      draft.note ||
      draft.quote ||
      draft.dispatchedRefNumber,
  );
}

function buildCustomerDetails(draft: AssistedChatDraft): string {
  const lines: string[] = ['Customer details'];
  lines.push(`Name: ${draft.customer.name.trim() || 'New customer'}`);
  if (draft.customer.phone.trim()) lines.push(`Phone: ${draft.customer.phone.trim()}`);
  if (draft.customer.email.trim()) lines.push(`Email: ${draft.customer.email.trim()}`);
  return lines.join('\n');
}

function buildLocationDetails(draft: AssistedChatDraft): string {
  const lines: string[] = ['Location details'];
  if (draft.location.address.trim()) lines.push(`Address: ${draft.location.address.trim()}`);
  if (draft.location.postcode) lines.push(`Postcode: ${draft.location.postcode}`);
  if (draft.location.lat != null && draft.location.lng != null) {
    lines.push(`Coordinates: ${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
  }
  if (draft.location.link) lines.push(`Location link: ${draft.location.link}`);
  lines.push(`Status: ${draft.location.status}`);
  return lines.join('\n');
}

function buildJobDetails(
  draft: AssistedChatDraft,
  effectiveTotal: number,
  lockingNutCharge: number,
  selectedPaymentOption: AdminQuotePaymentOption,
): string {
  const lines: string[] = ['Tyre Rescue Assisted Chat draft'];
  if (draft.customer.name.trim()) lines.push(`Customer: ${draft.customer.name.trim()}`);
  if (draft.customer.phone.trim()) lines.push(`Phone: ${draft.customer.phone.trim()}`);
  if (draft.location.address.trim()) lines.push(`Address: ${draft.location.address.trim()}`);
  if (draft.location.lat != null && draft.location.lng != null) {
    lines.push(`Coordinates: ${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
  }
  if (draft.tyre.size.trim()) lines.push(`Tyre size: ${draft.tyre.size.trim()}`);
  lines.push(`Quantity: ${draft.tyre.quantity}`);
  lines.push(
    `Locking wheel nut: ${
      draft.lockingNut.answer === 'yes'
        ? 'Customer has it'
        : draft.lockingNut.answer === 'no'
        ? 'Customer does not have it'
        : 'Unknown'
    }`,
  );
  if (lockingNutCharge > 0) lines.push(`Locking wheel nut removal: ${formatGbp(lockingNutCharge)}`);
  if (draft.note.trim()) lines.push(`Driver note: ${draft.note.trim()}`);
  if (draft.quote) {
    lines.push(`Total: ${formatGbp(effectiveTotal)}`);
  }
  if (draft.savedQuoteRef) lines.push(`Quote ref: ${draft.savedQuoteRef}`);
  lines.push(`Payment option: ${paymentOptionLabel(selectedPaymentOption)}`);
  if (draft.paymentLink) {
    lines.push(`Payment link: ${draft.paymentLink.paymentUrl}`);
    lines.push(`Payment link amount: ${formatPence(draft.paymentLink.amountPence)}`);
    if (draft.paymentLink.remainingBalancePence != null) {
      lines.push(`Balance on arrival: ${formatPence(draft.paymentLink.remainingBalancePence)}`);
    }
  }
  if (draft.dispatchedRefNumber) lines.push(`Booking ref: ${draft.dispatchedRefNumber}`);
  return lines.join('\n');
}

function buildPaymentMessage(paymentLink: StripePaymentLinkState, draft: AssistedChatDraft, effectiveTotal: number): string {
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  lines.push(
    paymentLink.kind === 'deposit'
      ? 'Your booking is ready. Please pay the 15% deposit using this secure payment link:'
      : 'Your booking is ready. Please complete the full payment using this secure payment link:',
  );
  lines.push(paymentLink.paymentUrl);
  lines.push('');
  lines.push(`Reference: ${paymentLink.refNumber}`);
  lines.push(paymentLink.kind === 'deposit' ? `Deposit due now: ${formatPence(paymentLink.amountPence)}` : `Amount due: ${formatPence(paymentLink.amountPence)}`);
  if (paymentLink.remainingBalancePence != null) lines.push(`Balance due on-site: ${formatPence(paymentLink.remainingBalancePence)}`);
  lines.push(`Total to pay: ${formatGbp(effectiveTotal)}`);
  if (draft.location.address) lines.push(`Address: ${draft.location.address}`);
  if (draft.tyre.size) lines.push(`Tyres: ${draft.tyre.quantity} x ${draft.tyre.size}`);
  return lines.join('\n');
}

function genericWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function openBookingUrl(refNumber: string): Promise<void> {
  return Linking.openURL(`${api.baseUrl}/admin/bookings/${encodeURIComponent(refNumber)}`);
}

export function AssistedChatScreen({ user, onLogout }: AssistedChatScreenProps = {}) {
  const { draft, hydrated, update, clear } = useAssistedChatDraft();
  const [noteInput, setNoteInput] = useState('');
  const [noteSynced, setNoteSynced] = useState(false);
  const [callNotesInput, setCallNotesInput] = useState('');
  const [callAssistMessage, setCallAssistMessage] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState(draft.customer.phone);
  const [phoneSynced, setPhoneSynced] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [activeJobsOpen, setActiveJobsOpen] = useState(false);
  const [trackingMapOpen, setTrackingMapOpen] = useState(false);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<AssistedChatStage | null>(null);
  const [mapSummaryOpen, setMapSummaryOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [editPriceOpen, setEditPriceOpen] = useState(false);
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const [notifSetupOpen, setNotifSetupOpen] = useState(false);
  const [alertReadinessState, setAlertReadinessState] = useState<UrgentAlertsReadinessState>('checking');
  const [fullScreenIntentGranted, setFullScreenIntentGranted] = useState<boolean>(true);
  const [armingCycle, setArmingCycle] = useState(0);

  const insets = useSafeAreaInsets();
  const bottomBarPaddingBottom = Math.max(insets.bottom + 8, 16);
  const scrollPaddingBottom = 132 + bottomBarPaddingBottom;

  // ── Push Notifications ─────────────────────────────────────────────────────

  // Register and confirm urgent alert readiness after login/app startup.
  // We keep retrying while the app is open so the operator gets an explicit
  // armed/not-armed state instead of assuming alerts are active.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (attempt: number) => {
      const retryIndex = Math.min(attempt, ALERT_ARM_RETRY_DELAYS_MS.length - 1);
      const delay = ALERT_ARM_RETRY_DELAYS_MS[retryIndex];
      retryTimer = setTimeout(() => {
        void runAttempt(attempt + 1);
      }, delay);
    };

    const runAttempt = async (attempt: number) => {
      if (cancelled) return;
      setAlertReadinessState('checking');
      const result = await ensureUrgentAlertsArmed();
      if (cancelled) return;

      setFullScreenIntentGranted(result.fullScreenIntentGranted);

      if (result.armed) {
        setAlertReadinessState('armed');
        if (__DEV__ && result.snapshot.tokenSuffix) {
          console.log(
            `[urgent-alerts] ALERT_SYSTEM_ARMED tokenSuffix=${result.snapshot.tokenSuffix}`,
          );
        }
        return;
      }

      setAlertReadinessState('not_armed');
      scheduleRetry(attempt);
    };

    if (!api.hasAdminToken) {
      setAlertReadinessState('not_armed');
      return () => {
        cancelled = true;
        if (retryTimer) clearTimeout(retryTimer);
      };
    }

    void runAttempt(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [armingCycle, api.hasAdminToken]);

  const handleRetryUrgentAlertArming = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (!api.hasAdminToken) return;
    if (Platform.OS === 'android' && !fullScreenIntentGranted) {
      // Deep-link directly to the per-app full-screen intent permission
      // page (Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT on API 34+,
      // falls back to app notification settings on older devices).
      void openFullScreenIntentSettings();
      setArmingCycle((v) => v + 1);
      return;
    }
    setAlertReadinessState('checking');
    setArmingCycle((v) => v + 1);
  }, [fullScreenIntentGranted]);

  // Open the bookings modal when the admin taps a notification.
  // For urgent_booking payloads we also persist a pending flag so that if
  // the tap arrives before this component is fully mounted (cold start),
  // the modal still opens on first render via the consumePendingOpenBookings
  // effect below.
  const notifResponseRef = useRef<NotificationSubscription | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    notifResponseRef.current = addAdminNotificationResponseListener((data) => {
      if (isUrgentBookingNotificationData(data)) {
        void setPendingOpenBookings();
      }
      setBookingsOpen(true);
      void clearAdminBadge();
    });
    return () => {
      notifResponseRef.current?.remove();
    };
  }, []);

  // Cold-start path: if a push notification tap stored the pending flag
  // before this screen mounted, open the bookings modal once.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      const pending = await consumePendingOpenBookings();
      if (pending) {
        setBookingsOpen(true);
        void clearAdminBadge();
      }
    })();
  }, []);

  const {
    hasNewCustomerBooking,
    latestNewBooking,
    markBookingsSeen,
    triggerForegroundUrgentAlert,
  } = useNewCustomerBookingAlert();

  // Urgent in-app popup state — separate from the persistent shimmer.
  const [urgentPopupOpen, setUrgentPopupOpen] = useState(false);
  const dismissedUrgentBookingIdRef = useRef<string | null>(null);
  // Hydrated from AsyncStorage on mount so a previously acknowledged
  // urgent booking does not re-trigger the popup + sound after the
  // operator closes and reopens the app.
  const [dismissedHydrated, setDismissedHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getDismissedUrgentBookingId();
      if (cancelled) return;
      dismissedUrgentBookingIdRef.current = saved;
      setDismissedHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const urgentBookingId = latestNewBooking?.id ?? null;
  const urgentBookingIsUrgent = Boolean(latestNewBooking?.isUrgent);

  // Show the urgent popup the first time we detect a new emergency booking,
  // unless the operator has already dismissed THIS booking id or the
  // bookings modal is already open.
  useEffect(() => {
    if (!dismissedHydrated) return;
    if (!hasNewCustomerBooking) return;
    if (!urgentBookingIsUrgent || !urgentBookingId) return;
    if (bookingsOpen) return;
    if (dismissedUrgentBookingIdRef.current === urgentBookingId) return;
    setUrgentPopupOpen(true);
    void triggerForegroundUrgentAlert();
  }, [
    dismissedHydrated,
    hasNewCustomerBooking,
    urgentBookingId,
    urgentBookingIsUrgent,
    bookingsOpen,
    triggerForegroundUrgentAlert,
  ]);

  // While the popup is visible and the booking is unresolved, fire a
  // reminder alert at most every 60s (the hook itself enforces the
  // cooldown — this interval just gives it the opportunity).
  useEffect(() => {
    if (!urgentPopupOpen) return;
    const id = setInterval(() => {
      void triggerForegroundUrgentAlert();
    }, 60_000);
    return () => clearInterval(id);
  }, [urgentPopupOpen, triggerForegroundUrgentAlert]);

  // Clear the badge whenever the bookings modal is opened.
  useEffect(() => {
    if (bookingsOpen) {
      void clearAdminBadge();
      setUrgentPopupOpen(false);
      // Persist this booking id as acknowledged so reopening the app
      // does not bring the popup back. We keep the local ref in sync.
      if (urgentBookingId) {
        dismissedUrgentBookingIdRef.current = urgentBookingId;
        void setDismissedUrgentBookingId(urgentBookingId);
      }
      // Also clear the visual "new booking" alert on the toolbar button
      // regardless of how the modal was opened (push tap, More-actions, etc.).
      void markBookingsSeen();
    }
  }, [bookingsOpen, markBookingsSeen, urgentBookingId]);

  const handleUrgentOpenBookings = useCallback(() => {
    setUrgentPopupOpen(false);
    if (urgentBookingId) {
      dismissedUrgentBookingIdRef.current = urgentBookingId;
      void setDismissedUrgentBookingId(urgentBookingId);
    }
    void markBookingsSeen();
    setBookingsOpen(true);
  }, [markBookingsSeen, urgentBookingId]);

  const handleUrgentDismiss = useCallback(() => {
    // Close the popup but keep the All-bookings red shimmer active until
    // the operator actually opens the bookings list. Persist so the
    // popup + sound do not return when the app is reopened.
    setUrgentPopupOpen(false);
    if (urgentBookingId) {
      dismissedUrgentBookingIdRef.current = urgentBookingId;
      void setDismissedUrgentBookingId(urgentBookingId);
    }
  }, [urgentBookingId]);

  // Clear badge when app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void clearAdminBadge();
    });
    return () => sub.remove();
  }, []);

  // Unregister on logout.
  const handleLogout = useCallback(async () => {
    await unregisterAdminPushNotifications();
    await clearTopicSubscriptionFlag();
    setAlertReadinessState('not_armed');
    await onLogout?.();
  }, [onLogout]);

  const alertReadinessLabel =
    alertReadinessState === 'checking'
      ? 'Checking urgent alerts...'
      : alertReadinessState === 'armed'
      ? 'Urgent alerts armed'
      : !fullScreenIntentGranted
      ? 'Full-screen alerts blocked'
      : 'Urgent alerts not armed';

  const canRetryAlertArming =
    Platform.OS !== 'web' && api.hasAdminToken && alertReadinessState !== 'checking';

  // ──────────────────────────────────────────────────────────────────────────

  if (hydrated && !noteSynced) {
    setNoteSynced(true);
    setNoteInput(draft.note);
  }

  if (hydrated && !phoneSynced) {
    setPhoneSynced(true);
    setPhoneInput(draft.customer.phone);
  }

  const lockingNutCharge =
    draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null
      ? draft.lockingNut.chargeGbp
      : 0;
  const baseTotal = draft.quote?.total ?? 0;
  const backendBaseTotal = Math.round(
    (baseTotal -
      (
        typeof draft.quote?.adminAdjustmentAmount === 'number' &&
        Number.isFinite(draft.quote.adminAdjustmentAmount)
          ? draft.quote.adminAdjustmentAmount
          : 0
      )) * 100,
  ) / 100;
  const engineEffectiveTotal = baseTotal;
  // When the operator has typed a manual final price, that overrides the
  // backend total everywhere the customer-facing price is used. The override
  // is stored as a backend admin adjustment before save/finalize.
  const effectiveTotal = draft.manualPriceGbp != null ? draft.manualPriceGbp : engineEffectiveTotal;

  const price = useAssistedChatPrice({ draft, update });
  const locationShare = useAssistedChatLocationShare({ draft, update });
  const quoteActions = useAssistedChatQuoteActions({ draft, update, effectiveTotal, lockingNutCharge });
  const todayBookings = useTodayBookings();
  const recentCustomers = useRecentCustomers();
  const duplicateMatch = useDuplicateBookingWarning({
    draft,
    todayBookings: todayBookings.items,
    recentCustomers: recentCustomers.items,
  });

  const activeQuote = draft.savedQuoteId && quoteActions.currentQuote?.id === draft.savedQuoteId
    ? quoteActions.currentQuote
    : null;
  const savedQuoteRef = activeQuote?.quoteRef ?? draft.savedQuoteRef;
  const quoteConfirmed = isQuoteConfirmed(activeQuote);
  const quotePricePence = getQuotePricePence(activeQuote, effectiveTotal);
  const selectedPaymentOption = activeQuote?.selectedPaymentOption ?? quoteActions.selectedPaymentOption;
  const quoteExpiryStatus = formatQuoteExpiryStatus(activeQuote, Boolean(savedQuoteRef));

  const handleBookingCreated = useCallback(
    ({
      response,
      paymentChoice,
      effectiveTotal: total,
      paymentLink,
    }: {
      response: { bookingId: string; refNumber: string };
      paymentChoice: AssistedChatPaymentChoice;
      effectiveTotal: number;
      paymentLink: StripePaymentLinkState | null;
    }) => {
      if (!response.refNumber) return;
      const item: TodayBookingItem = {
        bookingReference: response.refNumber,
        bookingId: response.bookingId,
        createdAtIso: new Date().toISOString(),
        paymentChoice,
        totalPence: Number.isFinite(total) ? Math.round(total * 100) : undefined,
        paymentLink: paymentLink?.paymentUrl,
        customerPhone: draft.customer.phone || undefined,
        customerAddress: draft.location.address || undefined,
        tyreSize: draft.tyre.size || undefined,
        quantity: draft.tyre.quantity,
      };
      todayBookings.addBooking(item);
      recentCustomers.saveCustomer({
        customerPhone: draft.customer.phone || undefined,
        customerName: draft.customer.name || undefined,
        customerEmail: draft.customer.email || undefined,
        customerAddress: draft.location.address || undefined,
        lat: draft.location.lat,
        lng: draft.location.lng,
        postcode: draft.location.postcode,
        tyreSize: draft.tyre.size || undefined,
        quantity: draft.tyre.quantity,
        note: draft.note || undefined,
        lastUsedAtIso: new Date().toISOString(),
        lastBookingReference: response.refNumber,
      });
    },
    [draft, recentCustomers, todayBookings],
  );

  const dispatch = useAssistedChatDispatch({
    draft,
    update,
    lockingNutCharge,
    onBookingCreated: handleBookingCreated,
  });

  // Admin-created Stripe payment link for an already-dispatched booking's
  // outstanding balance. The backend is the source of truth for completion.
  const paymentLinkActions = useAdminPaymentLink({ draft, update });

  // Live tracking session for the dispatched booking. Hook is a no-op when
  // dispatchedBookingId is null; auto-ensures (idempotent) the first time we
  // see a booking id, then polls /tracking every 8s.
  const bookingTracking = useBookingTracking({ bookingId: draft.dispatchedBookingId });

  // Whether the dispatched booking has both customer coordinates and a fresh
  // driver location fix — the prerequisites for the live tracking map.
  const trackingDriverLat = bookingTracking.data?.state.driverLat ?? null;
  const trackingDriverLng = bookingTracking.data?.state.driverLng ?? null;
  const trackingLastUpdatedAt = bookingTracking.data?.state.lastUpdatedAt ?? null;
  const trackingHasCustomerCoords =
    draft.location.lat != null && draft.location.lng != null;
  const trackingHasDriverLocation =
    trackingDriverLat != null && trackingDriverLng != null;
  // The live map can be opened whenever we have the booking ref + customer
  // location, even before the driver's first fix — the cockpit then shows the
  // customer marker and a "waiting for driver location" state.
  const canTrackDriver =
    trackingHasCustomerCoords &&
    draft.dispatchedRefNumber != null &&
    draft.dispatchedBookingId != null;
  // Driver fix older than 90s (matching the backend stale window) reads stale.
  const trackingIsStale =
    trackingHasDriverLocation &&
    trackingLastUpdatedAt != null &&
    Date.now() - new Date(trackingLastUpdatedAt).getTime() > 90_000;
  const trackDriverHint = !trackingHasCustomerCoords
    ? 'Customer location unavailable'
    : !trackingHasDriverLocation
      ? 'Waiting for driver location'
      : trackingIsStale
        ? 'Tracking stale'
        : 'Live tracking available';

  // Stable ActiveJobItem for the dispatched booking so the live map modal can
  // reuse the existing /api/admin/active-jobs/[ref]/route endpoint. Driver
  // position is provided live by that endpoint, so it is intentionally kept
  // out of this memo to avoid resetting the map on every tracking poll.
  const trackingJob: ActiveJobItem | null = useMemo(() => {
    const ref = draft.dispatchedRefNumber;
    const id = draft.dispatchedBookingId;
    if (!ref || !id) return null;
    return {
      bookingRef: ref,
      bookingId: id,
      status: 'driver_assigned',
      scheduledAt: null,
      assignedAt: null,
      acceptedAt: null,
      customer: {
        name: draft.customer.name.trim() || 'Customer',
        phone: draft.customer.phone.trim() || null,
        address: draft.location.address || '',
        lat: draft.location.lat,
        lng: draft.location.lng,
      },
      driver: {
        id: '',
        name: 'Driver',
        phone: null,
        lat: null,
        lng: null,
        locationAt: null,
        locationSource: null,
        isStale: false,
      },
      payment: null,
      distanceMiles: null,
      etaMinutes: null,
    };
  }, [
    draft.dispatchedRefNumber,
    draft.dispatchedBookingId,
    draft.customer.name,
    draft.customer.phone,
    draft.location.address,
    draft.location.lat,
    draft.location.lng,
  ]);

  // Phone of the driver selected by the operator in DriverAssignSection.
  // Tracked only so the assign section can highlight the current pick.
  const [, setSelectedDriverPhone] = useState<string | null>(null);

  // Driver chat (admin_driver channel). Creates the conversation on demand
  // then routes the operator to the admin web booking page where the
  // ChatWidget is mounted.
  const [driverChatBusy, setDriverChatBusy] = useState(false);
  const [driverChatError, setDriverChatError] = useState<string | null>(null);
  const handleOpenDriverChat = useCallback(async () => {
    const bookingId = draft.dispatchedBookingId;
    const refNumber = draft.dispatchedRefNumber;
    if (!bookingId || !refNumber) return;
    setDriverChatBusy(true);
    setDriverChatError(null);
    try {
      await api.post('/api/chat/conversations', { bookingId, channel: 'admin_driver' });
      await Linking.openURL(`${api.baseUrl}/admin/bookings/${encodeURIComponent(refNumber)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open driver chat';
      setDriverChatError(
        msg.includes('400') || msg.toLowerCase().includes('driver')
          ? 'Assign a driver first.'
          : msg,
      );
    } finally {
      setDriverChatBusy(false);
    }
  }, [draft.dispatchedBookingId, draft.dispatchedRefNumber]);

  const workflow = useMemo(
    () => getAssistedChatWorkflow({
      draft,
      quoteStatus: activeQuote?.quoteStatus ?? null,
      quoteConfirmedAt: activeQuote?.confirmedAt ?? null,
      quoteSelectedPaymentOption: activeQuote?.selectedPaymentOption ?? null,
      quoteExpired: activeQuote?.isExpired ?? false,
      quoteBusy: quoteActions.busy !== null,
      priceLoading: price.loading,
      dispatchBusy: dispatch.busy,
      canUseApi: api.hasAdminToken,
    }),
    [activeQuote, dispatch.busy, draft, price.loading, quoteActions.busy],
  );

  const activeStage = editingStage ?? workflow.currentStage;
  const hasLocation = draft.location.lat != null && draft.location.lng != null;
  const hasTyre = hasAssistedChatTyre(draft);
  const customerName = draft.customer.name.trim() || 'New customer';
  const customerPhone = draft.customer.phone.trim();
  const customerMessage = buildCustomerMessage({ draft, effectiveTotal, paymentChoice: draft.paymentChoice });
  const draftHasContent = hasDraftContent(draft);

  const flashNotice = useCallback((notice: ActionNotice) => {
    setActionNotice(notice);
    setTimeout(() => setActionNotice(null), 2200);
  }, []);

  const handleClear = useCallback(() => {
    clear();
    setNoteInput('');
    setCallNotesInput('');
    setCallAssistMessage(null);
    setNoteSynced(false);
    setPhoneInput('');
    setPhoneSynced(false);
    setDuplicateAck(false);
    setEditingStage(null);
    setMapSummaryOpen(false);
    quoteActions.setMessage(null);
    locationShare.setMessage(null);
  }, [clear, locationShare, quoteActions]);

  const handlePhoneBlur = useCallback(() => {
    update({ customer: { ...draft.customer, phone: phoneInput.trim() } });
  }, [draft.customer, phoneInput, update]);

  const customerWhatsAppNumber = useMemo(() => {
    const raw = draft.customer.phone ?? '';
    const digits = raw.replace(/\D+/g, '');
    if (!digits) return null;
    if (raw.trim().startsWith('+')) return digits;
    if (digits.startsWith('44')) return digits;
    if (digits.startsWith('0')) return `44${digits.slice(1)}`;
    return digits;
  }, [draft.customer.phone]);

  const customerDialNumber = useMemo(() => {
    const raw = (draft.customer.phone ?? '').trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d+]/g, '');
    return cleaned || null;
  }, [draft.customer.phone]);

  const handleOpenWhatsApp = useCallback(async () => {
    if (!customerWhatsAppNumber) return;
    const url = buildWhatsAppUrl(draft.customer.phone, customerMessage) ?? `https://wa.me/${customerWhatsAppNumber}`;
    try {
      await Linking.openURL(url);
    } catch {
      flashNotice({ kind: 'err', text: 'Could not open WhatsApp.' });
    }
  }, [customerMessage, customerWhatsAppNumber, draft.customer.phone, flashNotice]);

  const handleCallCustomer = useCallback(async () => {
    if (!customerDialNumber) return;
    try {
      await Linking.openURL(`tel:${customerDialNumber}`);
    } catch {
      flashNotice({ kind: 'err', text: 'Could not start the call.' });
    }
  }, [customerDialNumber, flashNotice]);

  const handleUseRecent = useCallback(
    (item: RecentCustomer) => {
      update({
        customer: {
          phone: item.customerPhone ?? '',
          name: item.customerName ?? '',
          email: item.customerEmail ?? '',
        },
        location: {
          method: 'address',
          address: item.customerAddress ?? '',
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          postcode: item.postcode ?? null,
          link: null,
          whatsappLink: null,
          status: item.lat != null && item.lng != null ? 'received' : 'idle',
        },
        tyre: {
          size: item.tyreSize ?? '',
          quantity: item.quantity ?? 1,
        },
        note: item.note ?? '',
        quickBookingId: null,
        quote: null,
        priceNeedsRefresh: false,
        savedQuoteId: null,
        savedQuoteRef: null,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
      setPhoneInput(item.customerPhone ?? '');
      setNoteInput(item.note ?? '');
      setRecentOpen(false);
      setDuplicateAck(false);
      setEditingStage(null);
    },
    [update],
  );

  const handleUseQuote = useCallback(
    (quote: AdminQuote) => {
      const total = quote.priceAmount / 100;
      update({
        customer: {
          phone: quote.customerPhone ?? '',
          name: quote.customerName ?? '',
          email: draft.customer.email,
        },
        location: {
          method: 'address',
          address: quote.address ?? '',
          lat: quote.latitude,
          lng: quote.longitude,
          postcode: quote.postcode,
          link: null,
          whatsappLink: null,
          status: quote.latitude != null && quote.longitude != null ? 'received' : 'idle',
        },
        tyre: {
          size: quote.tyreSize ?? '',
          quantity: quote.quantity,
        },
        lockingNut: {
          answer:
            quote.lockingWheelNutStatus === 'yes' || quote.lockingWheelNutStatus === 'no'
              ? quote.lockingWheelNutStatus
              : 'unknown',
          chargeGbp: quote.lockingWheelNutChargePence ? quote.lockingWheelNutChargePence / 100 : null,
        },
        quickBookingId: quote.quickBookingId,
        savedQuoteId: quote.id,
        savedQuoteRef: quote.quoteRef,
        note: quote.internalNotes ?? '',
        quote: {
          subtotal: total,
          vatAmount: 0,
          total,
          lineItems: [{ label: `Saved quote ${quote.quoteRef}`, amount: total, type: 'quote' }],
          distanceKm: null,
          serviceOrigin: null,
        },
        priceNeedsRefresh: quote.isExpired,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
      quoteActions.acceptExternalQuote(quote);
      setPhoneInput(quote.customerPhone ?? '');
      setNoteInput(quote.internalNotes ?? '');
      setQuotesOpen(false);
      setDuplicateAck(false);
      setEditingStage(null);
    },
    [draft.customer.email, quoteActions, update],
  );

  const handleApplyCallNotes = useCallback(() => {
    const parsed = parseCallNotes(callNotesInput);
    const applied: string[] = [];
    const patch: Partial<AssistedChatDraft> = {};

    if (parsed.customerName || parsed.customerPhone || parsed.customerEmail) {
      patch.customer = {
        ...draft.customer,
        ...(parsed.customerName ? { name: parsed.customerName } : {}),
        ...(parsed.customerPhone ? { phone: parsed.customerPhone } : {}),
        ...(parsed.customerEmail ? { email: parsed.customerEmail } : {}),
      };
      if (parsed.customerName) applied.push('name');
      if (parsed.customerPhone) applied.push('phone');
      if (parsed.customerEmail) applied.push('email');
    }

    if (parsed.locationAddress) {
      patch.location = {
        ...draft.location,
        method: 'address',
        address: parsed.locationAddress,
        lat: null,
        lng: null,
        postcode: null,
        link: null,
        whatsappLink: null,
        status: 'idle',
      };
      patch.quote = null;
      patch.priceNeedsRefresh = Boolean(draft.quote || draft.priceNeedsRefresh);
      patch.paymentChoice = null;
      patch.paymentLink = null;
      patch.dispatchedRefNumber = null;
      applied.push('address text');
    }

    if (parsed.tyreSize || parsed.quantity) {
      patch.tyre = {
        ...draft.tyre,
        ...(parsed.tyreSize ? { size: parsed.tyreSize } : {}),
        ...(parsed.quantity ? { quantity: parsed.quantity } : {}),
      };
      if (parsed.tyreSize) applied.push('tyre size');
      if (parsed.quantity) applied.push('quantity');
      patch.quote = null;
      patch.priceNeedsRefresh = Boolean(draft.quote || draft.priceNeedsRefresh);
      patch.paymentLink = null;
      patch.dispatchedRefNumber = null;
    }

    if (parsed.lockingNutAnswer) {
      patch.lockingNut = {
        answer: parsed.lockingNutAnswer,
        chargeGbp: parsed.lockingNutAnswer === 'no' ? parsed.lockingNutCharge ?? draft.lockingNut.chargeGbp : null,
      };
      applied.push('locking nut');
    }

    if (parsed.paymentChoice && draft.quote) {
      patch.paymentChoice = parsed.paymentChoice;
      applied.push('payment choice');
    }

    if (parsed.driverNote) {
      const nextNote = draft.note.trim() ? `${draft.note.trim()}\n${parsed.driverNote}` : parsed.driverNote;
      patch.note = nextNote;
      setNoteInput(nextNote);
      applied.push('driver note');
    }

    if (applied.length === 0) {
      setCallAssistMessage('No obvious details found. Try including a phone, address, tyre size, quantity, or payment word.');
      return;
    }

    if (parsed.customerPhone) setPhoneInput(parsed.customerPhone);
    update(patch);
    setDuplicateAck(false);
    setCallAssistMessage(`Applied: ${applied.join(', ')}.`);
  }, [callNotesInput, draft, update]);

  const handleCopyCustomerDetails = useCallback(async () => {
    const ok = await copyToClipboard(buildCustomerDetails(draft));
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Customer details copied.' : 'Could not copy customer details.' });
  }, [draft, flashNotice]);

  const handleCopyLocationDetails = useCallback(async () => {
    const ok = await copyToClipboard(buildLocationDetails(draft));
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Location details copied.' : 'Could not copy location details.' });
  }, [draft, flashNotice]);

  const handleCopyJobDetails = useCallback(async () => {
    const ok = await copyToClipboard(buildJobDetails(draft, effectiveTotal, lockingNutCharge, selectedPaymentOption));
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Job details copied.' : 'Could not copy job details.' });
  }, [draft, effectiveTotal, flashNotice, lockingNutCharge, selectedPaymentOption]);

  const handleCopyCustomerMessage = useCallback(async () => {
    const ok = await copyToClipboard(customerMessage);
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Customer message copied.' : 'Could not copy customer message.' });
  }, [customerMessage, flashNotice]);

  const handleCopyPaymentLink = useCallback(async () => {
    if (!draft.paymentLink) return;
    const ok = await copyToClipboard(draft.paymentLink.paymentUrl);
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Payment link copied.' : 'Could not copy payment link.' });
  }, [draft.paymentLink, flashNotice]);

  const handleOpenPaymentLink = useCallback(async () => {
    if (!draft.paymentLink) return;
    try {
      await Linking.openURL(draft.paymentLink.paymentUrl);
    } catch {
      flashNotice({ kind: 'err', text: 'Could not open payment link.' });
    }
  }, [draft.paymentLink, flashNotice]);

  const handleWhatsAppPaymentLink = useCallback(async () => {
    if (!draft.paymentLink) return;
    const message = buildPaymentMessage(draft.paymentLink, draft, effectiveTotal);
    const url = buildWhatsAppUrl(draft.customer.phone, message) ?? genericWhatsAppUrl(message);
    try {
      await Linking.openURL(url);
    } catch {
      const ok = await copyToClipboard(message);
      flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Payment message copied.' : 'Could not open WhatsApp.' });
    }
  }, [draft, effectiveTotal, flashNotice]);

  const handleOpenMaps = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(`https://www.google.com/maps?q=${draft.location.lat},${draft.location.lng}`);
  }, [draft.location.lat, draft.location.lng]);

  const handleOpenDirections = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&origin=55.8547,-4.2206&destination=${draft.location.lat},${draft.location.lng}&travelmode=driving`,
    );
  }, [draft.location.lat, draft.location.lng]);

  const handleOpenWaze = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(`https://waze.com/ul?ll=${draft.location.lat},${draft.location.lng}&navigate=yes`);
  }, [draft.location.lat, draft.location.lng]);

  const handleCopyRoute = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    const routeUrl = `https://www.google.com/maps/dir/?api=1&origin=55.8547,-4.2206&destination=${draft.location.lat},${draft.location.lng}&travelmode=driving`;
    const ok = await copyToClipboard(routeUrl);
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Route link copied.' : 'Could not copy route link.' });
  }, [draft.location.lat, draft.location.lng, flashNotice]);

  const handleCopyCoords = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    const ok = await copyToClipboard(`${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Coordinates copied.' : 'Could not copy coordinates.' });
  }, [draft.location.lat, draft.location.lng, flashNotice]);

  const handleReviewDispatch = useCallback(() => {
    setReviewOpen(true);
  }, []);

  const handleSendToDriver = useCallback(() => {
    if (!draft.paymentChoice) return;
    setReviewOpen(false);
    dispatch.choosePaymentAndDispatch(draft.paymentChoice);
  }, [dispatch, draft.paymentChoice]);

  const handlePrimaryAction = useCallback(async () => {
    if (editingStage) {
      setEditingStage(null);
      return;
    }

    if (workflow.primaryActionDisabled) return;

    if (workflow.currentStage === 'CUSTOMER') {
      setEditingStage('LOCATION');
      return;
    }

    if (workflow.currentStage === 'LOCATION') {
      const method = draft.customer.phone.trim()
        ? 'whatsapp'
        : draft.customer.email.trim()
        ? 'email'
        : 'copy';
      await locationShare.requestLink(method);
      return;
    }

    if (workflow.currentStage === 'PRICE') {
      await price.getPrice();
      return;
    }

    if (workflow.currentStage === 'QUOTE') {
      await quoteActions.saveQuote();
      return;
    }

    if (workflow.currentStage === 'CONFIRMATION') {
      await quoteActions.confirmQuote();
      return;
    }

    if (workflow.currentStage === 'PAYMENT') {
      setEditingStage('PAYMENT');
      return;
    }

    if (workflow.currentStage === 'READY_TO_DISPATCH') {
      handleReviewDispatch();
      return;
    }

    if (workflow.currentStage === 'DISPATCHED' && draft.dispatchedRefNumber) {
      await openBookingUrl(draft.dispatchedRefNumber).catch(() => {
        flashNotice({ kind: 'err', text: 'Could not open booking.' });
      });
    }
  }, [draft, editingStage, flashNotice, handleReviewDispatch, locationShare, price, quoteActions, workflow]);

  const sheetActions = useMemo<SheetAction[]>(() => {
    const actions: SheetAction[] = [];
    const locationShareRelevant = !hasLocation || draft.location.status === 'pending' || Boolean(draft.location.link);
    const noToken = api.hasAdminToken ? null : 'Log in again before using admin actions.';

    if (locationShareRelevant) {
      actions.push(
        {
          id: 'copy-location-link',
          label: 'Copy location link',
          description: 'Generate or copy the customer location request.',
          disabledReason: noToken,
          onPress: () => locationShare.requestLink('copy'),
        },
        {
          id: 'location-whatsapp',
          label: 'Send via WhatsApp',
          description: 'Open WhatsApp with the location request.',
          disabledReason: noToken ?? (!draft.customer.phone.trim() ? 'Add a customer phone number first.' : null),
          onPress: () => locationShare.requestLink('whatsapp'),
        },
        {
          id: 'location-sms',
          label: 'Send via SMS',
          description: 'Send the location request by SMS.',
          disabledReason: noToken ?? (!isValidUkPhone(draft.customer.phone) ? 'Add a valid UK phone number first.' : null),
          onPress: () => locationShare.requestLink('sms'),
        },
        {
          id: 'location-email',
          label: 'Send via Email',
          description: 'Email the location request to the customer.',
          disabledReason: noToken ?? (!draft.customer.email.trim() ? 'Add a customer email first.' : null),
          onPress: () => locationShare.requestLink('email'),
        },
      );
    }

    if (hasLocation) {
      actions.push(
        { id: 'open-maps', label: 'Open Google Maps', description: 'Open the customer pin.', onPress: handleOpenMaps },
        { id: 'open-directions', label: 'Open Directions', description: 'Open garage to customer directions.', onPress: handleOpenDirections },
        { id: 'open-waze', label: 'Open Waze', description: 'Open Waze navigation.', onPress: handleOpenWaze },
        { id: 'copy-route', label: 'Copy route link', description: 'Copy a Google Maps directions link.', onPress: handleCopyRoute },
        { id: 'copy-coords', label: 'Copy coordinates', description: 'Copy the customer coordinates.', onPress: handleCopyCoords },
      );
    }

    actions.push(
      {
        id: 'copy-quote-message',
        label: 'Copy quote message',
        description: 'Copy the saved quote or confirmation message.',
        disabledReason: draft.quote ? null : 'Get a price before copying a quote message.',
        onPress: quoteActions.copyConfirmedMessage,
      },
      {
        id: 'send-quote',
        label: 'Send quote',
        description: 'Save if needed, then open WhatsApp and copy the quote.',
        disabledReason: draft.quote ? null : 'Get a price before sending a quote.',
        onPress: quoteActions.sendQuote,
      },
      {
        id: 'copy-customer-message',
        label: 'Copy customer message',
        description: 'Copy the current booking message.',
        disabledReason: draft.quote || draft.dispatchedRefNumber ? null : 'Get a price before copying the customer message.',
        onPress: handleCopyCustomerMessage,
      },
      {
        id: 'send-customer-whatsapp',
        label: 'Send customer WhatsApp',
        description: 'Open WhatsApp with the current booking message.',
        disabledReason: draft.customer.phone.trim() ? null : 'Add a customer phone number first.',
        onPress: handleOpenWhatsApp,
      },
      {
        id: 'copy-job-details',
        label: 'Copy job details',
        description: 'Copy customer, tyre, price, payment, and note details.',
        disabledReason: draftHasContent ? null : 'There is no draft to copy yet.',
        onPress: handleCopyJobDetails,
      },
    );

    if (quoteActions.selectedPaymentOption === 'PAYMENT_LINK' || quoteActions.confirmResult?.paymentInstruction) {
      actions.push({
        id: 'copy-payment-instructions',
        label: 'Copy payment instructions',
        description: 'Copy the saved quote payment instruction.',
        disabledReason: draft.quote ? null : 'Get a price before copying payment instructions.',
        onPress: quoteActions.copyPaymentInstruction,
      });
    }

    if (draft.paymentLink) {
      actions.push(
        { id: 'copy-payment-link', label: 'Copy payment link', description: 'Copy the Stripe payment link.', onPress: handleCopyPaymentLink },
        { id: 'open-payment-link', label: 'Open payment link', description: 'Open the Stripe payment link.', onPress: handleOpenPaymentLink },
        { id: 'whatsapp-payment-link', label: 'WhatsApp payment link', description: 'Send the payment link to the customer.', onPress: handleWhatsAppPaymentLink },
      );
    }

    actions.push({
      id: 'admin-bookings',
      label: 'All bookings',
      description: 'Browse, search, and filter all admin bookings.',
      disabledReason: noToken,
      onPress: () => setBookingsOpen(true),
    });

    actions.push({
      id: 'admin-visitors',
      label: '🌐 Visitors',
      description: 'Real-time visitor analytics and live feed.',
      disabledReason: noToken,
      onPress: () => setVisitorsOpen(true),
    });

    actions.push({
      id: 'admin-invoices',
      label: '📄 Invoices',
      description: 'Browse, send, and manage customer invoices.',
      disabledReason: noToken,
      onPress: () => setInvoicesOpen(true),
    });

    actions.push({
      id: 'admin-stock',
      label: '🛞 Stock',
      description: 'Manage tyre stock levels, prices and availability.',
      disabledReason: noToken,
      onPress: () => setStockOpen(true),
    });

    actions.push({
      id: 'notification-setup',
      label: 'Notification setup',
      description: 'Check urgent alert status and open notification settings.',
      onPress: () => { setMoreOpen(false); setNotifSetupOpen(true); },
    });

    if (__DEV__ && urgentBookingId) {
      actions.push({
        id: 'test-urgent-alert',
        label: 'Test urgent alert (dev)',
        description: 'Trigger a local urgent booking alert for the current booking.',
        onPress: () => {
          void showLocalUrgentBookingAlert({ bookingId: urgentBookingId });
        },
      });
    }

    actions.push({
      id: 'clear-draft',
      label: 'Clear draft',
      description: 'Reset this operator workflow.',
      disabledReason: draftHasContent ? null : 'Draft is already empty.',
      destructive: true,
      onPress: handleClear,
    });

    if (onLogout) {
      actions.push({
        id: 'logout',
        label: 'Log out',
        description: 'End this admin session.',
        onPress: () => {
          void handleLogout();
        },
      });
    }

    return actions;
  }, [
    draft,
    draftHasContent,
    handleClear,
    handleCopyCoords,
    handleCopyCustomerMessage,
    handleCopyJobDetails,
    handleCopyPaymentLink,
    handleCopyRoute,
    handleOpenDirections,
    handleOpenMaps,
    handleOpenPaymentLink,
    handleOpenWaze,
    handleOpenWhatsApp,
    handleWhatsAppPaymentLink,
    hasLocation,
    locationShare,
    handleLogout,
    onLogout,
    quoteActions,
    urgentBookingId,
  ]);

  const primaryLabel = editingStage ? 'Done Editing' : workflow.primaryActionLabel;
  const primaryDisabled = editingStage ? false : workflow.primaryActionDisabled;
  const primaryDisabledReason = editingStage ? null : workflow.primaryActionDisabledReason;
  const stageTitle = editingStage ? `Editing ${stageLabel(editingStage)}` : stageLabel(workflow.currentStage);

  const handleSelectTimelineStep = (step: AssistedChatTimelineStep) => {
    const targetStage = stageForTimelineStep(step, { quoteConfirmed });
    const blockedReason = blockedReasonForStage(targetStage, {
      hasCustomerDetails: Boolean(draft.customer.name.trim() || draft.customer.phone.trim() || draft.customer.email.trim()),
      hasLocation,
      hasTyre,
      hasPrice: Boolean(draft.quote && !draft.priceNeedsRefresh),
      hasSavedQuote: Boolean(savedQuoteRef),
      quoteConfirmed,
      hasPaymentChoice: Boolean(draft.paymentChoice),
    });
    setEditingStage(targetStage);
    if (blockedReason) {
      flashNotice({ kind: 'info', text: blockedReason });
    } else {
      setActionNotice(null);
    }
  };

  // Operator workflow projection: shared progress/next-action state derived
  // from the existing draft + workflow + quote/dispatch flags. Keeps the new
  // OperatorStepProgress + NextBestActionCard in lockstep with the legacy
  // Timeline/SummaryCard stack without changing any backend behaviour.
  const hasPrice = Boolean(draft.quote && !draft.priceNeedsRefresh);
  const hasSavedQuote = Boolean(savedQuoteRef);
  const operatorDerivationInput = {
    draft,
    activeStage,
    hasLocation,
    hasTyre,
    hasPrice,
    priceLoading: price.loading,
    hasSavedQuote,
    quoteConfirmed,
    dispatchBusy: dispatch.busy,
    locationPolling: locationShare.isPolling,
    hasDispatched: Boolean(draft.dispatchedRefNumber),
    hasPaymentLink: Boolean(draft.paymentLink),
  };
  const operatorSteps = useMemo(
    () => deriveOperatorWorkflowSteps(operatorDerivationInput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeStage,
      draft,
      hasLocation,
      hasTyre,
      hasPrice,
      hasSavedQuote,
      quoteConfirmed,
      price.loading,
      dispatch.busy,
      locationShare.isPolling,
    ],
  );
  const activeOperatorStepId = useMemo(() => {
    // Reuse the same mapping the chip uses for the active stage so the
    // highlighted chip always matches the open SectionCard.
    switch (activeStage) {
      case 'CUSTOMER':
        return 'customer' as const;
      case 'LOCATION':
        return 'location' as const;
      case 'TYRE':
        return draft.lockingNut.answer === 'unknown' && hasTyre ? ('lockingNut' as const) : ('tyre' as const);
      case 'PRICE':
      case 'QUOTE':
      case 'CONFIRMATION':
        return 'quote' as const;
      case 'PAYMENT':
        return 'payment' as const;
      case 'READY_TO_DISPATCH':
      case 'DISPATCHED':
        return 'dispatch' as const;
    }
  }, [activeStage, draft.lockingNut.answer, hasTyre]);
  const nextBestAction = useMemo(
    () =>
      deriveNextBestAction({
        ...operatorDerivationInput,
        primaryActionLabel: primaryLabel,
        primaryActionDisabled: primaryDisabled,
        primaryActionDisabledReason: primaryDisabledReason,
        onPrimaryPress: handlePrimaryAction,
        primaryLoading: price.loading || dispatch.busy || quoteActions.busy !== null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeStage,
      draft,
      hasLocation,
      hasTyre,
      hasPrice,
      hasSavedQuote,
      quoteConfirmed,
      price.loading,
      dispatch.busy,
      locationShare.isPolling,
      primaryLabel,
      primaryDisabled,
      primaryDisabledReason,
      handlePrimaryAction,
      quoteActions.busy,
    ],
  );

  const handleSelectOperatorStep = useCallback(
    (stepId: typeof operatorSteps[number]['id']) => {
      const targetStage = stageForStepId(stepId, {
        quoteConfirmed,
        hasPrice,
        hasSavedQuote,
      });
      const blockedReason = blockedReasonForStage(targetStage, {
        hasCustomerDetails: Boolean(
          draft.customer.name.trim() || draft.customer.phone.trim() || draft.customer.email.trim(),
        ),
        hasLocation,
        hasTyre,
        hasPrice,
        hasSavedQuote,
        quoteConfirmed,
        hasPaymentChoice: Boolean(draft.paymentChoice),
      });
      setEditingStage(targetStage);
      if (blockedReason) {
        flashNotice({ kind: 'info', text: blockedReason });
      } else {
        setActionNotice(null);
      }
    },
    [draft, flashNotice, hasLocation, hasPrice, hasSavedQuote, hasTyre, quoteConfirmed],
  );

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Assisted Chat</Text>
          <Text style={styles.headerCustomer} numberOfLines={1}>{customerName}</Text>
          <Text style={styles.headerPhone} numberOfLines={1}>{customerPhone || (user?.name ? `Signed in as ${user.name}` : 'No phone added')}</Text>
          <Pressable
            onPress={canRetryAlertArming ? handleRetryUrgentAlertArming : undefined}
            accessibilityRole="button"
            accessibilityLabel="Urgent alert readiness"
            style={({ pressed }) => [
              styles.alertReadinessPill,
              alertReadinessState === 'armed'
                ? styles.alertReadinessPillArmed
                : alertReadinessState === 'not_armed'
                ? styles.alertReadinessPillNotArmed
                : null,
              pressed && canRetryAlertArming && styles.alertReadinessPillPressed,
            ]}
          >
            <Text style={styles.alertReadinessText}>{alertReadinessLabel}</Text>
            {alertReadinessState === 'not_armed' ? (
              <Text style={styles.alertReadinessRetryText}>
                {!fullScreenIntentGranted ? 'Tap to grant permission' : 'Tap to retry'}
              </Text>
            ) : null}
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{stageTitle}</Text>
          </View>
          <View style={styles.headerContactRow}>
            <Pressable
              onPress={customerDialNumber ? handleCallCustomer : undefined}
              disabled={!customerDialNumber}
              accessibilityRole="button"
              accessibilityLabel="Call customer"
              style={({ pressed }) => [
                styles.compactContactButton,
                styles.callButton,
                pressed && customerDialNumber && styles.contactButtonPressed,
                !customerDialNumber && styles.contactButtonDisabled,
              ]}
            >
              <Text style={styles.compactContactLabel}>Call</Text>
            </Pressable>
            <Pressable
              onPress={customerWhatsAppNumber ? handleOpenWhatsApp : undefined}
              disabled={!customerWhatsAppNumber}
              accessibilityRole="button"
              accessibilityLabel="Open WhatsApp chat with customer"
              style={({ pressed }) => [
                styles.compactContactButton,
                styles.whatsappButton,
                pressed && customerWhatsAppNumber && styles.contactButtonPressed,
                !customerWhatsAppNumber && styles.contactButtonDisabled,
              ]}
            >
              <Text style={styles.compactContactLabel}>WA</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: scrollPaddingBottom }]} keyboardShouldPersistTaps="handled">
        {!api.hasAdminToken ? <InlineNotice kind="warn">No admin token. Log in to enable API calls.</InlineNotice> : null}
        {actionNotice ? <StatusBanner kind={actionNotice.kind} message={actionNotice.text} /> : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind === 'ok' ? 'ok' : quoteActions.message.kind === 'err' ? 'err' : 'info'} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}

        <View style={styles.toolRow}>
          <AppButton label={`Bookings ${todayBookings.count}`} variant="secondary" onPress={() => setHistoryOpen(true)} style={styles.toolButton} />
          <AlertActionButton
            label="All bookings"
            active={hasNewCustomerBooking}
            badgeLabel="New"
            onPress={() => {
              markBookingsSeen();
              setBookingsOpen(true);
            }}
            style={styles.toolButton}
            testID="all-bookings-alert-button"
          />
          <AppButton label="Recent customers" variant="secondary" onPress={() => setRecentOpen(true)} style={styles.toolButton} />
          <AppButton label="Active jobs" variant="secondary" onPress={() => setActiveJobsOpen(true)} style={styles.toolButton} />
          <AppButton label="Quotes" variant="secondary" onPress={() => setQuotesOpen(true)} style={styles.toolButton} />
        </View>

        <NextBestActionCard
          title={nextBestAction.title}
          body={nextBestAction.body}
          status={nextBestAction.status}
          // Suppress the duplicate CTA when the next-best step is already the
          // active section: the bottom bar (and the section itself) already
          // expose the same primary action, so the card becomes guidance-only.
          primaryLabel={nextBestAction.id === activeOperatorStepId ? undefined : nextBestAction.primaryLabel}
          onPrimaryPress={nextBestAction.id === activeOperatorStepId ? undefined : nextBestAction.onPrimaryPress}
          loading={nextBestAction.loading}
          disabled={nextBestAction.disabled}
          disabledReason={primaryDisabledReason ?? undefined}
        />

        <OperatorStepProgress
          steps={operatorSteps}
          activeStepId={activeOperatorStepId}
          onStepPress={handleSelectOperatorStep}
        />

        <View style={styles.summaryStack}>
          <SummaryCard
            title="Customer"
            value={customerName}
            detail={customerPhone || draft.customer.email || 'No contact details yet'}
            done={Boolean(draft.customer.name.trim() || draft.customer.phone.trim() || draft.customer.email.trim())}
            active={activeStage === 'CUSTOMER'}
            onPress={() => setEditingStage('CUSTOMER')}
            onLongPress={handleCopyCustomerDetails}
          />
          {hasLocation || draft.location.status === 'pending' ? (
            <SummaryCard
              title="Location"
              value={hasLocation ? 'Confirmed' : 'Waiting for share'}
              detail={draft.location.address || draft.location.link || 'Location link sent'}
              done={hasLocation}
              active={activeStage === 'LOCATION'}
              onPress={() => setEditingStage('LOCATION')}
              onLongPress={handleCopyLocationDetails}
              rightLabel={hasLocation ? (mapSummaryOpen ? 'Hide map' : 'Show map') : undefined}
              onRightPress={hasLocation ? () => setMapSummaryOpen((value) => !value) : undefined}
            />
          ) : null}
          {hasLocation && mapSummaryOpen && activeStage !== 'LOCATION' ? (
            <LocationSection draft={draft} update={update} locationShare={locationShare} showInlineActions={false} displayMode="mapOnly" />
          ) : null}
          {hasTyre ? (
            <SummaryCard
              title="Tyre"
              value={`${draft.tyre.size} x ${draft.tyre.quantity}`}
              detail={draft.lockingNut.answer === 'no' ? 'Locking wheel nut removal may apply' : 'Tyre details ready'}
              done
              active={activeStage === 'TYRE'}
              onPress={() => setEditingStage('TYRE')}
            />
          ) : null}
          {draft.quote && !draft.priceNeedsRefresh ? (
            <SummaryCard
              title="Price"
              value={formatGbp(effectiveTotal)}
              detail={draft.quote.distanceKm != null ? `${(draft.quote.distanceKm * 0.621371).toFixed(1)} mi pricing distance` : 'Price ready'}
              done
              active={activeStage === 'PRICE'}
              onPress={() => setEditingStage('PRICE')}
            />
          ) : null}
          {savedQuoteRef ? (
            <SummaryCard
              title="Quote"
              value={`Quote ${savedQuoteRef}`}
              detail={quoteExpiryStatus ?? 'Valid until unknown'}
              done={quoteConfirmed}
              active={activeStage === 'QUOTE' || activeStage === 'CONFIRMATION'}
              onPress={() => setEditingStage(quoteConfirmed ? 'PAYMENT' : 'CONFIRMATION')}
              onLongPress={quoteActions.copyConfirmedMessage}
            />
          ) : null}
          {draft.paymentChoice ? (
            <SummaryCard
              title="Payment"
              value={paymentChoiceLabel(draft.paymentChoice)}
              detail={draft.paymentLink ? 'Payment link ready' : quoteConfirmed ? 'Quote payment option selected' : 'Selected before confirmation'}
              done={quoteConfirmed}
              active={activeStage === 'PAYMENT'}
              onPress={() => setEditingStage('PAYMENT')}
            />
          ) : null}
        </View>

        <View style={styles.activeStepBlock}>
          {renderActiveStage({
            activeStage,
            draft,
            update,
            phoneInput,
            setPhoneInput,
            handlePhoneBlur,
            noteInput,
            setNoteInput,
            callNotesInput,
            setCallNotesInput,
            callAssistMessage,
            setCallAssistMessage,
            handleApplyCallNotes,
            locationShare,
            price,
            lockingNutCharge,
            effectiveTotal,
            duplicateMatch,
            duplicateAck,
            setDuplicateAck,
            setHistoryOpen,
            quoteActions,
            activeQuote,
            savedQuoteRef,
            quoteConfirmed,
            quoteExpiryStatus,
            quotePricePence,
            selectedPaymentOption,
            dispatch,
            handleCopyCustomerDetails,
            engineEffectiveTotal,
            setEditPriceOpen,
            breakdownVisible,
            setBreakdownVisible,
          })}
          {activeStage === 'DISPATCHED' && draft.dispatchedBookingId ? (
            <>
              <DriverAssignSection
                bookingId={draft.dispatchedBookingId}
                trackingData={bookingTracking.data}
                customerLat={draft.location.lat}
                customerLng={draft.location.lng}
                onSelectDriver={(phone) => setSelectedDriverPhone(phone)}
              />
              <BookingTrackingCard
                data={bookingTracking.data}
                ensureFailed={bookingTracking.ensureFailed}
                busy={bookingTracking.busy}
                customerPhone={draft.customer.phone.trim() || null}
                onRetryEnsure={() => { void bookingTracking.ensure(); }}
                onRefresh={() => { void bookingTracking.refresh(); }}
              />
              <AppButton
                label="Track driver"
                variant="primary"
                onPress={() => setTrackingMapOpen(true)}
                disabled={!canTrackDriver}
                fullWidth
              />
              {trackDriverHint ? (
                <Text style={styles.trackDriverHint}>{trackDriverHint}</Text>
              ) : null}
              <AppButton
                label={driverChatBusy ? 'Opening…' : 'Chat with driver'}
                variant="secondary"
                onPress={() => { void handleOpenDriverChat(); }}
                loading={driverChatBusy}
                disabled={driverChatBusy}
                fullWidth
              />
              {driverChatError ? (
                <Text style={styles.driverChatError}>{driverChatError}</Text>
              ) : null}

              <SectionCard title="Payment">
                {draft.paymentLink ? (
                  <>
                    <Text style={styles.paymentLinkAmount}>
                      Payment link created · {formatPence(draft.paymentLink.amountPence)}
                    </Text>
                    <Text style={styles.paymentLinkStatus}>Awaiting payment</Text>
                    <AppButton
                      label="Copy link"
                      variant="secondary"
                      onPress={() => { void handleCopyPaymentLink(); }}
                      fullWidth
                    />
                    <AppButton
                      label="Send payment link"
                      variant="primary"
                      onPress={() => { void handleWhatsAppPaymentLink(); }}
                      fullWidth
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.paymentLinkHint}>
                      Create a Stripe link for the outstanding balance and send it to the customer.
                    </Text>
                    <AppButton
                      label="Create payment link"
                      variant="primary"
                      onPress={() => { void paymentLinkActions.createForDispatchedBooking(); }}
                      loading={paymentLinkActions.busy}
                      disabled={paymentLinkActions.busy}
                      fullWidth
                    />
                  </>
                )}
                {paymentLinkActions.error ? (
                  <StatusBanner kind="err" message={paymentLinkActions.error} />
                ) : null}
              </SectionCard>
            </>
          ) : null}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomBarPaddingBottom }]}>
        {editingStage ? (
          <AppButton label="Back" variant="ghost" onPress={() => setEditingStage(null)} style={styles.backButton} />
        ) : null}
        <AppButton label="More" variant="secondary" onPress={() => setMoreOpen(true)} style={styles.moreButton} />
        <View style={styles.primaryWrap}>
          <AppButton
            label={primaryLabel}
            variant={primaryDisabled ? 'secondary' : 'primary'}
            onPress={() => {
              void handlePrimaryAction();
            }}
            loading={!editingStage && (price.loading || quoteActions.busy === 'save' || quoteActions.busy === 'confirm' || dispatch.busy)}
            disabled={primaryDisabled}
            style={styles.primaryButton}
            fullWidth
          />
          {primaryDisabledReason ? <Text style={styles.primaryReason}>{primaryDisabledReason}</Text> : null}
        </View>
      </View>

      <GuidedActionSheet visible={moreOpen} title="More" actions={sheetActions} onClose={() => setMoreOpen(false)} />
      <DispatchReviewSheet
        visible={reviewOpen}
        draft={draft}
        activeQuote={activeQuote}
        selectedPaymentOption={selectedPaymentOption}
        effectiveTotal={effectiveTotal}
        quoteConfirmed={quoteConfirmed}
        dispatchBusy={dispatch.busy}
        onClose={() => setReviewOpen(false)}
        onSend={handleSendToDriver}
      />
      <TodayBookingsModal visible={historyOpen} items={todayBookings.items} onClose={() => setHistoryOpen(false)} />
      <RecentCustomersModal
        visible={recentOpen}
        items={recentCustomers.items}
        draftHasContent={draftHasContent}
        onClose={() => setRecentOpen(false)}
        onUseCustomer={handleUseRecent}
      />
      <AdminQuotesModal visible={quotesOpen} onClose={() => setQuotesOpen(false)} onUseQuote={handleUseQuote} />
      <AdminBookingsModal visible={bookingsOpen} onClose={() => setBookingsOpen(false)} />
      <UrgentBookingPopup
        visible={urgentPopupOpen}
        booking={latestNewBooking}
        onOpenBookings={handleUrgentOpenBookings}
        onDismiss={handleUrgentDismiss}
      />
      <AdminVisitorsModal visible={visitorsOpen} onClose={() => setVisitorsOpen(false)} />
      <AdminInvoicesModal visible={invoicesOpen} onClose={() => setInvoicesOpen(false)} />
      <AdminStockModal visible={stockOpen} onClose={() => setStockOpen(false)} />
      <ActiveJobsModal visible={activeJobsOpen} onClose={() => setActiveJobsOpen(false)} />
      <ActiveJobMapModal
        visible={trackingMapOpen}
        job={trackingJob}
        onClose={() => setTrackingMapOpen(false)}
      />
      <Modal
        visible={notifSetupOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNotifSetupOpen(false)}
        accessibilityViewIsModal
      >
        <View style={styles.notifSetupOverlay}>
          <View style={styles.notifSetupSheet}>
            <NotificationReliabilityCard />
            <Pressable
              onPress={() => setNotifSetupOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close notification setup"
              style={({ pressed }) => [styles.notifSetupClose, pressed && styles.notifSetupClosePressed]}
            >
              <Text style={styles.notifSetupCloseLabel}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <EditQuotePriceModal
        visible={editPriceOpen}
        currentPriceGbp={effectiveTotal}
        engineBaseTotal={backendBaseTotal}
        quickBookingId={draft.quickBookingId}
        onClose={() => setEditPriceOpen(false)}
        onSaved={(newPrice, quote) =>
          update({
            manualPriceGbp: newPrice,
            ...(quote ? { quote, priceNeedsRefresh: false } : {}),
          })
        }
      />
    </SafeAreaView>
  );
}

interface RenderActiveStageArgs {
  activeStage: AssistedChatStage;
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  phoneInput: string;
  setPhoneInput: (value: string) => void;
  handlePhoneBlur: () => void;
  noteInput: string;
  setNoteInput: (value: string) => void;
  callNotesInput: string;
  setCallNotesInput: (value: string) => void;
  callAssistMessage: string | null;
  setCallAssistMessage: (value: string | null) => void;
  handleApplyCallNotes: () => void;
  locationShare: ReturnType<typeof useAssistedChatLocationShare>;
  price: ReturnType<typeof useAssistedChatPrice>;
  lockingNutCharge: number;
  effectiveTotal: number;
  duplicateMatch: ReturnType<typeof useDuplicateBookingWarning>;
  duplicateAck: boolean;
  setDuplicateAck: (value: boolean) => void;
  setHistoryOpen: (value: boolean) => void;
  quoteActions: ReturnType<typeof useAssistedChatQuoteActions>;
  activeQuote: AdminQuote | null;
  savedQuoteRef: string | null;
  quoteConfirmed: boolean;
  quoteExpiryStatus: string | null;
  quotePricePence: number;
  selectedPaymentOption: AdminQuotePaymentOption;
  dispatch: ReturnType<typeof useAssistedChatDispatch>;
  handleCopyCustomerDetails: () => void | Promise<void>;
  engineEffectiveTotal: number;
  setEditPriceOpen: (value: boolean) => void;
  breakdownVisible: boolean;
  setBreakdownVisible: (value: boolean) => void;

}

function renderActiveStage(args: RenderActiveStageArgs) {
  const {
    activeStage,
    draft,
    update,
    phoneInput,
    setPhoneInput,
    handlePhoneBlur,
    noteInput,
    setNoteInput,
    callNotesInput,
    setCallNotesInput,
    callAssistMessage,
    setCallAssistMessage,
    handleApplyCallNotes,
    locationShare,
    price,
    lockingNutCharge,
    effectiveTotal,
    duplicateMatch,
    duplicateAck,
    setDuplicateAck,
    setHistoryOpen,
    quoteActions,
    activeQuote,
    savedQuoteRef,
    quoteConfirmed,
    quoteExpiryStatus,
    quotePricePence,
    selectedPaymentOption,
    dispatch,
    handleCopyCustomerDetails,
    engineEffectiveTotal,
    setEditPriceOpen,
    breakdownVisible,
    setBreakdownVisible,
  } = args;

  if (activeStage === 'CUSTOMER') {
    return (
      <View style={styles.stepStack}>
        <Pressable onLongPress={handleCopyCustomerDetails} delayLongPress={350}>
          <SectionCard title="Customer">
            <FieldLabel>Customer name</FieldLabel>
            <TextInput
              value={draft.customer.name}
              onChangeText={(name) => update({ customer: { ...draft.customer, name } })}
              placeholder="Name"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <View style={styles.fieldGap} />
            <FieldLabel>Customer phone</FieldLabel>
            <TextInput
              value={phoneInput}
              onChangeText={setPhoneInput}
              onBlur={handlePhoneBlur}
              placeholder="07... or 0141..."
              placeholderTextColor={colors.subtle}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <View style={styles.fieldGap} />
            <FieldLabel>
              {draft.customerEmailMode === 'send_customer_confirmation'
                ? 'Customer email *'
                : 'Customer email (optional)'}
            </FieldLabel>
            <TextInput
              value={draft.customer.email}
              onChangeText={(email) => update({ customer: { ...draft.customer, email } })}
              placeholder="you@example.com"
              placeholderTextColor={colors.subtle}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <View style={styles.fieldGap} />
            {/* زر تبديل وضع البريد الإلكتروني */}
            <View style={styles.emailModeRow}>
              {(['walk_in_customer', 'send_customer_confirmation'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => update({ customerEmailMode: mode })}
                  style={[
                    styles.emailModeBtn,
                    draft.customerEmailMode === mode && styles.emailModeBtnActive,
                  ]}
                >
                  <Text style={[
                    styles.emailModeBtnText,
                    draft.customerEmailMode === mode && styles.emailModeBtnTextActive,
                  ]}>
                    {mode === 'walk_in_customer' ? 'Walk-in — no email' : 'Send confirmation'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>
        </Pressable>
        <CallNotesCard
          callNotesInput={callNotesInput}
          setCallNotesInput={setCallNotesInput}
          callAssistMessage={callAssistMessage}
          setCallAssistMessage={setCallAssistMessage}
          handleApplyCallNotes={handleApplyCallNotes}
        />
      </View>
    );
  }

  if (activeStage === 'LOCATION') {
    return (
      <View>
        <LocationSection draft={draft} update={update} locationShare={locationShare} showInlineActions={false} />
      </View>
    );
  }

  if (activeStage === 'TYRE') {
    return (
      <View style={styles.stepStack}>
        <TyreSelectionSection draft={draft} update={update} />
        <LockingWheelNutSection draft={draft} update={update} />
        <SectionCard title="Driver note">
          <FieldLabel>Admin note</FieldLabel>
          <TextInput
            value={noteInput}
            onChangeText={setNoteInput}
            onBlur={() => update({ note: noteInput })}
            placeholder="Anything the driver should know"
            placeholderTextColor={colors.subtle}
            style={styles.note}
            multiline
            textAlignVertical="top"
          />
        </SectionCard>
      </View>
    );
  }

  if (activeStage === 'PRICE') {
    const hasLocation = draft.location.lat != null && draft.location.lng != null;
    const hasTyre = hasAssistedChatTyre(draft);
    const pricingDisabledReason = !hasLocation
      ? 'Price is locked until the customer location is confirmed.'
      : !hasTyre
      ? 'Enter a tyre size before getting the price.'
      : null;
    const status = computeCompactQuoteStatus({
      activeQuote,
      savedQuoteRef,
      quoteConfirmed,
      paymentLink: draft.paymentLink,
    });
    return (
      <View style={styles.stepStack}>
        {pricingDisabledReason ? (
          <View style={styles.inlineNoticeWrap}>
            <InlineNotice kind="info">{pricingDisabledReason}</InlineNotice>
          </View>
        ) : null}
        <DuplicateBookingWarning
          match={duplicateMatch}
          acknowledged={duplicateAck}
          onReview={() => setHistoryOpen(true)}
          onContinueAnyway={() => setDuplicateAck(true)}
        />
        <CompactQuoteCard
          displayedPriceGbp={effectiveTotal}
          isManualPrice={draft.manualPriceGbp != null}
          originalCalculatedPriceGbp={engineEffectiveTotal}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={dispatch.busy && draft.paymentChoice === 'full'}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={() => { void dispatch.choosePaymentAndDispatch('full'); }}
          onToggleBreakdown={() => setBreakdownVisible(!breakdownVisible)}
          breakdownVisible={breakdownVisible}
        />
        {breakdownVisible ? (
          <PriceSummary
            quote={draft.quote}
            lockingNutCharge={lockingNutCharge}
            loading={price.loading}
            stageIdx={price.stageIdx}
            stageLabels={price.stageLabels}
            error={price.error}
            onGetPrice={price.getPrice}
            onChoosePayment={(choice) => update({ paymentChoice: choice })}
            paymentChoice={draft.paymentChoice}
            paymentBusy={dispatch.busy}
            paymentError={dispatch.error}
            paymentLink={draft.paymentLink}
            dispatchedRefNumber={draft.dispatchedRefNumber}
            pricingBlocked={!hasLocation || !hasTyre}
            priceNeedsRefresh={draft.priceNeedsRefresh}
            manualPriceGbp={draft.manualPriceGbp}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? <PaymentLinkInline link={draft.paymentLink} isManualPrice={draft.manualPriceGbp != null} /> : null}
      </View>
    );
  }

  if (activeStage === 'QUOTE') {
    const status = computeCompactQuoteStatus({
      activeQuote,
      savedQuoteRef,
      quoteConfirmed,
      paymentLink: draft.paymentLink,
    });
    return (
      <View style={styles.stepStack}>
        <CompactQuoteCard
          displayedPriceGbp={effectiveTotal}
          isManualPrice={draft.manualPriceGbp != null}
          originalCalculatedPriceGbp={engineEffectiveTotal}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={dispatch.busy && draft.paymentChoice === 'full'}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={() => { void dispatch.choosePaymentAndDispatch('full'); }}
          onToggleBreakdown={() => setBreakdownVisible(!breakdownVisible)}
          breakdownVisible={breakdownVisible}
        />
        {breakdownVisible && draft.quote ? (
          <PriceSummary
            quote={draft.quote}
            lockingNutCharge={lockingNutCharge}
            loading={price.loading}
            stageIdx={price.stageIdx}
            stageLabels={price.stageLabels}
            error={price.error}
            onGetPrice={price.getPrice}
            onChoosePayment={(choice) => update({ paymentChoice: choice })}
            paymentChoice={draft.paymentChoice}
            paymentBusy={dispatch.busy}
            paymentError={dispatch.error}
            paymentLink={draft.paymentLink}
            dispatchedRefNumber={draft.dispatchedRefNumber}
            pricingBlocked={false}
            priceNeedsRefresh={draft.priceNeedsRefresh}
            manualPriceGbp={draft.manualPriceGbp}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? <PaymentLinkInline link={draft.paymentLink} isManualPrice={draft.manualPriceGbp != null} /> : null}
      </View>
    );
  }

  if (activeStage === 'CONFIRMATION' || activeStage === 'PAYMENT') {
    const status = computeCompactQuoteStatus({
      activeQuote,
      savedQuoteRef,
      quoteConfirmed,
      paymentLink: draft.paymentLink,
    });
    return (
      <View style={styles.stepStack}>
        <CompactQuoteCard
          displayedPriceGbp={effectiveTotal}
          isManualPrice={draft.manualPriceGbp != null}
          originalCalculatedPriceGbp={engineEffectiveTotal}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={dispatch.busy && draft.paymentChoice === 'full'}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={() => { void dispatch.choosePaymentAndDispatch('full'); }}
          onToggleBreakdown={() => setBreakdownVisible(!breakdownVisible)}
          breakdownVisible={breakdownVisible}
        />
        {breakdownVisible && draft.quote ? (
          <PriceSummary
            quote={draft.quote}
            lockingNutCharge={lockingNutCharge}
            loading={price.loading}
            stageIdx={price.stageIdx}
            stageLabels={price.stageLabels}
            error={price.error}
            onGetPrice={price.getPrice}
            onChoosePayment={(choice) => update({ paymentChoice: choice })}
            paymentChoice={draft.paymentChoice}
            paymentBusy={dispatch.busy}
            paymentError={dispatch.error}
            paymentLink={draft.paymentLink}
            dispatchedRefNumber={draft.dispatchedRefNumber}
            pricingBlocked={false}
            priceNeedsRefresh={draft.priceNeedsRefresh}
            manualPriceGbp={draft.manualPriceGbp}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? <PaymentLinkInline link={draft.paymentLink} isManualPrice={draft.manualPriceGbp != null} /> : null}
      </View>
    );
  }

  if (activeStage === 'READY_TO_DISPATCH') {
    return (
      <SectionCard title="Ready to dispatch">
        <Text style={styles.bodyText}>Review the job before sending it to the driver.</Text>
        <View style={styles.readySummary}>
          <DetailRow label="Payment" value={paymentChoiceLabel(draft.paymentChoice)} />
          <DetailRow label="Quote" value={savedQuoteRef ? `Quote ${savedQuoteRef}` : 'Saved quote unavailable'} />
          <DetailRow label="Total" value={formatGbp(effectiveTotal)} />
        </View>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Dispatched">
      <Text style={styles.bodyText}>Booking {draft.dispatchedRefNumber ?? 'created'} is ready.</Text>
      {draft.paymentLink ? (
        <View style={styles.paymentLinkSummary}>
          <Text style={styles.paymentLinkTitle}>{draft.paymentLink.kind === 'deposit' ? 'Deposit payment link' : 'Full payment link'}</Text>
          <Text style={styles.paymentLinkMeta}>{draft.paymentLink.paymentUrl}</Text>
          <Text style={styles.paymentLinkMeta}>Amount: {formatPence(draft.paymentLink.amountPence)}</Text>
          {draft.paymentLink.remainingBalancePence != null ? (
            <Text style={styles.paymentLinkMeta}>Balance on arrival: {formatPence(draft.paymentLink.remainingBalancePence)}</Text>
          ) : null}
        </View>
      ) : null}
    </SectionCard>
  );
}

function stageLabel(stage: AssistedChatStage): string {
  if (stage === 'READY_TO_DISPATCH') return 'Ready to dispatch';
  return stage.charAt(0) + stage.slice(1).toLowerCase().replace(/_/g, ' ');
}

function Timeline({
  items,
  onSelect,
}: {
  items: AssistedChatTimelineItem[];
  onSelect: (step: AssistedChatTimelineStep) => void;
}) {
  return (
    <View style={styles.timeline}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onSelect(item.key)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.label} section`}
          style={({ pressed }) => [
            styles.timelineItem,
            item.state === 'done' && styles.timelineItemDone,
            item.state === 'active' && styles.timelineItemActive,
            pressed && styles.timelineItemPressed,
          ]}
        >
          <Text
            style={[
              styles.timelineText,
              item.state === 'done' && styles.timelineTextDone,
              item.state === 'active' && styles.timelineTextActive,
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function stageForTimelineStep(
  step: AssistedChatTimelineStep,
  ctx: { quoteConfirmed: boolean },
): AssistedChatStage {
  switch (step) {
    case 'CUSTOMER':
      return 'CUSTOMER';
    case 'LOCATION':
      return 'LOCATION';
    case 'TYRE':
      return 'TYRE';
    case 'PRICE':
      return 'PRICE';
    case 'QUOTE':
      return ctx.quoteConfirmed ? 'PAYMENT' : 'CONFIRMATION';
    case 'PAYMENT':
      return 'PAYMENT';
    case 'DISPATCH':
      return 'READY_TO_DISPATCH';
  }
}

function blockedReasonForStage(
  stage: AssistedChatStage,
  ctx: {
    hasCustomerDetails: boolean;
    hasLocation: boolean;
    hasTyre: boolean;
    hasPrice: boolean;
    hasSavedQuote: boolean;
    quoteConfirmed: boolean;
    hasPaymentChoice: boolean;
  },
): string | null {
  switch (stage) {
    case 'CUSTOMER':
    case 'LOCATION':
      return null;
    case 'TYRE':
      if (!ctx.hasLocation) return 'Confirm location before adding tyre details.';
      return null;
    case 'PRICE':
      if (!ctx.hasLocation) return 'Complete location before pricing.';
      if (!ctx.hasTyre) return 'Add tyre details before pricing.';
      return null;
    case 'QUOTE':
    case 'CONFIRMATION':
      if (!ctx.hasPrice) return 'Get a price before saving a quote.';
      return null;
    case 'PAYMENT':
      if (!ctx.hasSavedQuote) return 'Save a quote before choosing payment.';
      return null;
    case 'READY_TO_DISPATCH':
    case 'DISPATCHED':
      if (!ctx.quoteConfirmed) return 'Confirm the quote before dispatch.';
      if (!ctx.hasPaymentChoice) return 'Choose a payment option before dispatch.';
      return null;
  }
}

function SummaryCard({
  title,
  value,
  detail,
  done,
  active,
  rightLabel,
  onPress,
  onLongPress,
  onRightPress,
}: {
  title: string;
  value: string;
  detail: string;
  done: boolean;
  active: boolean;
  rightLabel?: string;
  onPress: () => void;
  onLongPress?: () => void | Promise<void>;
  onRightPress?: () => void;
}) {
  const cardStyle = [
    styles.summaryCard,
    done && styles.summaryCardDone,
    active && styles.summaryCardActive,
  ];
  const content = (
    <View style={styles.summaryMain}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryDetail} numberOfLines={2}>{detail}</Text>
    </View>
  );

  if (rightLabel && onRightPress) {
    return (
      <View style={cardStyle}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={350}
          accessibilityRole="button"
          style={({ pressed }) => [styles.summaryMainButton, pressed && styles.summaryCardPressed]}
        >
          {content}
        </Pressable>
        <Pressable onPress={onRightPress} style={styles.summaryRightButton} accessibilityRole="button">
          <Text style={styles.summaryRightText}>{rightLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      style={({ pressed }) => [
        cardStyle,
        pressed && styles.summaryCardPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

function CallNotesCard({
  callNotesInput,
  setCallNotesInput,
  callAssistMessage,
  setCallAssistMessage,
  handleApplyCallNotes,
}: {
  callNotesInput: string;
  setCallNotesInput: (value: string) => void;
  callAssistMessage: string | null;
  setCallAssistMessage: (value: string | null) => void;
  handleApplyCallNotes: () => void;
}) {
  return (
    <SectionCard title="Smart call notes" helperText="Paste rough call notes and apply obvious details. Address still needs selecting from suggestions for coordinates.">
      <TextInput
        value={callNotesInput}
        onChangeText={(value) => {
          setCallNotesInput(value);
          setCallAssistMessage(null);
        }}
        placeholder="Example: customer is Ali, 07700 900123, address 3 Gateside Street, needs 205/55R16 x2, cash, note side street"
        placeholderTextColor={colors.subtle}
        style={styles.callNotesInput}
        multiline
        textAlignVertical="top"
      />
      <View style={styles.callNotesActions}>
        <AppButton label="Apply notes" variant="secondary" onPress={handleApplyCallNotes} disabled={!callNotesInput.trim()} style={styles.flexActionButton} />
        <AppButton
          label="Clear notes"
          variant="ghost"
          onPress={() => {
            setCallNotesInput('');
            setCallAssistMessage(null);
          }}
          disabled={!callNotesInput.trim()}
          style={styles.flexActionButton}
        />
      </View>
      {callAssistMessage ? (
        <View style={styles.inlineNoticeTop}>
          <InlineNotice kind={callAssistMessage.startsWith('Applied:') ? 'info' : 'warn'}>{callAssistMessage}</InlineNotice>
        </View>
      ) : null}
    </SectionCard>
  );
}

function QuoteStepCard({
  activeQuote,
  savedQuoteRef,
  quoteConfirmed,
  quoteExpiryStatus,
  quotePricePence,
  selectedPaymentOption,
  effectiveTotal,
  onLongPress,
}: {
  activeQuote: AdminQuote | null;
  savedQuoteRef: string | null;
  quoteConfirmed: boolean;
  quoteExpiryStatus: string | null;
  quotePricePence: number;
  selectedPaymentOption: AdminQuotePaymentOption;
  effectiveTotal: number;
  onLongPress: () => void | Promise<void>;
}) {
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350}>
      <SectionCard title="Quote">
        <View style={styles.quoteHeaderBox}>
          <Text style={styles.quoteTitle}>{savedQuoteRef ? `Quote ${savedQuoteRef}` : 'Quote not saved'}</Text>
          <Text style={styles.quoteTotal}>{formatGbp(effectiveTotal)}</Text>
        </View>
        <View style={styles.detailRows}>
          <DetailRow label="Saved state" value={savedQuoteRef ? 'Saved' : 'Not saved'} />
          <DetailRow label="Confirmation" value={quoteConfirmed ? 'Confirmed by phone' : 'Not confirmed'} />
          {quoteExpiryStatus ? <DetailRow label="Expiry" value={quoteExpiryStatus} /> : null}
          <DetailRow label="Quote status" value={activeQuote?.quoteStatus ?? (savedQuoteRef ? 'Saved' : 'Draft')} />
          <DetailRow label="Selected payment" value={paymentOptionLabel(selectedPaymentOption)} />
          <DetailRow label="Full price" value={formatPence(quotePricePence)} />
        </View>
      </SectionCard>
    </Pressable>
  );
}

function PaymentLinkInline({ link, isManualPrice = false }: { link: StripePaymentLinkState; isManualPrice?: boolean }) {
  const kindLabel = link.kind === 'deposit' ? 'Deposit payment link' : 'Full payment link';
  const handleOpen = (): void => {
    void Linking.openURL(link.paymentUrl);
  };
  const handleCopy = (): void => {
    void copyToClipboard(link.paymentUrl);
  };
  return (
    <SectionCard title={kindLabel}>
      <Text style={styles.paymentLinkMeta} numberOfLines={2}>{link.paymentUrl}</Text>
      <Text style={styles.paymentLinkMeta}>Amount: {formatPence(link.amountPence)}</Text>
      {isManualPrice ? (
        <Text style={styles.paymentLinkMeta}>Manual price used for payment</Text>
      ) : null}
      <View style={styles.paymentLinkActions}>
        <AppButton label="Copy link" variant="secondary" onPress={handleCopy} style={styles.flexActionButton} />
        <AppButton label="Open" variant="ghost" onPress={handleOpen} style={styles.flexActionButton} />
      </View>
    </SectionCard>
  );
}

function PaymentSelector({
  selectedPaymentOption,
  quotePricePence,
  disabled,
  onSelect,
}: {
  selectedPaymentOption: AdminQuotePaymentOption;
  quotePricePence: number;
  disabled: boolean;
  onSelect: (option: AdminQuotePaymentOption) => void;
}) {
  const deposit = getDepositSummary(quotePricePence);
  return (
    <SectionCard title="Payment">
      <View style={styles.paymentList}>
        {PAYMENT_OPTIONS.map((option) => {
          const selected = selectedPaymentOption === option.value;
          const detail = option.value === 'DEPOSIT_15'
            ? `Deposit ${formatPence(deposit.depositAmountPence)}. Remaining ${formatPence(deposit.remainingBalancePence)}.`
            : option.description;
          return (
            <Pressable
              key={option.value}
              onPress={disabled ? undefined : () => onSelect(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              style={({ pressed }) => [
                styles.paymentOption,
                selected && styles.paymentOptionSelected,
                pressed && !disabled && styles.paymentOptionPressed,
                disabled && styles.paymentOptionDisabled,
              ]}
            >
              <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
              <View style={styles.paymentCopy}>
                <Text style={[styles.paymentLabel, selected && styles.paymentLabelSelected]}>{option.label}</Text>
                <Text style={styles.paymentDetail}>{detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

function GuidedActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <AppButton label="Close" variant="ghost" onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetList}>
            {actions.map((action) => {
              const disabled = Boolean(action.disabledReason);
              return (
                <Pressable
                  key={action.id}
                  onPress={disabled ? undefined : () => {
                    onClose();
                    void action.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ disabled }}
                  style={({ pressed }) => [
                    styles.sheetAction,
                    action.destructive && styles.sheetActionDanger,
                    disabled && styles.sheetActionDisabled,
                    pressed && !disabled && styles.sheetActionPressed,
                  ]}
                >
                  <Text style={[styles.sheetActionLabel, action.destructive && styles.sheetActionDangerLabel]}>{action.label}</Text>
                  {action.description ? <Text style={styles.sheetActionDescription}>{action.description}</Text> : null}
                  {action.disabledReason ? <Text style={styles.sheetActionReason}>{action.disabledReason}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DispatchReviewSheet({
  visible,
  draft,
  activeQuote,
  selectedPaymentOption,
  effectiveTotal,
  quoteConfirmed,
  dispatchBusy,
  onClose,
  onSend,
}: {
  visible: boolean;
  draft: AssistedChatDraft;
  activeQuote: AdminQuote | null;
  selectedPaymentOption: AdminQuotePaymentOption;
  effectiveTotal: number;
  quoteConfirmed: boolean;
  dispatchBusy: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  const distanceMiles =
    draft.quote?.distanceMiles ??
    (draft.quote?.distanceKm != null ? draft.quote.distanceKm * 0.621371 : null);
  const driveTime = draft.quote?.serviceOrigin?.etaMinutes ?? null;
  const canSend = Boolean(draft.paymentChoice && draft.quote && draft.quickBookingId && quoteConfirmed && !draft.dispatchedRefNumber);
  const disabledReason = !draft.quote
    ? 'Get a price before dispatching.'
    : !draft.quickBookingId
    ? 'Get a current quick booking before dispatching.'
    : !quoteConfirmed
    ? 'Confirm the saved quote before dispatching.'
    : !draft.paymentChoice
    ? 'Choose a payment option before dispatching.'
    : draft.dispatchedRefNumber
    ? `Already dispatched as ${draft.dispatchedRefNumber}.`
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.reviewBackdrop}>
        <View style={styles.reviewSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Review dispatch</Text>
            <AppButton label="Close" variant="ghost" onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <ScrollView contentContainerStyle={styles.reviewContent}>
            <DetailRow label="Customer" value={draft.customer.name.trim() || 'New customer'} />
            <DetailRow label="Phone" value={draft.customer.phone.trim() || 'Not set'} />
            <DetailRow label="Tyres" value={draft.tyre.size.trim() ? `${draft.tyre.quantity} x ${draft.tyre.size.trim()}` : `Quantity ${draft.tyre.quantity}`} />
            <DetailRow label="Address/location" value={draft.location.address.trim() || draft.location.status} />
            <DetailRow label="Price" value={formatGbp(effectiveTotal)} />
            <DetailRow label="Quote ref" value={activeQuote?.quoteRef ?? draft.savedQuoteRef ?? 'Not saved'} />
            <DetailRow label="Selected payment" value={paymentOptionLabel(selectedPaymentOption)} />
            <DetailRow label="Payment status" value={draft.paymentLink ? 'Payment link ready' : draft.paymentChoice ? paymentChoiceLabel(draft.paymentChoice) : 'Not selected'} />
            <DetailRow label="Distance" value={distanceMiles != null ? `${distanceMiles.toFixed(1)} miles` : 'Not available'} />
            <DetailRow label="Drive time" value={driveTime != null ? `${driveTime} minutes` : 'Not available'} />
            <DetailRow label="Driver/admin note" value={draft.note.trim() || 'None'} />
            {disabledReason ? <StatusBanner kind="warn" message={disabledReason} /> : null}
          </ScrollView>
          <View style={styles.reviewActions}>
            <AppButton
              label="Send to Driver"
              variant={canSend ? 'primary' : 'secondary'}
              onPress={onSend}
              disabled={!canSend || dispatchBusy}
              loading={dispatchBusy}
              style={styles.reviewPrimary}
              fullWidth
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const baseInput: TextStyle = {
  minHeight: 48,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: radius.md,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: fontSize.md,
  color: colors.text,
  backgroundColor: colors.inputBg,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
    gap: 10,
  },
  headerTextBlock: { flex: 1, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  headerCustomer: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
  headerPhone: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  alertReadinessPill: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    minHeight: 34,
    justifyContent: 'center',
  },
  alertReadinessPillArmed: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  alertReadinessPillNotArmed: {
    borderColor: colors.warning,
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  alertReadinessPillPressed: { opacity: 0.78 },
  alertReadinessText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  alertReadinessRetryText: { color: colors.warning, fontSize: fontSize.xs, marginTop: 2, fontWeight: '700' },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  statusChip: {
    minHeight: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipText: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '800' },
  headerContactRow: { flexDirection: 'row', gap: 8 },
  compactContactButton: {
    minHeight: 48,
    minWidth: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  callButton: { backgroundColor: colors.accent, borderColor: colors.accent },
  whatsappButton: { backgroundColor: '#25D366', borderColor: '#1FB855' },
  compactContactLabel: { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: '800' },
  contactButtonPressed: { opacity: 0.82 },
  contactButtonDisabled: { opacity: 0.38 },
  scroll: { padding: 12, gap: 12, paddingBottom: 148 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toolButton: { flexGrow: 1, flexBasis: 104 },
  timeline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 8,
  },
  timelineItem: {
    minHeight: 34,
    flexGrow: 1,
    flexBasis: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: colors.bg,
  },
  timelineItemDone: { borderColor: colors.successBorder, backgroundColor: colors.successBg },
  timelineItemActive: { borderColor: colors.accent, backgroundColor: 'rgba(249,115,22,0.14)' },
  timelineItemPressed: { opacity: 0.72 },
  timelineText: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800' },
  timelineTextDone: { color: colors.success },
  timelineTextActive: { color: colors.accent },
  summaryStack: { gap: 8 },
  summaryCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 10,
  },
  summaryCardDone: { borderColor: colors.successBorder },
  summaryCardActive: { borderColor: colors.accent },
  summaryCardPressed: { backgroundColor: colors.card },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryMainButton: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', borderRadius: radius.sm },
  summaryTitle: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.4 },
  summaryValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '800', marginTop: 2 },
  summaryDetail: { color: colors.subtle, fontSize: fontSize.xs, marginTop: 2, lineHeight: 16 },
  summaryRightButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  summaryRightText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '800' },
  activeStepBlock: { gap: 12 },
  stepStack: { gap: 12 },
  input: baseInput,
  fieldGap: { height: 10 },
  emailModeRow: { flexDirection: 'row', gap: 8 },
  emailModeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center' as const,
  },
  emailModeBtnActive: { borderColor: colors.accent, backgroundColor: 'rgba(249,115,22,0.08)' },
  emailModeBtnText: { fontSize: 11, fontWeight: '600' as const, color: colors.subtle, textAlign: 'center' as const },
  emailModeBtnTextActive: { color: colors.accent },
  note: { ...baseInput, minHeight: 96, textAlignVertical: 'top' },
  callNotesInput: { ...baseInput, minHeight: 92, lineHeight: 20, textAlignVertical: 'top' },
  callNotesActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  flexActionButton: { flexGrow: 1, flexBasis: 130 },
  inlineNoticeTop: { marginTop: 10 },
  inlineNoticeWrap: { marginBottom: 10 },
  quoteHeaderBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 12,
    gap: 4,
  },
  quoteTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  quoteTotal: { color: colors.accent, fontSize: fontSize.xl, fontWeight: '900' },
  detailRows: { marginTop: 10, gap: 8 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  detailLabel: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700', flex: 1 },
  detailValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700', flex: 1.35, textAlign: 'right' },
  paymentList: { gap: 8 },
  paymentOption: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  paymentOptionSelected: { borderColor: colors.accent, backgroundColor: 'rgba(249,115,22,0.12)' },
  paymentOptionPressed: { borderColor: colors.borderStrong, backgroundColor: colors.surface },
  paymentOptionDisabled: { opacity: 0.62 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  paymentCopy: { flex: 1, minWidth: 0 },
  paymentLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  paymentLabelSelected: { color: colors.accent },
  paymentDetail: { color: colors.muted, fontSize: fontSize.xs, marginTop: 3, lineHeight: 16 },
  bodyText: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20, marginBottom: 10 },
  readySummary: { gap: 8, marginBottom: 12 },
  paymentLinkSummary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 12,
    gap: 5,
  },
  paymentLinkTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  paymentLinkMeta: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 17 },
  paymentLinkActions: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  bottomSpacer: { height: 8 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  backButton: { minWidth: 76, minHeight: 56 },
  moreButton: { minWidth: 84, minHeight: 56 },
  primaryWrap: { flex: 1, minWidth: 0 },
  primaryButton: { minHeight: 56 },
  primaryReason: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '700', marginTop: 5 },
  driverChatError: { color: colors.danger, fontSize: fontSize.xs, marginTop: 6 },
  trackDriverHint: { color: colors.muted, fontSize: fontSize.xs, marginTop: 6, textAlign: 'center' },
  paymentLinkHint: { color: colors.muted, fontSize: fontSize.sm, marginBottom: 8 },
  paymentLinkAmount: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginBottom: 2 },
  paymentLinkStatus: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '700', marginBottom: 8 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  actionSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sheetTitle: { flex: 1, color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  sheetCloseButton: { minWidth: 86 },
  sheetList: { gap: 8, paddingBottom: space.md },
  sheetAction: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sheetActionPressed: { backgroundColor: colors.card, borderColor: colors.borderStrong },
  sheetActionDisabled: { opacity: 0.58 },
  sheetActionDanger: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerBg },
  sheetActionLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  sheetActionDangerLabel: { color: colors.danger },
  sheetActionDescription: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 16, marginTop: 3 },
  sheetActionReason: { color: colors.warning, fontSize: fontSize.xs, lineHeight: 16, marginTop: 4, fontWeight: '700' },
  reviewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  reviewSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  reviewContent: { gap: 8, paddingBottom: 12 },
  reviewActions: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  reviewPrimary: { minHeight: 56 },
  notifSetupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  notifSetupSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  notifSetupClose: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  notifSetupClosePressed: { opacity: 0.7 },
  notifSetupCloseLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
});

~~~

## assisted-chat-app/src/components/PaymentLinkCard.tsx

~~~
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { AssistedChatDraft, StripePaymentLinkState } from '@/types/assisted-chat';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';
import { formatGbp } from '@/lib/money';
import { AppButton, SectionCard, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';

interface Props {
  paymentLink: StripePaymentLinkState;
  draft: AssistedChatDraft;
  effectiveTotal: number;
  /** Manual admin override in GBP. When set, a small badge tells the operator the link uses the manual price. */
  manualPriceGbp?: number | null;
}

function moneyFromPence(pence: number): string {
  return formatGbp(pence / 100);
}

function buildPaymentMessage(
  paymentLink: StripePaymentLinkState,
  draft: AssistedChatDraft,
  effectiveTotal: number,
): string {
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  lines.push(
    paymentLink.kind === 'deposit'
      ? 'Your booking is ready. Please pay the 15% deposit using this secure payment link:'
      : 'Your booking is ready. Please complete the full payment using this secure payment link:',
  );
  lines.push(paymentLink.paymentUrl);
  lines.push('');
  lines.push(`Reference: ${paymentLink.refNumber}`);
  lines.push(
    paymentLink.kind === 'deposit'
      ? `Deposit due now: ${moneyFromPence(paymentLink.amountPence)}`
      : `Amount due: ${moneyFromPence(paymentLink.amountPence)}`,
  );
  if (paymentLink.remainingBalancePence != null) {
    lines.push(`Balance due on-site: ${moneyFromPence(paymentLink.remainingBalancePence)}`);
  }
  lines.push(`Total: ${formatGbp(effectiveTotal)}`);
  if (draft.location.address) lines.push(`Address: ${draft.location.address}`);
  if (draft.tyre.size) lines.push(`Tyres: ${draft.tyre.quantity} x ${draft.tyre.size}`);
  return lines.join('\n');
}

function genericWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function PaymentLinkCard({ paymentLink, draft, effectiveTotal, manualPriceGbp = null }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const message = buildPaymentMessage(paymentLink, draft, effectiveTotal);

  const handleCopy = async (): Promise<void> => {
    const ok = await copyToClipboard(paymentLink.paymentUrl);
    setCopyState(ok ? 'ok' : 'err');
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const handleOpen = async (): Promise<void> => {
    setActionMessage(null);
    try {
      await Linking.openURL(paymentLink.paymentUrl);
    } catch {
      setActionMessage('Could not open payment link.');
    }
  };

  const handleWhatsApp = async (): Promise<void> => {
    setActionMessage(null);
    const url = buildWhatsAppUrl(draft.customer.phone, message) ?? genericWhatsAppUrl(message);
    try {
      await Linking.openURL(url);
    } catch {
      const ok = await copyToClipboard(message);
      setActionMessage(
        ok
          ? 'Payment message copied. Paste it into WhatsApp.'
          : 'Could not open WhatsApp.',
      );
    }
  };

  return (
    <SectionCard title={paymentLink.kind === 'deposit' ? 'Deposit payment link' : 'Full payment link'}>
      <View style={styles.summary}>
        <Text style={styles.readyText}>
          {paymentLink.kind === 'deposit'
            ? 'Deposit payment link ready'
            : 'Full payment link ready'}
        </Text>
        <Text style={styles.metaText}>Reference: {paymentLink.refNumber}</Text>
        <Text style={styles.amountText}>
          {paymentLink.kind === 'deposit' ? 'Deposit: ' : 'Amount: '}
          {moneyFromPence(paymentLink.amountPence)}
        </Text>
        {paymentLink.remainingBalancePence != null ? (
          <Text style={styles.metaText}>
            Balance on-site: {moneyFromPence(paymentLink.remainingBalancePence)}
          </Text>
        ) : null}
        {manualPriceGbp != null && Number.isFinite(manualPriceGbp) ? (
          <Text style={styles.metaText}>Manual price used for payment</Text>
        ) : null}
      </View>
      <Text style={styles.linkText} selectable>
        {paymentLink.paymentUrl}
      </Text>
      <View style={styles.actions}>
        <AppButton label="Copy payment link" variant="secondary" onPress={handleCopy} fullWidth />
        <AppButton label="Open payment link" variant="primary" onPress={handleOpen} fullWidth />
        <AppButton label="WhatsApp payment link" variant="secondary" onPress={handleWhatsApp} fullWidth />
      </View>
      {copyState === 'ok' ? <StatusBanner kind="ok" message="Payment link copied." /> : null}
      {copyState === 'err' ? <StatusBanner kind="err" message="Could not copy payment link." /> : null}
      {actionMessage ? <StatusBanner kind="warn" message={actionMessage} /> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  summary: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 4,
  },
  readyText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  amountText: { color: colors.accent, fontSize: fontSize.md, fontWeight: '800' },
  metaText: { color: colors.muted, fontSize: fontSize.xs },
  linkText: {
    marginTop: 8,
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  actions: { gap: 8, marginTop: 10 },
});

~~~

## assisted-chat-app/src/components/PriceSummary.tsx

~~~
import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type {
  AssistedChatPaymentChoice,
  AssistedChatQuoteBreakdown,
  StripePaymentLinkState,
} from '@/types/assisted-chat';
import { AppButton, SectionCard, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';
import { formatGbp } from '@/lib/money';

interface Props {
  quote: AssistedChatQuoteBreakdown | null;
  lockingNutCharge: number;
  loading: boolean;
  stageIdx: number;
  stageLabels: readonly string[];
  error: string | null;
  onGetPrice: () => void;
  onChoosePayment: (choice: AssistedChatPaymentChoice) => void;
  paymentChoice: AssistedChatPaymentChoice | null;
  paymentBusy: boolean;
  paymentError: string | null;
  paymentLink: StripePaymentLinkState | null;
  dispatchedRefNumber: string | null;
  /** Disable Get price for blocking client-side issues (e.g. insufficient stock). */
  pricingBlocked?: boolean;
  /** Optional inline slot rendered above Get price (e.g. duplicate warning). */
  beforeGetPriceSlot?: ReactNode;
  /** True when a priced field changed after the last quote. */
  priceNeedsRefresh?: boolean;
  /** Optional slot rendered after Get price when pricing failed (recovery). */
  afterGetPriceSlot?: ReactNode;
  /** Optional slot rendered after the payment buttons (e.g. customer message card / payment recovery). */
  afterPaymentSlot?: ReactNode;
  /** Guided screens use the sticky primary CTA instead of an inline Get price button. */
  showGetPriceAction?: boolean;
  /** Guided screens render exactly one payment selector elsewhere. */
  showPaymentOptions?: boolean;
  /**
   * Manual admin price override in GBP. When set, the breakdown is
   * relabelled as a calculated reference ("Calculated breakdown") and the
   * final highlighted row shows the manual price instead.
   */
  manualPriceGbp?: number | null;
}

export function PriceSummary({
  quote,
  lockingNutCharge,
  loading,
  stageIdx,
  stageLabels,
  error,
  onGetPrice,
  onChoosePayment,
  paymentChoice,
  paymentBusy,
  paymentError,
  paymentLink,
  dispatchedRefNumber,
  pricingBlocked,
  beforeGetPriceSlot,
  priceNeedsRefresh,
  afterGetPriceSlot,
  afterPaymentSlot,
  showGetPriceAction = true,
  showPaymentOptions = true,
  manualPriceGbp = null,
}: Props) {
  const baseTotal = quote?.total ?? 0;
  const calculatedTotal = baseTotal;
  const hasManualOverride =
    typeof manualPriceGbp === 'number' && Number.isFinite(manualPriceGbp);
  // The customer-payable figure used for deposit/cash/full button labels and
  // the customer-facing sentence. Manual override wins, and is persisted as a
  // backend admin adjustment before quote save/finalize.
  const effectiveTotal = hasManualOverride ? (manualPriceGbp as number) : calculatedTotal;
  const depositPercent = 0.15;
  const deposit = effectiveTotal * depositPercent;
  const priceLines = quote?.lineItems.filter((line) => line.type !== 'subtotal' && line.type !== 'total') ?? [];
  const pricingSource = quote?.serviceOrigin?.source === 'driver' ? 'nearest driver' : quote?.serviceOrigin?.source === 'garage' ? 'garage' : null;
  const hasDistanceCharge = priceLines.some((line) => /callout|rural|distance/i.test(line.label));
  const hasRuralSurcharge = priceLines.some((line) => /rural/i.test(line.label));
  const customerPriceSentence = quote
    ? `Tell customer: total is ${formatGbp(effectiveTotal)} including tyre, fitting${hasDistanceCharge ? ', callout and distance charges' : ''}.`
    : null;
  const smartWarnings = [
    quote?.distanceKm != null && quote.distanceKm >= 48
      ? 'Long-distance job. The price includes extra travel distance.'
      : null,
    hasRuralSurcharge ? 'Rural surcharge is included in this quote. Mention this if the customer asks why the total is higher.' : null,
    quote &&
    lockingNutCharge > 0 &&
    quote.adminAdjustmentReason !== 'Locking wheel nut removal'
      ? 'Refresh the price so locking wheel nut removal is included in the backend quote.'
      : null,
  ].filter(Boolean) as string[];

  return (
    <SectionCard title={hasManualOverride ? 'Calculated breakdown' : 'Price'}>
      {beforeGetPriceSlot}
      {priceNeedsRefresh ? (
        <View style={{ marginBottom: 10 }}>
          <StatusBanner kind="warn" message="Price needs refresh. Address or tyre details changed after the last quote." />
        </View>
      ) : null}
      {showGetPriceAction ? (
        <AppButton
          label={loading ? stageLabels[Math.max(0, stageIdx)] + '…' : 'Get price'}
          onPress={onGetPrice}
          loading={loading}
          disabled={loading || pricingBlocked === true}
          fullWidth
        />
      ) : null}

      {error ? (
        <View style={{ marginTop: 10 }}>
          <StatusBanner kind="err" message={error} />
        </View>
      ) : null}
      {afterGetPriceSlot}

      {!quote && !loading && !error ? (
        <Text style={styles.emptyHint}>
          Price will appear after location and tyre details are ready.
        </Text>
      ) : null}

      {quote ? (
        <View style={styles.breakdown}>
          {priceLines.map((line, i) => (
            <View key={`${line.type}-${i}`} style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={2}>
                {line.label}
                {line.quantity && line.quantity > 1
                  ? `  × ${line.quantity}`
                  : ''}
              </Text>
              <Text style={styles.rowValue}>{formatGbp(line.amount)}</Text>
            </View>
          ))}

          {quote.vatAmount > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>VAT (incl.)</Text>
              <Text style={styles.rowValue}>{formatGbp(quote.vatAmount)}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>
              {hasManualOverride ? 'Calculated total' : 'Total'}
            </Text>
            <Text style={styles.totalValue}>{formatGbp(calculatedTotal)}</Text>
          </View>

          {hasManualOverride ? (
            <>
              <View style={styles.divider} />
              <View style={[styles.row, styles.finalRow]}>
                <Text style={styles.finalLabel}>Final quote price</Text>
                <Text style={styles.finalValue}>{formatGbp(effectiveTotal)}</Text>
              </View>
              <Text style={styles.manualNoteText}>Manual override applied</Text>
            </>
          ) : null}

          {customerPriceSentence ? (
            <View style={styles.sayBox}>
              <Text style={styles.sayText}>{customerPriceSentence}</Text>
            </View>
          ) : null}

          {quote.distanceKm != null ? (
            <Text style={styles.meta}>
              Distance used for pricing: {quote.distanceKm.toFixed(1)} km{pricingSource ? ` from ${pricingSource}` : ''}
            </Text>
          ) : (
            <Text style={styles.warnMeta}>Pricing distance unavailable. Price used the fallback distance.</Text>
          )}

          {smartWarnings.length > 0 ? (
            <View style={styles.warningStack}>
              {smartWarnings.map((warning) => (
                <StatusBanner key={warning} kind="warn" message={warning} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {quote && showPaymentOptions ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Text style={styles.payLabel}>Choose payment</Text>
          <View style={{ gap: 8 }}>
            <AppButton
              label={`Pay deposit 15% (${formatGbp(deposit)})`}
              onPress={() => onChoosePayment('deposit')}
              variant={paymentChoice === 'deposit' ? 'primary' : 'secondary'}
              loading={paymentBusy && paymentChoice === 'deposit'}
              disabled={paymentBusy || dispatchedRefNumber !== null}
              fullWidth
            />
            <AppButton
              label={`Cash (${formatGbp(effectiveTotal)})`}
              onPress={() => onChoosePayment('cash')}
              variant={paymentChoice === 'cash' ? 'primary' : 'secondary'}
              loading={paymentBusy && paymentChoice === 'cash'}
              disabled={paymentBusy || dispatchedRefNumber !== null}
              fullWidth
            />
            <AppButton
              label={`Full payment (${formatGbp(effectiveTotal)})`}
              onPress={() => onChoosePayment('full')}
              variant={paymentChoice === 'full' ? 'primary' : 'secondary'}
              loading={paymentBusy && paymentChoice === 'full'}
              disabled={paymentBusy || dispatchedRefNumber !== null}
              fullWidth
            />
          </View>
          {paymentError ? (
            <View style={{ marginTop: 6 }}>
              <StatusBanner kind="err" message={paymentError} />
            </View>
          ) : null}
          {dispatchedRefNumber ? (
            <View style={{ marginTop: 6 }}>
              <StatusBanner
                kind="ok"
                message={
                  paymentLink
                    ? `${paymentLink.kind === 'deposit' ? 'Deposit' : 'Full'} payment link ready for ${dispatchedRefNumber}.`
                    : `Booking ${dispatchedRefNumber} created.`
                }
              />
            </View>
          ) : null}
          {afterPaymentSlot}
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  breakdown: {
    marginTop: 12,
    padding: 10,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    gap: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLabel: { color: colors.text, fontSize: fontSize.sm, flexShrink: 1, paddingRight: 8 },
  rowValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  totalLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  totalValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  finalRow: {
    backgroundColor: colors.infoBg,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  finalLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  finalValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  manualNoteText: {
    marginTop: 4,
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sayBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    borderRadius: radius.md,
    backgroundColor: colors.infoBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sayText: { color: colors.info, fontSize: fontSize.sm, fontWeight: '700', lineHeight: 19 },
  meta: { marginTop: 6, color: colors.subtle, fontSize: fontSize.xs },
  warnMeta: { marginTop: 6, color: colors.warning, fontSize: fontSize.xs, fontWeight: '700' },
  emptyHint: {
    marginTop: 12,
    color: colors.muted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  warningStack: { marginTop: 8, gap: 6 },
  payLabel: { color: colors.muted, fontWeight: '700', fontSize: fontSize.xs, letterSpacing: 1 },
});

~~~

## assisted-chat-app/src/components/quote/EditQuotePriceModal.tsx

~~~
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { formatGbp } from '@/lib/money';
import { ASSISTED_CHAT_PRICING_CONTEXT } from '@/lib/pricing-context';
import { ActionButton } from '../ui/ActionButton';
import { colors, fontSize, radius, space } from '../theme';
import type { AssistedChatQuoteBreakdown, QuickBookPatchResponse } from '@/types/assisted-chat';

const MIN_PRICE_GBP = 0.01;
const MAX_PRICE_GBP = 5000;
const MANUAL_PRICE_REASON = 'Manual admin price override';

interface EditQuotePriceModalProps {
  visible: boolean;
  /** Current displayed total in GBP (engine total + locking nut, or manual override if set). */
  currentPriceGbp: number;
  /** Engine base total in GBP (draft.quote.total) — used to compute the adminAdjustmentAmount delta. */
  engineBaseTotal: number;
  /** Existing quick_booking id; required for PATCH. Null disables editing. */
  quickBookingId: string | null;
  onClose: () => void;
  /** Called after a successful PATCH with the new manual price in GBP. */
  onSaved: (newPriceGbp: number, quote: AssistedChatQuoteBreakdown | null) => void;
}

function quoteFromQuickBookPatch(
  breakdown: QuickBookPatchResponse['booking']['priceBreakdown'],
  distanceKm: string | null,
): AssistedChatQuoteBreakdown | null {
  if (!breakdown) return null;

  return {
    subtotal: breakdown.subtotal,
    vatAmount: breakdown.vatAmount,
    total: breakdown.total,
    lineItems: breakdown.lineItems,
    distanceKm: distanceKm ? Number(distanceKm) : null,
    distanceMiles: breakdown.distanceMiles ?? null,
    fittingPrice: breakdown.fittingPrice ?? null,
    tyrePrice: breakdown.tyrePrice ?? null,
    totalPrice: breakdown.totalPrice ?? null,
    adminAdjustmentAmount: breakdown.adminAdjustmentAmount ?? null,
    adminAdjustmentReason: breakdown.adminAdjustmentReason ?? null,
    serviceOrigin: breakdown.serviceOrigin ?? null,
  };
}

function parsePrice(input: string): number | null {
  const trimmed = input.trim().replace(/[£\s,]/g, '');
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}

function validatePrice(input: string): { value: number | null; error: string | null } {
  const value = parsePrice(input);
  if (value === null) {
    return { value: null, error: 'Enter a valid amount in GBP, for example 120 or 89.50.' };
  }
  if (value <= 0) {
    return { value: null, error: 'Price must be greater than zero.' };
  }
  if (value < MIN_PRICE_GBP) {
    return { value: null, error: `Minimum price is ${formatGbp(MIN_PRICE_GBP)}.` };
  }
  if (value > MAX_PRICE_GBP) {
    return { value: null, error: `Maximum price is ${formatGbp(MAX_PRICE_GBP)}.` };
  }
  return { value, error: null };
}

export function EditQuotePriceModal({
  visible,
  currentPriceGbp,
  engineBaseTotal,
  quickBookingId,
  onClose,
  onSaved,
}: EditQuotePriceModalProps) {
  const [input, setInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      setInput(currentPriceGbp > 0 ? currentPriceGbp.toFixed(2) : '');
      setError(null);
      setSubmitError(null);
      setBusy(false);
    }
  }, [visible, currentPriceGbp]);

  const handleSubmit = async (): Promise<void> => {
    if (busy) return;
    setSubmitError(null);
    const result = validatePrice(input);
    if (result.error || result.value === null) {
      setError(result.error ?? 'Enter a valid amount.');
      return;
    }
    if (!quickBookingId) {
      setSubmitError('Manual price editing is not available in the current API response.');
      return;
    }
    setBusy(true);
    try {
      const delta = Math.round((result.value - engineBaseTotal) * 100) / 100;
      const patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${quickBookingId}`, {
        adminAdjustmentAmount: delta,
        adminAdjustmentReason: MANUAL_PRICE_REASON,
        pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
      });
      onSaved(result.value, quoteFromQuickBookPatch(patched.booking.priceBreakdown, patched.booking.distanceKm));
      onClose();
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to update price.';
      setSubmitError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (next: string): void => {
    setInput(next);
    if (error) setError(null);
    if (submitError) setSubmitError(null);
  };

  const editingBlockedReason = !quickBookingId
    ? 'Manual price editing is not available in the current API response.'
    : null;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Edit quote price</Text>
            <Text style={styles.helper}>
              Current price: <Text style={styles.helperStrong}>{formatGbp(currentPriceGbp)}</Text>
            </Text>
            <Text style={styles.helper}>
              This replaces the calculated total for this quote and is stored as an admin
              adjustment on the booking.
            </Text>

            <Text style={styles.label}>New price (GBP)</Text>
            <TextInput
              value={input}
              onChangeText={handleChange}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.subtle}
              editable={!busy && editingBlockedReason === null}
              style={styles.input}
              autoFocus
              accessibilityLabel="New quote price in GBP"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
            {editingBlockedReason ? <Text style={styles.warnText}>{editingBlockedReason}</Text> : null}

            <View style={styles.actions}>
              <ActionButton
                label="Cancel"
                variant="ghost"
                onPress={onClose}
                disabled={busy}
                fullWidth
              />
              <ActionButton
                label="Save price"
                variant="primary"
                onPress={() => { void handleSubmit(); }}
                loading={busy}
                loadingLabel="Saving..."
                disabled={editingBlockedReason !== null}
                disabledReason={editingBlockedReason ?? undefined}
                fullWidth
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'stretch',
    padding: space.md,
  },
  center: {
    width: '100%',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 10,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  helper: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 19 },
  helperStrong: { color: colors.text, fontWeight: '700' },
  label: {
    marginTop: 6,
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: fontSize.lg,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  errorText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600' },
  warnText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});

~~~

## assisted-chat-app/src/hooks/useAssistedChatDispatch.ts

~~~
import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ASSISTED_CHAT_PRICING_CONTEXT } from '@/lib/pricing-context';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  DepositCheckoutResponse,
  FinalizeResponse,
  StripePaymentLinkState,
} from '@/types/assisted-chat';

const LOCKING_NUT_REASON = 'Locking wheel nut removal';
const MANUAL_PRICE_REASON = 'Manual admin price override';

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface UseAssistedChatDispatchArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  lockingNutCharge: number;
  /**
   * Called once per successful finalize, AFTER the server confirms the real
   * booking and we've stored its `refNumber` on the draft. Use this to
   * append to local history, fire analytics, etc. Never called on
   * validation error, network error, 401/403/500, or duplicate-tap.
   */
  onBookingCreated?: (args: {
    response: FinalizeResponse;
    paymentChoice: AssistedChatPaymentChoice;
    effectiveTotal: number;
    paymentLink: StripePaymentLinkState | null;
  }) => void;
}

// Reuses the existing PATCH (for adminAdjustmentAmount) + POST /finalize flow.
// Choosing a payment IS the dispatch in the existing system — there is no
// separate "send-to-driver" endpoint; finalize creates the booking and
// transitions the quick_booking to dispatched. We mirror the web app exactly.
export function useAssistedChatDispatch({
  draft,
  update,
  lockingNutCharge,
  onBookingCreated,
}: UseAssistedChatDispatchArgs) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResponse | null>(null);
  const inflight = useRef(false);

  const choosePaymentAndDispatch = useCallback(
    async (choice: AssistedChatPaymentChoice) => {
      if (inflight.current) return;
      setError(null);
      setResult(null);
      if (!draft.quickBookingId || !draft.quote) {
        setError('Generate a price first.');
        return;
      }
      // التحقق من البريد الإلكتروني إذا طُلب إرسال تأكيد للعميل
      if (draft.customerEmailMode === 'send_customer_confirmation' && !draft.customer.email.trim()) {
        setError('Enter a valid customer email before sending confirmation.');
        return;
      }

      inflight.current = true;
      setBusy(true);
      update({ paymentChoice: choice });

      try {
        // Build the admin adjustment so the backend stores the price the
        // operator actually decided. Manual override wins over locking nut
        // because the operator's typed value is already the final charge.
        const existingAdjustmentAmount = finiteAmount(draft.quote.adminAdjustmentAmount);
        const backendBaseTotal = Math.round((draft.quote.total - existingAdjustmentAmount) * 100) / 100;
        let adjustmentAmount = 0;
        let adjustmentReason: string | null = null;
        if (draft.manualPriceGbp != null && Number.isFinite(draft.manualPriceGbp)) {
          adjustmentAmount = Math.round((draft.manualPriceGbp - backendBaseTotal) * 100) / 100;
          adjustmentReason = MANUAL_PRICE_REASON;
        } else if (
          lockingNutCharge > 0 &&
          (
            draft.quote.adminAdjustmentReason !== LOCKING_NUT_REASON ||
            Math.round(existingAdjustmentAmount * 100) !== Math.round(lockingNutCharge * 100)
          )
        ) {
          adjustmentAmount = lockingNutCharge;
          adjustmentReason = LOCKING_NUT_REASON;
        }
        if (adjustmentReason !== null) {
          await api.patch(`/api/admin/quick-book/${draft.quickBookingId}`, {
            adminAdjustmentAmount: adjustmentAmount,
            adminAdjustmentReason: adjustmentReason,
            pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
          });
        }

        const paymentMethod = choice === 'cash' ? 'cash' : choice === 'deposit' ? 'deposit' : 'stripe';
        const response = await api.post<FinalizeResponse>(`/api/admin/quick-book/${draft.quickBookingId}/finalize`, {
          paymentMethod,
          customerEmailMode: draft.customerEmailMode,
          ...(choice === 'deposit' ? { depositPercent: 0.15 } : {}),
        });

        let paymentLink: StripePaymentLinkState | null = null;
        if (choice === 'full' && response.paymentUrl) {
          paymentLink = {
            kind: 'full',
            paymentUrl: response.paymentUrl,
            amountPence: Math.round((response.breakdown?.total ?? draft.quote.total) * 100),
            remainingBalancePence: null,
            bookingId: response.bookingId,
            refNumber: response.refNumber,
            createdAtIso: new Date().toISOString(),
          };
        }

        if (choice === 'deposit') {
          const deposit = await api.post<DepositCheckoutResponse>(`/api/bookings/${response.bookingId}/deposit`, {
            mode: 'checkout',
          });
          if (deposit.checkoutUrl) {
            paymentLink = {
              kind: 'deposit',
              paymentUrl: deposit.checkoutUrl,
              amountPence: deposit.depositAmountPence,
              remainingBalancePence: deposit.remainingBalancePence,
              bookingId: response.bookingId,
              refNumber: response.refNumber,
              createdAtIso: new Date().toISOString(),
            };
          }
        }

        setResult(response);
        update({
          dispatchedRefNumber: response.refNumber,
          dispatchedBookingId: response.bookingId,
          paymentChoice: choice,
          paymentLink,
          quote: response.breakdown
            ? {
                subtotal: response.breakdown.subtotal,
                vatAmount: response.breakdown.vatAmount,
                total: response.breakdown.total,
                lineItems: response.breakdown.lineItems,
                distanceKm: draft.quote.distanceKm,
                distanceMiles: response.breakdown.distanceMiles ?? draft.quote.distanceMiles ?? null,
                fittingPrice: response.breakdown.fittingPrice ?? draft.quote.fittingPrice ?? null,
                tyrePrice: response.breakdown.tyrePrice ?? draft.quote.tyrePrice ?? null,
                totalPrice: response.breakdown.totalPrice ?? draft.quote.totalPrice ?? null,
                adminAdjustmentAmount: response.breakdown.adminAdjustmentAmount ?? draft.quote.adminAdjustmentAmount ?? null,
                adminAdjustmentReason: response.breakdown.adminAdjustmentReason ?? draft.quote.adminAdjustmentReason ?? null,
              }
            : draft.quote,
        });
        const backendTotal = response.breakdown?.total ?? draft.quote.total;
        onBookingCreated?.({
          response,
          paymentChoice: choice,
          effectiveTotal: backendTotal,
          paymentLink,
        });
      } catch (err) {
        // Stale quick_booking — wipe the dead id so the operator can
        // re-price/dispatch from a fresh session. The dispatch step itself
        // does not auto-create a new booking because totals/breakdowns must
        // be recomputed via Get Price first.
        if (err instanceof ApiError && err.status === 404) {
          update({
            quickBookingId: null,
            savedQuoteId: null,
            savedQuoteRef: null,
            quote: null,
            priceNeedsRefresh: true,
            manualPriceGbp: null,
            paymentChoice: null,
            paymentLink: null,
            dispatchedRefNumber: null,
            dispatchedBookingId: null,
          });
          setError('This quick booking session expired. Tap Get Price to start a new one before dispatching.');
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        setBusy(false);
        inflight.current = false;
      }
    },
    [draft, lockingNutCharge, onBookingCreated, update],
  );

  return { busy, error, result, setError, choosePaymentAndDispatch };
}

~~~

## assisted-chat-app/src/hooks/useAssistedChatLocationShare.ts

~~~
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { normalizeAssistedChatTyreSize } from '@/lib/assisted-chat-workflow';
import { ASSISTED_CHAT_PRICING_CONTEXT } from '@/lib/pricing-context';
import type {
  AssistedChatDraft,
  AssistedChatLocationMethod,
  AssistedChatQuoteBreakdown,
  QuickBookCreateResponse,
  QuickBookGetResponse,
  SendLinkResponse,
} from '@/types/assisted-chat';

const PLACEHOLDER_NAME = 'Walk-in customer';
const PLACEHOLDER_PHONE = '0000000000';

export type LocationShareMethod = 'copy' | 'whatsapp' | 'sms' | 'email';

export interface LocationShareMessage {
  kind: 'ok' | 'err' | 'info' | 'warn';
  text: string;
}

export interface LocationShareProgress {
  isPolling: boolean;
  lastPollAt: number | null;
  lastPollingError: string | null;
  staleReason: string | null;
}

interface UseAssistedChatLocationShareArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

function quoteFromBooking(booking: QuickBookCreateResponse['booking']): AssistedChatQuoteBreakdown | null {
  if (!booking.priceBreakdown) return null;
  return {
    subtotal: booking.priceBreakdown.subtotal,
    vatAmount: booking.priceBreakdown.vatAmount,
    total: booking.priceBreakdown.total,
    lineItems: booking.priceBreakdown.lineItems,
    serviceOrigin: booking.priceBreakdown.serviceOrigin ?? null,
    distanceKm: booking.distanceKm ? Number(booking.distanceKm) : null,
    distanceMiles: booking.priceBreakdown.distanceMiles ?? null,
    fittingPrice: booking.priceBreakdown.fittingPrice ?? null,
    tyrePrice: booking.priceBreakdown.tyrePrice ?? null,
    totalPrice: booking.priceBreakdown.totalPrice ?? null,
  };
}

export function useAssistedChatLocationShare({ draft, update }: UseAssistedChatLocationShareArgs) {
  const [busy, setBusy] = useState<LocationShareMethod | null>(null);
  const [message, setMessage] = useState<LocationShareMessage | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const [lastPollingError, setLastPollingError] = useState<string | null>(null);
  const [staleReason, setStaleReason] = useState<string | null>(null);

  const applyBooking = useCallback(
    (booking: QuickBookCreateResponse['booking'], extra?: Partial<AssistedChatDraft['location']>) => {
      const lat = booking.locationLat ? Number(booking.locationLat) : null;
      const lng = booking.locationLng ? Number(booking.locationLng) : null;
      const quote = quoteFromBooking(booking);
      update({
        quickBookingId: booking.id,
        location: {
          ...draft.location,
          ...extra,
          address: booking.locationAddress ?? extra?.address ?? draft.location.address,
          lat,
          lng,
          postcode: booking.locationPostcode ?? extra?.postcode ?? draft.location.postcode,
          status: lat != null && lng != null ? 'received' : extra?.status ?? draft.location.status,
        },
        quote: quote ?? draft.quote,
        priceNeedsRefresh: false,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
    },
    [draft.location, draft.quote, update],
  );

  const ensureQuickBooking = useCallback(
    async (method: AssistedChatLocationMethod): Promise<{ id: string; locationLink: string | null; whatsappLink: string | null }> => {
      if (draft.quickBookingId) {
        return {
          id: draft.quickBookingId,
          locationLink: draft.location.link,
          whatsappLink: draft.location.whatsappLink,
        };
      }
      const created = await api.post<QuickBookCreateResponse>('/api/admin/quick-book', {
        customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
        customerPhone: draft.customer.phone.trim() || PLACEHOLDER_PHONE,
        customerEmail: draft.customer.email.trim() || undefined,
        locationMethod: method,
        locationAddress: method === 'address' ? draft.location.address : undefined,
        locationLat: method === 'address' && draft.location.lat != null ? draft.location.lat : undefined,
        locationLng: method === 'address' && draft.location.lng != null ? draft.location.lng : undefined,
        serviceType: 'fit',
        tyreSize: normalizeAssistedChatTyreSize(draft.tyre.size) ?? undefined,
        tyreCount: draft.tyre.quantity,
        pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
        notes: draft.note || undefined,
      });
      applyBooking(created.booking, {
        method,
        link: created.locationLink,
        whatsappLink: created.whatsappLink,
        status: method === 'link' ? 'pending' : created.booking.locationLat ? 'received' : 'idle',
      });
      return {
        id: created.booking.id,
        locationLink: created.locationLink,
        whatsappLink: created.whatsappLink,
      };
    },
    [applyBooking, draft],
  );

  const requestLink = useCallback(
    async (method: LocationShareMethod) => {
      setMessage(null);
      setLastPollingError(null);
      setStaleReason(null);
      setBusy(method);
      try {
        const ensured = await ensureQuickBooking('link');
        const result = await api.post<SendLinkResponse>('/api/admin/quick-book/send-link', {
          quickBookingId: ensured.id,
          method,
        });
        if (!result.ok && result.error) {
          setMessage({ kind: 'err', text: result.error });
          return;
        }

        const rawLocationLink = method === 'copy' ? result.link ?? ensured.locationLink : ensured.locationLink;
        const whatsappLink = method === 'whatsapp' ? result.link ?? ensured.whatsappLink : ensured.whatsappLink;
        update({
          location: {
            ...draft.location,
            method: 'link',
            link: rawLocationLink,
            whatsappLink,
            status: 'pending',
          },
          ...(draft.quote || draft.priceNeedsRefresh
            ? { quote: null, priceNeedsRefresh: true, paymentChoice: null, paymentLink: null, dispatchedRefNumber: null, dispatchedBookingId: null }
            : {}),
        });

        const linkToCopy = rawLocationLink ?? result.link ?? '';
        if (method === 'copy') {
          const ok = await copyToClipboard(result.message ?? result.link ?? '');
          setMessage({ kind: ok ? 'ok' : 'err', text: ok ? 'Location message copied.' : 'Could not copy location message.' });
        } else if (method === 'whatsapp' && result.link) {
          const copied = linkToCopy ? await copyToClipboard(linkToCopy) : false;
          await Linking.openURL(result.link);
          setMessage({ kind: 'ok', text: copied ? 'WhatsApp opened and link copied.' : 'WhatsApp opened.' });
        } else if (method === 'sms') {
          const copied = linkToCopy ? await copyToClipboard(linkToCopy) : false;
          setMessage({ kind: 'ok', text: copied ? `${result.message ?? 'SMS sent successfully.'} Link copied.` : result.message ?? 'SMS sent successfully.' });
        } else if (method === 'email') {
          const copied = linkToCopy ? await copyToClipboard(linkToCopy) : false;
          setMessage({ kind: 'ok', text: copied ? `${result.message ?? 'Email sent successfully.'} Link copied.` : result.message ?? 'Email sent successfully.' });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setIsPolling(false);
          setStaleReason('Request expired or no longer available.');
          update({
            quickBookingId: null,
            location: {
              ...draft.location,
              link: null,
              whatsappLink: null,
              status: 'idle',
            },
            savedQuoteId: null,
            savedQuoteRef: null,
            quote: null,
            priceNeedsRefresh: false,
            paymentChoice: null,
            paymentLink: null,
            dispatchedRefNumber: null,
            dispatchedBookingId: null,
          });
          setMessage({
            kind: 'err',
            text: 'This quick booking session expired. Tap the action again to start a new one.',
          });
        } else {
          setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Location link action failed.' });
        }
      } finally {
        setBusy(null);
      }
    },
    [draft.location, draft.priceNeedsRefresh, draft.quote, ensureQuickBooking, update],
  );

  useEffect(() => {
    if (draft.location.method !== 'link' || draft.location.status !== 'pending' || !draft.quickBookingId) {
      setIsPolling(false);
      return;
    }
    let cancelled = false;
    setIsPolling(true);
    setLastPollingError(null);
    const interval = setInterval(async () => {
      setLastPollAt(Date.now());
      try {
        const data = await api.get<QuickBookGetResponse>(`/api/admin/quick-book/${draft.quickBookingId}`);
        if (cancelled) return;
        if (data.booking.locationLat && data.booking.locationLng) {
          setIsPolling(false);
          setLastPollingError(null);
          setStaleReason(null);
          applyBooking(data.booking, { method: 'link' });
          setMessage({ kind: 'ok', text: 'Location shared by customer.' });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          if (cancelled) return;
          clearInterval(interval);
          setIsPolling(false);
          setStaleReason('Request expired or no longer available.');
          update({
            quickBookingId: null,
            location: {
              ...draft.location,
              link: null,
              whatsappLink: null,
              status: 'idle',
            },
            savedQuoteId: null,
            savedQuoteRef: null,
            quote: null,
            priceNeedsRefresh: false,
            paymentChoice: null,
            paymentLink: null,
            dispatchedRefNumber: null,
            dispatchedBookingId: null,
          });
          setMessage({
            kind: 'err',
            text: 'This quick booking session expired. Send a new location link.',
          });
        } else {
          setLastPollingError('Could not check the location just now. We will keep listening.');
        }
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applyBooking, draft.location, draft.quickBookingId, update]);

  return {
    busy,
    message,
    isPolling,
    lastPollAt,
    lastPollingError,
    staleReason,
    setMessage,
    requestLink,
  };
}

~~~

## assisted-chat-app/src/hooks/useAssistedChatPrice.ts

~~~
import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { normalizeAssistedChatTyreSize } from '@/lib/assisted-chat-workflow';
import { ASSISTED_CHAT_PRICING_CONTEXT } from '@/lib/pricing-context';
import type {
  AssistedChatDraft,
  AssistedChatQuoteBreakdown,
  QuickBookCreateResponse,
  QuickBookPatchResponse,
} from '@/types/assisted-chat';

const PLACEHOLDER_NAME = 'Walk-in customer';
const PLACEHOLDER_PHONE = '0000000000';
const LOCKING_NUT_REASON = 'Locking wheel nut removal';
const QUOTE_STAGE_LABELS = ['Checking stock', 'Calculating price', 'Saving quote'] as const;
const QUOTE_STAGE_MS = 450;

export interface UseAssistedChatPriceArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

export function useAssistedChatPrice({ draft, update }: UseAssistedChatPriceArgs) {
  const [loading, setLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const runStagedDelay = useCallback(() => {
    return new Promise<void>((resolve) => {
      let stage = 0;
      setStageIdx(0);
      const tick = () => {
        stage += 1;
        if (stage >= QUOTE_STAGE_LABELS.length) {
          resolve();
          return;
        }
        setStageIdx(stage);
        setTimeout(tick, QUOTE_STAGE_MS);
      };
      setTimeout(tick, QUOTE_STAGE_MS);
    });
  }, []);

  const applyQuote = useCallback(
    (
      quickBookingId: string,
      breakdown: QuickBookCreateResponse['booking']['priceBreakdown'],
      distanceKm: string | null,
    ) => {
      if (!breakdown) {
        setError('Pricing engine returned no breakdown.');
        return;
      }

      const quote: AssistedChatQuoteBreakdown = {
        subtotal: breakdown.subtotal,
        vatAmount: breakdown.vatAmount,
        total: breakdown.total,
        lineItems: breakdown.lineItems,
        serviceOrigin: breakdown.serviceOrigin ?? null,
        distanceKm: distanceKm ? Number(distanceKm) : null,
        distanceMiles: breakdown.distanceMiles ?? null,
        fittingPrice: breakdown.fittingPrice ?? null,
        tyrePrice: breakdown.tyrePrice ?? null,
        totalPrice: breakdown.totalPrice ?? null,
        adminAdjustmentAmount: breakdown.adminAdjustmentAmount ?? null,
        adminAdjustmentReason: breakdown.adminAdjustmentReason ?? null,
      };

      // Note: `manualPriceGbp` is deliberately preserved across re-pricing.
      // Only EditQuotePriceModal (or a 404 reset) can change/clear it; the
      // operator's typed final price must survive a fresh engine recalc.
      update({
        quickBookingId,
        savedQuoteId: null,
        savedQuoteRef: null,
        quote,
        priceNeedsRefresh: false,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
    },
    [update],
  );

  const getPrice = useCallback(async () => {
    if (inflight.current) return;
    setError(null);

    const normalizedTyreSize = normalizeAssistedChatTyreSize(draft.tyre.size);
    if (!normalizedTyreSize) {
      setError('Enter a valid tyre size before pricing.');
      return;
    }
    if (draft.tyre.quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    if (draft.lockingNut.answer === 'no') {
      const charge = draft.lockingNut.chargeGbp;
      if (charge == null || !Number.isFinite(charge) || charge < 0) {
        setError('Enter a valid GBP amount for the locking wheel nut removal charge.');
        return;
      }
    }
    if (draft.location.lat == null || draft.location.lng == null) {
      setError(
        draft.location.method === 'link'
          ? 'Wait for the customer to share their location before pricing.'
          : 'Select the customer address from the suggestions before pricing.',
      );
      return;
    }

    const lockingNutCharge =
      draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null
        ? draft.lockingNut.chargeGbp
        : 0;
    const adjustmentPayload =
      lockingNutCharge > 0
        ? {
            adminAdjustmentAmount: lockingNutCharge,
            adminAdjustmentReason: LOCKING_NUT_REASON,
          }
        : {
            adminAdjustmentAmount: 0,
            adminAdjustmentReason: null,
          };

    inflight.current = true;
    setLoading(true);
    setStageIdx(0);

    try {
      const apiCall = (async () => {
        if (!draft.quickBookingId) {
          const created = await api.post<QuickBookCreateResponse>('/api/admin/quick-book', {
            customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
            customerPhone: draft.customer.phone.trim() || PLACEHOLDER_PHONE,
            customerEmail: draft.customer.email.trim() || undefined,
            customerEmailMode: draft.customerEmailMode,
            locationMethod: draft.location.method,
            locationAddress: draft.location.address || undefined,
            locationLat: draft.location.lat,
            locationLng: draft.location.lng,
            serviceType: 'fit',
            tyreSize: normalizedTyreSize,
            tyreCount: draft.tyre.quantity,
            ...adjustmentPayload,
            pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
            notes: draft.note || undefined,
          });
          return {
            quickBookingId: created.booking.id,
            breakdown: created.booking.priceBreakdown,
            distanceKm: created.booking.distanceKm,
          };
        }

        const patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${draft.quickBookingId}`, {
          customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
          customerPhone: draft.customer.phone.trim() || PLACEHOLDER_PHONE,
          locationLat: draft.location.lat,
          locationLng: draft.location.lng,
          locationAddress: draft.location.address || null,
          locationPostcode: draft.location.postcode || null,
          tyreSize: normalizedTyreSize,
          tyreCount: draft.tyre.quantity,
          notes: draft.note || null,
          ...adjustmentPayload,
          pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
        });
        return {
          quickBookingId: draft.quickBookingId,
          breakdown: patched.booking.priceBreakdown,
          distanceKm: patched.booking.distanceKm,
        };
      })();

      const [result] = await Promise.all([apiCall, runStagedDelay()]);
      applyQuote(result.quickBookingId, result.breakdown, result.distanceKm);
    } catch (err) {
      // Stale quick_booking row (deleted by another admin, expired cleanup,
      // or wiped DB in dev) — clear the saved id so the next press creates
      // a fresh one. Never crash, never loop.
      if (err instanceof ApiError && err.status === 404 && draft.quickBookingId) {
        update({
          quickBookingId: null,
          savedQuoteId: null,
          savedQuoteRef: null,
          quote: null,
          priceNeedsRefresh: true,
          manualPriceGbp: null,
          paymentChoice: null,
          paymentLink: null,
          dispatchedRefNumber: null,
          dispatchedBookingId: null,
        });
        setError('This quick booking session expired. Tap Get Price again to start a new one.');
      } else if (err instanceof ApiError && err.status === 422) {
        update({
          quote: null,
          priceNeedsRefresh: true,
          paymentChoice: null,
          paymentLink: null,
          dispatchedRefNumber: null,
          dispatchedBookingId: null,
        });
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
      setStageIdx(-1);
      inflight.current = false;
    }
  }, [draft, applyQuote, runStagedDelay, update]);

  return {
    getPrice,
    loading,
    stageIdx,
    stageLabels: QUOTE_STAGE_LABELS,
    error,
    setError,
  };
}

~~~

## assisted-chat-app/src/hooks/useAssistedChatQuoteActions.ts

~~~
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';
import { ASSISTED_CHAT_PRICING_CONTEXT } from '@/lib/pricing-context';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  AssistedChatQuoteBreakdown,
  QuickBookPatchResponse,
} from '@/types/assisted-chat';
import type {
  AdminQuote,
  AdminQuotePaymentOption,
  AdminQuoteResponse,
  ConfirmAdminQuoteResponse,
  CreateAdminQuoteInput,
  UpdateAdminQuoteInput,
} from '@/types/admin-quotes';

interface UseAssistedChatQuoteActionsArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  effectiveTotal: number;
  lockingNutCharge: number;
}

const LOCKING_NUT_REASON = 'Locking wheel nut removal';
const MANUAL_PRICE_REASON = 'Manual admin price override';

export interface QuoteActionMessage {
  kind: 'ok' | 'err' | 'info';
  text: string;
}

function paymentOptionToDispatchChoice(option: AdminQuotePaymentOption): AssistedChatPaymentChoice {
  if (option === 'DEPOSIT_15') return 'deposit';
  if (option === 'CASH_ON_ARRIVAL') return 'cash';
  return 'full';
}

function dispatchChoiceToPaymentOption(choice: AssistedChatPaymentChoice | null): AdminQuotePaymentOption | null {
  if (choice === 'deposit') return 'DEPOSIT_15';
  if (choice === 'cash') return 'CASH_ON_ARRIVAL';
  if (choice === 'full') return 'FULL_PAYMENT';
  return null;
}

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function quoteFromQuickBookPatch(
  breakdown: QuickBookPatchResponse['booking']['priceBreakdown'],
  distanceKm: string | null,
): AssistedChatQuoteBreakdown {
  if (!breakdown) {
    throw new Error('Pricing engine returned no breakdown.');
  }

  return {
    subtotal: breakdown.subtotal,
    vatAmount: breakdown.vatAmount,
    total: breakdown.total,
    lineItems: breakdown.lineItems,
    distanceKm: distanceKm ? Number(distanceKm) : null,
    distanceMiles: breakdown.distanceMiles ?? null,
    fittingPrice: breakdown.fittingPrice ?? null,
    tyrePrice: breakdown.tyrePrice ?? null,
    totalPrice: breakdown.totalPrice ?? null,
    adminAdjustmentAmount: breakdown.adminAdjustmentAmount ?? null,
    adminAdjustmentReason: breakdown.adminAdjustmentReason ?? null,
    serviceOrigin: breakdown.serviceOrigin ?? null,
  };
}

function getBackendPriceAmountPence(draft: AssistedChatDraft, fallbackTotal: number): number {
  const total =
    typeof draft.quote?.total === 'number' && Number.isFinite(draft.quote.total)
      ? draft.quote.total
      : fallbackTotal;
  return Math.round(total * 100);
}

function buildQuoteInput(draft: AssistedChatDraft, priceAmountPence: number, lockingNutCharge: number): CreateAdminQuoteInput {
  return {
    quickBookingId: draft.quickBookingId,
    customerName: draft.customer.name || null,
    customerPhone: draft.customer.phone || null,
    address: draft.location.address || null,
    postcode: draft.location.postcode,
    latitude: draft.location.lat,
    longitude: draft.location.lng,
    tyreSize: draft.tyre.size || null,
    quantity: draft.tyre.quantity,
    lockingWheelNutStatus: draft.lockingNut.answer,
    lockingWheelNutChargePence: Math.round(lockingNutCharge * 100),
    priceAmount: priceAmountPence,
    currency: 'GBP',
    quoteStatus: 'QUOTED',
    internalNotes: draft.note || null,
  };
}

export function useAssistedChatQuoteActions({
  draft,
  update,
  effectiveTotal,
  lockingNutCharge,
}: UseAssistedChatQuoteActionsArgs) {
  const [busy, setBusy] = useState<'save' | 'send' | 'confirm' | 'copy' | 'instruction' | null>(null);
  const [message, setMessage] = useState<QuoteActionMessage | null>(null);
  const [currentQuote, setCurrentQuote] = useState<AdminQuote | null>(null);
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<AdminQuotePaymentOption>('FULL_PAYMENT');
  const [confirmResult, setConfirmResult] = useState<ConfirmAdminQuoteResponse | null>(null);

  useEffect(() => {
    if (currentQuote?.selectedPaymentOption) return;
    const draftPaymentOption = dispatchChoiceToPaymentOption(draft.paymentChoice);
    if (draftPaymentOption && draftPaymentOption !== selectedPaymentOption) {
      setSelectedPaymentOption(draftPaymentOption);
    }
  }, [currentQuote?.selectedPaymentOption, draft.paymentChoice, selectedPaymentOption]);

  const selectPaymentOption = useCallback(
    (option: AdminQuotePaymentOption) => {
      setSelectedPaymentOption(option);
      update({ paymentChoice: paymentOptionToDispatchChoice(option) });
    },
    [update],
  );

  const persistQuote = useCallback(
    (quote: AdminQuote) => {
      setCurrentQuote(quote);
      if (quote.selectedPaymentOption) {
        setSelectedPaymentOption(quote.selectedPaymentOption);
        update({
          savedQuoteId: quote.id,
          savedQuoteRef: quote.quoteRef,
          paymentChoice: paymentOptionToDispatchChoice(quote.selectedPaymentOption),
        });
        return;
      }
      update({ savedQuoteId: quote.id, savedQuoteRef: quote.quoteRef });
    },
    [update],
  );

  const saveQuote = useCallback(async (): Promise<AdminQuote> => {
    if (!draft.quote) throw new Error('Get price before saving a quote.');

    let canonicalDraft = draft;
    if (draft.quickBookingId) {
      const existingAdjustmentAmount = finiteAmount(draft.quote.adminAdjustmentAmount);
      const backendBaseTotal = Math.round((draft.quote.total - existingAdjustmentAmount) * 100) / 100;
      let adjustmentAmount = 0;
      let adjustmentReason: string | null = null;

      if (draft.manualPriceGbp != null && Number.isFinite(draft.manualPriceGbp)) {
        adjustmentAmount = Math.round((draft.manualPriceGbp - backendBaseTotal) * 100) / 100;
        adjustmentReason = MANUAL_PRICE_REASON;
      } else if (lockingNutCharge > 0) {
        adjustmentAmount = lockingNutCharge;
        adjustmentReason = LOCKING_NUT_REASON;
      }

      const needsPatch =
        Math.round(existingAdjustmentAmount * 100) !== Math.round(adjustmentAmount * 100) ||
        (draft.quote.adminAdjustmentReason ?? null) !== adjustmentReason;

      if (needsPatch) {
        const patched = await api.patch<QuickBookPatchResponse>(`/api/admin/quick-book/${draft.quickBookingId}`, {
          adminAdjustmentAmount: adjustmentAmount,
          adminAdjustmentReason: adjustmentReason,
          pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
        });
        const quote = quoteFromQuickBookPatch(patched.booking.priceBreakdown, patched.booking.distanceKm);
        canonicalDraft = { ...draft, quote, priceNeedsRefresh: false };
        update({ quote, priceNeedsRefresh: false });
      }
    }

    const input = buildQuoteInput(
      canonicalDraft,
      getBackendPriceAmountPence(canonicalDraft, effectiveTotal),
      lockingNutCharge,
    );
    if (draft.savedQuoteId) {
      const patch: UpdateAdminQuoteInput = { ...input };
      const response = await api.patch<AdminQuoteResponse>(`/api/admin/quotes/${draft.savedQuoteId}`, patch);
      return response.quote;
    }
    const response = await api.post<AdminQuoteResponse>('/api/admin/quotes', input);
    return response.quote;
  }, [draft, effectiveTotal, lockingNutCharge, update]);

  const handleSave = useCallback(async () => {
    setBusy('save');
    setMessage({ kind: 'info', text: 'Saving quote...' });
    try {
      const quote = await saveQuote();
      persistQuote(quote);
      setMessage({ kind: 'ok', text: `Quote ${quote.quoteRef} saved.` });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && draft.savedQuoteId) {
        update({ savedQuoteId: null, savedQuoteRef: null });
        setMessage({ kind: 'err', text: 'Saved quote not found. The stale reference was removed.' });
      } else {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to save quote.' });
      }
    } finally {
      setBusy(null);
    }
  }, [draft.savedQuoteId, persistQuote, saveQuote, update]);

  const ensureSavedQuote = useCallback(async (): Promise<AdminQuote> => {
    if (currentQuote) return currentQuote;
    const quote = await saveQuote();
    persistQuote(quote);
    return quote;
  }, [currentQuote, persistQuote, saveQuote]);

  const sendQuote = useCallback(async () => {
    setBusy('send');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const copied = await copyToClipboard(quote.whatsappMessage);
      const url = buildWhatsAppUrl(draft.customer.phone, quote.whatsappMessage);
      if (url) {
        await Linking.openURL(url).catch(() => undefined);
      }
      setMessage(
        copied
          ? { kind: 'ok', text: `Quote ${quote.quoteRef} message copied.` }
          : { kind: 'err', text: 'Could not copy WhatsApp message.' },
      );
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to send quote.' });
    } finally {
      setBusy(null);
    }
  }, [draft.customer.phone, ensureSavedQuote]);

  const confirmQuote = useCallback(async () => {
    setBusy('confirm');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const response = await api.post<ConfirmAdminQuoteResponse>(`/api/admin/quotes/${quote.id}/confirm`, {
        selectedPaymentOption,
        operatorNote: draft.note || null,
      });
      persistQuote(response.quote);
      setConfirmResult(response);
      update({ paymentChoice: paymentOptionToDispatchChoice(response.selectedPaymentOption ?? selectedPaymentOption) });
      setMessage({
        kind: 'ok',
        text: response.alreadyConfirmed
          ? `Quote ${response.quote.quoteRef} was already confirmed.`
          : `Quote ${response.quote.quoteRef} confirmed by phone.`,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        update({ savedQuoteId: null, savedQuoteRef: null });
        setCurrentQuote(null);
        setMessage({ kind: 'err', text: 'Quote not found. The stale reference was removed.' });
      } else {
        setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to confirm quote.' });
      }
    } finally {
      setBusy(null);
    }
  }, [draft.note, ensureSavedQuote, persistQuote, selectedPaymentOption, update]);

  const copyConfirmedMessage = useCallback(async () => {
    setBusy('copy');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const text = confirmResult?.whatsappMessage ?? quote.confirmationWhatsAppMessages[selectedPaymentOption];
      const ok = await copyToClipboard(text);
      setMessage(ok ? { kind: 'ok', text: 'Quote message copied.' } : { kind: 'err', text: 'Could not copy WhatsApp message.' });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to copy message.' });
    } finally {
      setBusy(null);
    }
  }, [confirmResult, ensureSavedQuote, selectedPaymentOption]);

  const copyPaymentInstruction = useCallback(async () => {
    setBusy('instruction');
    setMessage(null);
    try {
      const quote = await ensureSavedQuote();
      const text = confirmResult?.paymentInstruction ?? quote.confirmationWhatsAppMessages.PAYMENT_LINK;
      const ok = await copyToClipboard(text);
      setMessage(ok ? { kind: 'ok', text: 'Payment instructions copied.' } : { kind: 'err', text: 'Could not copy payment instructions.' });
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Failed to copy payment instructions.' });
    } finally {
      setBusy(null);
    }
  }, [confirmResult, ensureSavedQuote]);

  const acceptExternalQuote = useCallback(
    (quote: AdminQuote) => {
      setConfirmResult(null);
      setCurrentQuote(quote);
      if (quote.selectedPaymentOption) {
        setSelectedPaymentOption(quote.selectedPaymentOption);
        update({ paymentChoice: paymentOptionToDispatchChoice(quote.selectedPaymentOption) });
      } else {
        setSelectedPaymentOption('FULL_PAYMENT');
        update({ paymentChoice: null });
      }
    },
    [update],
  );

  return {
    busy,
    message,
    currentQuote,
    selectedPaymentOption,
    confirmResult,
    setMessage,
    selectPaymentOption,
    saveQuote: handleSave,
    sendQuote,
    confirmQuote,
    copyConfirmedMessage,
    copyPaymentInstruction,
    acceptExternalQuote,
  };
}

~~~

## assisted-chat-app/src/lib/customer-message.ts

~~~
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
} from '@/types/assisted-chat';
import { formatGbp } from './money';

/**
 * Templates the operator-side customer messages. Pure, deterministic, and
 * intentionally NOT a hook — easy to unit-test and reuse in copy/WhatsApp
 * actions. Only fields that exist on the draft are emitted; missing fields
 * are skipped so the customer never sees "undefined" / "null".
 *
 */

export interface CustomerMessageInput {
  draft: AssistedChatDraft;
  effectiveTotal: number;
  paymentChoice?: AssistedChatPaymentChoice | null;
}

const PAYMENT_INTRO: Record<AssistedChatPaymentChoice, string> = {
  deposit:
    'Your booking is ready. Please pay the 15% deposit to confirm your tyre fitting.',
  cash:
    'Your booking has been created. Payment will be collected in cash.',
  full:
    'Your booking is ready. Please complete the full payment to confirm your tyre fitting.',
};

/**
 * Build the customer-facing message body. Falls back to a generic "Hi, this
 * is Tyre Rescue." opener when no payment choice has been made yet (so the
 * header WhatsApp button can still send something useful pre-payment).
 */
export function buildCustomerMessage(input: CustomerMessageInput): string {
  const { draft, effectiveTotal, paymentChoice } = input;
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  if (paymentChoice) {
    lines.push(PAYMENT_INTRO[paymentChoice]);
  } else if (draft.dispatchedRefNumber) {
    lines.push('Your booking has been created.');
  } else {
    lines.push('Here are your booking details so far.');
  }

  const detail: string[] = [];
  if (draft.dispatchedRefNumber) {
    detail.push(`Reference: ${draft.dispatchedRefNumber}`);
  }
  if (draft.tyre.size) {
    detail.push(`Tyres: ${draft.tyre.quantity} x ${draft.tyre.size}`);
  } else if (draft.tyre.quantity) {
    detail.push(`Quantity: ${draft.tyre.quantity}`);
  }
  if (draft.location.address) {
    detail.push(`Address: ${draft.location.address}`);
  }
  if (draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null) {
    detail.push(`Locking wheel nut removal: ${formatGbp(draft.lockingNut.chargeGbp)}`);
  }
  if (draft.quote && Number.isFinite(effectiveTotal) && effectiveTotal > 0) {
    detail.push(`Total to pay: ${formatGbp(effectiveTotal)}`);
  }
  if (draft.paymentLink) {
    detail.push(
      draft.paymentLink.kind === 'deposit'
        ? `Deposit link: ${draft.paymentLink.paymentUrl}`
        : `Payment link: ${draft.paymentLink.paymentUrl}`,
    );
  }

  if (detail.length) {
    lines.push('');
    lines.push(...detail);
  }
  return lines.join('\n');
}

/**
 * Build a `wa.me` URL for the supplied UK-leaning phone number, normalizing
 * a leading 0 to the +44 country code. Returns `null` when no usable digits
 * are present so callers can disable the button.
 */
export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const raw = phone ?? '';
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return null;
  let normalized: string;
  if (raw.trim().startsWith('+')) normalized = digits;
  else if (digits.startsWith('44')) normalized = digits;
  else if (digits.startsWith('0')) normalized = `44${digits.slice(1)}`;
  else normalized = digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

~~~

## assisted-chat-app/src/lib/pricing-context.ts

~~~
export const ASSISTED_CHAT_PRICING_CONTEXT = 'emergency_mobile_fitting' as const;

~~~

## components/admin/assisted-chat/AssistedChatPage.tsx

~~~
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
  Textarea,
  VStack,
  type ButtonProps,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps } from '@/lib/design-tokens';
import { QuickBookMap } from '@/components/admin/quick-book/QuickBookMap';
import { AdminQuotePanel } from '@/components/admin/assisted-chat/AdminQuotePanel';
import { useAssistedChatDraft } from '@/lib/hooks/useAssistedChatDraft';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  AssistedChatQuoteBreakdown,
  AssistedChatQuoteLine,
  AssistedChatServiceOrigin,
  LockingNutAnswer,
} from '@/types/admin-assisted-chat';
import type { AdminQuote } from '@/types/admin-quotes';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const PLACEHOLDER_NAME = 'Walk-in customer';
const PLACEHOLDER_PHONE = '0000000000';
const LOCKING_NUT_REASON = 'Locking wheel nut removal';

const QUOTE_STAGE_LABELS: readonly string[] = [
  'Checking stock',
  'Checking distance',
  'Calculating callout',
  'Preparing quote',
];
const QUOTE_STAGE_MS = 850; // ~3.4s minimum across the four stages

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
  context?: { id: string; text: string }[];
}

interface TyreSizeSuggestion {
  size: string;
  count: number;
}

interface QuickBookCreateResponse {
  booking: {
    id: string;
    distanceKm: string | null;
    totalPrice: string | null;
    basePrice: string | null;
    priceBreakdown: {
      lineItems: AssistedChatQuoteLine[];
      subtotal: number;
      vatAmount: number;
      total: number;
      adminAdjustmentAmount?: number | null;
      adminAdjustmentReason?: string | null;
      serviceOrigin?: AssistedChatServiceOrigin | null;
    } | null;
  };
}

interface QuickBookPatchResponse {
  booking: {
    id: string;
    totalPrice: string | null;
    basePrice: string | null;
    distanceKm: string | null;
    priceBreakdown: {
      lineItems: AssistedChatQuoteLine[];
      subtotal: number;
      vatAmount: number;
      total: number;
      adminAdjustmentAmount?: number | null;
      adminAdjustmentReason?: string | null;
      serviceOrigin?: AssistedChatServiceOrigin | null;
    } | null;
  };
}

interface FinalizeResponse {
  bookingId: string;
  refNumber: string;
  paymentMethod: 'stripe' | 'cash' | 'deposit';
  paymentUrl: string | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
}

interface DepositResponse {
  clientSecret: string;
  depositAmount: number;
  remainingBalance: number;
}

interface SendLinkResponse {
  ok: boolean;
  method: 'sms' | 'whatsapp' | 'email' | 'copy';
  message?: string;
  link?: string;
  error?: string;
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const r = payload as Record<string, unknown>;
  if (typeof r.error === 'string' && r.error.trim()) return r.error;
  if (typeof r.message === 'string' && r.message.trim()) return r.message;
  return fallback;
}

/**
 * Mirrors lib/voodoo-sms.ts normalizeUkPhoneNumber — kept client-side so we
 * can disable the SMS button without a network round-trip.
 */
function isValidUkPhone(input: string): boolean {
  if (!input) return false;
  const digits = input.replace(/[^\d+]/g, '');
  if (/^07\d{9}$/.test(digits)) return true;
  if (/^\+447\d{9}$/.test(digits)) return true;
  if (/^447\d{9}$/.test(digits)) return true;
  if (/^0[12]\d{8,9}$/.test(digits)) return true;
  return false;
}

// ──────────────────────────────────────────────────────────
// Shared button styles — explicit hover/active/focus/disabled
// to remove the Chakra default focus ring + WebKit tap white flash.
// ──────────────────────────────────────────────────────────

const baseButtonShared: Pick<
  ButtonProps,
  'h' | 'borderRadius' | 'fontWeight' | 'transition' | '_focus' | '_focusVisible' | '_disabled'
> = {
  h: '44px',
  borderRadius: '8px',
  fontWeight: '600',
  transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  _focus: { boxShadow: 'none', outline: 'none' },
  _focusVisible: {
    boxShadow: `0 0 0 2px ${c.bg}, 0 0 0 4px ${c.accent}`,
    outline: 'none',
  },
  _disabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
    bg: c.card,
    color: c.muted,
    borderColor: c.border,
    _hover: { bg: c.card, color: c.muted, borderColor: c.border },
  },
};

const primaryButton: ButtonProps = {
  ...baseButtonShared,
  bg: c.accent,
  color: '#09090B',
  borderWidth: '1px',
  borderColor: c.accent,
  _hover: { bg: c.accentHover, color: '#09090B', borderColor: c.accentHover },
  _active: {
    bg: c.accentHover,
    color: '#09090B',
    borderColor: c.accentHover,
    transform: 'translateY(1px)',
  },
};

const secondaryButton: ButtonProps = {
  ...baseButtonShared,
  bg: c.card,
  color: c.text,
  borderWidth: '1px',
  borderColor: c.border,
  _hover: { bg: '#2F2F33', color: c.text, borderColor: '#52525B' },
  _active: { bg: c.surface, color: c.text, borderColor: c.border, transform: 'translateY(1px)' },
};

const ghostButton: ButtonProps = {
  ...baseButtonShared,
  bg: 'transparent',
  color: c.muted,
  borderWidth: '1px',
  borderColor: c.border,
  _hover: { bg: c.card, color: c.text, borderColor: '#52525B' },
  _active: { bg: c.surface, color: c.text, borderColor: c.border, transform: 'translateY(1px)' },
};

interface ChatLine {
  who: 'system' | 'admin';
  body: React.ReactNode;
}

export function AssistedChatPage() {
  const { draft, hydrated, update, clear } = useAssistedChatDraft();

  // Local UI-only state (not persisted)
  const [phoneInput, setPhoneInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [tyreSizeInput, setTyreSizeInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [lockingNutChargeInput, setLockingNutChargeInput] = useState('');
  const [locationLink, setLocationLink] = useState<string | null>(null);

  // Sync local inputs with hydrated draft (one-shot on hydrate)
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || syncedRef.current) return;
    syncedRef.current = true;
    setPhoneInput(draft.customer.phone);
    setAddressInput(draft.location.label);
    setTyreSizeInput(draft.tyre.size);
    setNoteInput(draft.note);
    if (draft.lockingNut.chargeGbp != null) {
      setLockingNutChargeInput(String(draft.lockingNut.chargeGbp));
    }
  }, [hydrated, draft]);

  // Address autocomplete
  const [addrSuggestions, setAddrSuggestions] = useState<MapboxFeature[]>([]);
  const [showAddrSuggestions, setShowAddrSuggestions] = useState(false);
  const [addrSearching, setAddrSearching] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tyre autocomplete
  const [tyreSuggestions, setTyreSuggestions] = useState<TyreSizeSuggestion[]>([]);
  const [showTyreSuggestions, setShowTyreSuggestions] = useState(false);
  const tyreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Async state
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteStageIdx, setQuoteStageIdx] = useState<number>(-1);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [lockingNutInputError, setLockingNutInputError] = useState<string | null>(null);
  const quoteInflightRef = useRef(false);

  const [linkBusy, setLinkBusy] = useState<'sms' | 'whatsapp' | 'copy' | null>(null);
  const [linkResult, setLinkResult] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<FinalizeResponse | null>(null);
  const [depositInfo, setDepositInfo] = useState<DepositResponse | null>(null);

  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  // ── Derived ──
  const lockingNutCharge =
    draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null
      ? draft.lockingNut.chargeGbp
      : 0;
  const effectiveTotal = draft.quote?.total ?? 0;
  const phoneIsValid = isValidUkPhone(phoneInput || draft.customer.phone);
  const hasAddress = draft.location.lat != null && draft.location.lng != null;

  const clearPricedState = {
    savedQuoteId: null,
    savedQuoteRef: null,
    quote: null,
    paymentChoice: null,
    dispatchedRefNumber: null,
  } satisfies Partial<AssistedChatDraft>;

  // ── Mapbox address search ──
  const searchAddress = useCallback(async (q: string) => {
    if (!q || q.length < 3) {
      setAddrSuggestions([]);
      return;
    }
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setAddrError('Mapbox token missing');
      return;
    }
    setAddrSearching(true);
    setAddrError(null);
    try {
      const encoded = encodeURIComponent(q);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?country=gb&types=address,postcode,place&proximity=-4.2518,55.8617&language=en&limit=6&access_token=${token}`,
      );
      if (!res.ok) {
        setAddrError('Address lookup failed. Try again.');
        setAddrSuggestions([]);
        return;
      }
      const data = (await res.json()) as { features?: MapboxFeature[] };
      setAddrSuggestions(data.features ?? []);
    } catch {
      setAddrError('Address lookup failed. Check your connection.');
      setAddrSuggestions([]);
    } finally {
      setAddrSearching(false);
    }
  }, []);

  const handleAddressChange = (value: string) => {
    setAddressInput(value);
    update({ location: { label: value, lat: null, lng: null, postcode: null }, ...clearPricedState });
    setLocationLink(null);
    setShowAddrSuggestions(true);
    if (addrTimer.current) clearTimeout(addrTimer.current);
    addrTimer.current = setTimeout(() => searchAddress(value), 250);
  };

  const selectAddress = (f: MapboxFeature) => {
    const [lng, lat] = f.center;
    const postcodeCtx = f.context?.find((ctx) => ctx.id.startsWith('postcode'));
    setAddressInput(f.place_name);
    update({
      location: {
        label: f.place_name,
        lat,
        lng,
        postcode: postcodeCtx?.text ?? null,
      },
      ...clearPricedState,
    });
    setLocationLink(null);
    setAddrSuggestions([]);
    setShowAddrSuggestions(false);
  };

  // ── Tyre size search ──
  const searchTyres = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setTyreSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/tyres/sizes?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { sizes?: TyreSizeSuggestion[] };
      setTyreSuggestions(data.sizes ?? []);
    } catch {
      /* silent */
    }
  }, []);

  const handleTyreChange = (value: string) => {
    setTyreSizeInput(value);
    update({ tyre: { ...draft.tyre, size: value }, ...clearPricedState });
    setShowTyreSuggestions(true);
    if (tyreTimer.current) clearTimeout(tyreTimer.current);
    tyreTimer.current = setTimeout(() => searchTyres(value), 200);
  };

  const selectTyreSize = (size: string) => {
    setTyreSizeInput(size);
    update({ tyre: { ...draft.tyre, size }, ...clearPricedState });
    setTyreSuggestions([]);
    setShowTyreSuggestions(false);
  };

  // ── Phone / quantity / locking nut handlers ──
  const handlePhoneBlur = () => {
    update({ customer: { ...draft.customer, phone: phoneInput.trim() } });
  };

  const handleNoteBlur = () => {
    update({ note: noteInput });
  };

  const handleQuantity = (q: number) => {
    const clamped = Math.max(1, Math.min(10, Math.round(q)));
    update({ tyre: { ...draft.tyre, quantity: clamped }, ...clearPricedState });
  };

  const handleLockingNutAnswer = (answer: LockingNutAnswer) => {
    setLockingNutInputError(null);
    if (answer === 'no') {
      update({ lockingNut: { answer, chargeGbp: draft.lockingNut.chargeGbp }, ...clearPricedState });
    } else {
      update({ lockingNut: { answer, chargeGbp: null }, ...clearPricedState });
      setLockingNutChargeInput('');
    }
  };

  const handleLockingNutChargeChange = (raw: string) => {
    setLockingNutChargeInput(raw);
    setLockingNutInputError(null);
    if (raw.trim() === '') {
      update({ lockingNut: { ...draft.lockingNut, chargeGbp: null }, ...clearPricedState });
      return;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setLockingNutInputError('Enter a valid GBP amount (0 or more).');
      return;
    }
    if (parsed > 1000) {
      setLockingNutInputError('Charge looks too high. Confirm with the manager.');
    }
    update({
      lockingNut: { ...draft.lockingNut, chargeGbp: Math.round(parsed * 100) / 100 },
      ...clearPricedState,
    });
  };

  // ──────────────────────────────────────────────────────────
  // Lazy quick-bookings draft creation. Reused by location-link actions
  // (so admin can copy/SMS/WA the link before pricing) and by Get Price.
  // ──────────────────────────────────────────────────────────
  const ensureQuickBookingId = useCallback(async (): Promise<string> => {
    if (draft.quickBookingId) return draft.quickBookingId;
    if (!hasAddress) {
      throw new Error('Select the customer address from the suggestions first.');
    }
    const res = await fetch('/api/admin/quick-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
        customerPhone: phoneIsValid ? (phoneInput || draft.customer.phone).trim() : PLACEHOLDER_PHONE,
        locationMethod: 'address' as const,
        locationAddress: draft.location.label,
        locationLat: draft.location.lat,
        locationLng: draft.location.lng,
        serviceType: 'fit' as const,
        tyreSize: draft.tyre.size || undefined,
        tyreCount: draft.tyre.quantity,
        notes: draft.note || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to create draft'));
    const created = data as QuickBookCreateResponse;
    update({ quickBookingId: created.booking.id });
    return created.booking.id;
  }, [
    draft.quickBookingId,
    draft.customer.name,
    draft.customer.phone,
    draft.location.label,
    draft.location.lat,
    draft.location.lng,
    draft.tyre.size,
    draft.tyre.quantity,
    draft.note,
    phoneInput,
    phoneIsValid,
    hasAddress,
    update,
  ]);

  const applyQuoteFromBreakdown = useCallback(
    (
      qbId: string,
      breakdown: QuickBookCreateResponse['booking']['priceBreakdown'],
      distanceKmStr: string | null,
    ) => {
      if (!breakdown) {
        setQuoteError('Pricing engine returned no breakdown.');
        return;
      }
      const next: AssistedChatQuoteBreakdown = {
        subtotal: breakdown.subtotal,
        vatAmount: breakdown.vatAmount,
        total: breakdown.total,
        lineItems: breakdown.lineItems,
        serviceOrigin: breakdown.serviceOrigin ?? null,
        distanceKm: distanceKmStr ? Number(distanceKmStr) : null,
        adminAdjustmentAmount: breakdown.adminAdjustmentAmount ?? null,
        adminAdjustmentReason: breakdown.adminAdjustmentReason ?? null,
      };
      update({
        quickBookingId: qbId,
        savedQuoteId: null,
        savedQuoteRef: null,
        quote: next,
        paymentChoice: null,
        dispatchedRefNumber: null,
      });
    },
    [update],
  );

  // Drives the staged "Checking stock… Checking distance…" loader. Resolves
  // once all stages have advanced (~3.4s total).
  const runStagedDelay = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      let stage = 0;
      setQuoteStageIdx(0);
      const tick = () => {
        stage += 1;
        if (stage >= QUOTE_STAGE_LABELS.length) {
          resolve();
          return;
        }
        setQuoteStageIdx(stage);
        window.setTimeout(tick, QUOTE_STAGE_MS);
      };
      window.setTimeout(tick, QUOTE_STAGE_MS);
    });
  }, []);

  // ── Get price ──
  // The backend quote is the source of truth. Locking-nut charges are sent as
  // admin adjustments so display, saved quote, payment, and finalize agree.
  const handleGetPrice = useCallback(async () => {
    if (quoteInflightRef.current) return;

    setQuoteError(null);
    setPaymentResult(null);
    setPaymentError(null);
    setDepositInfo(null);

    if (!hasAddress) {
      setQuoteError('Select the customer address from the suggestions before pricing.');
      return;
    }
    if (!draft.tyre.size.trim()) {
      setQuoteError('Choose a tyre size from the in-stock list.');
      return;
    }
    if (draft.tyre.quantity < 1) {
      setQuoteError('Quantity must be at least 1.');
      return;
    }
    if (draft.lockingNut.answer === 'no') {
      const charge = draft.lockingNut.chargeGbp;
      if (charge == null || !Number.isFinite(charge) || charge < 0) {
        setQuoteError('Enter a valid GBP amount for the locking wheel nut removal charge.');
        return;
      }
    }

    quoteInflightRef.current = true;
    setQuoteLoading(true);
    setQuoteStageIdx(0);

    try {
      const adjustmentPayload =
        lockingNutCharge > 0
          ? {
              adminAdjustmentAmount: lockingNutCharge,
              adminAdjustmentReason: LOCKING_NUT_REASON,
            }
          : {
              adminAdjustmentAmount: 0,
              adminAdjustmentReason: null,
            };
      const apiCall = (async () => {
        const qbId = draft.quickBookingId ?? (await ensureQuickBookingId());
        const res = await fetch(`/api/admin/quick-book/${qbId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationLat: draft.location.lat,
            locationLng: draft.location.lng,
            locationAddress: draft.location.label,
            locationPostcode: draft.location.postcode,
            tyreSize: draft.tyre.size,
            tyreCount: draft.tyre.quantity,
            notes: draft.note || null,
            pricingContext: 'emergency_mobile_fitting',
            ...adjustmentPayload,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to refresh quote'));
        const patched = data as QuickBookPatchResponse;
        return { qbId, patched };
      })();

      const [{ qbId, patched }] = await Promise.all([apiCall, runStagedDelay()]);
      applyQuoteFromBreakdown(qbId, patched.booking.priceBreakdown, patched.booking.distanceKm);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setQuoteLoading(false);
      setQuoteStageIdx(-1);
      quoteInflightRef.current = false;
    }
  }, [
    hasAddress,
    draft.tyre.size,
    draft.tyre.quantity,
    draft.lockingNut.answer,
    draft.lockingNut.chargeGbp,
    lockingNutCharge,
    draft.quickBookingId,
    draft.location.lat,
    draft.location.lng,
    draft.location.label,
    draft.location.postcode,
    draft.note,
    ensureQuickBookingId,
    applyQuoteFromBreakdown,
    runStagedDelay,
  ]);

  // ──────────────────────────────────────────────────────────
  // Location link actions — beside the address field.
  // ──────────────────────────────────────────────────────────
  const fetchLocationLink = useCallback(async (): Promise<string> => {
    const qbId = await ensureQuickBookingId();
    const res = await fetch('/api/admin/quick-book/send-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quickBookingId: qbId, method: 'copy' }),
    });
    const data = (await res.json()) as SendLinkResponse;
    if (!res.ok || !data.link) {
      throw new Error(data.error ?? 'Could not generate location link');
    }
    setLocationLink(data.link);
    return data.link;
  }, [ensureQuickBookingId]);

  const writeToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handleCopyLocationLink = useCallback(async () => {
    setLinkResult(null);
    setLinkBusy('copy');
    try {
      const link = locationLink ?? (await fetchLocationLink());
      const ok = await writeToClipboard(link);
      setLinkResult(
        ok
          ? { kind: 'ok', message: 'Location link copied to clipboard' }
          : { kind: 'err', message: 'Could not copy. Use the link manually.' },
      );
    } catch (err) {
      setLinkResult({ kind: 'err', message: err instanceof Error ? err.message : 'Copy failed' });
    } finally {
      setLinkBusy(null);
    }
  }, [locationLink, fetchLocationLink, writeToClipboard]);

  const handleSendSmsLocationLink = useCallback(async () => {
    setLinkResult(null);
    if (!phoneIsValid) {
      setLinkResult({ kind: 'err', message: 'Enter a valid UK phone number first.' });
      return;
    }
    setLinkBusy('sms');
    try {
      const qbId = await ensureQuickBookingId();
      const res = await fetch('/api/admin/quick-book/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickBookingId: qbId, method: 'sms' }),
      });
      const data = (await res.json()) as SendLinkResponse;
      if (!res.ok || !data.ok) {
        setLinkResult({ kind: 'err', message: data.error ?? 'SMS send failed' });
      } else {
        setLinkResult({ kind: 'ok', message: data.message ?? 'SMS sent' });
        if (data.link) setLocationLink(data.link);
      }
    } catch (err) {
      setLinkResult({ kind: 'err', message: err instanceof Error ? err.message : 'SMS send failed' });
    } finally {
      setLinkBusy(null);
    }
  }, [phoneIsValid, ensureQuickBookingId]);

  const handleOpenWhatsAppLocationLink = useCallback(async () => {
    setLinkResult(null);
    setLinkBusy('whatsapp');
    try {
      const qbId = await ensureQuickBookingId();
      const res = await fetch('/api/admin/quick-book/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickBookingId: qbId, method: 'whatsapp' }),
      });
      const data = (await res.json()) as SendLinkResponse;
      if (!res.ok || !data.link) {
        setLinkResult({ kind: 'err', message: data.error ?? 'Could not build WhatsApp link' });
        return;
      }
      window.open(data.link, '_blank', 'noopener,noreferrer');
      setLinkResult({ kind: 'ok', message: 'WhatsApp opened in a new tab' });
    } catch (err) {
      setLinkResult({ kind: 'err', message: err instanceof Error ? err.message : 'WhatsApp failed' });
    } finally {
      setLinkBusy(null);
    }
  }, [ensureQuickBookingId]);

  // ──────────────────────────────────────────────────────────
  // Choose payment — finalize only after the displayed backend quote already
  // contains any locking-nut adjustment.
  // ──────────────────────────────────────────────────────────
  const handleChoosePayment = useCallback(
    async (choice: AssistedChatPaymentChoice) => {
      setPaymentError(null);
      setPaymentResult(null);
      setDepositInfo(null);
      if (!draft.quickBookingId || !draft.quote) {
        setPaymentError('Generate a price first.');
        return;
      }
      if (
        lockingNutCharge > 0 &&
        (
          draft.quote.adminAdjustmentReason !== LOCKING_NUT_REASON ||
          Math.round((draft.quote.adminAdjustmentAmount ?? 0) * 100) !== Math.round(lockingNutCharge * 100)
        )
      ) {
        setPaymentError('Refresh the price after changing the locking wheel nut charge.');
        return;
      }
      update({ paymentChoice: choice });
      setPaymentBusy(true);
      try {
        const paymentMethod = choice === 'cash' ? 'cash' : choice === 'deposit' ? 'deposit' : 'stripe';
        const body: Record<string, unknown> = { paymentMethod };
        if (choice === 'deposit') body.depositPercent = 0.15;

        const res = await fetch(`/api/admin/quick-book/${draft.quickBookingId}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to finalize'));
        const fin = data as FinalizeResponse;
        setPaymentResult(fin);
        update({ dispatchedRefNumber: fin.refNumber });

        if (choice === 'full' && fin.paymentUrl) {
          window.open(fin.paymentUrl, '_blank', 'noopener,noreferrer');
        }
        if (choice === 'deposit') {
          const depRes = await fetch(`/api/bookings/${fin.bookingId}/deposit`, { method: 'POST' });
          const depData = await depRes.json();
          if (!depRes.ok) throw new Error(getApiErrorMessage(depData, 'Failed to create deposit payment'));
          setDepositInfo(depData as DepositResponse);
        }
      } catch (err) {
        setPaymentError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setPaymentBusy(false);
      }
    },
    [draft.quickBookingId, draft.quote, lockingNutCharge, update],
  );

  // ── Send to driver (idempotent) ──
  const inflightDispatchRef = useRef(false);
  const handleDispatch = useCallback(async () => {
    if (inflightDispatchRef.current) return;
    setDispatchError(null);
    if (!draft.quote) {
      setDispatchError('Generate a price first.');
      return;
    }
    if (!draft.paymentChoice) {
      setDispatchError('Choose a payment method first (cash, deposit 15%, or full payment).');
      return;
    }
    if (draft.dispatchedRefNumber) {
      setDispatchError(`Already dispatched as ${draft.dispatchedRefNumber}.`);
      return;
    }
    inflightDispatchRef.current = true;
    setDispatchBusy(true);
    try {
      if (!paymentResult) {
        await handleChoosePayment(draft.paymentChoice);
      }
    } finally {
      inflightDispatchRef.current = false;
      setDispatchBusy(false);
    }
  }, [
    draft.quote,
    draft.paymentChoice,
    draft.dispatchedRefNumber,
    paymentResult,
    handleChoosePayment,
  ]);

  // ── Copy details to clipboard (now includes location link + payment) ──
  const handleCopyDetails = useCallback(async () => {
    const lines: string[] = [];
    lines.push('Tyre Rescue — Assisted Chat draft');
    if (draft.customer.phone) lines.push(`Phone: ${draft.customer.phone}`);
    if (draft.location.label) lines.push(`Address: ${draft.location.label}`);
    if (locationLink) lines.push(`Location link: ${locationLink}`);
    if (draft.tyre.size) lines.push(`Tyre size: ${draft.tyre.size}`);
    lines.push(`Quantity: ${draft.tyre.quantity}`);
    lines.push(
      `Locking wheel nut: ${
        draft.lockingNut.answer === 'yes'
          ? 'Customer has it'
          : draft.lockingNut.answer === 'no'
          ? 'Customer does NOT have it'
          : 'Unknown'
      }`,
    );
    if (lockingNutCharge > 0) {
      lines.push(`Locking wheel nut removal: ${GBP.format(lockingNutCharge)}`);
    }
    if (draft.quote) {
      lines.push(`Total: ${GBP.format(effectiveTotal)}`);
    }
    if (draft.paymentChoice) {
      const labelMap: Record<AssistedChatPaymentChoice, string> = {
        cash: `Cash (${GBP.format(effectiveTotal)})`,
        deposit: `Deposit 15% (${GBP.format(effectiveTotal * 0.15)})`,
        full: `Full payment (${GBP.format(effectiveTotal)})`,
      };
      lines.push(`Payment choice: ${labelMap[draft.paymentChoice]}`);
    }
    const ok = await writeToClipboard(lines.join('\n'));
    setCopyState(ok ? 'ok' : 'err');
    window.setTimeout(() => setCopyState('idle'), 1800);
  }, [
    draft.customer.phone,
    draft.location.label,
    draft.tyre.size,
    draft.tyre.quantity,
    draft.lockingNut.answer,
    draft.quote,
    draft.paymentChoice,
    locationLink,
    lockingNutCharge,
    effectiveTotal,
    writeToClipboard,
  ]);

  const handleClearDraft = () => {
    clear();
    setPhoneInput('');
    setAddressInput('');
    setTyreSizeInput('');
    setNoteInput('');
    setLockingNutChargeInput('');
    setLockingNutInputError(null);
    setLocationLink(null);
    setPaymentResult(null);
    setDepositInfo(null);
    setPaymentError(null);
    setQuoteError(null);
    setLinkResult(null);
    setDispatchError(null);
    setCopyState('idle');
    syncedRef.current = false;
  };

  const handleApplySavedQuote = useCallback(
    (quote: AdminQuote) => {
      const total = quote.priceAmount / 100;
      const nextQuote: AssistedChatQuoteBreakdown = {
        subtotal: total,
        vatAmount: 0,
        total,
        lineItems: [
          {
            label: `Saved quote ${quote.quoteRef}`,
            amount: total,
            type: 'quote',
          },
        ],
        serviceOrigin: null,
        distanceKm: null,
      };
      update({
        quickBookingId: quote.quickBookingId,
        savedQuoteId: quote.id,
        savedQuoteRef: quote.quoteRef,
        customer: {
          ...draft.customer,
          name: quote.customerName ?? draft.customer.name,
          phone: quote.customerPhone ?? draft.customer.phone,
        },
        location: {
          label: quote.address ?? '',
          lat: quote.latitude,
          lng: quote.longitude,
          postcode: quote.postcode,
        },
        tyre: {
          size: quote.tyreSize ?? '',
          quantity: quote.quantity,
        },
        lockingNut: {
          answer:
            quote.lockingWheelNutStatus === 'yes' || quote.lockingWheelNutStatus === 'no'
              ? quote.lockingWheelNutStatus
              : 'unknown',
          chargeGbp: quote.lockingWheelNutChargePence ? quote.lockingWheelNutChargePence / 100 : null,
        },
        note: quote.internalNotes ?? '',
        quote: nextQuote,
        paymentChoice: null,
        dispatchedRefNumber: null,
      });
      setPhoneInput(quote.customerPhone ?? '');
      setAddressInput(quote.address ?? '');
      setTyreSizeInput(quote.tyreSize ?? '');
      setNoteInput(quote.internalNotes ?? '');
      setLockingNutChargeInput(quote.lockingWheelNutChargePence ? String(quote.lockingWheelNutChargePence / 100) : '');
    },
    [draft.customer, update],
  );

  // ── Build chat transcript ──
  const transcript = useMemo<ChatLine[]>(() => {
    const out: ChatLine[] = [];
    out.push({
      who: 'system',
      body: (
        <Text>
          Welcome. I&apos;ll guide you through booking a fit job step by step. Customer phone is
          optional, but required to send the location link by SMS or WhatsApp.
        </Text>
      ),
    });
    if (draft.customer.phone) {
      out.push({ who: 'admin', body: <Text>Phone: {draft.customer.phone}</Text> });
    }
    if (draft.location.label) {
      out.push({
        who: 'admin',
        body: (
          <Text>
            Address: {draft.location.label}
            {!hasAddress && (
              <Text as="span" color="red.300" ml={2}>
                (not yet selected from suggestions)
              </Text>
            )}
          </Text>
        ),
      });
    }
    if (draft.tyre.size) {
      out.push({
        who: 'admin',
        body: (
          <Text>
            Tyre: {draft.tyre.size} × {draft.tyre.quantity}
          </Text>
        ),
      });
    }
    if (draft.lockingNut.answer !== 'unknown' || lockingNutCharge > 0) {
      out.push({
        who: 'admin',
        body: (
          <Text>
            Locking wheel nut:{' '}
            {draft.lockingNut.answer === 'yes'
              ? 'Customer has the key'
              : draft.lockingNut.answer === 'no'
              ? `No key — removal charge ${
                  lockingNutCharge > 0 ? GBP.format(lockingNutCharge) : 'pending'
                }`
              : 'Unknown'}
          </Text>
        ),
      });
    }
    if (draft.note.trim()) {
      out.push({ who: 'admin', body: <Text>Note: {draft.note}</Text> });
    }
    if (draft.quote) {
      out.push({
        who: 'system',
        body: (
          <PriceBreakdownView
            quote={draft.quote}
            effectiveTotal={effectiveTotal}
          />
        ),
      });
    }
    if (paymentResult) {
      out.push({
        who: 'system',
        body: (
          <Stack gap={1}>
            <Text fontWeight="600">
              Booking ref {paymentResult.refNumber} created — payment method:{' '}
              {paymentResult.paymentMethod}
            </Text>
            {paymentResult.paymentMethod === 'deposit' && depositInfo && (
              <Text>
                Deposit due now: {GBP.format(depositInfo.depositAmount)} • Balance on-site:{' '}
                {GBP.format(depositInfo.remainingBalance)}
              </Text>
            )}
            {paymentResult.paymentMethod === 'cash' && (
              <Text>Cash payment recorded. Job is dispatched to driver.</Text>
            )}
            {paymentResult.paymentMethod === 'stripe' && paymentResult.paymentUrl && (
              <Text>
                Stripe checkout opened in a new tab.{' '}
                <a
                  href={paymentResult.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: c.accent, textDecoration: 'underline' }}
                >
                  Reopen
                </a>
              </Text>
            )}
          </Stack>
        ),
      });
    }
    return out;
  }, [
    draft.customer.phone,
    draft.location.label,
    draft.tyre.size,
    draft.tyre.quantity,
    draft.lockingNut.answer,
    draft.note,
    draft.quote,
    paymentResult,
    depositInfo,
    hasAddress,
    lockingNutCharge,
    effectiveTotal,
  ]);

  // ── Map props ──
  const mapCustomerLat = draft.location.lat;
  const mapCustomerLng = draft.location.lng;
  const serviceOrigin = draft.quote?.serviceOrigin ?? null;

  return (
    <Flex direction={{ base: 'column', lg: 'row' }} gap={4} align="stretch">
      {/* ── Chat panel ── */}
      <Box flex={1} minW={0}>
        <Box
          bg={c.surface}
          border={`1px solid ${c.border}`}
          borderRadius="10px"
          p={{ base: 3, md: 5 }}
        >
          <VStack align="stretch" gap={4}>
            {transcript.map((l, i) => (
              <ChatBubble key={i} who={l.who}>
                {l.body}
              </ChatBubble>
            ))}

            {/* ── Section: Customer ── */}
            <SectionCard title="Customer">
              <Box maxW="320px">
                <FieldLabel>Customer phone (optional)</FieldLabel>
                <Input
                  {...inputProps}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onBlur={handlePhoneBlur}
                  placeholder="07… or 0141…"
                  inputMode="tel"
                />
                {phoneInput && !phoneIsValid && (
                  <Text color="red.300" fontSize="12px" mt={1}>
                    UK phone format not recognised.
                  </Text>
                )}
              </Box>
            </SectionCard>

            {/* ── Section: Address + location-link actions ── */}
            <SectionCard title="Customer address">
              <Box position="relative">
                <FieldLabel>Customer address (Mapbox)</FieldLabel>
                <Input
                  {...inputProps}
                  value={addressInput}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  onFocus={() => setShowAddrSuggestions(true)}
                  placeholder="Start typing the address or postcode"
                  autoComplete="off"
                />
                {addrSearching && (
                  <Text position="absolute" right={3} top="34px" color={c.muted} fontSize="12px">
                    searching…
                  </Text>
                )}
                {addrError && (
                  <Text color="red.300" fontSize="12px" mt={1}>
                    {addrError}{' '}
                    <button
                      type="button"
                      style={{ background: 'none', border: 0, color: c.accent, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      onClick={() => searchAddress(addressInput)}
                    >
                      Retry
                    </button>
                  </Text>
                )}
                {showAddrSuggestions && addrSuggestions.length > 0 && (
                  <Box
                    position="absolute"
                    top="100%"
                    left={0}
                    right={0}
                    mt={1}
                    bg={c.dropdown.bg}
                    border={`1px solid ${c.border}`}
                    borderRadius="6px"
                    maxH="240px"
                    overflowY="auto"
                    zIndex={20}
                  >
                    {addrSuggestions.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        style={{
                          background: 'transparent',
                          border: 0,
                          color: c.text,
                          cursor: 'pointer',
                          display: 'block',
                          padding: '8px 12px',
                          textAlign: 'left',
                          width: '100%',
                        }}
                        onClick={() => selectAddress(f)}
                      >
                        <Text fontSize="13px">{f.place_name}</Text>
                      </button>
                    ))}
                  </Box>
                )}
              </Box>

              {/* Location link actions — directly attached to address. */}
              <Box mt={3}>
                <Text fontSize="12px" color={c.muted} mb={2}>
                  Use this link when the customer cannot explain the address.
                </Text>
                <HStack gap={2} flexWrap="wrap">
                  <Button
                    {...secondaryButton}
                    px={4}
                    onClick={handleCopyLocationLink}
                    disabled={linkBusy !== null || !hasAddress}
                  >
                    {linkBusy === 'copy' ? <Spinner size="sm" /> : 'Copy location link'}
                  </Button>
                  <Button
                    {...secondaryButton}
                    px={4}
                    onClick={handleSendSmsLocationLink}
                    disabled={linkBusy !== null || !hasAddress || !phoneIsValid}
                  >
                    {linkBusy === 'sms' ? <Spinner size="sm" /> : 'Send SMS location link'}
                  </Button>
                  <Button
                    {...secondaryButton}
                    px={4}
                    onClick={handleOpenWhatsAppLocationLink}
                    disabled={linkBusy !== null || !hasAddress || !phoneIsValid}
                  >
                    {linkBusy === 'whatsapp' ? <Spinner size="sm" /> : 'Open WhatsApp link'}
                  </Button>
                </HStack>
                {locationLink && (
                  <Text fontSize="12px" color={c.muted} mt={2} wordBreak="break-all">
                    {locationLink}
                  </Text>
                )}
                {linkResult && (
                  <Text
                    color={linkResult.kind === 'ok' ? c.text : 'red.300'}
                    fontSize="13px"
                    mt={2}
                  >
                    {linkResult.message}
                  </Text>
                )}
              </Box>
            </SectionCard>

            {/* ── Section: Tyre + quantity ── */}
            <SectionCard title="Tyre">
              <Stack direction={{ base: 'column', md: 'row' }} gap={3}>
                <Box flex={2} position="relative">
                  <FieldLabel>Tyre size (in-stock only)</FieldLabel>
                  <Input
                    {...inputProps}
                    value={tyreSizeInput}
                    onChange={(e) => handleTyreChange(e.target.value)}
                    onFocus={() => setShowTyreSuggestions(true)}
                    placeholder="e.g. 205/55R16"
                    autoComplete="off"
                  />
                  {showTyreSuggestions && tyreSuggestions.length > 0 && (
                    <Box
                      position="absolute"
                      top="100%"
                      left={0}
                      right={0}
                      mt={1}
                      bg={c.dropdown.bg}
                      border={`1px solid ${c.border}`}
                      borderRadius="6px"
                      maxH="240px"
                      overflowY="auto"
                      zIndex={20}
                    >
                      {tyreSuggestions.map((s) => (
                        <button
                          key={s.size}
                          type="button"
                          style={{
                            background: 'transparent',
                            border: 0,
                            color: c.text,
                            cursor: 'pointer',
                            display: 'block',
                            padding: '8px 12px',
                            textAlign: 'left',
                            width: '100%',
                          }}
                          onClick={() => selectTyreSize(s.size)}
                        >
                          <Flex justify="space-between">
                            <Text fontSize="13px">{s.size}</Text>
                            <Text fontSize="12px" color={c.muted}>
                              {s.count} in stock
                            </Text>
                          </Flex>
                        </button>
                      ))}
                    </Box>
                  )}
                  {showTyreSuggestions &&
                    tyreSizeInput.length >= 2 &&
                    tyreSuggestions.length === 0 && (
                      <Text color="red.300" fontSize="12px" mt={1}>
                        No matching sizes in stock.
                      </Text>
                    )}
                </Box>
                <Box flex={1}>
                  <FieldLabel>Quantity</FieldLabel>
                  <Input
                    {...inputProps}
                    type="number"
                    min={1}
                    max={10}
                    value={draft.tyre.quantity}
                    onChange={(e) => handleQuantity(Number(e.target.value))}
                  />
                </Box>
              </Stack>
            </SectionCard>

            {/* ── Section: Locking wheel nut ── */}
            <SectionCard title="Locking wheel nut">
              <Text fontSize="13px" color={c.text} mb={2}>
                Does the customer have the locking wheel nut key?
              </Text>
              <HStack gap={2} flexWrap="wrap">
                <PillButton
                  active={draft.lockingNut.answer === 'yes'}
                  onClick={() => handleLockingNutAnswer('yes')}
                >
                  Yes, customer has it
                </PillButton>
                <PillButton
                  active={draft.lockingNut.answer === 'no'}
                  onClick={() => handleLockingNutAnswer('no')}
                >
                  No, customer does not have it
                </PillButton>
                <PillButton
                  active={draft.lockingNut.answer === 'unknown'}
                  onClick={() => handleLockingNutAnswer('unknown')}
                >
                  Unknown
                </PillButton>
              </HStack>
              {draft.lockingNut.answer === 'no' && (
                <Box mt={3} maxW="280px">
                  <FieldLabel>Locking wheel nut removal charge (GBP)</FieldLabel>
                  <Input
                    {...inputProps}
                    type="number"
                    step="0.01"
                    min={0}
                    value={lockingNutChargeInput}
                    onChange={(e) => handleLockingNutChargeChange(e.target.value)}
                    placeholder="e.g. 25"
                    inputMode="decimal"
                  />
                  {lockingNutInputError && (
                    <Text color="red.300" fontSize="12px" mt={1}>
                      {lockingNutInputError}
                    </Text>
                  )}
                </Box>
              )}
            </SectionCard>

            {/* ── Section: Note ── */}
            <SectionCard title="Optional note">
              <Textarea
                {...textareaProps}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onBlur={handleNoteBlur}
                placeholder="Anything the driver should know"
                minH="72px"
              />
            </SectionCard>

            {/* ── Get price ── */}
            <Box>
              <HStack gap={3} flexWrap="wrap">
                <Button
                  {...primaryButton}
                  px={6}
                  onClick={handleGetPrice}
                  disabled={quoteLoading}
                >
                  {quoteLoading ? <Spinner size="sm" /> : 'Get price'}
                </Button>
                {quoteLoading && quoteStageIdx >= 0 && (
                  <Text color={c.muted} fontSize="13px">
                    {QUOTE_STAGE_LABELS[Math.min(quoteStageIdx, QUOTE_STAGE_LABELS.length - 1)]}…
                  </Text>
                )}
              </HStack>
              {quoteError && (
                <Text color="red.300" fontSize="13px" mt={2}>
                  {quoteError}
                </Text>
              )}
            </Box>

            {/* ── Saved quote actions ── */}
            {draft.quote && (
              <AdminQuotePanel
                draft={draft}
                effectiveTotal={effectiveTotal}
                lockingNutCharge={lockingNutCharge}
                update={update}
                onApplyQuote={handleApplySavedQuote}
              />
            )}

            {/* ── Payment choices ── */}
            {draft.quote && (
              <SectionCard title="Payment choice">
                <HStack gap={3} flexWrap="wrap">
                  <Button
                    {...(draft.paymentChoice === 'deposit' ? primaryButton : secondaryButton)}
                    px={5}
                    onClick={() => handleChoosePayment('deposit')}
                    disabled={paymentBusy}
                  >
                    Pay deposit 15% ({GBP.format(effectiveTotal * 0.15)})
                  </Button>
                  <Button
                    {...(draft.paymentChoice === 'cash' ? primaryButton : secondaryButton)}
                    px={5}
                    onClick={() => handleChoosePayment('cash')}
                    disabled={paymentBusy}
                  >
                    Cash ({GBP.format(effectiveTotal)})
                  </Button>
                  <Button
                    {...(draft.paymentChoice === 'full' ? primaryButton : secondaryButton)}
                    px={5}
                    onClick={() => handleChoosePayment('full')}
                    disabled={paymentBusy}
                  >
                    Full payment ({GBP.format(effectiveTotal)})
                  </Button>
                  {paymentBusy && <Spinner size="sm" color={c.muted} />}
                </HStack>
                {paymentError && (
                  <Text color="red.300" fontSize="13px" mt={2}>
                    {paymentError}
                  </Text>
                )}
              </SectionCard>
            )}
          </VStack>
        </Box>

        {/* ── External action buttons (outside chat box) ── */}
        <Stack direction={{ base: 'column', sm: 'row' }} gap={3} mt={4} flexWrap="wrap">
          <Button {...secondaryButton} px={5} onClick={handleCopyDetails}>
            {copyState === 'ok' ? 'Copied' : copyState === 'err' ? 'Copy failed' : 'Copy details'}
          </Button>
          <Button
            {...primaryButton}
            px={6}
            onClick={handleDispatch}
            disabled={dispatchBusy || !draft.quote || !draft.paymentChoice}
          >
            {dispatchBusy ? <Spinner size="sm" /> : 'Send it to driver'}
          </Button>
          <Button {...ghostButton} px={5} onClick={handleClearDraft}>
            Clear draft
          </Button>
        </Stack>
        {dispatchError && (
          <Text color="red.300" fontSize="13px" mt={2}>
            {dispatchError}
          </Text>
        )}
        {draft.dispatchedRefNumber && !dispatchError && (
          <Text color={c.muted} fontSize="13px" mt={2}>
            Dispatched as booking {draft.dispatchedRefNumber}.
          </Text>
        )}
      </Box>

      {/* ── Persistent map panel ── */}
      <Box
        w={{ base: '100%', lg: '420px' }}
        flexShrink={0}
        bg={c.surface}
        border={`1px solid ${c.border}`}
        borderRadius="10px"
        p={3}
        position={{ base: 'static', lg: 'sticky' }}
        top={{ lg: '24px' }}
        alignSelf={{ lg: 'flex-start' }}
      >
        <Text fontSize="12px" color={c.muted} mb={2} textTransform="uppercase" letterSpacing="0.05em">
          Map
        </Text>
        {mapCustomerLat != null && mapCustomerLng != null ? (
          <Box h="380px" borderRadius="8px" overflow="hidden">
            <QuickBookMap
              customerLat={mapCustomerLat}
              customerLng={mapCustomerLng}
              serviceOriginLat={serviceOrigin?.lat ?? null}
              serviceOriginLng={serviceOrigin?.lng ?? null}
              serviceOriginSource={serviceOrigin?.source ?? null}
              showRoute
            />
          </Box>
        ) : (
          <Box
            h="380px"
            borderRadius="8px"
            border={`1px dashed ${c.border}`}
            display="flex"
            alignItems="center"
            justifyContent="center"
            p={4}
          >
            <Text color={c.muted} fontSize="13px" textAlign="center">
              Select a customer address from the suggestions to load the map.
            </Text>
          </Box>
        )}
        {draft.quote?.distanceKm != null && (
          <Text fontSize="12px" color={c.muted} mt={3}>
            Distance used by pricing: {(draft.quote.distanceKm * 0.621371).toFixed(1)} miles
            {serviceOrigin?.source === 'driver' && ' (from nearest driver)'}
            {serviceOrigin?.source === 'garage' && ' (from garage)'}
          </Text>
        )}
      </Box>
    </Flex>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box bg={c.bg} border={`1px solid ${c.border}`} borderRadius="8px" p={4}>
      <Text
        fontSize="11px"
        color={c.muted}
        textTransform="uppercase"
        letterSpacing="0.08em"
        mb={3}
        fontWeight="600"
      >
        {title}
      </Text>
      {children}
    </Box>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize="12px" color={c.muted} mb={1}>
      {children}
    </Text>
  );
}

function ChatBubble({ who, children }: { who: 'system' | 'admin'; children: React.ReactNode }) {
  const isAdmin = who === 'admin';
  return (
    <Flex justify={isAdmin ? 'flex-end' : 'flex-start'}>
      <Box
        maxW="85%"
        bg={isAdmin ? c.card : '#1A1A1B'}
        border={`1px solid ${c.border}`}
        borderRadius="10px"
        px={3}
        py={2}
        color={c.text}
        fontSize="14px"
      >
        {children}
      </Box>
    </Flex>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      bg={active ? c.accent : c.card}
      color={active ? '#09090B' : c.text}
      borderWidth="1px"
      borderColor={active ? c.accent : c.border}
      h="40px"
      px={4}
      borderRadius="20px"
      fontWeight="600"
      fontSize="13px"
      transition="background 0.15s ease, color 0.15s ease, border-color 0.15s ease"
      _hover={{
        bg: active ? c.accentHover : '#2F2F33',
        color: active ? '#09090B' : c.text,
        borderColor: active ? c.accentHover : '#52525B',
      }}
      _active={{
        bg: active ? c.accentHover : c.surface,
        color: active ? '#09090B' : c.text,
        transform: 'translateY(1px)',
      }}
      _focus={{ boxShadow: 'none', outline: 'none' }}
      _focusVisible={{
        boxShadow: `0 0 0 2px ${c.bg}, 0 0 0 4px ${c.accent}`,
        outline: 'none',
      }}
    >
      {children}
    </Button>
  );
}

function PriceBreakdownView({
  quote,
  effectiveTotal,
}: {
  quote: AssistedChatQuoteBreakdown;
  effectiveTotal: number;
}) {
  // Filter engine meta lines (subtotal/vat/total) so admin sees only real
  // charge lines from the backend breakdown and a single Total.
  const display = quote.lineItems.filter(
    (l) => l.type !== 'subtotal' && l.type !== 'vat' && l.type !== 'total',
  );
  return (
    <Stack gap={1} fontSize="13px">
      <Text fontWeight="600">Price breakdown</Text>
      {display.map((l, i) => (
        <Flex key={`${l.label}-${i}`} justify="space-between">
          <Text color={c.text}>{l.label}</Text>
          <Text color={c.text}>{GBP.format(l.amount)}</Text>
        </Flex>
      ))}
      <Flex justify="space-between" pt={2} borderTop={`1px solid ${c.border}`} mt={1}>
        <Text fontWeight="700">Total</Text>
        <Text fontWeight="700" color={c.accent}>
          {GBP.format(effectiveTotal)}
        </Text>
      </Flex>
    </Stack>
  );
}

~~~

## components/admin/quick-book/QuickBookForm.tsx

~~~
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, VStack, HStack, Stack, Input, Button, Flex, Spinner, Textarea } from '@chakra-ui/react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { QuickBookMap } from './QuickBookMap';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import {
  buildLocationCopyMessage,
  type LocationMessageContext,
} from '@/lib/quick-book-message-templates';
import { formatGbp } from '@/lib/fitting-location-pricing';
import type { CustomerEmailMode } from '@/app/api/admin/quick-book/route';

// Load Stripe outside of component to avoid recreating on every render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type LocationMethod = 'address' | 'link';
type FormStatus = 'idle' | 'submitting' | 'success' | 'error' | 'polling' | 'finalizing';

interface FormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerEmailMode: CustomerEmailMode;
  locationMethod: LocationMethod;
  locationAddress: string;
  locationLat: number | null;
  locationLng: number | null;
  serviceType: 'fit' | 'repair' | 'assess';
  tyreSize: string;
  tyreCount: number;
  notes: string;
}

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

interface TyreSizeSuggestion {
  size: string;
  count: number;
}

interface PricingLineItem {
  label: string;
  amount: number;
  type: string;
  quantity?: number;
  unitPrice?: number;
}

interface CreatedBooking {
  locationLink: string | null;
  whatsappLink: string | null;
  whatsappText: string | null;
  booking: {
    id: string;
    status: string;
    locationLat: string | null;
    locationLng: string | null;
    distanceKm: string | null;
    totalPrice: string | null;
    basePrice: string | null;
    surchargePercent: string | null;
    selectedTyreProductId: string | null;
    selectedTyreUnitPrice: string | null;
    selectedTyreBrand: string | null;
    selectedTyrePattern: string | null;
    priceBreakdown: {
      lineItems: PricingLineItem[];
      totalTyreCost: number;
      totalServiceFee: number;
      calloutFee: number;
      totalSurcharges: number;
      discountAmount: number;
      subtotal: number;
      vatAmount: number;
      total: number;
      distanceMiles?: number | null;
      fittingPrice?: number | null;
      tyrePrice?: number | null;
      totalPrice?: number | null;
      serviceOrigin?: {
        lat: number;
        lng: number;
        source: 'driver' | 'garage';
        driverId: string | null;
        etaMinutes: number | null;
      } | null;
    } | null;
    adminAdjustmentAmount: string | null;
    adminAdjustmentReason: string | null;
  };
}

interface FinalizedResult {
  bookingId: string;
  refNumber: string;
  invoiceNumber: string;
  paymentMethod: 'stripe' | 'cash' | 'deposit';
  paymentUrl: string | null;
  stripeClientSecret: string | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  breakdown: {
    subtotal: number;
    vatAmount: number;
    total: number;
    distanceMiles?: number | null;
    fittingPrice?: number | null;
    tyrePrice?: number | null;
    totalPrice?: number | null;
    lineItems: { label: string; amount: number; type: string }[];
  };
}

const initialForm: FormState = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerEmailMode: 'walk_in_customer',
  locationMethod: 'address',
  locationAddress: '',
  locationLat: null,
  locationLng: null,
  serviceType: 'fit',
  tyreSize: '',
  tyreCount: 1,
  notes: '',
};

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;

  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error;
  }

  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>;
    if (Array.isArray(nested.formErrors) && nested.formErrors.length > 0) {
      const first = nested.formErrors[0];
      if (typeof first === 'string' && first.trim()) return first;
    }
    if (nested.fieldErrors && typeof nested.fieldErrors === 'object') {
      const entries = Object.entries(nested.fieldErrors as Record<string, unknown>);
      const parts: string[] = [];
      for (const [field, msgs] of entries) {
        const first = Array.isArray(msgs) ? msgs[0] : msgs;
        if (typeof first === 'string' && first.trim()) parts.push(`${field}: ${first}`);
      }
      if (parts.length) return parts.join('; ');
    }
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }

  return fallback;
}

function getBackendQuoteTotal(
  breakdown: { total?: number | null } | null | undefined,
  syncedTotalPrice?: string | number | null,
): number {
  if (typeof breakdown?.total === 'number' && Number.isFinite(breakdown.total)) {
    return breakdown.total;
  }

  const parsed = syncedTotalPrice == null ? NaN : Number(syncedTotalPrice);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Stripe Elements form for deposit payment
 */
interface DepositCheckoutFormProps {
  depositAmount: number;
  remainingBalance: number;
  bookingId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function DepositCheckoutFormInner({
  depositAmount,
  remainingBalance,
  onSuccess,
  onCancel,
}: DepositCheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/admin/bookings`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess();
    } else if (paymentIntent && paymentIntent.status === 'processing') {
      // Payment still processing
      onSuccess();
    } else {
      setErrorMessage('Payment status unknown. Please check booking status.');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={4} align="stretch">
        <Box bg="rgba(249, 115, 22, 0.08)" border={`1px solid ${c.border}`} p={4} borderRadius="8px">
          <Flex justify="space-between" mb={2}>
            <Text color={c.muted} fontSize="sm">Deposit (20%)</Text>
            <Text color={c.accent} fontSize="lg" fontWeight="700">£{depositAmount.toFixed(2)}</Text>
          </Flex>
          <Flex justify="space-between">
            <Text color={c.muted} fontSize="sm">Balance due on-site</Text>
            <Text color={c.text} fontSize="md" fontWeight="600">£{remainingBalance.toFixed(2)}</Text>
          </Flex>
        </Box>

        <Box bg={c.surface} p={4} borderRadius="8px">
          <PaymentElement
            options={{
              layout: 'tabs',
            }}
          />
        </Box>

        {errorMessage && (
          <Text color="red.400" fontSize="sm">{errorMessage}</Text>
        )}

        <HStack gap={3}>
          <Button
            type="submit"
            flex={1}
            h="56px"
            bg={c.accent}
            color="#09090B"
            fontWeight="700"
            borderRadius="8px"
            disabled={!stripe || isProcessing}
          >
            {isProcessing ? <Spinner size="sm" /> : `Pay £${depositAmount.toFixed(2)} Deposit`}
          </Button>
          <Button
            type="button"
            flex={1}
            h="56px"
            variant="outline"
            borderColor={c.border}
            color={c.text}
            fontWeight="600"
            borderRadius="8px"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </Button>
        </HStack>

        <Text color={c.muted} fontSize="xs" textAlign="center">
          The remaining £{remainingBalance.toFixed(2)} will be collected on-site.
        </Text>
      </VStack>
    </form>
  );
}

export function QuickBookForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [finalized, setFinalized] = useState<FinalizedResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  // SMS send state
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  // Email send state
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  // Deposit payment dialog state
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositClientSecret, setDepositClientSecret] = useState<string | null>(null);
  const [depositInfo, setDepositInfo] = useState<{
    depositAmount: number;
    remainingBalance: number;
    bookingId: string;
  } | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [stripeRetryLoading, setStripeRetryLoading] = useState(false);
  const [stripeRetryError, setStripeRetryError] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  // Route/distance info (from map)
  const [routeInfo, setRouteInfo] = useState<{ drivingKm: number | null; drivingMinutes: number | null } | null>(null);

  const [isFinalizing, setIsFinalizing] = useState(false);

  // Admin price adjustment
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);

  // Address autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState<MapboxFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tyre size autocomplete
  const [tyreSuggestions, setTyreSuggestions] = useState<TyreSizeSuggestion[]>([]);
  const [showTyreSuggestions, setShowTyreSuggestions] = useState(false);
  const tyreSizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── Mapbox address autocomplete ──
  const searchAddress = useCallback(async (query: string) => {
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    setIsSearchingAddress(true);
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) return;
      const encoded = encodeURIComponent(query);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?country=gb&types=address,postcode,place&proximity=-4.2518,55.8617&language=en&limit=6&access_token=${token}`
      );
      const data = await res.json();
      setAddressSuggestions(data.features || []);
    } catch { /* silent */ }
    finally { setIsSearchingAddress(false); }
  }, []);

  const handleAddressChange = (value: string) => {
    set('locationAddress', value);
    set('locationLat', null);
    set('locationLng', null);
    setShowSuggestions(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchAddress(value), 250);
  };

  const selectAddress = (feature: MapboxFeature) => {
    const [lng, lat] = feature.center;
    setForm((f) => ({
      ...f,
      locationAddress: feature.place_name,
      locationLat: lat,
      locationLng: lng,
    }));
    setAddressSuggestions([]);
    setShowSuggestions(false);
  };

  // ── Tyre size autocomplete from real DB ──
  const searchTyreSizes = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setTyreSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/tyres/sizes?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setTyreSuggestions(data.sizes || []);
      }
    } catch { /* silent */ }
  }, []);

  const handleTyreSizeChange = (value: string) => {
    set('tyreSize', value);
    setShowTyreSuggestions(true);
    if (tyreSizeTimeout.current) clearTimeout(tyreSizeTimeout.current);
    tyreSizeTimeout.current = setTimeout(() => searchTyreSizes(value), 200);
  };

  const selectTyreSize = (size: string) => {
    set('tyreSize', size);
    setTyreSuggestions([]);
    setShowTyreSuggestions(false);
  };

  // ── Submit quick booking ──
  const handleSubmit = useCallback(async () => {
    // التحقق من البريد الإلكتروني عند الضرورة قبل إرسال الطلب
    if (form.customerEmailMode === 'send_customer_confirmation' && !form.customerEmail.trim()) {
      setError('Please enter a customer email address to send a confirmation.');
      return;
    }
    setStatus('submitting');
    setError('');
    try {
      const res = await fetch('/api/admin/quick-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail || undefined,
          customerEmailMode: form.customerEmailMode,
          locationMethod: form.locationMethod,
          locationAddress: form.locationMethod === 'address' ? form.locationAddress : undefined,
          locationLat: form.locationLat ?? undefined,
          locationLng: form.locationLng ?? undefined,
          serviceType: form.serviceType,
          tyreSize: form.tyreSize || undefined,
          tyreCount: form.tyreCount,
          pricingContext: 'admin_quick_book',
          notes: form.notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(getApiErrorMessage(data, 'Failed to create booking'));
      }

      const data = await res.json();
      setCreated(data);
      setStatus(form.locationMethod === 'link' ? 'polling' : 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, [form]);

  // ── Initiate deposit payment (create PaymentIntent) ──
  const initiateDepositPayment = useCallback(async (bookingId: string) => {
    setDepositLoading(true);
    setDepositError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(getApiErrorMessage(data, 'Failed to create deposit payment'));
      }

      const data = await res.json();
      setDepositClientSecret(data.clientSecret);
      setDepositInfo({
        depositAmount: data.depositAmount,
        remainingBalance: data.remainingBalance,
        bookingId,
      });
      setDepositDialogOpen(true);
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDepositLoading(false);
    }
  }, []);

  // ── Finalize into real booking ──
  const handleFinalize = useCallback(async (paymentMethod: 'stripe' | 'cash' | 'deposit') => {
    if (!created?.booking.id) return;
    setIsFinalizing(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/quick-book/${created.booking.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod, customerEmailMode: form.customerEmailMode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(getApiErrorMessage(data, 'Failed to finalize booking'));
      }

      const data: FinalizedResult = await res.json();
      setFinalized(data);

      // If Stripe full payment: open Stripe checkout in a new tab so admin
      // stays on the booking page. They can retry from here if Stripe is
      // cancelled or closed.
      if (paymentMethod === 'stripe' && data.paymentUrl) {
        window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
      }

      // If deposit payment: open the deposit dialog
      if (paymentMethod === 'deposit') {
        // Now create the deposit PaymentIntent
        await initiateDepositPayment(data.bookingId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsFinalizing(false);
    }
  }, [created?.booking.id, form.customerEmailMode, initiateDepositPayment]);

  // ── Handle deposit payment success ──
  const handleDepositSuccess = useCallback(() => {
    setDepositDialogOpen(false);
    setDepositSuccess(true);
    // Refresh booking state
    if (finalized) {
      setFinalized({
        ...finalized,
      });
    }
  }, [finalized]);

  // ── Retry full Stripe payment (regenerate checkout URL) ──
  const retryStripePayment = useCallback(async () => {
    if (!created?.booking.id) return;
    setStripeRetryLoading(true);
    setStripeRetryError(null);
    try {
      const res = await fetch(`/api/admin/quick-book/${created.booking.id}/checkout-session`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(data, 'Failed to regenerate Stripe checkout'));
      }
      const data = await res.json();
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setStripeRetryError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setStripeRetryLoading(false);
    }
  }, [created?.booking.id]);

  // ── Close deposit dialog without completing ──
  const closeDepositDialog = useCallback(() => {
    setConfirmCloseOpen(true);
  }, []);

  const confirmCloseDeposit = useCallback(async () => {
    setConfirmCloseOpen(false);
    setDepositDialogOpen(false);
    setDepositClientSecret(null);
    setDepositInfo(null);
    setDepositError(null);

    // Roll back the unpaid booking on the server so admin can pick a different
    // payment method (or retry deposit) from a clean state.
    if (created?.booking.id) {
      try {
        const res = await fetch(`/api/admin/quick-book/${created.booking.id}/finalize`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(getApiErrorMessage(data, 'Could not cancel pending booking'));
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not cancel pending booking');
        return;
      }
    }

    // Return admin to the payment-method selector
    setFinalized(null);
    setDepositSuccess(false);
  }, [created?.booking.id]);

  // ── Save admin price adjustment ──
  const handleSaveAdjustment = useCallback(async () => {
    if (!created?.booking.id) return;
    const amt = parseFloat(adjustmentAmount);
    if (isNaN(amt)) return;
    setAdjustmentSaving(true);
    try {
      const res = await fetch(`/api/admin/quick-book/${created.booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAdjustmentAmount: amt,
          adminAdjustmentReason: adjustmentReason || undefined,
          pricingContext: 'admin_quick_book',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreated((prev) =>
          prev ? { ...prev, booking: { ...prev.booking, ...data.booking } } : prev
        );
      }
    } catch { /* silent */ }
    finally { setAdjustmentSaving(false); }
  }, [created?.booking.id, adjustmentAmount, adjustmentReason]);

  const handleRemoveAdjustment = useCallback(async () => {
    if (!created?.booking.id) return;
    setAdjustmentSaving(true);
    try {
      const res = await fetch(`/api/admin/quick-book/${created.booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAdjustmentAmount: 0,
          adminAdjustmentReason: '',
          pricingContext: 'admin_quick_book',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreated((prev) =>
          prev ? { ...prev, booking: { ...prev.booking, ...data.booking } } : prev
        );
        setAdjustmentAmount('');
        setAdjustmentReason('');
        setShowAdjustment(false);
      }
    } catch { /* silent */ }
    finally { setAdjustmentSaving(false); }
  }, [created?.booking.id]);

  // ── Poll for location updates when method is 'link' ──
  useEffect(() => {
    if (status !== 'polling' || !created?.booking.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/quick-book/${created.booking.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.booking.locationLat && data.booking.locationLng) {
            setCreated((prev) =>
              prev ? { ...prev, booking: { ...prev.booking, ...data.booking } } : prev
            );
            setStatus('success');
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, created?.booking.id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendSms = async () => {
    if (!created?.booking.id || smsSending) return;
    setSmsSending(true);
    setSmsResult(null);
    try {
      const res = await fetch('/api/admin/quick-book/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickBookingId: created.booking.id, method: 'sms' }),
      });
      const data = await res.json();
      setSmsResult({ ok: data.ok, message: data.message, error: data.error });
    } catch {
      setSmsResult({ ok: false, error: 'Network error' });
    } finally {
      setSmsSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!created?.booking.id || emailSending) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await fetch('/api/admin/quick-book/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickBookingId: created.booking.id, method: 'email' }),
      });
      const data = await res.json();
      setEmailResult({ ok: data.ok, message: data.message, error: data.error });
    } catch {
      setEmailResult({ ok: false, error: 'Network error' });
    } finally {
      setEmailSending(false);
    }
  };

  const handleReset = () => {
    setForm(initialForm);
    setCreated(null);
    setFinalized(null);
    setStatus('idle');
    setError('');
    setSmsSending(false);
    setSmsResult(null);
    setEmailSending(false);
    setEmailResult(null);
    setShowAdjustment(false);
    setAdjustmentAmount('');
    setAdjustmentReason('');
    // Reset deposit state
    setDepositDialogOpen(false);
    setDepositClientSecret(null);
    setDepositInfo(null);
    setDepositLoading(false);
    setDepositError(null);
    setDepositSuccess(false);
  };

  // ── Finalized success state ──
  if (finalized) {
    const isDepositPayment = finalized.paymentMethod === 'deposit';
    const isDepositPaid = depositSuccess;
    const isStripePayment = finalized.paymentMethod === 'stripe';
    const depositAmount = finalized.depositAmountPence ? finalized.depositAmountPence / 100 : 0;
    const remainingBalance = finalized.remainingBalancePence ? finalized.remainingBalancePence / 100 : 0;
    const payableTotal = getBackendQuoteTotal(finalized.breakdown, null);

    return (
      <>
        <Box bg={c.card} p={6} borderRadius="12px" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
          <VStack gap={4} align="stretch">
            <Flex align="center" gap={3}>
              <Text fontSize="32px">
                {isDepositPayment
                  ? isDepositPaid ? '✅' : '💰'
                  : finalized.paymentMethod === 'stripe' ? '💳' : '✅'}
              </Text>
              <Box>
                <Text color={c.text} fontSize="lg" fontWeight="600">
                  {isDepositPayment
                    ? isDepositPaid
                      ? 'Deposit Paid — Booking Created'
                      : 'Awaiting Deposit Payment'
                    : finalized.paymentMethod === 'stripe'
                      ? 'Awaiting Stripe Payment'
                      : 'Booking Created — Paid'}
                </Text>
                <Text color={c.accent} fontSize="md" fontWeight="700">{finalized.refNumber}</Text>
                {finalized.paymentMethod === 'stripe' && (
                  <Text color={c.muted} fontSize="xs">Redirected to Stripe checkout page</Text>
                )}
                {isDepositPayment && isDepositPaid && (
                  <Text color="#22C55E" fontSize="xs">Balance of £{remainingBalance.toFixed(2)} to collect on-site</Text>
                )}
              </Box>
            </Flex>

            {/* Deposit info banner when deposit is paid */}
            {isDepositPayment && isDepositPaid && (
              <Box bg="rgba(34, 197, 94, 0.1)" p={4} borderRadius="8px" borderLeft="3px solid #22C55E">
                <Flex justify="space-between" mb={2}>
                  <Text color={c.muted} fontSize="sm">Deposit Paid</Text>
                  <Text color="#22C55E" fontSize="lg" fontWeight="700">£{depositAmount.toFixed(2)}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={c.text} fontSize="sm" fontWeight="600">Collect on arrival</Text>
                  <Text color={c.accent} fontSize="lg" fontWeight="700">£{remainingBalance.toFixed(2)}</Text>
                </Flex>
              </Box>
            )}

            <Box bg={c.surface} p={4} borderRadius="8px">
              <Text color={c.muted} fontSize="xs" mb={2}>Payable quote</Text>
              <Flex justify="space-between" align="center">
                <Text color={c.text} fontSize="md" fontWeight="700">Total</Text>
                <Text color={c.accent} fontSize="xl" fontWeight="700">
                  {formatGbp(payableTotal)}
                </Text>
              </Flex>
            </Box>

            <Box bg={c.surface} p={3} borderRadius="8px">
              <Text color={c.muted} fontSize="xs">Invoice</Text>
              <Text color={c.text} fontSize="sm" fontWeight="600">{finalized.invoiceNumber}</Text>
            </Box>

            {isDepositPayment && !isDepositPaid && (
              <Button
                w="100%"
                h="48px"
                variant="outline"
                borderColor={c.accent}
                color={c.accent}
                bg="transparent"
                fontWeight="700"
                borderRadius="8px"
                _hover={{ bg: 'rgba(249, 115, 22, 0.08)' }}
                onClick={() => initiateDepositPayment(finalized.bookingId)}
                disabled={depositLoading}
              >
                {depositLoading ? <Spinner size="sm" /> : `💰 Retry Deposit Payment (£${depositAmount.toFixed(2)})`}
              </Button>
            )}

            {isStripePayment && (
              <VStack gap={2} align="stretch">
                <Box bg="rgba(249, 115, 22, 0.08)" p={3} borderRadius="8px" borderLeft={`3px solid ${c.accent}`}>
                  <Text color={c.text} fontSize="sm" fontWeight="600">
                    Stripe Checkout opened in a new tab
                  </Text>
                  <Text color={c.muted} fontSize="xs" mt={1}>
                    If the customer cancels or closes the tab, click Retry below to send a fresh checkout link.
                  </Text>
                </Box>
                <Button
                  w="100%"
                  h="48px"
                  variant="outline"
                  borderColor={c.accent}
                  color={c.accent}
                  bg="transparent"
                  fontWeight="700"
                  borderRadius="8px"
                  _hover={{ bg: 'rgba(249, 115, 22, 0.08)' }}
                  onClick={retryStripePayment}
                  disabled={stripeRetryLoading}
                >
                  {stripeRetryLoading ? <Spinner size="sm" /> : `💳 Retry Stripe Payment (£${finalized.breakdown.total.toFixed(2)})`}
                </Button>
                {stripeRetryError && (
                  <Text color="red.400" fontSize="sm">{stripeRetryError}</Text>
                )}
              </VStack>
            )}

            {depositError && (
              <Text color="red.400" fontSize="sm">{depositError}</Text>
            )}

            <HStack gap={3}>
              <a href={`/admin/bookings/${finalized.refNumber}`} style={{ flex: 1 }}>
                <Button w="100%" bg={c.accent} color="#09090B" h="48px" fontWeight="700" borderRadius="8px">
                  View Booking
                </Button>
              </a>
              <Button
                flex={1}
                h="48px"
                variant="outline"
                borderColor={c.border}
                color={c.text}
                fontWeight="600"
                borderRadius="8px"
                onClick={handleReset}
              >
                New Booking
              </Button>
            </HStack>
          </VStack>
        </Box>

        {/* Deposit payment dialog */}
        {depositDialogOpen && depositClientSecret && depositInfo && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDepositDialog();
            }}
          >
            <Box
              bg={c.card}
              borderRadius="12px"
              border={`1px solid ${c.border}`}
              maxW="480px"
              w="100%"
              maxH="90vh"
              overflowY="auto"
              p={6}
            >
              <Flex justify="space-between" align="center" mb={4}>
                <Text fontSize="lg" fontWeight="700" color={c.text}>💰 Pay Deposit</Text>
                <Button
                  size="sm"
                  variant="ghost"
                  color={c.muted}
                  onClick={closeDepositDialog}
                >
                  ✕
                </Button>
              </Flex>
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: depositClientSecret,
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: '#F97316',
                      colorBackground: '#18181B',
                      colorText: '#FAFAFA',
                      colorDanger: '#EF4444',
                      borderRadius: '8px',
                    },
                  },
                }}
              >
                <DepositCheckoutFormInner
                  depositAmount={depositInfo.depositAmount}
                  remainingBalance={depositInfo.remainingBalance}
                  bookingId={depositInfo.bookingId}
                  onSuccess={handleDepositSuccess}
                  onCancel={closeDepositDialog}
                />
              </Elements>
            </Box>
          </div>
        )}

        {/* Styled confirm-close modal (replaces window.confirm) */}
        {confirmCloseOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmCloseOpen(false);
            }}
          >
            <Box
              bg={c.card}
              borderRadius="12px"
              border={`1px solid ${c.border}`}
              maxW="420px"
              w="100%"
              p={6}
              boxShadow="0 20px 60px rgba(0,0,0,0.5)"
            >
              <Flex align="center" gap={3} mb={3}>
                <Text fontSize="28px">⚠️</Text>
                <Text fontSize="lg" fontWeight="700" color={c.text}>
                  Close without paying?
                </Text>
              </Flex>
              <Text color={c.muted} fontSize="sm" mb={5} lineHeight="1.5">
                The booking has already been created and will remain{' '}
                <Text as="span" color="#F59E0B" fontWeight="600">awaiting payment</Text>.
                You can re-open the deposit payment from the booking screen.
              </Text>
              <HStack gap={3}>
                <Button
                  flex={1}
                  h="44px"
                  variant="outline"
                  borderColor={c.border}
                  color={c.text}
                  fontWeight="600"
                  borderRadius="8px"
                  onClick={() => setConfirmCloseOpen(false)}
                >
                  Keep Paying
                </Button>
                <Button
                  flex={1}
                  h="44px"
                  bg="#EF4444"
                  color="white"
                  fontWeight="700"
                  borderRadius="8px"
                  onClick={confirmCloseDeposit}
                >
                  Close Anyway
                </Button>
              </HStack>
            </Box>
          </div>
        )}
      </>
    );
  }

  // ── Success state (pre-finalize) ──
  if (status === 'success' && created) {
    const selectedTyreUnitPrice = created.booking.selectedTyreUnitPrice
      ? Number(created.booking.selectedTyreUnitPrice)
      : null;
    const hasTyreSnapshot =
      Boolean(created.booking.selectedTyreProductId) &&
      selectedTyreUnitPrice != null &&
      Number.isFinite(selectedTyreUnitPrice);
    const tyreLineTotal = hasTyreSnapshot
      ? selectedTyreUnitPrice! * form.tyreCount
      : 0;

    return (
      <Box bg={c.card} p={6} borderRadius="12px" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
        <VStack gap={5} align="stretch">
          <Flex align="center" gap={3}>
            <Text fontSize="32px">📋</Text>
            <Box>
              <Text color={c.text} fontSize="lg" fontWeight="600">Draft Created</Text>
              <Text color={c.muted} fontSize="sm">Ready to finalize into a real booking</Text>
            </Box>
          </Flex>

          <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid ${hasTyreSnapshot ? '#22C55E' : '#64748B'}`}>
            <Text color={c.text} fontSize="sm" fontWeight="600" mb={2}>Pricing Mode</Text>
            <Text color={hasTyreSnapshot ? '#22C55E' : c.muted} fontSize="sm" fontWeight="600">
              {hasTyreSnapshot ? 'Includes tyre product pricing' : 'Service-only pricing'}
            </Text>
            {hasTyreSnapshot && (
              <VStack align="stretch" gap={1} mt={2}>
                <Text color={c.text} fontSize="sm">
                  {created.booking.selectedTyreBrand} {created.booking.selectedTyrePattern}
                </Text>
                <Text color={c.muted} fontSize="xs">
                  Unit price: £{selectedTyreUnitPrice!.toFixed(2)} x {form.tyreCount}
                </Text>
                <Text color={c.accent} fontSize="sm" fontWeight="700">
                  Tyre line: £{tyreLineTotal.toFixed(2)}
                </Text>
              </VStack>
            )}
          </Box>

          {/* ═══ LOCATION SECTION WITH MAP ═══ */}
          <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid #3B82F6`}>
            <Text color={c.text} fontSize="sm" fontWeight="600" mb={3}>📍 Customer Location</Text>
            
            {created.booking.locationLat ? (
              <VStack align="stretch" gap={4}>
                {/* ── LIVE MAP ── */}
                <Box borderRadius="8px" overflow="hidden" h="280px">
                  <QuickBookMap
                    customerLat={Number(created.booking.locationLat)}
                    customerLng={Number(created.booking.locationLng)}
                    serviceOriginLat={created.booking.priceBreakdown?.serviceOrigin?.lat}
                    serviceOriginLng={created.booking.priceBreakdown?.serviceOrigin?.lng}
                    serviceOriginSource={created.booking.priceBreakdown?.serviceOrigin?.source}
                    showRoute={true}
                    onRouteCalculated={(km, mins) => setRouteInfo({ drivingKm: km, drivingMinutes: mins })}
                  />
                </Box>

                {/* ── DISTANCE & ETA ── */}
                <Flex gap={4} wrap="wrap">
                  <Box flex={1} minW="120px" bg="rgba(34, 197, 94, 0.1)" p={3} borderRadius="8px">
                    <Text color={c.muted} fontSize="xs" mb={1}>🚗 Driving Distance</Text>
                    <Text color="#22C55E" fontSize="lg" fontWeight="700">
                      {routeInfo?.drivingKm
                        ? `${(routeInfo.drivingKm * 0.621371).toFixed(1)} mi`
                        : created.booking.distanceKm
                          ? `${(Number(created.booking.distanceKm) * 0.621371).toFixed(1)} mi`
                          : '—'}
                    </Text>
                    {(routeInfo?.drivingKm || created.booking.distanceKm) && (
                      <Text color={c.muted} fontSize="xs">
                        ({routeInfo?.drivingKm?.toFixed(1) || Number(created.booking.distanceKm).toFixed(1)} km)
                      </Text>
                    )}
                  </Box>
                  <Box flex={1} minW="120px" bg="rgba(249, 115, 22, 0.1)" p={3} borderRadius="8px">
                    <Text color={c.muted} fontSize="xs" mb={1}>⏱ ETA to Customer</Text>
                    <Text color={c.accent} fontSize="lg" fontWeight="700">
                      {routeInfo?.drivingMinutes ? `${routeInfo.drivingMinutes} min` : '—'}
                    </Text>
                    {!routeInfo?.drivingMinutes && (
                      <Text color={c.muted} fontSize="xs">Calculating...</Text>
                    )}
                  </Box>
                </Flex>

                {/* ── COORDINATES & ADDRESS ── */}
                <Box bg="rgba(59, 130, 246, 0.1)" p={3} borderRadius="8px">
                  <HStack justify="space-between" mb={2}>
                    <Text color={c.muted} fontSize="xs">Coordinates</Text>
                    <Text color="#22C55E" fontSize="xs" fontWeight="600">✓ Received</Text>
                  </HStack>
                  <HStack justify="space-between" align="center">
                    <Text color={c.text} fontSize="sm" fontFamily="monospace">
                      {Number(created.booking.locationLat).toFixed(6)}, {Number(created.booking.locationLng).toFixed(6)}
                    </Text>
                    <Button
                      size="xs"
                      bg={copiedCoords ? '#22C55E' : c.accent}
                      color="#09090B"
                      fontWeight="600"
                      onClick={() => {
                        const coords = `${Number(created.booking.locationLat).toFixed(6)}, ${Number(created.booking.locationLng).toFixed(6)}`;
                        navigator.clipboard.writeText(coords);
                        setCopiedCoords(true);
                        setTimeout(() => setCopiedCoords(false), 2000);
                      }}
                    >
                      {copiedCoords ? '✓ Copied' : '📋 Copy'}
                    </Button>
                  </HStack>
                  {form.locationAddress && (
                    <Text color={c.muted} fontSize="xs" mt={2}>
                      {form.locationAddress}
                    </Text>
                  )}
                </Box>

                {/* ── MAP ACTION BUTTONS ── */}
                <Box>
                  <Text color={c.muted} fontSize="xs" mb={2}>Quick Actions</Text>
                  <Flex gap={2} wrap="wrap">
                    <Button
                      size="sm"
                      bg="#4285F4"
                      color="white"
                      fontWeight="600"
                      onClick={() => {
                        const url = `https://www.google.com/maps?q=${created.booking.locationLat},${created.booking.locationLng}`;
                        window.open(url, '_blank');
                      }}
                    >
                      🗺️ Google Maps
                    </Button>
                    <Button
                      size="sm"
                      bg="#34A853"
                      color="white"
                      fontWeight="600"
                      onClick={() => {
                        const url = `https://www.google.com/maps/dir/?api=1&origin=55.8547,-4.2206&destination=${created.booking.locationLat},${created.booking.locationLng}&travelmode=driving`;
                        window.open(url, '_blank');
                      }}
                    >
                      🚗 Get Directions
                    </Button>
                    <Button
                      size="sm"
                      bg="#1DA1F2"
                      color="white"
                      fontWeight="600"
                      onClick={() => {
                        const url = `https://waze.com/ul?ll=${created.booking.locationLat},${created.booking.locationLng}&navigate=yes`;
                        window.open(url, '_blank');
                      }}
                    >
                      📍 Waze
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor={c.border}
                      color={c.text}
                      fontWeight="600"
                      onClick={() => {
                        const coords = `${Number(created.booking.locationLat).toFixed(6)}, ${Number(created.booking.locationLng).toFixed(6)}`;
                        navigator.clipboard.writeText(coords);
                        setCopiedCoords(true);
                        setTimeout(() => setCopiedCoords(false), 2000);
                      }}
                    >
                      {copiedCoords ? '✓ Copied' : '📋 Copy Coords'}
                    </Button>
                  </Flex>
                </Box>
              </VStack>
            ) : created.locationLink ? (
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                  <Text color={c.muted} fontSize="xs">Location Link (expires 2h)</Text>
                  <Text color="#F59E0B" fontSize="xs" fontWeight="600">⏳ Pending</Text>
                </HStack>
                <Text color={c.accent} fontSize="sm" wordBreak="break-all">
                  {created.locationLink}
                </Text>
                <Flex gap={2} wrap="wrap">
                  <Button
                    size="sm"
                    bg={c.accent}
                    color="#09090B"
                    fontWeight="600"
                    onClick={() => {
                      const ctx: LocationMessageContext = {
                        customerName: form.customerName,
                        locationLink: created.locationLink!,
                        serviceType: form.serviceType,
                      };
                      handleCopy(buildLocationCopyMessage(ctx));
                    }}
                  >
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </Button>
                  {created.whatsappLink && (
                    <a href={created.whatsappLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" bg="#25D366" color="white" fontWeight="600">
                        WhatsApp
                      </Button>
                    </a>
                  )}
                  <Button size="sm" bg="#3B82F6" color="white" fontWeight="600" onClick={handleSendSms} disabled={smsSending}>
                    {smsSending ? '⏳ Sending…' : '💬 SMS'}
                  </Button>
                  {form.customerEmail && (
                    <Button size="sm" bg="#8B5CF6" color="white" fontWeight="600" onClick={handleSendEmail} disabled={emailSending}>
                      {emailSending ? '⏳ Sending…' : '✉️ Email'}
                    </Button>
                  )}
                </Flex>
                {smsResult && (
                  <Text fontSize="xs" color={smsResult.ok ? 'green.500' : 'red.500'}>
                    {smsResult.ok ? '✅ SMS sent successfully' : `❌ SMS failed: ${smsResult.error}`}
                  </Text>
                )}
                {emailResult && (
                  <Text fontSize="xs" color={emailResult.ok ? 'green.500' : 'red.500'}>
                    {emailResult.ok ? '✅ Email sent successfully' : `❌ Email failed: ${emailResult.error}`}
                  </Text>
                )}
                <Text color={c.muted} fontSize="xs">
                  Send this link to the customer so they can share their GPS location
                </Text>
              </VStack>
            ) : (
              <Text color={c.muted} fontSize="sm">Address entered manually during booking</Text>
            )}
          </Box>

          {/* ═══ PRICING SECTION ═══ */}
          {created.booking.totalPrice && (
            <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid #22C55E`}>
              {(() => {
                const payableTotal = getBackendQuoteTotal(
                  created.booking.priceBreakdown,
                  created.booking.totalPrice,
                );

                return (
                  <>
                    <Text color={c.text} fontSize="sm" fontWeight="600" mb={3}>Payable quote</Text>
                    <Flex justify="space-between" align="center">
                      <Text color={c.text} fontSize="md" fontWeight="700">Total</Text>
                      <Text color={c.accent} fontSize="xl" fontWeight="700">
                        {formatGbp(payableTotal)}
                      </Text>
                    </Flex>
                  </>
                );
              })()}

            </Box>
          )}

          {/* ═══ ADMIN ADJUSTMENT ═══ */}
          <Box bg={c.surface} p={4} borderRadius="8px" borderLeft="3px solid #F59E0B">
            {!showAdjustment ? (
              <VStack gap={2} align="stretch">
                {created.booking.adminAdjustmentAmount && Number(created.booking.adminAdjustmentAmount) !== 0 ? (
                  <>
                    <Flex justify="space-between" align="center">
                      <Text color="#F59E0B" fontSize="sm" fontWeight="600">
                        ✓ Adjustment applied to quote total
                      </Text>
                      <Text color="#F59E0B" fontSize="sm" fontWeight="700">
                        {Number(created.booking.adminAdjustmentAmount) >= 0 ? '+' : ''}£{Number(created.booking.adminAdjustmentAmount).toFixed(2)}
                      </Text>
                    </Flex>
                    {created.booking.adminAdjustmentReason && (
                      <Text color={c.muted} fontSize="xs">
                        Reason: {created.booking.adminAdjustmentReason}
                      </Text>
                    )}
                    <Button
                      w="100%"
                      variant="outline"
                      borderColor="#F59E0B"
                      color="#F59E0B"
                      fontWeight="600"
                      borderRadius="8px"
                      onClick={() => setShowAdjustment(true)}
                    >
                      ✏️ Edit Adjustment
                    </Button>
                  </>
                ) : (
                  <Button
                    w="100%"
                    variant="outline"
                    borderColor="#F59E0B"
                    color="#F59E0B"
                    fontWeight="600"
                    borderRadius="8px"
                    onClick={() => setShowAdjustment(true)}
                  >
                    ➕ Add Price Adjustment
                  </Button>
                )}
              </VStack>
            ) : (
              <VStack gap={3} align="stretch">
                <Text color={c.text} fontSize="sm" fontWeight="600">Manual Price Adjustment</Text>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount (e.g. 15.00)"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  {...inputProps}
                />
                <Input
                  placeholder="Reason (optional)"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  {...inputProps}
                />
                <HStack gap={2}>
                  <Button
                    flex={1}
                    bg="#F59E0B"
                    color="#09090B"
                    fontWeight="600"
                    borderRadius="8px"
                    onClick={handleSaveAdjustment}
                    disabled={adjustmentSaving || !adjustmentAmount}
                  >
                    {adjustmentSaving ? <Spinner size="xs" /> : 'Apply'}
                  </Button>
                  {created.booking.adminAdjustmentAmount && Number(created.booking.adminAdjustmentAmount) !== 0 && (
                    <Button
                      flex={1}
                      variant="outline"
                      borderColor="red.500"
                      color="red.400"
                      fontWeight="600"
                      borderRadius="8px"
                      onClick={handleRemoveAdjustment}
                      disabled={adjustmentSaving}
                    >
                      Remove
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    color={c.muted}
                    onClick={() => setShowAdjustment(false)}
                  >
                    Cancel
                  </Button>
                </HStack>
              </VStack>
            )}
          </Box>

          {error && <Text color="red.400" fontSize="sm">{error}</Text>}

          {/* ═══ PAYMENT SECTION ═══ */}
          <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid ${c.accent}`}>
            <Text color={c.text} fontSize="sm" fontWeight="600" mb={3}>💳 Payment Method</Text>
            <VStack gap={2}>
              <Stack
                direction={{ base: 'column', md: 'row' }}
                gap={2}
                w="100%"
              >
                <Button
                  flex={1}
                  w="100%"
                  bg={c.accent}
                  color="#09090B"
                  h="52px"
                  fontWeight="700"
                  borderRadius="8px"
                  fontSize="14px"
                  onClick={() => handleFinalize('stripe')}
                  disabled={isFinalizing || depositLoading}
                >
                  {isFinalizing ? <Spinner size="sm" /> : '💳 Pay Full'}
                </Button>
                <Button
                  flex={1}
                  w="100%"
                  variant="outline"
                  borderColor={c.accent}
                  color={c.accent}
                  bg="transparent"
                  h="52px"
                  fontWeight="700"
                  borderRadius="8px"
                  fontSize="14px"
                  _hover={{ bg: 'rgba(249, 115, 22, 0.08)' }}
                  onClick={() => handleFinalize('deposit')}
                  disabled={isFinalizing || depositLoading}
                >
                  {depositLoading ? <Spinner size="sm" /> : '💰 Pay Deposit (20%)'}
                </Button>
                <Button
                  flex={1}
                  w="100%"
                  bg="#22C55E"
                  color="white"
                  h="52px"
                  fontWeight="700"
                  borderRadius="8px"
                  fontSize="14px"
                  onClick={() => handleFinalize('cash')}
                  disabled={isFinalizing || depositLoading}
                >
                  {isFinalizing ? <Spinner size="sm" /> : '💵 Cash'}
                </Button>
              </Stack>
              <Text color={c.muted} fontSize="xs" textAlign="center">
                Pay Full: Stripe checkout • Deposit: 20% now, balance on-site • Cash: marks as paid
              </Text>
              {depositError && (
                <Text color="red.400" fontSize="xs">{depositError}</Text>
              )}
            </VStack>
          </Box>

          <Button
            w="100%"
            h="44px"
            variant="outline"
            borderColor={c.border}
            color={c.muted}
            fontWeight="500"
            borderRadius="8px"
            onClick={handleReset}
          >
            Cancel / Start Over
          </Button>
        </VStack>
      </Box>
    );
  }

  // Polling state (waiting for customer location)
  if (status === 'polling' && created) {
    return (
      <Box bg={c.card} p={6} borderRadius="12px" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
        <VStack gap={6} align="stretch">
          <Flex align="center" gap={3}>
            <Spinner size="md" color={c.accent} />
            <Box>
              <Text color={c.text} fontSize="lg" fontWeight="600">
                Waiting for customer location
              </Text>
              <Text color={c.muted} fontSize="sm">Polling every 3 seconds...</Text>
            </Box>
          </Flex>

          {/* ═══ LOCATION SHARING SECTION ═══ */}
          {created.locationLink && (
            <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid #3B82F6`}>
              <Text color={c.text} fontSize="sm" fontWeight="600" mb={2}>📍 Location Link (send to customer)</Text>
              <Text color={c.accent} fontSize="sm" wordBreak="break-all" mb={3}>
                {created.locationLink}
              </Text>
              <Flex gap={2} wrap="wrap">
                <Button
                  size="sm"
                  bg={c.accent}
                  color="#09090B"
                  fontWeight="600"
                  onClick={() => {
                    const ctx: LocationMessageContext = {
                      customerName: form.customerName,
                      locationLink: created.locationLink!,
                      serviceType: form.serviceType,
                    };
                    handleCopy(buildLocationCopyMessage(ctx));
                  }}
                >
                  {copied ? '✓ Copied' : '📋 Copy Link'}
                </Button>
                {created.whatsappLink && (
                  <a href={created.whatsappLink} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" bg="#25D366" color="white" fontWeight="600">
                      WhatsApp
                    </Button>
                  </a>
                )}
                <Button size="sm" bg="#3B82F6" color="white" fontWeight="600" onClick={handleSendSms} disabled={smsSending}>
                  {smsSending ? '⏳ Sending…' : '💬 Text / SMS'}
                </Button>
                {form.customerEmail && (
                  <Button size="sm" bg="#8B5CF6" color="white" fontWeight="600" onClick={handleSendEmail} disabled={emailSending}>
                    {emailSending ? '⏳ Sending…' : '✉️ Email'}
                  </Button>
                )}
              </Flex>
              {smsResult && (
                <Text fontSize="xs" color={smsResult.ok ? 'green.500' : 'red.500'}>
                  {smsResult.ok ? '✅ SMS sent successfully' : `❌ SMS failed: ${smsResult.error}`}
                </Text>
              )}
              {emailResult && (
                <Text fontSize="xs" color={emailResult.ok ? 'green.500' : 'red.500'}>
                  {emailResult.ok ? '✅ Email sent successfully' : `❌ Email failed: ${emailResult.error}`}
                </Text>
              )}
              <Text color={c.muted} fontSize="xs" mt={2}>
                Customer clicks this link to share their GPS location with you
              </Text>
            </Box>
          )}

          <Button variant="ghost" color={c.muted} size="sm" onClick={handleReset}>
            Cancel / Start Over
          </Button>
        </VStack>
      </Box>
    );
  }

  // ── Main form ──
  return (
    <Box bg={c.card} p={6} borderRadius="12px" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
      <VStack gap={5} align="stretch">
        {/* Customer Details */}
        <Text color={c.text} fontSize="sm" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em">
          Customer
        </Text>
        <Flex gap={3} direction={{ base: 'column', md: 'row' }}>
          <Input
            flex={1}
            placeholder="Name *"
            value={form.customerName}
            onChange={(e) => set('customerName', e.target.value)}
            {...inputProps}
          />
          <Input
            flex={1}
            placeholder="Phone *"
            value={form.customerPhone}
            onChange={(e) => set('customerPhone', e.target.value)}
            {...inputProps}
          />
        </Flex>
        <Input
          placeholder={form.customerEmailMode === 'send_customer_confirmation' ? 'Email *' : 'Email (optional)'}
          value={form.customerEmail}
          onChange={(e) => set('customerEmail', e.target.value)}
          {...inputProps}
        />

        {/* Email mode toggle */}
        <Flex gap={2}>
          {(['walk_in_customer', 'send_customer_confirmation'] as CustomerEmailMode[]).map((mode) => (
            <Box
              key={mode}
              as="button"
              flex={1}
              p={3}
              borderRadius="8px"
              borderWidth="2px"
              borderColor={form.customerEmailMode === mode ? c.accent : c.border}
              bg={form.customerEmailMode === mode ? 'rgba(249,115,22,0.1)' : c.surface}
              color={form.customerEmailMode === mode ? c.accent : c.muted}
              cursor="pointer"
              transition="all 0.2s"
              textAlign="center"
              fontSize="12px"
              fontWeight="600"
              onClick={() => set('customerEmailMode', mode)}
              _hover={{ borderColor: c.accent }}
            >
              {mode === 'walk_in_customer' ? 'Walk-in — no email' : 'Send confirmation email'}
            </Box>
          ))}
        </Flex>

        {/* Location */}
        <Text color={c.text} fontSize="sm" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em" mt={2}>
          Location
        </Text>
        <Flex gap={3}>
          {(['address', 'link'] as LocationMethod[]).map((m) => (
            <Box
              key={m}
              as="button"
              flex={1}
              p={4}
              borderRadius="8px"
              borderWidth="2px"
              borderColor={form.locationMethod === m ? c.accent : c.border}
              bg={form.locationMethod === m ? 'rgba(249,115,22,0.1)' : c.surface}
              color={form.locationMethod === m ? c.accent : c.text}
              cursor="pointer"
              transition="all 0.2s"
              textAlign="center"
              minH="48px"
              onClick={() => set('locationMethod', m)}
              _hover={{ borderColor: c.accent }}
            >
              <Text fontSize="lg" mb={1}>
                {m === 'address' ? '🏠' : '📍'}
              </Text>
              <Text fontSize="13px" fontWeight="600">
                {m === 'address' ? 'Enter Address' : 'Send Link'}
              </Text>
            </Box>
          ))}
        </Flex>

        {form.locationMethod === 'address' && (
          <Box position="relative" style={anim.fadeUp('0.3s')}>
            <Input
              placeholder="Start typing address or postcode..."
              value={form.locationAddress}
              onChange={(e) => handleAddressChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              {...inputProps}
            />
            {isSearchingAddress && (
              <Box position="absolute" right="12px" top="50%" transform="translateY(-50%)">
                <Spinner size="xs" color={c.accent} />
              </Box>
            )}
            {showSuggestions && addressSuggestions.length > 0 && (
              <Box
                position="absolute"
                top="100%"
                left={0}
                right={0}
                bg={c.card}
                border={`1px solid ${c.border}`}
                borderRadius="8px"
                mt={1}
                zIndex={10}
                maxH="240px"
                overflow="auto"
                boxShadow="0 8px 24px rgba(0,0,0,0.3)"
              >
                {addressSuggestions.map((s) => (
                  <Box
                    key={s.id}
                    px={4}
                    py={3}
                    cursor="pointer"
                    _hover={{ bg: c.surface }}
                    borderBottom={`1px solid ${c.border}`}
                    onMouseDown={() => selectAddress(s)}
                  >
                    <Text color={c.text} fontSize="sm">{s.place_name}</Text>
                  </Box>
                ))}
              </Box>
            )}
            {form.locationLat && (
              <Text color="#22C55E" fontSize="xs" mt={1}>
                ✓ Location confirmed ({form.locationLat.toFixed(4)}, {form.locationLng?.toFixed(4)})
              </Text>
            )}
          </Box>
        )}

        {form.locationMethod === 'link' && (
          <Box bg={c.surface} p={3} borderRadius="8px" style={anim.fadeUp('0.3s')}>
            <Text color={c.muted} fontSize="sm">
              A location sharing link will be generated. Send via WhatsApp or copy to clipboard.
              Expires in 2 hours.
            </Text>
          </Box>
        )}

        {/* Service */}
        <Text color={c.text} fontSize="sm" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em" mt={2}>
          Service
        </Text>
        <Flex gap={3}>
          {(['fit', 'repair', 'assess'] as const).map((s) => (
            <Box
              key={s}
              as="button"
              flex={1}
              py={3}
              borderRadius="8px"
              borderWidth="2px"
              borderColor={form.serviceType === s ? c.accent : c.border}
              bg={form.serviceType === s ? 'rgba(249,115,22,0.1)' : c.surface}
              color={form.serviceType === s ? c.accent : c.text}
              cursor="pointer"
              transition="all 0.2s"
              textAlign="center"
              onClick={() => set('serviceType', s)}
              _hover={{ borderColor: c.accent }}
            >
              <Text fontSize="13px" fontWeight="600" textTransform="capitalize">
                {s === 'fit' ? 'Tyre Fitting' : s === 'repair' ? 'Repair' : 'Assessment'}
              </Text>
            </Box>
          ))}
        </Flex>

        <Flex gap={3}>
          <Box flex={1} position="relative">
            <Input
              placeholder="Tyre size e.g. 205/55R16"
              value={form.tyreSize}
              onChange={(e) => handleTyreSizeChange(e.target.value)}
              onFocus={() => setShowTyreSuggestions(true)}
              onBlur={() => setTimeout(() => setShowTyreSuggestions(false), 200)}
              {...inputProps}
            />
            {showTyreSuggestions && tyreSuggestions.length > 0 && (
              <Box
                position="absolute"
                top="100%"
                left={0}
                right={0}
                bg={c.card}
                border={`1px solid ${c.border}`}
                borderRadius="8px"
                mt={1}
                zIndex={10}
                maxH="200px"
                overflow="auto"
                boxShadow="0 8px 24px rgba(0,0,0,0.3)"
              >
                {tyreSuggestions.map((s) => (
                  <Box
                    key={s.size}
                    px={4}
                    py={3}
                    cursor="pointer"
                    _hover={{ bg: c.surface }}
                    borderBottom={`1px solid ${c.border}`}
                    onMouseDown={() => selectTyreSize(s.size)}
                  >
                    <Flex justify="space-between" align="center">
                      <Text color={c.text} fontSize="sm" fontWeight="600">{s.size}</Text>
                      <Text color={c.muted} fontSize="xs">{s.count} in stock</Text>
                    </Flex>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          <Box w="100px">
            <Input
              type="number"
              min={1}
              max={10}
              value={form.tyreCount}
              onChange={(e) => set('tyreCount', Math.max(1, parseInt(e.target.value) || 1))}
              textAlign="center"
              {...inputProps}
            />
            <Text color={c.muted} fontSize="xs" textAlign="center" mt={1}>Qty</Text>
          </Box>
        </Flex>

        <Textarea
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          bg={c.input.bg}
          borderColor={c.input.border}
          color={c.input.text}
          fontSize="15px"
          borderRadius="6px"
          minH="80px"
          resize="vertical"
        />

        {error && <Text color="red.400" fontSize="sm">{error}</Text>}

        <Button
          w="100%"
          h="56px"
          bg={c.accent}
          color="#09090B"
          fontSize="16px"
          fontWeight="700"
          borderRadius="8px"
          _hover={{ bg: c.accentHover }}
          onClick={handleSubmit}
          disabled={
            status === 'submitting' ||
            !form.customerName ||
            !form.customerPhone ||
            (form.locationMethod === 'address' && !form.locationAddress)
          }
        >
          {status === 'submitting' ? <Spinner size="sm" /> : 'Create Quick Booking'}
        </Button>
      </VStack>
    </Box>
  );
}

~~~

## components/booking/StepCustomerDetails.tsx

~~~
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Checkbox,
  Fieldset,
  Field,
  Spinner,
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react';
import { WizardState, WizardStep } from './types';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { API } from '@/lib/api-endpoints';
import { EMAIL_REGEX, PHONE_DISPLAY_REGEX } from '@/lib/utils';
import { getStoredUtm } from '@/lib/hooks/useUtmCapture';
import { formatPrice } from '@/lib/pricing-engine';

interface StepCustomerDetailsProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
  goToStep?: (step: WizardStep) => void;
}

export function StepCustomerDetails({
  state,
  updateState,
  goToNext,
  goToPrev,
  goToStep,
}: StepCustomerDetailsProps) {
  const { data: session } = useSession();
  
  const [name, setName] = useState(state.customerName || '');
  const [email, setEmail] = useState(state.customerEmail || '');
  const [phone, setPhone] = useState(state.customerPhone || '');
  const [createAccount, setCreateAccount] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [domainSuggestions, setDomainSuggestions] = useState<string[]>([]);

  const COMMON_DOMAINS = [
    'gmail.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk',
    'outlook.com', 'icloud.com', 'aol.com', 'live.co.uk',
    'btinternet.com', 'sky.com', 'virginmedia.com',
  ];
  const sessionName = session?.user?.name;
  const sessionEmail = session?.user?.email;

  // Pre-fill from session if logged in
  useEffect(() => {
    if (sessionName) setName((current) => current || sessionName);
    if (sessionEmail) setEmail((current) => current || sessionEmail);
  }, [sessionEmail, sessionName]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!EMAIL_REGEX.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!PHONE_DISPLAY_REGEX.test(phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    // Update local state first
    const customerDetails = {
      customerName: name.trim(),
      customerEmail: email.trim(),
      customerPhone: phone.trim(),
      createAccount,
    };
    updateState(customerDetails);

    try {
      // Create the booking
      const utm = getStoredUtm();
      const res = await fetch(API.BOOKINGS_CREATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: state.quoteId,
          customerName: customerDetails.customerName,
          customerEmail: customerDetails.customerEmail,
          customerPhone: customerDetails.customerPhone,
          vehicleReg: state.vehicleReg || undefined,
          tyrePhotoUrl: state.tyrePhotoUrl || undefined,
          lockingNutStatus: state.lockingNutStatus || undefined,
          notes: undefined,
          ...(utm || {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.code === 'SLOT_UNAVAILABLE') {
          updateState({
            scheduledDate: null,
            scheduledTime: null,
            quoteId: null,
            breakdown: null,
            quoteExpiresAt: null,
          });
          goToStep?.('schedule');
        }
        throw new Error(data.message || data.error || 'Failed to create booking');
      }

      // Update state with booking details and Stripe client secret
      updateState({
        bookingId: data.bookingId,
        refNumber: data.refNumber,
        stripeClientSecret: data.stripeClientSecret,
      });

      goToNext();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to create booking'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoggedIn = !!session?.user;
  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Your details
        </Text>
        <Text color={c.muted}>
          We&apos;ll use this to contact you about your booking.
        </Text>
      </Box>

      {/* Compact order summary */}
      {state.breakdown && (
        <Box p={4} bg={c.surface} borderRadius="md" borderWidth="1px" borderColor={c.border}>
          <HStack justify="space-between">
            <Text fontWeight="600" color={c.text}>
              Total
            </Text>
            <Text fontWeight="700" color={c.accent}>{formatPrice(state.breakdown.total)}</Text>
          </HStack>
        </Box>
      )}

      {isLoggedIn && (
        <Box p={3} bg="rgba(34,197,94,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(34,197,94,0.3)">
          <Text color="green.400" fontSize="sm">
            Logged in as {session.user.email}
          </Text>
        </Box>
      )}

      <Fieldset.Root disabled={isSubmitting}>
        <Fieldset.Content>
          {/* Name */}
          <Field.Root invalid={!!errors.name}>
            <Field.Label fontWeight="500">
              Full name
              <Text as="span" color="red.500" ml={1}>*</Text>
            </Field.Label>
            <Box style={anim.fadeUp('0.4s', '0.1s')}>
            <Input {...inputProps}
              placeholder="John Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              size="lg"
            />
            </Box>
            {errors.name && (
              <Field.ErrorText>{errors.name}</Field.ErrorText>
            )}
          </Field.Root>

          {/* Email */}
          <Field.Root invalid={!!errors.email}>
            <Field.Label fontWeight="500">
              Email address
              <Text as="span" color="red.500" ml={1}>*</Text>
            </Field.Label>
            <Box style={anim.fadeUp('0.4s', '0.2s')} position="relative">
            <Input {...inputProps}
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => {
                const val = e.target.value;
                setEmail(val);
                const atIndex = val.indexOf('@');
                if (atIndex > 0) {
                  const partial = val.slice(atIndex + 1).toLowerCase();
                  if (partial && !partial.includes('.') || (partial.includes('.') && !COMMON_DOMAINS.includes(partial))) {
                    setDomainSuggestions(
                      COMMON_DOMAINS.filter(d => d.startsWith(partial)).slice(0, 4)
                    );
                  } else {
                    setDomainSuggestions([]);
                  }
                } else {
                  setDomainSuggestions([]);
                }
              }}
              onBlur={() => setTimeout(() => setDomainSuggestions([]), 150)}
              autoComplete="email"
              size="lg"
            />
            {domainSuggestions.length > 0 && (
              <Box
                position="absolute"
                top="100%"
                left={0}
                right={0}
                mt={1}
                bg={c.surface}
                border={`1px solid ${c.border}`}
                borderRadius="8px"
                overflow="hidden"
                zIndex={10}
                boxShadow="lg"
              >
                {domainSuggestions.map((domain) => {
                  const localPart = email.split('@')[0];
                  const suggestion = `${localPart}@${domain}`;
                  return (
                    <Box
                      key={domain}
                      px={3}
                      py={2}
                      cursor="pointer"
                      fontSize="14px"
                      color={c.text}
                      _hover={{ bg: c.border }}
                      onClick={() => {
                        setEmail(suggestion);
                        setDomainSuggestions([]);
                      }}
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {localPart}@<Text as="span" color={c.accent} fontWeight="600">{domain}</Text>
                    </Box>
                  );
                })}
              </Box>
            )}
            </Box>
            {errors.email && (
              <Field.ErrorText>{errors.email}</Field.ErrorText>
            )}
            <Field.HelperText>
              We&apos;ll send booking confirmation here
            </Field.HelperText>
          </Field.Root>

          {/* Phone */}
          <Field.Root invalid={!!errors.phone}>
            <Field.Label fontWeight="500">
              Phone number
              <Text as="span" color="red.500" ml={1}>*</Text>
            </Field.Label>
            <Box style={anim.fadeUp('0.4s', '0.3s')}>
            <Input {...inputProps}
              type="tel"
              placeholder="07123 456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              size="lg"
            />
            </Box>
            {errors.phone && (
              <Field.ErrorText>{errors.phone}</Field.ErrorText>
            )}
            <Field.HelperText>
              The driver will call this number when arriving
            </Field.HelperText>
          </Field.Root>

          {/* Create Account Checkbox */}
          {!isLoggedIn && (
            <Box pt={2}>
              <Checkbox.Root
                checked={createAccount}
                onCheckedChange={(e) => setCreateAccount(!!e.checked)}
                colorPalette="orange"
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control
                  borderColor={c.input.border}
                  bg="transparent"
                />
                <Checkbox.Label color={c.text}>
                  <VStack align="start" gap={0}>
                    <Text fontWeight="500">Create an account</Text>
                    <Text fontSize="sm" color={c.muted}>
                      Track your bookings and get faster checkout next time
                    </Text>
                  </VStack>
                </Checkbox.Label>
              </Checkbox.Root>
            </Box>
          )}
        </Fieldset.Content>
      </Fieldset.Root>

      {/* Terms Notice */}
      <Box fontSize="sm" color={c.muted} pt={2}>
        By continuing, you agree to our{' '}
        <Link href="/terms" style={{ textDecoration: 'underline' }}>
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" style={{ textDecoration: 'underline' }}>
          Privacy Policy
        </Link>
        .
      </Box>

      {/* Submit Error */}
      {submitError && (
        <Box p={4} bg="rgba(239,68,68,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.3)">
          <Text color="red.400">{submitError}</Text>
        </Box>
      )}

      {/* Navigation */}
      <HStack gap={4} pt={4}>
        <Button variant="outline" onClick={goToPrev} flex="1" disabled={isSubmitting}>
          Back
        </Button>
        <Button
          colorPalette="orange"
          onClick={handleContinue}
          flex="1"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <HStack gap={2}>
              <Spinner size="sm" />
              <Text>Creating booking...</Text>
            </HStack>
          ) : (
            'Continue to payment'
          )}
        </Button>
      </HStack>
    </VStack>
  );
}

~~~

## components/booking/StepPayment.tsx

~~~
'use client';

import { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
} from '@chakra-ui/react';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { formatPrice, PricingBreakdown } from '@/lib/pricing-engine';
import { trackConversion } from '@/lib/analytics/gtag';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import type { SelectedTyre } from './types';

// Load Stripe outside of component to avoid recreating on every render
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export interface StepPaymentProps {
  clientSecret: string;
  bookingId: string;
  refNumber: string;
  breakdown: PricingBreakdown;
  selectedTyres?: SelectedTyre[];
  onSuccess: (refNumber: string) => void;
  onError: (error: string) => void;
}

/**
 * Inner component that has access to Stripe hooks
 */
function CheckoutForm({
  refNumber,
  breakdown,
  onSuccess,
  onError,
}: Omit<StepPaymentProps, 'clientSecret' | 'bookingId' | 'selectedTyres'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/success/${refNumber}`,
      },
      redirect: 'if_required',
    });

    if (error) {
      // Payment failed or cancelled by user
      setErrorMessage(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
      onError(error.message || 'Payment failed');
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Payment succeeded without redirect — confirm server-side before navigating
      try {
        await fetch('/api/bookings/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: refNumber,
            paymentIntentId: paymentIntent.id,
          }),
        });
      } catch {
        // Non-blocking — webhook will handle it if this fails
      }
      trackConversion(breakdown.total / 100);
      onSuccess(refNumber);
    } else if (paymentIntent && paymentIntent.status === 'processing') {
      // Payment still processing (e.g. bank debits) — navigate to success page
      // which will show awaiting-confirmation state
      trackConversion(breakdown.total / 100);
      onSuccess(refNumber);
    } else {
      // Payment not succeeded (cancelled, requires_action, requires_payment_method, etc.)
      const statusMsg = paymentIntent?.status
        ? `Payment not completed (status: ${paymentIntent.status}). Please try again.`
        : 'Payment was not completed. Please try again.';
      setErrorMessage(statusMsg);
      setIsProcessing(false);
      onError(statusMsg);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={6} align="stretch">
        {/* Order Summary */}
        <Box style={anim.slideInLeft('0.6s', '0.1s')}>
          <Text fontWeight="600" fontSize="lg" mb={4}>
            Order Summary
          </Text>
          <Box
            bg={c.surface}
            borderRadius="md"
            p={4}
            borderWidth="1px"
            borderColor={c.border}
          >
            <HStack justify="space-between">
              <Text fontWeight="700" fontSize="lg" color={c.text}>
                Total
              </Text>
              <Text fontWeight="700" fontSize="xl" color={c.accent}>
                {formatPrice(breakdown.total)}
              </Text>
            </HStack>
          </Box>
        </Box>

        {/* Payment Element */}
        <Box style={anim.slideInRight('0.6s', '0.1s')}>
          <Text fontWeight="600" fontSize="lg" mb={4}>
            Payment Details
          </Text>
          <Box
            bg={c.surface}
            borderRadius="md"
            p={4}
            borderWidth="1px"
            borderColor={c.border}
          >
            <PaymentElement
              options={{
                layout: 'accordion',
                wallets: {
                  applePay: 'auto',
                  googlePay: 'auto',
                },
              }}
            />
          </Box>
        </Box>

        {/* Error Message */}
        {errorMessage && (
          <Box
            bg="rgba(239,68,68,0.1)"
            borderWidth="1px"
            borderColor="rgba(239,68,68,0.3)"
            borderRadius="md"
            p={4}
          >
            <Text color="red.400" fontSize="sm">
              {errorMessage}
            </Text>
          </Box>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          size="lg"
          colorPalette="orange"
          disabled={!stripe || !elements || isProcessing}
          width="full"
        >
          {isProcessing ? (
            <HStack gap={2}>
              <Spinner size="sm" />
              <Text>Processing payment...</Text>
            </HStack>
          ) : (
            `Pay ${formatPrice(breakdown.total)}`
          )}
        </Button>

        {/* Security Notice */}
        <Text fontSize="xs" color={c.muted} textAlign="center">
          Your payment is secured by Stripe. We never store your card details.
        </Text>
      </VStack>
    </form>
  );
}

/**
 * Step Payment Component
 * 
 * Wraps the checkout form in Stripe Elements provider.
 * Displays order summary alongside the payment form.
 * 
 * Design rules:
 * - No icons, no emojis, no decorative characters
 * - Typography and spacing carry hierarchy
 * - Professional, clean layout
 */
export function StepPayment({
  clientSecret,
  refNumber,
  breakdown,
  onSuccess,
  onError,
}: StepPaymentProps) {
  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'night',
      variables: {
        colorPrimary: c.accent,
        colorBackground: c.surface,
        colorText: c.text,
        colorDanger: '#ef4444',
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '6px',
      },
    },
  };

  if (!clientSecret) {
    return (
      <Box py={12} textAlign="center">
        <Spinner size="lg" />
        <Text mt={4} color={c.muted}>
          Preparing secure payment...
        </Text>
      </Box>
    );
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutForm
        refNumber={refNumber}
        breakdown={breakdown}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}

~~~

## components/booking/StepPricing.tsx

~~~
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, VStack, HStack, Text, Button, Spinner } from '@chakra-ui/react';
import { WizardState, WizardStep } from './types';
import { formatPrice, PricingBreakdown } from '@/lib/pricing-engine';
import { colorTokens as c } from '@/lib/design-tokens';
import { trackCallClick } from '@/lib/analytics/gtag';
import { anim } from '@/lib/animations';
import { API } from '@/lib/api-endpoints';

interface StepPricingProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
  goToStep?: (step: WizardStep) => void;
}

/** Auto-lookup cheapest matching tyre for emergency bookings that need replacement */
async function findCheapestMatchingTyre(
  tyreSize: { width: string; aspect: string; rim: string },
  quantity: number,
  service: 'fit' | 'assess',
): Promise<{
  tyreId: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  unitPrice: number;
  quantity: number;
  service: 'fit' | 'assess';
} | null> {
  const params = new URLSearchParams({
    width: tyreSize.width,
    aspect: tyreSize.aspect,
    rim: tyreSize.rim,
    limit: '20',
  });
  const res = await fetch(`${API.TYRES}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const tyres: Array<{
    id: string; brand: string; pattern: string; sizeDisplay: string;
    priceNew: number | null; stockNew: number | null;
  }> = data.tyres ?? [];
  if (tyres.length === 0) return null;

  // Pick cheapest available tyre with sufficient stock, or fall back to any priced tyre
  const priced = tyres.filter(t => t.priceNew != null && t.priceNew > 0);
  const withStock = priced.filter(t => (t.stockNew ?? 0) >= quantity);
  const candidates = withStock.length > 0 ? withStock : priced;
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (a.priceNew ?? 0) - (b.priceNew ?? 0));
  const tyre = candidates[0];
  return {
    tyreId: tyre.id,
    brand: tyre.brand,
    pattern: tyre.pattern,
    sizeDisplay: tyre.sizeDisplay,
    unitPrice: tyre.priceNew!,
    quantity,
    service,
  };
}

const RECOVERY_LIMIT = 3;
const LOADING_TIMEOUT_MS = 20_000;
const SLOT_UNAVAILABLE_MESSAGE =
  'This time slot is no longer available. Please choose another time.';

function apiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const maybe = data as { message?: unknown; error?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
    if (typeof maybe.error === 'string') return maybe.error;
  }
  return fallback;
}

function isSlotUnavailablePayload(data: unknown): boolean {
  return Boolean(
    data &&
      typeof data === 'object' &&
      (data as { code?: unknown }).code === 'SLOT_UNAVAILABLE',
  );
}

export function StepPricing({
  state,
  updateState,
  goToNext,
  goToPrev,
  goToStep,
}: StepPricingProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [repairQuoteError, setRepairQuoteError] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [buildSha, setBuildSha] = useState<string | null>(null);

  // Fetch build SHA once for support diagnostics
  useEffect(() => {
    fetch('/api/public/build-info')
      .then(r => r.json())
      .then(d => setBuildSha(d.gitSha ?? null))
      .catch(() => {});
  }, []);

  // Guards to prevent infinite re-fetch loops
  const inFlightRef = useRef(false);
  const lastFetchKeyRef = useRef('');
  const recoveryCountRef = useRef(0);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRepairIntent =
    state.serviceType === 'repair' || state.conditionAssessment === 'repair';

  const handleSlotUnavailable = useCallback(() => {
    updateState({
      scheduledDate: null,
      scheduledTime: null,
      quoteId: null,
      breakdown: null,
      quoteExpiresAt: null,
    });
    goToStep?.('schedule');
  }, [goToStep, updateState]);

  // Stable fingerprint of selectedTyres for dependency tracking
  const tyreFingerprint = useMemo(
    () =>
      isRepairIntent
        ? ''
        : state.selectedTyres.map(t => `${t.tyreId}:${t.quantity}:${t.service}`).join('|'),
    [isRepairIntent, state.selectedTyres],
  );

  // State-driven auto-recovery: reacts to pricing state, not just mount
  useEffect(() => {
    if (isRepairIntent) {
      const hasStaleRepairCart = state.selectedTyres.length > 0;
      const hasStaleTyrePricing =
        state.breakdown?.lineItems.some(item => item.type === 'tyre') ?? false;

      if (hasStaleRepairCart || hasStaleTyrePricing) {
        updateState({
          selectedTyres: [],
          fulfillmentOption: null,
          quoteId: null,
          breakdown: null,
          quoteExpiresAt: null,
        });
        return;
      }
    }

    // Already have a valid quote — nothing to do
    if (state.quoteId && state.breakdown) return;

    // Cannot fetch without location
    if (!state.lat || !state.lng) return;

    const isRepair = isRepairIntent;
    const hasTyres = !isRepair && state.selectedTyres.length > 0;
    // Emergency flow with assess/fit but no tyre selection step — treat as service-only quote
    const isEmergencyNoTyres =
      !isRepair && state.bookingType === 'emergency' && state.selectedTyres.length === 0;

    // Emergency replacement/assess needs auto tyre lookup (no tyre-selection step)
    const needsAutoTyreLookup =
      isEmergencyNoTyres && state.conditionAssessment !== 'repair';

    // Nothing quotable — no tyres and not a repair/emergency-without-tyres
    if (!isRepair && !hasTyres && !isEmergencyNoTyres) return;

    // Build a stable key from request inputs to avoid duplicate fetches
    const fetchKey = [
      state.lat,
      state.lng,
      state.bookingType,
      state.serviceType,
      isRepair ? `repair:${state.quantity || 1}` : tyreFingerprint,
      state.fittingLocation ?? '',
      state.scheduledDate ?? '',
      state.scheduledTime ?? '',
    ].join('|');

    // Already fetched (or fetching) for these exact inputs
    if (fetchKey === lastFetchKeyRef.current) return;

    // Concurrent request guard
    if (inFlightRef.current) return;

    // Retry limit reached for this session
    if (recoveryCountRef.current >= RECOVERY_LIMIT) return;
    lastFetchKeyRef.current = fetchKey;
    recoveryCountRef.current += 1;
    inFlightRef.current = true;

    async function fetchQuote() {
      setIsRefreshing(true);
      setRepairQuoteError(null);
      setLoadingTimedOut(false);
      try {
        // Determine how to build the quote request
        let finalServiceType: string;
        type TyreSel = { tyreId: string; quantity: number; service: string; requiresTpms: boolean; isPreOrder: boolean };
        let finalTyreSelections: TyreSel[];
        let autoTyre: Awaited<ReturnType<typeof findCheapestMatchingTyre>> = null;
        let isSendingAsRepair = false;

        if (
          needsAutoTyreLookup &&
          state.tyreSize.width &&
          state.tyreSize.aspect &&
          state.tyreSize.rim
        ) {
          // Emergency replacement/assess — auto-select cheapest matching tyre
          const svc = state.serviceType === 'assess' ? 'assess' as const : 'fit' as const;
          autoTyre = await findCheapestMatchingTyre(
            state.tyreSize,
            state.quantity || 1,
            svc,
          );
        }

        if (autoTyre) {
          // Found a matching tyre — quote with tyre cost + fitting/assess fee
          finalServiceType = autoTyre.service;
          finalTyreSelections = [{
            tyreId: autoTyre.tyreId,
            quantity: autoTyre.quantity,
            service: autoTyre.service,
            requiresTpms: false,
            isPreOrder: false,
          }];
        } else if (isRepair || isEmergencyNoTyres) {
          // Pure repair OR emergency fallback (no matching tyres found)
          isSendingAsRepair = true;
          finalServiceType = 'repair';
          finalTyreSelections = [];
        } else {
          finalServiceType = state.conditionAssessment === 'repair' ? 'repair' : 'fit';
          finalTyreSelections = state.selectedTyres.map((t) => ({
            tyreId: t.tyreId,
            quantity: t.quantity,
            service: t.service,
            requiresTpms: t.requiresTpms ?? false,
            isPreOrder: t.isPreOrder ?? false,
          }));
        }

        const payload = {
            lat: state.lat,
            lng: state.lng,
            addressLine: state.address,
            bookingType: state.bookingType,
            serviceType: finalServiceType,
            tyreSelections: finalTyreSelections,
            quantity: isSendingAsRepair ? (state.quantity || 1) : undefined,
            fulfillmentOption: state.fulfillmentOption ?? undefined,
            fittingLocation: state.fittingLocation ?? undefined,
            scheduledAt:
              state.scheduledDate && state.scheduledTime
                ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
                : undefined,
        };
        const visitCount = typeof localStorage !== 'undefined' ? localStorage.getItem('tr_visit_count') || '1' : '1';
        const res = await fetch(API.BOOKINGS_QUOTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-visit-count': visitCount },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
          if (isSlotUnavailablePayload(data)) {
            handleSlotUnavailable();
            throw new Error(apiErrorMessage(data, SLOT_UNAVAILABLE_MESSAGE));
          }
          throw new Error(apiErrorMessage(data, 'Failed to get quote'));
        }

        // Validate response shape before updating state
        if (!data.quoteId || typeof data.quoteId !== 'string') {
          throw new Error('Invalid quote response — missing quote ID');
        }
        if (!data.breakdown || typeof data.breakdown !== 'object') {
          throw new Error('Invalid quote response — missing pricing breakdown');
        }

        updateState({
          quoteId: data.quoteId,
          breakdown: data.breakdown,
          quoteExpiresAt: data.expiresAt,
          ...(autoTyre
            ? {
                selectedTyres: [{
                  tyreId: autoTyre.tyreId,
                  brand: autoTyre.brand,
                  pattern: autoTyre.pattern,
                  sizeDisplay: autoTyre.sizeDisplay,
                  quantity: autoTyre.quantity,
                  unitPrice: autoTyre.unitPrice,
                  service: autoTyre.service,
                }],
              }
            : isSendingAsRepair
            ? { selectedTyres: [] }
            : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get quote';
        setRepairQuoteError(message);
        // Reset fetch key so user-triggered retry can re-attempt
        lastFetchKeyRef.current = '';
      } finally {
        inFlightRef.current = false;
        setIsRefreshing(false);
      }
    }

    fetchQuote();

    // Cleanup: only reset inFlightRef so the next effect run can proceed.
    // Do NOT cancel in-flight requests — React Strict Mode re-runs effects
    // (mount → cleanup → remount) which would cancel valid fetches via
    // a closure `cancelled` flag before the response arrives.
    return () => {
      inFlightRef.current = false;
    };
  }, [
    state.quoteId,
    state.breakdown,
    state.lat,
    state.lng,
    state.serviceType,
    state.bookingType,
    isRepairIntent,
    tyreFingerprint,
    updateState,
    state.conditionAssessment,
    state.address,
    state.quantity,
    state.tyreSize,
    state.fulfillmentOption,
    state.fittingLocation,
    state.scheduledDate,
    state.scheduledTime,
    state.selectedTyres,
    handleSlotUnavailable,
  ]);

  // Hard fail-safe: never allow infinite loading spinner
  useEffect(() => {
    if (state.breakdown || repairQuoteError) {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoadingTimedOut(false);
      return;
    }

    // Already timed out — don't restart
    if (loadingTimedOut) return;

    if (!loadingTimerRef.current) {
      loadingTimerRef.current = setTimeout(() => {
        loadingTimerRef.current = null;
        setLoadingTimedOut(true);
      }, LOADING_TIMEOUT_MS);
    }

    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    };
  }, [state.breakdown, repairQuoteError, loadingTimedOut]);

  // Calculate time remaining
  useEffect(() => {
    if (!state.quoteExpiresAt) return;

    const calculateTimeRemaining = () => {
      const expiresAt = new Date(state.quoteExpiresAt!).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

      if (remaining === 0) {
        setIsExpired(true);
      }

      setTimeRemaining(remaining);
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [state.quoteExpiresAt]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Refresh quote (without cart changes)
  const handleRefreshQuote = useCallback(async () => {
    setIsRefreshing(true);
    setIsExpired(false);

    try {
      const refreshAsRepairIntent =
        state.serviceType === 'repair' || state.conditionAssessment === 'repair';
      const isEmergencyNeedsTyre =
        !refreshAsRepairIntent &&
        state.bookingType === 'emergency' &&
        state.selectedTyres.length === 0 &&
        state.conditionAssessment !== 'repair' &&
        state.tyreSize.width &&
        state.tyreSize.aspect &&
        state.tyreSize.rim;

      let autoTyre: Awaited<ReturnType<typeof findCheapestMatchingTyre>> = null;
      if (isEmergencyNeedsTyre) {
        const svc = state.serviceType === 'assess' ? 'assess' as const : 'fit' as const;
        autoTyre = await findCheapestMatchingTyre(
          state.tyreSize,
          state.quantity || 1,
          svc,
        );
      }

      let refreshServiceType: string;
      type TyreSel = { tyreId: string; quantity: number; service: string; requiresTpms: boolean; isPreOrder: boolean };
      let refreshTyreSelections: TyreSel[];
      let refreshAsRepair = false;

      if (refreshAsRepairIntent) {
        refreshAsRepair = true;
        refreshServiceType = 'repair';
        refreshTyreSelections = [];
      } else if (autoTyre) {
        refreshServiceType = autoTyre.service;
        refreshTyreSelections = [{
          tyreId: autoTyre.tyreId,
          quantity: autoTyre.quantity,
          service: autoTyre.service,
          requiresTpms: false,
          isPreOrder: false,
        }];
      } else if (state.selectedTyres.length === 0) {
        refreshAsRepair = true;
        refreshServiceType = 'repair';
        refreshTyreSelections = [];
      } else {
        refreshServiceType = state.conditionAssessment === 'repair' ? 'repair' : 'fit';
        refreshTyreSelections = state.selectedTyres.map((tyre) => ({
          tyreId: tyre.tyreId,
          quantity: tyre.quantity,
          service: tyre.service,
          requiresTpms: false,
          isPreOrder: tyre.isPreOrder ?? false,
        }));
      }

      const vc3 = typeof localStorage !== 'undefined' ? localStorage.getItem('tr_visit_count') || '1' : '1';
      const res = await fetch(API.BOOKINGS_QUOTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-visit-count': vc3 },
        body: JSON.stringify({
          lat: state.lat,
          lng: state.lng,
          addressLine: state.address,
          bookingType: state.bookingType,
          serviceType: refreshServiceType,
          tyreSelections: refreshTyreSelections,
          quantity: refreshAsRepair ? (state.quantity || 1) : undefined,
          fulfillmentOption: state.fulfillmentOption ?? undefined,
          fittingLocation: state.fittingLocation ?? undefined,
          scheduledAt: state.scheduledDate && state.scheduledTime
            ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
            : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (isSlotUnavailablePayload(data)) {
          handleSlotUnavailable();
          throw new Error(apiErrorMessage(data, SLOT_UNAVAILABLE_MESSAGE));
        }
        throw new Error(apiErrorMessage(data, 'Failed to refresh quote'));
      }

      if (!data.quoteId || !data.breakdown) {
        throw new Error('Incomplete quote response');
      }

      updateState({
        quoteId: data.quoteId,
        breakdown: data.breakdown,
        quoteExpiresAt: data.expiresAt,
        ...(autoTyre
          ? {
              selectedTyres: [{
                tyreId: autoTyre.tyreId,
                brand: autoTyre.brand,
                pattern: autoTyre.pattern,
                sizeDisplay: autoTyre.sizeDisplay,
                quantity: autoTyre.quantity,
                unitPrice: autoTyre.unitPrice,
                service: autoTyre.service,
              }],
            }
          : {}),
        ...(refreshAsRepair ? { selectedTyres: [] } : {}),
      });
    } catch (error) {
      setRepairQuoteError(error instanceof Error ? error.message : 'Failed to refresh quote. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [state, updateState, handleSlotUnavailable]);

  // Manual retry handler — resets guards so the recovery effect can re-trigger
  const handleManualRetry = useCallback(() => {
    lastFetchKeyRef.current = '';
    recoveryCountRef.current = 0;
    setRepairQuoteError(null);
    setLoadingTimedOut(false);
    // Clear stale quote state to trigger the recovery effect
    updateState({
      quoteId: null,
      breakdown: null,
      quoteExpiresAt: null,
      ...(isRepairIntent ? { selectedTyres: [], fulfillmentOption: null } : {}),
    });
  }, [isRepairIntent, updateState]);

  const breakdown = state.breakdown as PricingBreakdown | null;
  const quoteDisplayText = `Total: ${formatPrice(breakdown?.total ?? 0)}`;

  if (!breakdown) {
    // Error state (API error or response validation failure)
    if (repairQuoteError) {
      return (
        <VStack py={12} gap={4}>
          <Box p={4} bg="rgba(239,68,68,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.3)" textAlign="center">
            <Text fontWeight="600" color="red.400" mb={2}>
              Unable to generate quote
            </Text>
            <Text color="red.300" fontSize="sm" mb={3}>
              {repairQuoteError}
            </Text>
            <Text color={c.muted} fontSize="sm">
              Please call us on{' '}
              <a href="tel:01412660690" style={{ color: c.accent, fontWeight: 500 }} onClick={() => trackCallClick('booking_step_pricing_quote_error')}>
                0141 266 0690
              </a>
            </Text>
            {buildSha && buildSha !== 'unknown' && (
              <Text color={c.muted} fontSize="xs" mt={1}>Build: {buildSha.slice(0, 7)}</Text>
            )}
          </Box>
          <HStack gap={3} justify="center">
            <Button variant="outline" onClick={goToPrev}>
              Back
            </Button>
            <Button colorPalette="orange" onClick={handleManualRetry}>
              Retry
            </Button>
          </HStack>
        </VStack>
      );
    }

    // Timed-out state — spinner has been showing too long
    if (loadingTimedOut) {
      return (
        <VStack py={12} gap={4}>
          <Box p={4} bg="rgba(249,115,22,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(249,115,22,0.3)" textAlign="center">
            <Text fontWeight="600" color={c.accent} mb={2}>
              Quote is taking longer than expected
            </Text>
            <Text color={c.muted} fontSize="sm" mb={3}>
              This may be due to a slow connection. You can retry or go back and try again.
            </Text>
            <Text color={c.muted} fontSize="sm">
              Need help? Call{' '}
              <a href="tel:01412660690" style={{ color: c.accent, fontWeight: 500 }} onClick={() => trackCallClick('booking_step_pricing_timeout')}>
                0141 266 0690
              </a>
            </Text>
            {buildSha && buildSha !== 'unknown' && (
              <Text color={c.muted} fontSize="xs" mt={1}>Build: {buildSha.slice(0, 7)}</Text>
            )}
          </Box>
          <HStack gap={3} justify="center">
            <Button variant="outline" onClick={goToPrev}>
              Back
            </Button>
            <Button colorPalette="orange" onClick={handleManualRetry}>
              Retry
            </Button>
          </HStack>
        </VStack>
      );
    }

    // Normal loading state (bounded by the timeout above)
    return (
      <VStack py={12}>
        <Spinner size="lg" />
        <Text>Loading pricing...</Text>
      </VStack>
    );
  }

  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Your quote
        </Text>

        {/* Countdown Timer */}
        {!isExpired && timeRemaining !== null && (
          <HStack
            p={3}
            bg={timeRemaining < 300 ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.08)'}
            borderRadius="md"
            borderWidth="1px"
            borderColor={timeRemaining < 300 ? 'rgba(249,115,22,0.3)' : 'rgba(249,115,22,0.2)'}
          >
            <Text
              fontWeight="600"
              color={c.accent}
            >
              Quote expires in: {formatTime(timeRemaining)}
            </Text>
          </HStack>
        )}

        {isExpired && (
          <Box
            p={4}
            bg="rgba(239,68,68,0.1)"
            borderRadius="md"
            borderWidth="1px"
            borderColor="rgba(239,68,68,0.3)"
          >
            <Text fontWeight="600" color="red.400" mb={2}>
              This quote has expired
            </Text>
            <Text color="red.300" fontSize="sm" mb={3}>
              Prices and availability may have changed.
            </Text>
            <Button
              colorPalette="red"
              size="sm"
              onClick={handleRefreshQuote}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <HStack>
                  <Spinner size="sm" />
                  <Text>Refreshing...</Text>
                </HStack>
              ) : (
                'Get New Quote'
              )}
            </Button>
          </Box>
        )}
      </Box>

      {/* Service Summary */}
      <Box p={4} bg={c.surface} borderRadius="md">
        <Text fontWeight="600" mb={2} color={c.text}>
          Service details
        </Text>
        <VStack align="stretch" gap={1} fontSize="sm" color={c.muted}>
          {!isRepairIntent &&
            state.selectedTyres.map((tyre, i) => (
              <Text key={i}>
                {tyre.quantity}x {tyre.brand} {tyre.pattern}
              </Text>
            ))}
          {state.conditionAssessment === 'repair' && (
            <Text>Puncture repair service</Text>
          )}
          <Text>{state.address}</Text>
          {state.scheduledDate && state.scheduledTime && (
            <Text>
              {new Date(state.scheduledDate).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              at {state.scheduledTime}
            </Text>
          )}
          {state.bookingType === 'emergency' && (
            <Text fontWeight="500" color={c.accent}>
              Emergency booking - fastest available driver
            </Text>
          )}
        </VStack>
      </Box>

      {/* Quote Price */}
      <Box borderWidth="1px" borderColor={c.border} borderRadius="lg" overflow="hidden" style={anim.fadeUp('0.5s', '0.1s')}>
        <HStack p={5} bg={c.accent}>
          <Text fontWeight="700" fontSize="lg" color={c.bg}>
            {quoteDisplayText}
          </Text>
        </HStack>
      </Box>

      {/* Navigation */}
      <HStack gap={4} pt={4}>
        <Button variant="outline" onClick={goToPrev} flex="1">
          Back
        </Button>
        <Button
          colorPalette="orange"
          onClick={goToNext}
          disabled={isExpired || !breakdown || breakdown.total <= 0}
          flex="1"
        >
          Continue to details
        </Button>
      </HStack>
    </VStack>
  );
}

~~~

## lib/__tests__/assisted-chat-pricing-regression.test.ts

~~~
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculatePricing, parsePricingRules, type PricingInput } from '../pricing-engine';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('assisted chat emergency pricing context', () => {
  it('uses the emergency mobile fitting context in the assisted app', () => {
    const contextSource = readSource('assisted-chat-app/src/lib/pricing-context.ts');
    expect(contextSource).toContain("'emergency_mobile_fitting'");

    for (const file of [
      'assisted-chat-app/src/hooks/useAssistedChatPrice.ts',
      'assisted-chat-app/src/hooks/useAssistedChatLocationShare.ts',
      'assisted-chat-app/src/hooks/useAssistedChatQuoteActions.ts',
      'assisted-chat-app/src/hooks/useAssistedChatDispatch.ts',
      'assisted-chat-app/src/components/quote/EditQuotePriceModal.tsx',
    ]) {
      const source = readSource(file);
      expect(source).toContain('ASSISTED_CHAT_PRICING_CONTEXT');
      expect(source).not.toContain("pricingContext: 'assisted_chat'");
      expect(source).not.toContain('pricingContext: "assisted_chat"');
    }
  });

  it('maps assisted chat quick-book requests to emergency bookings', async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    const { resolveQuickBookBookingType } = await import('../quick-book-pricing');

    expect(resolveQuickBookBookingType('emergency_mobile_fitting')).toBe('emergency');
    expect(resolveQuickBookBookingType('admin_quick_book')).toBe('emergency');
    expect(resolveQuickBookBookingType('assisted_chat')).toBe('emergency');
    expect(resolveQuickBookBookingType('scheduled_mobile_fitting')).toBe('scheduled');
    expect(resolveQuickBookBookingType('scheduled_garage_fitting')).toBe('scheduled');
  });

  it('prices assisted app context the same as backend emergency mobile context', async () => {
    const { ASSISTED_CHAT_PRICING_CONTEXT } = await import('../../assisted-chat-app/src/lib/pricing-context');
    const rules = parsePricingRules([]);
    const base: PricingInput = {
      tyreSelections: [{ tyreId: 'tyre-1', quantity: 2, unitPrice: 80, service: 'fit' }],
      distanceMiles: 100,
      bookingType: 'emergency',
      bookingDate: new Date('2025-01-06T10:00:00Z'),
      isBankHoliday: false,
    };

    const assisted = calculatePricing(
      { ...base, pricingContext: ASSISTED_CHAT_PRICING_CONTEXT },
      rules,
    );
    const backendEmergency = calculatePricing(
      { ...base, pricingContext: 'emergency_mobile_fitting' },
      rules,
    );

    expect(assisted.isValid).toBe(true);
    expect(assisted.total).toBe(backendEmergency.total);
    expect(assisted.tyreSubtotal).toBe(backendEmergency.tyreSubtotal);
    expect(assisted.serviceSubtotal).toBe(backendEmergency.serviceSubtotal);
    expect(assisted.calloutFee).toBe(backendEmergency.calloutFee);
    expect(assisted.lineItems.map((item) => [item.code, item.amount])).toEqual(
      backendEmergency.lineItems.map((item) => [item.code, item.amount]),
    );
  });
});

describe('assisted chat price copy and display regressions', () => {
  it('does not reintroduce fitting-at-location copy in assisted chat customer messages', () => {
    for (const file of [
      'assisted-chat-app/src/components/ActionButtons.tsx',
      'assisted-chat-app/src/components/PaymentLinkCard.tsx',
      'assisted-chat-app/src/components/PriceSummary.tsx',
      'assisted-chat-app/src/lib/customer-message.ts',
    ]) {
      expect(readSource(file)).not.toMatch(/Fitting at your location|Fit at your location/);
    }
  });

  it('does not use the fitting-at-location label as a total heading in customer/admin UI', () => {
    for (const file of [
      'components/booking/StepPricing.tsx',
      'components/booking/StepCustomerDetails.tsx',
      'components/booking/StepPayment.tsx',
      'components/admin/quick-book/QuickBookForm.tsx',
    ]) {
      const source = readSource(file);
      expect(source).not.toContain('FITTING_AT_LOCATION_LABEL');
      expect(source).not.toContain('getSeparateFittingPrice');
    }
  });

  it('does not leave stale 60-mile manual-quote copy in quote endpoints', () => {
    for (const file of [
      'app/api/bookings/quote/route.ts',
      'lib/quick-book-pricing.ts',
      'lib/fitting-location-pricing.ts',
    ]) {
      expect(readSource(file)).not.toMatch(/over 60 miles|60 miles away|ends at 60/i);
    }
  });
});

~~~

## lib/__tests__/fitting-location-pricing.test.ts

~~~
import { describe, expect, it } from 'vitest';
import {
  calculateFittingAtLocationPrice,
  formatGbp,
} from '../fitting-location-pricing';

// v2: fittingPrice is the travel fee only (labour is billed separately by the pricing engine)
// Tier structure: base £24 (0–3 mi), +£1.70/mi (3–10), +£2.35/mi (10–20), +£3.00/mi (20–40), +£3.85/mi (40–60), +£4.25/mi (60–100)
describe('calculateFittingAtLocationPrice', () => {
  it.each([
    [0,    24],
    [3,    24],
    [5,    27.4],
    [6,    29.1],
    [10,   35.9],
    [11,   38.25],
    [20,   59.4],
    [21,   62.4],
    [40,   119.4],
    [41,   123.25],
    [60,   196.4],
    [100,  366.4],
  ])('returns %s miles as £%s travel fee', (distanceMiles, expectedPrice) => {
    const result = calculateFittingAtLocationPrice(distanceMiles);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.fittingPrice).toBe(expectedPrice);
    }
  });

  it('returns manual quote state over 100 miles', () => {
    const result = calculateFittingAtLocationPrice(100.01);

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe('MANUAL_QUOTE_REQUIRED');
      expect(result.fittingPrice).toBeNull();
    }
  });

  it.each([null, undefined, NaN, Infinity, -1])('rejects invalid distance %s', (distanceMiles) => {
    const result = calculateFittingAtLocationPrice(distanceMiles);

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe('INVALID_DISTANCE');
    }
  });

  it('formats GBP with en-GB currency rules', () => {
    expect(formatGbp(89.65)).toBe('£89.65');
  });
});

~~~

## lib/__tests__/pricing-engine.test.ts

~~~
import { describe, it, expect } from 'vitest';
import {
  calculatePricing,
  calculateHybridPricing,
  parsePricingRules,
  resolvePricingContext,
  resolvePricingMode,
  resolveMode,
  getDisplayBreakdown,
  type PricingRules,
  type PricingInput,
  type HybridPricingInput,
} from '../pricing-engine';
import {
  calculateTravelFee,
  milesBetween,
  calculateFittingAtLocationPrice,
} from '../fitting-location-pricing';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultRules(overrides: Partial<PricingRules> = {}): PricingRules {
  return {
    tpms_fee_per_tyre: 10,
    shop_fit_labour_per_tyre: 18,
    shop_repair_labour_per_tyre: 25,
    mobile_fit_labour_per_tyre: 18,
    mobile_repair_labour_per_tyre: 25,
    emergency_fit_labour_per_tyre: 22,
    emergency_repair_labour_per_tyre: 30,
    emergency_priority_fee: 47,
    shop_weekend_fee: 10,
    shop_bank_holiday_fee: 20,
    mobile_weekend_fee: 12,
    mobile_bank_holiday_fee: 25,
    emergency_bank_holiday_fee: 45,
    mobile_min_service_subtotal: 47,
    emergency_min_service_subtotal: 90,
    multi_tyre_discount_2: 5,
    multi_tyre_discount_3: 8,
    multi_tyre_discount_4: 12,
    emergency_multi_tyre_discount_3: 3,
    emergency_multi_tyre_discount_4: 5,
    minimum_order_total: 50,
    max_service_miles: 190,
    quote_expiry_minutes: 15,
    surge_pricing_enabled: false,
    ...overrides,
  };
}

// Monday
const WEEKDAY = new Date('2025-01-06T10:00:00Z');
// Saturday
const WEEKEND = new Date('2025-01-04T10:00:00Z');

function shopInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    tyreSelections: [{ tyreId: 'test-1', quantity: 1, unitPrice: 80, service: 'fit' }],
    distanceMiles: 5,
    bookingType: 'scheduled',
    pricingContext: 'scheduled_garage_fitting',
    bookingDate: WEEKDAY,
    isBankHoliday: false,
    ...overrides,
  };
}

function mobileInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    tyreSelections: [{ tyreId: 'test-1', quantity: 1, unitPrice: 80, service: 'fit' }],
    distanceMiles: 5,
    bookingType: 'scheduled',
    pricingContext: 'scheduled_mobile_fitting',
    bookingDate: WEEKDAY,
    isBankHoliday: false,
    ...overrides,
  };
}

function emergencyInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    tyreSelections: [{ tyreId: 'test-1', quantity: 1, unitPrice: 80, service: 'fit' }],
    distanceMiles: 5,
    bookingType: 'emergency',
    pricingContext: 'emergency_mobile_fitting',
    bookingDate: WEEKDAY,
    isBankHoliday: false,
    ...overrides,
  };
}

// ─── calculateTravelFee ───────────────────────────────────────────────────────
// Tier structure: base £24 (0–3 mi), +£1.70/mi (3–10), +£2.35/mi (10–20),
//                +£3.00/mi (20–40), +£3.85/mi (40–60), +£4.25/mi (60–100)

describe('calculateTravelFee', () => {
  it('returns null for invalid distance', () => {
    expect(calculateTravelFee(-1)).toBeNull();
    expect(calculateTravelFee(NaN)).toBeNull();
  });

  it('returns null for distance > 100 miles', () => {
    expect(calculateTravelFee(100)).toBe(366.4);
    expect(calculateTravelFee(100.01)).toBeNull();
  });

  it('returns 24 for 0 miles (base covers first 3 miles)', () => {
    expect(calculateTravelFee(0)).toBe(24);
  });

  it('returns 24 for 3 miles (exact tier boundary)', () => {
    expect(calculateTravelFee(3)).toBe(24);
  });

  it('returns correct fee for 5 miles', () => {
    // 24 + (5-3)*1.70 = 24 + 3.40 = 27.40
    expect(calculateTravelFee(5)).toBe(27.4);
  });

  it('returns correct fee for 10 miles (tier boundary)', () => {
    // 24 + (10-3)*1.70 = 24 + 11.90 = 35.90
    expect(calculateTravelFee(10)).toBe(35.9);
  });

  it('returns correct fee for 11 miles', () => {
    // 24 + 7*1.70 + 1*2.35 = 38.25
    expect(calculateTravelFee(11)).toBe(38.25);
  });

  it('returns correct fee for 20 miles (tier boundary)', () => {
    // 24 + 11.90 + 10*2.35 = 59.40
    expect(calculateTravelFee(20)).toBe(59.4);
  });

  it('returns correct fee for 40 miles (tier boundary)', () => {
    // 24 + 11.90 + 23.50 + 20*3.00 = 119.40
    expect(calculateTravelFee(40)).toBe(119.4);
  });

  it('returns correct fee for 60 miles', () => {
    // 24 + 11.90 + 23.50 + 60.00 + 20*3.85 = 196.40
    expect(calculateTravelFee(60)).toBe(196.4);
  });

  it('returns correct fee for 100 miles (max allowed)', () => {
    // 196.40 + 40*4.25 = 366.40
    expect(calculateTravelFee(100)).toBe(366.4);
  });

  it('has no price jumps at tier boundaries (continuous) — spec test 4', () => {
    // Prove continuity by checking exact values around tier edges.
    // If there were a discrete step the mid-boundary value would jump by several pounds.

    // Around 3-mile boundary: 2.99→24, 3→24, 3.01→24.02
    expect(calculateTravelFee(2.99)).toBe(24);
    expect(calculateTravelFee(3)).toBe(24);
    expect(calculateTravelFee(3.01)).toBe(24.02);

    // Around 10-mile boundary: 9.99→35.88, 10→35.90, 10.01→35.92
    expect(calculateTravelFee(9.99)).toBe(35.88);
    expect(calculateTravelFee(10)).toBe(35.9);
    expect(calculateTravelFee(10.01)).toBe(35.92);

    // Around 20-mile boundary: 19.99→59.38, 20→59.40, 20.01→59.43
    expect(calculateTravelFee(19.99)).toBe(59.38);
    expect(calculateTravelFee(20)).toBe(59.4);
    expect(calculateTravelFee(20.01)).toBe(59.43);

    // Around 40-mile boundary
    const at39_99 = calculateTravelFee(39.99)!;
    const at40 = calculateTravelFee(40)!;
    const at40_01 = calculateTravelFee(40.01)!;
    expect(at40 - at39_99).toBeLessThan(0.10); // tiny step, not a slab jump
    expect(at40_01 - at40).toBeLessThan(0.10);
  });
});

describe('milesBetween', () => {
  it('returns 0 when distance is below the range', () => {
    expect(milesBetween(2, 3, 10)).toBe(0);
  });

  it('returns distance within range when fully inside', () => {
    expect(milesBetween(5, 3, 10)).toBe(2);
  });

  it('returns the full range width when distance exceeds the range', () => {
    expect(milesBetween(20, 3, 10)).toBe(7);
  });
});

describe('calculateFittingAtLocationPrice', () => {
  it('returns INVALID_DISTANCE for null input', () => {
    const result = calculateFittingAtLocationPrice(null);
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe('INVALID_DISTANCE');
  });

  it('returns MANUAL_QUOTE_REQUIRED for > 100 miles', () => {
    const result = calculateFittingAtLocationPrice(100.01);
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe('MANUAL_QUOTE_REQUIRED');
  });

  it('returns travelFee only (fittingLabourFee = 0 in v2)', () => {
    const result = calculateFittingAtLocationPrice(5);
    expect(result.available).toBe(true);
    if (result.available) {
      // 24 + 2*1.70 = 27.40
      expect(result.travelFee).toBe(27.4);
      expect(result.fittingLabourFee).toBe(0);
      expect(result.fittingPrice).toBe(27.4);
    }
  });

  it('is valid at exactly 60 miles', () => {
    const result = calculateFittingAtLocationPrice(60);
    expect(result.available).toBe(true);
    // 24 + 11.90 + 23.50 + 60.00 + 77.00 = 196.40
    if (result.available) expect(result.travelFee).toBe(196.4);
  });

  it('is valid at exactly 100 miles', () => {
    const result = calculateFittingAtLocationPrice(100);
    expect(result.available).toBe(true);
    if (result.available) expect(result.travelFee).toBe(366.4);
  });
});

// ─── calculatePricing — scheduled_shop ───────────────────────────────────────

describe('calculatePricing — scheduled_shop', () => {
  it('1 tyre fit weekday: labour only, no travel', () => {
    const result = calculatePricing(shopInput(), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('scheduled_shop');
    expect(result.totalTyreCost).toBe(80);
    expect(result.calloutFee).toBe(0);
    expect(result.total).toBe(98); // 80 + 18
    expect(result.fittingPrice).toBeUndefined(); // shop has no fittingPrice
  });

  it('2 tyres: 5% bundle discount on labour only', () => {
    const result = calculatePricing(shopInput({
      tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    // labour = 2×18=36, discount = 36×0.05=1.80, service = 34.20, total = 160+34.20
    expect(result.isValid).toBe(true);
    expect(result.discountAmount).toBe(1.8);
    expect(result.total).toBe(194.2);
  });

  it('3 tyres: 8% bundle discount', () => {
    const result = calculatePricing(shopInput({
      tyreSelections: [{ tyreId: 't1', quantity: 3, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    // labour = 3×18=54, discount = 54×0.08=4.32, service = 49.68, total = 240+49.68=289.68
    expect(result.discountAmount).toBeCloseTo(4.32, 2);
    expect(result.total).toBeCloseTo(289.68, 2);
  });

  it('weekend adds shop_weekend_fee (£10), not mobile rate', () => {
    const result = calculatePricing(shopInput({ bookingDate: WEEKEND }), defaultRules());
    // 80 + 18 + 10 = 108
    expect(result.total).toBe(108);
    expect(result.totalSurcharges).toBe(10);
  });

  it('bank holiday adds shop_bank_holiday_fee (£20)', () => {
    const result = calculatePricing(shopInput({ isBankHoliday: true }), defaultRules());
    // 80 + 18 + 20 = 118
    expect(result.total).toBe(118);
  });

  it('applies minimum_order_total when total is low', () => {
    // 1 tyre £10, service-only repair: tyre=0, service=25 → total=25 < 50
    const result = calculatePricing(shopInput({
      tyreSelections: [],
      serviceType: 'repair',
      tyreQuantity: 1,
    }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.total).toBe(50); // minimum enforced
  });

  it('ignores weather and traffic surcharges for shop mode — spec test 11', () => {
    const result = calculatePricing(shopInput({
      weatherSurcharge: 20,
      weatherSurchargeCode: 'SNOW_ICE',
      trafficSurcharge: 15,
    }), defaultRules());
    // Shop ignores both — total stays at 98
    expect(result.total).toBe(98);
    expect(result.weatherSurcharge).toBe(0);
    expect(result.trafficSurcharge).toBe(0);
    expect(result.calloutFee).toBe(0);
  });

  it('scheduled_shop with distance > 100 does not return mobile coverage manual quote', () => {
    const result = calculatePricing(shopInput({ distanceMiles: 120 }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.mode).toBe('scheduled_shop');
  });

  it('does not return invalid even when weatherManualQuoteRequired for shop', () => {
    const result = calculatePricing(shopInput({ weatherManualQuoteRequired: true }), defaultRules());
    expect(result.isValid).toBe(true);
  });

  it('includes TPMS fee and excludes it from bundle discount', () => {
    const result = calculatePricing(shopInput({
      tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 80, service: 'fit', requiresTpms: true }],
    }), defaultRules());
    // labour=36, discount=1.80, TPMS=20, service=36-1.80+20=54.20, tyre=160, total=214.20
    expect(result.total).toBeCloseTo(214.2, 2);
    expect(result.discountAmount).toBeCloseTo(1.8, 2);
  });

  it('repair uses shop_repair_labour_per_tyre rate', () => {
    const result = calculatePricing(shopInput({
      tyreSelections: [{ tyreId: 't1', quantity: 1, unitPrice: 80, service: 'repair' }],
    }), defaultRules());
    // 80 + 25 = 105
    expect(result.total).toBe(105);
  });

  it('all line items have a code', () => {
    const result = calculatePricing(shopInput({ isBankHoliday: true, bookingDate: WEEKEND }), defaultRules());
    for (const item of result.lineItems) {
      expect(item.code).toBeTruthy();
    }
  });
});

// ─── calculatePricing — scheduled_mobile ─────────────────────────────────────

describe('calculatePricing — scheduled_mobile', () => {
  it('1 tyre fit 5 miles weekday: minimum service applies — spec test 5', () => {
    const result = calculatePricing(mobileInput(), defaultRules());
    // labour=18, travel=27.40, raw=45.40 < min(47), adj=1.60, service=47, total=127
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('scheduled_mobile');
    expect(result.totalTyreCost).toBe(80);
    expect(result.calloutFee).toBe(27.4);
    expect(result.serviceSubtotal).toBe(47);
    expect(result.total).toBe(127);
    expect(typeof result.fittingPrice).toBe('number'); // mobile detection field
    expect(result.fittingPrice).toBe(47);
  });

  it('10 miles: no minimum needed, uses actual service cost', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 10 }), defaultRules());
    // labour=18, travel=35.90, raw=53.90 > 47, service=53.90, total=133.90
    expect(result.total).toBe(133.9);
    expect(result.serviceSubtotal).toBe(53.9);
  });

  it('at 20 miles: service matches ~£77.40 for one fit tyre — spec test 6', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 20 }), defaultRules());
    // labour=18, travel=59.40, raw=77.40 > 47, service=77.40, total=157.40
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(77.4, 2);
    expect(result.total).toBeCloseTo(157.4, 2);
  });

  it('at 40 miles: service matches ~£137.40 for one fit tyre — spec test 7', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 40 }), defaultRules());
    // labour=18, travel=119.40, raw=137.40 > 47, service=137.40, total=217.40
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(137.4, 2);
    expect(result.total).toBeCloseTo(217.4, 2);
  });

  it('60 miles (max): valid pricing returned', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 60 }), defaultRules());
    // labour=18, travel=196.40, raw=214.40, service=214.40, total=294.40
    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(196.4);
    expect(result.total).toBe(294.4);
  });

  it('100 miles (max): valid pricing returned', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 100 }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(366.4);
    expect(result.total).toBe(464.4);
  });

  it('100.01 miles: returns outside auto-pricing area — spec test 11', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 100.01 }), defaultRules());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('OUTSIDE_AUTO_PRICING_AREA');
  });

  it('invalid distance: returns invalid distance error', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: -1 }), defaultRules());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('FITTING_LOCATION_INVALID_DISTANCE');
  });

  it('severe weather: blocked with WEATHER_MANUAL_QUOTE_REQUIRED — spec test 12', () => {
    const result = calculatePricing(mobileInput({ weatherManualQuoteRequired: true }), defaultRules());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('WEATHER_MANUAL_QUOTE_REQUIRED');
  });

  it('weather surcharge added to service (mode-appropriate amount from caller)', () => {
    // Caller computes £12 heavy rain for mobile mode and passes it in
    const result = calculatePricing(mobileInput({ weatherSurcharge: 12, weatherSurchargeCode: 'HEAVY_RAIN' }), defaultRules());
    // labour=18, travel=27.40, weather=12, raw=57.40 > 47, service=57.40, total=137.40
    expect(result.total).toBe(137.4);
    expect(result.weatherSurcharge).toBe(12);
  });

  it('traffic surcharge added to service', () => {
    const result = calculatePricing(mobileInput({ trafficSurcharge: 8, trafficSurchargeCode: 'MODERATE_TRAFFIC' }), defaultRules());
    // labour=18, travel=27.40, traffic=8, raw=53.40 > 47, service=53.40, total=133.40
    expect(result.total).toBe(133.4);
    expect(result.trafficSurcharge).toBe(8);
  });

  it('weekend adds mobile_weekend_fee (£12)', () => {
    const result = calculatePricing(mobileInput({ bookingDate: WEEKEND }), defaultRules());
    // labour=18, travel=27.40, weekend=12, raw=57.40 > 47, service=57.40, total=137.40
    expect(result.total).toBe(137.4);
  });

  it('bank holiday adds mobile_bank_holiday_fee (£25)', () => {
    const result = calculatePricing(mobileInput({ isBankHoliday: true }), defaultRules());
    // labour=18, travel=27.40, bh=25, raw=70.40 > 47, service=70.40, total=150.40
    expect(result.total).toBe(150.4);
  });

  it('2 tyres: 5% bundle discount on labour only, not travel', () => {
    const result = calculatePricing(mobileInput({
      tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    // labour=36, discount=1.80, travel=27.40, raw=61.60 > 47, service=61.60, total=221.60
    expect(result.discountAmount).toBe(1.8);
    expect(result.calloutFee).toBe(27.4);
    expect(result.total).toBe(221.6);
  });

  it('demand multiplier applies to service only, never to tyre cost — spec test 4', () => {
    const result = calculatePricing(mobileInput({
      surgeMultiplier: 1.10,
    }), defaultRules({ surge_pricing_enabled: true }));
    // service before demand: 47 (minimum), demand clamp: 1.10 (within 0.95–1.15)
    // demand amount: 47 × 0.10 = 4.70, service after: 51.70
    // tyre: 80 (unchanged!), total: 80 + 51.70 = 131.70
    expect(result.surgeMultiplier).toBe(1.10);
    expect(result.tyreSubtotal).toBe(80);
    expect(result.serviceSubtotal).toBeCloseTo(51.7, 2);
    expect(result.total).toBeCloseTo(131.7, 2);
  });

  it('demand clamp for mobile: max 1.15', () => {
    const result = calculatePricing(mobileInput({
      surgeMultiplier: 1.30, // above mobile max
    }), defaultRules({ surge_pricing_enabled: true }));
    expect(result.surgeMultiplier).toBe(1.15); // clamped
  });

  it('demand clamp for mobile: min 0.95', () => {
    const result = calculatePricing(mobileInput({
      surgeMultiplier: 0.80, // below mobile min
    }), defaultRules({ surge_pricing_enabled: true }));
    expect(result.surgeMultiplier).toBe(0.95); // clamped
  });

  it('service-only repair 5 miles', () => {
    const result = calculatePricing(mobileInput({
      tyreSelections: [],
      serviceType: 'repair',
      tyreQuantity: 1,
    }), defaultRules());
    // repair labour: 25, travel: 27.40, raw: 52.40 > 47, service=52.40, tyre=0, total=52.40
    expect(result.isValid).toBe(true);
    expect(result.totalTyreCost).toBe(0);
    expect(result.total).toBe(52.4);
  });

  it('surge disabled ignores multiplier', () => {
    const result = calculatePricing(mobileInput({ surgeMultiplier: 1.20 }),
      defaultRules({ surge_pricing_enabled: false }));
    expect(result.surgeMultiplier).toBe(1.0);
  });

  it('tyreSubtotal and serviceSubtotal fields populated correctly', () => {
    const result = calculatePricing(mobileInput(), defaultRules());
    expect(result.tyreSubtotal).toBe(80);
    expect(result.serviceSubtotal).toBe(47);
    expect(result.tyrePrice).toBe(80);
    expect(result.totalPrice).toBe(127);
  });

  it('all line items have a code', () => {
    const result = calculatePricing(mobileInput({
      weatherSurcharge: 12,
      weatherSurchargeCode: 'HEAVY_RAIN',
      trafficSurcharge: 5,
      trafficSurchargeCode: 'MODERATE_TRAFFIC',
      isBankHoliday: true,
    }), defaultRules());
    for (const item of result.lineItems) {
      expect(item.code).toBeTruthy();
    }
  });
});

// ─── calculatePricing — emergency_mobile ─────────────────────────────────────

describe('calculatePricing — emergency_mobile', () => {
  it('1 tyre fit 5 miles weekday: correct emergency pricing — spec test 8', () => {
    const result = calculatePricing(emergencyInput(), defaultRules());
    // emergency travel: 27.40 × 1.15 = 31.51, labour: 22, priority: 47
    // raw service: 100.51; guardrail: max(81, 58.75, 90) = 90 → not triggered
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('emergency_mobile');
    expect(result.calloutFee).toBeCloseTo(31.51, 2);
    expect(result.emergencySurcharge).toBe(47);
    expect(result.emergencySurchargeSource).toBe('pricing_rule');
    expect(result.serviceSubtotal).toBeCloseTo(100.51, 2);
    expect(result.total).toBeCloseTo(180.51, 2);
    expect(typeof result.fittingPrice).toBe('number'); // mobile detection
  });

  it('at 20 miles: service matches ~£137.31 for one fit tyre — spec test 9', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 20 }), defaultRules());
    // scheduled travel=59.40, emergency travel=68.31, labour=22, priority=47
    // raw=137.31; guardrail: max(111.40, 96.75, 90) = 111.40 → not triggered
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(137.31, 2);
    expect(result.total).toBeCloseTo(217.31, 2);
  });

  it('at 40 miles: service matches ~£206.31 for one fit tyre — spec test 10', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 40 }), defaultRules());
    // scheduled travel=119.40, emergency travel=137.31, labour=22, priority=47
    // raw=206.31; guardrail: max(171.40, 171.75, 90) = 171.75 → not triggered
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(206.31, 2);
    expect(result.total).toBeCloseTo(286.31, 2);
  });

  it('emergency travel fee is 1.15× the scheduled mobile travel fee', () => {
    const mobileResult = calculatePricing(mobileInput({ distanceMiles: 10 }), defaultRules());
    const emergResult = calculatePricing(emergencyInput({ distanceMiles: 10 }), defaultRules());
    // scheduledTravel(10) = 35.90, emergencyTravel = 35.90 × 1.15 = 41.285 → 41.29 (ROUND_HALF_UP)
    // Use precision 1 (tolerance 0.05) to stay robust against the half-penny rounding boundary.
    expect(emergResult.calloutFee).toBeCloseTo(mobileResult.calloutFee * 1.15, 1);
  });

  it('emergency priority fee always present (never £0) — spec test 8', () => {
    const result = calculatePricing(emergencyInput(), defaultRules());
    expect(result.emergencySurcharge).toBeGreaterThan(0);
    expect(result.emergencySurcharge).toBe(47);
  });

  it('missing emergency DB rule still results in emergency priority >= £47 — spec test 8', () => {
    // parsePricingRules with no emergency_priority_fee key falls back to default 47
    const rules = parsePricingRules([]);
    expect(rules.emergency_priority_fee).toBe(47);
    const result = calculatePricing(emergencyInput(), rules);
    expect(result.emergencySurcharge).toBeGreaterThanOrEqual(47);
  });

  it('bank holiday adds emergency_bank_holiday_fee (£45)', () => {
    const result = calculatePricing(emergencyInput({ isBankHoliday: true }), defaultRules());
    // labour=22, travel=31.51, priority=47, bh=45 → raw=145.51 > guardrail(90)
    expect(result.total).toBeCloseTo(225.51, 2);
  });

  it('weekend surcharge NOT applied to emergency (emergency is always urgent)', () => {
    const result = calculatePricing(emergencyInput({ bookingDate: WEEKEND }), defaultRules());
    // no weekend fee for emergency mode
    const weekdayResult = calculatePricing(emergencyInput(), defaultRules());
    expect(result.total).toBe(weekdayResult.total);
  });

  it('guardrail enforced when priority fee is very low', () => {
    // With priority_fee=10, raw service = 22+31.51+10 = 63.51
    // scheduledMobileBase: 18+27.40=45.40 → scheduledMobileService=max(45.40,47)=47
    // guardrail = max(47+34=81, 47*1.25=58.75, 90) = 90
    // 63.51 < 90 → adjustment = 26.49, service = 90
    const result = calculatePricing(emergencyInput(),
      defaultRules({ emergency_priority_fee: 10 }));
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(90, 2);
    expect(result.total).toBeCloseTo(170, 2);
  });

  it('guardrail uses EMERGENCY_GUARDRAIL_ADJUSTMENT code', () => {
    const result = calculatePricing(emergencyInput(),
      defaultRules({ emergency_priority_fee: 10 }));
    const guardrailItem = result.lineItems.find((li) => li.code === 'EMERGENCY_GUARDRAIL_ADJUSTMENT');
    expect(guardrailItem).toBeDefined();
    expect(guardrailItem?.amount).toBeGreaterThan(0);
  });

  it('guardrail: emergency >= scheduledMobile + £34 — spec test 3', () => {
    // Service-only repair at 5 miles:
    // scheduledMobileBase=25+27.40=52.40, scheduledMobileService=max(52.40,47)=52.40
    // guardrailMin = max(52.40+34=86.40, 52.40*1.25=65.50, 90) = 90
    const result = calculatePricing(emergencyInput({
      tyreSelections: [],
      serviceType: 'repair',
      tyreQuantity: 1,
    }), defaultRules({ emergency_priority_fee: 1 }));
    // emergency raw: 30 + 31.51 + 1 = 62.51 < 90 → guardrail applies
    expect(result.serviceSubtotal).toBeCloseTo(90, 2);
  });

  it('demand clamp for emergency: min 1.00, max 1.25', () => {
    const result = calculatePricing(emergencyInput({ surgeMultiplier: 1.30 }),
      defaultRules({ surge_pricing_enabled: true }));
    expect(result.surgeMultiplier).toBe(1.25); // capped at 1.25

    const result2 = calculatePricing(emergencyInput({ surgeMultiplier: 0.80 }),
      defaultRules({ surge_pricing_enabled: true }));
    expect(result2.surgeMultiplier).toBe(1.0); // floor at 1.0 (no discount for emergency)
  });

  it('demand multiplier applies to service only', () => {
    const result = calculatePricing(emergencyInput({ surgeMultiplier: 1.20 }),
      defaultRules({ surge_pricing_enabled: true }));
    // service before demand: 100.51, demand: 1.20
    // demand amount: 100.51 × 0.20 = 20.10, service after: 120.61
    // tyre: 80 (unchanged), total: 200.61
    expect(result.tyreSubtotal).toBe(80);
    expect(result.serviceSubtotal).toBeCloseTo(120.61, 2);
    expect(result.total).toBeCloseTo(200.61, 2);
  });

  it('emergency bundle discount rates: 0% for 2 tyres', () => {
    const result = calculatePricing(emergencyInput({
      tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    expect(result.discountAmount).toBe(0); // no emergency discount for 2 tyres
  });

  it('emergency bundle discount rates: 3% for 3 tyres', () => {
    const result = calculatePricing(emergencyInput({
      tyreSelections: [{ tyreId: 't1', quantity: 3, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    // labour = 3×22=66, discount = 66×0.03=1.98
    expect(result.discountAmount).toBeCloseTo(1.98, 2);
  });

  it('emergency: 60 miles is auto-priced — spec test 11', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 60 }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBeCloseTo(225.86, 2);
  });

  it('emergency: 100 miles is auto-priced — spec test 11', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 100 }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBeCloseTo(421.36, 2);
  });

  it('emergency: 100.01 miles returns outside auto-pricing area — spec test 11', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 100.01 }), defaultRules());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('OUTSIDE_AUTO_PRICING_AREA');
  });
});

// ─── resolvePricingContext ────────────────────────────────────────────────────

describe('resolvePricingContext', () => {
  it('returns emergency_mobile_fitting for emergency bookings', () => {
    expect(resolvePricingContext({ bookingType: 'emergency' })).toBe('emergency_mobile_fitting');
  });

  it('returns scheduled_mobile_fitting for mobile scheduled bookings', () => {
    expect(resolvePricingContext({ bookingType: 'scheduled', fittingLocation: 'mobile' })).toBe('scheduled_mobile_fitting');
  });

  it('returns scheduled_garage_fitting when no fittingLocation specified', () => {
    expect(resolvePricingContext({ bookingType: 'scheduled' })).toBe('scheduled_garage_fitting');
  });

  it('returns scheduled_garage_fitting for shop fittingLocation', () => {
    expect(resolvePricingContext({ bookingType: 'scheduled', fittingLocation: 'shop' })).toBe('scheduled_garage_fitting');
  });
});

// ─── resolvePricingMode (and backward-compat resolveMode alias) ───────────────

describe('resolvePricingMode', () => {
  it('scheduled_garage_fitting context → scheduled_shop', () => {
    expect(resolvePricingMode({ pricingContext: 'scheduled_garage_fitting' })).toBe('scheduled_shop');
  });

  it('fittingLocation shop → scheduled_shop', () => {
    expect(resolvePricingMode({ fittingLocation: 'shop', bookingType: 'scheduled' })).toBe('scheduled_shop');
  });

  it('emergency_mobile_fitting context → emergency_mobile', () => {
    expect(resolvePricingMode({ pricingContext: 'emergency_mobile_fitting' })).toBe('emergency_mobile');
  });

  it('bookingType emergency → emergency_mobile', () => {
    expect(resolvePricingMode({ bookingType: 'emergency' })).toBe('emergency_mobile');
  });

  it('scheduled_mobile_fitting context → scheduled_mobile', () => {
    expect(resolvePricingMode({ pricingContext: 'scheduled_mobile_fitting' })).toBe('scheduled_mobile');
  });

  it('no context, scheduled bookingType → scheduled_mobile', () => {
    expect(resolvePricingMode({ bookingType: 'scheduled' })).toBe('scheduled_mobile');
  });

  it('explicit mode field takes precedence', () => {
    expect(resolvePricingMode({
      mode: 'scheduled_shop',
      bookingType: 'emergency',
      pricingContext: 'emergency_mobile_fitting',
    })).toBe('scheduled_shop');
  });

  it('resolveMode alias produces same result as resolvePricingMode', () => {
    const inputs = [
      { bookingType: 'emergency' as const },
      { bookingType: 'scheduled' as const, fittingLocation: 'shop' as const },
      { bookingType: 'scheduled' as const, fittingLocation: 'mobile' as const },
    ];
    for (const inp of inputs) {
      expect(resolveMode(inp)).toBe(resolvePricingMode(inp));
    }
  });
});

// ─── parsePricingRules ────────────────────────────────────────────────────────

describe('parsePricingRules', () => {
  it('returns all defaults when given empty rules array', () => {
    const rules = parsePricingRules([]);
    expect(rules.tpms_fee_per_tyre).toBe(10);
    expect(rules.shop_fit_labour_per_tyre).toBe(18);
    expect(rules.mobile_fit_labour_per_tyre).toBe(18);
    expect(rules.emergency_fit_labour_per_tyre).toBe(22);
    expect(rules.emergency_priority_fee).toBe(47);
    expect(rules.mobile_min_service_subtotal).toBe(47);
    expect(rules.emergency_min_service_subtotal).toBe(90);
    expect(rules.surge_pricing_enabled).toBe(false);
  });

  it('overrides specific values from DB rows', () => {
    const rules = parsePricingRules([
      { key: 'shop_fit_labour_per_tyre', value: '22' },
      { key: 'emergency_priority_fee', value: '65' },
    ]);
    expect(rules.shop_fit_labour_per_tyre).toBe(22);
    expect(rules.emergency_priority_fee).toBe(65);
    expect(rules.mobile_fit_labour_per_tyre).toBe(18); // still default
  });

  it('parses boolean surge_pricing_enabled correctly', () => {
    const rules = parsePricingRules([{ key: 'surge_pricing_enabled', value: 'true' }]);
    expect(rules.surge_pricing_enabled).toBe(true);
  });
});

// ─── getDisplayBreakdown ──────────────────────────────────────────────────────

describe('getDisplayBreakdown', () => {
  it('returns items unchanged when no rural surcharge exists (v2 normal case)', () => {
    const result = calculatePricing(mobileInput(), defaultRules());
    const display = getDisplayBreakdown(result);

    expect(display.total).toBe(result.total);
    expect(display.subtotal).toBe(result.subtotal);
    expect(display.lineItems.length).toBe(result.lineItems.length);
  });

  it('folds legacy rural surcharge into callout line item', () => {
    const mockBreakdown = {
      lineItems: [
        { label: 'Tyre', amount: 80, type: 'tyre' as const, code: 'TYRE_SUBTOTAL' as const },
        { label: 'Callout (5 mi.)', amount: 32, type: 'callout' as const, code: 'TRAVEL_DISTANCE' as const },
        { label: 'Rural area surcharge (50%)', amount: 56, type: 'surcharge' as const, code: 'TRAVEL_DISTANCE' as const },
        { label: 'Subtotal', amount: 168, type: 'subtotal' as const, code: 'LINE_SUBTOTAL' as const },
        { label: 'Total', amount: 168, type: 'total' as const, code: 'LINE_TOTAL' as const },
      ],
      subtotal: 168,
      vatAmount: 0,
      total: 168,
      // Required PricingBreakdown fields
      totalTyreCost: 80, totalServiceFee: 0, calloutFee: 32,
      totalSurcharges: 56, discountAmount: 0, surgeMultiplier: 1,
      vatRate: 0, quoteExpiresAt: new Date(), isValid: true,
    };

    const display = getDisplayBreakdown(mockBreakdown as Parameters<typeof getDisplayBreakdown>[0]);
    const ruralLines = display.lineItems.filter((li) => li.label.toLowerCase().includes('rural'));
    expect(ruralLines).toHaveLength(0);

    const calloutLine = display.lineItems.find((li) => li.type === 'callout');
    expect(calloutLine?.amount).toBe(88); // 32 + 56
    expect(calloutLine?.label).toContain('long-distance fee');
    expect(display.total).toBe(168);
  });
});

// ─── calculateHybridPricing ───────────────────────────────────────────────────

describe('calculateHybridPricing', () => {
  const hybridMobile = (overrides: Partial<HybridPricingInput> = {}): HybridPricingInput => ({
    ...mobileInput(),
    ...overrides,
  });

  it('weatherMultiplier=1.0, no demand → same total as base calculatePricing', () => {
    const base = calculatePricing(mobileInput(), defaultRules());
    const hybrid = calculateHybridPricing(hybridMobile({ weatherMultiplier: 1.0 }), defaultRules());
    expect(hybrid.finalPrice).toBe(base.total);
    expect(hybrid.legacyBreakdown.isValid).toBe(true);
  });

  it('applies weather multiplier to service only, not tyres', () => {
    const hybrid = calculateHybridPricing(
      hybridMobile({ weatherMultiplier: 1.10 }),
      defaultRules(),
    );
    // service before weather=47 (minimum), after=47×1.10=51.70
    // tyre=80 (unchanged), total=131.70
    expect(hybrid.finalPrice).toBeCloseTo(131.7, 2);
    expect(hybrid.basePrice).toBe(80); // tyre cost
    expect(hybrid.weatherMultiplier).toBe(1.10);
  });

  it('does not apply weather multiplier when flat weatherSurcharge already passed', () => {
    // Guard: flat fee already applied → weatherMult must be 1.0 to avoid double-charging
    const withFlatFee = calculateHybridPricing(
      hybridMobile({ weatherMultiplier: 1.10, weatherSurcharge: 12, weatherSurchargeCode: 'HEAVY_RAIN' }),
      defaultRules(),
    );
    const withMultiplierOnly = calculateHybridPricing(
      hybridMobile({ weatherMultiplier: 1.10 }),
      defaultRules(),
    );
    // With flat fee, weatherMultiplier must be neutralised (guard active)
    expect(withFlatFee.weatherMultiplier).toBe(1.0);
    // Without flat fee, multiplier is applied
    expect(withMultiplierOnly.weatherMultiplier).toBe(1.10);
  });

  it('caps combined multiplier at 1.50 (emergency mode, clamp matches input)', () => {
    const hybrid = calculateHybridPricing(
      { ...emergencyInput(), surgeMultiplier: 1.25, weatherMultiplier: 1.25 },
      defaultRules({ surge_pricing_enabled: true }),
    );
    // service after demand=125.64, preDemandService≈100.512
    // combinedMult=1.5625>1.50, so cap: 100.512*1.50≈150.77, total≈230.77
    expect(hybrid.finalPrice).toBeCloseTo(230.77, 2);
    expect(hybrid.pricingAudit.surgeMultiplier).toBe(1.25);
  });

  it('marks legacyBreakdown.isValid = true for valid inputs', () => {
    const hybrid = calculateHybridPricing(hybridMobile(), defaultRules());
    expect(hybrid.legacyBreakdown.isValid).toBe(true);
  });

  it('returns invalid legacyBreakdown for severe weather', () => {
    const hybrid = calculateHybridPricing(
      hybridMobile({ weatherManualQuoteRequired: true }),
      defaultRules(),
    );
    expect(hybrid.legacyBreakdown.isValid).toBe(false);
    expect(hybrid.legacyBreakdown.error).toBe('WEATHER_MANUAL_QUOTE_REQUIRED');
  });

  it('pricingReasons includes emergency for emergency bookings', () => {
    const hybrid = calculateHybridPricing(
      { ...emergencyInput(), weatherMultiplier: 1.0 },
      defaultRules(),
    );
    expect(hybrid.pricingReasons).toContain('Emergency booking');
  });
});

// ─── Pricing consistency — spec tests 1, 2, 3, 4, 5, 12, 13 ──────────────────

describe('pricing consistency', () => {
  it('shop service < mobile service < emergency service for same tyre and date — spec tests 1 & 2', () => {
    const rules = defaultRules();
    const shop = calculatePricing(shopInput(), rules);
    const mobile = calculatePricing(mobileInput(), rules);
    const emerg = calculatePricing(emergencyInput(), rules);

    expect(emerg.serviceSubtotal!).toBeGreaterThan(mobile.serviceSubtotal!);
    expect(mobile.serviceSubtotal!).toBeGreaterThan(shop.total - shop.totalTyreCost);
    expect(emerg.total).toBeGreaterThan(mobile.total);
    expect(mobile.total).toBeGreaterThan(shop.total);
  });

  it('emergency service >= max(£90, scheduledMobile + £34, scheduledMobile * 1.25) — spec test 3', () => {
    const rules = defaultRules();
    // Service-only at 5 miles to isolate service comparison
    const mobileResult = calculatePricing(
      mobileInput({ tyreSelections: [], serviceType: 'repair', tyreQuantity: 1 }),
      rules,
    );
    const emergResult = calculatePricing(
      emergencyInput({ tyreSelections: [], serviceType: 'repair', tyreQuantity: 1 }),
      rules,
    );
    const mS = mobileResult.serviceSubtotal!;
    const eS = emergResult.serviceSubtotal!;
    expect(eS).toBeGreaterThanOrEqual(Math.max(mS + 34, mS * 1.25, 90));
  });

  it('tyre cost is never multiplied by demand — spec test 4', () => {
    const rules = defaultRules({ surge_pricing_enabled: true });
    const withDemand = calculatePricing(mobileInput({ surgeMultiplier: 1.15 }), rules);
    const noDemand = calculatePricing(mobileInput(), rules);

    expect(withDemand.tyreSubtotal).toBe(noDemand.tyreSubtotal);
    expect(withDemand.total).toBeGreaterThan(noDemand.total);
  });

  it('total = tyreSubtotal + serviceSubtotal always', () => {
    const cases = [
      calculatePricing(shopInput(), defaultRules()),
      calculatePricing(mobileInput(), defaultRules()),
      calculatePricing(emergencyInput(), defaultRules()),
      calculatePricing(mobileInput({ distanceMiles: 20 }), defaultRules()),
    ];
    for (const result of cases) {
      if (result.isValid) {
        expect(result.total).toBeCloseTo(
          (result.tyreSubtotal ?? 0) + (result.serviceSubtotal ?? 0),
          2,
        );
      }
    }
  });

  it('calculatePricing is deterministic (architectural basis for quote/quick-book parity) — spec test 13', () => {
    // Both the customer quote route and admin quick-book call calculatePricing
    // with the same inputs. After dynamic layer removal, both return
    // calculatePricing output directly (quick-book adds admin adjustment only).
    // Verified here by showing determinism for identical inputs.
    const input = mobileInput();
    const rules = defaultRules();
    const a = calculatePricing(input, rules);
    const b = calculatePricing(input, rules);
    expect(a.total).toBe(b.total);
    expect(a.serviceSubtotal).toBe(b.serviceSubtotal);
    expect(a.tyreSubtotal).toBe(b.tyreSubtotal);
  });

  it('no stale v1 labels in live v2 breakdowns — spec test 13', () => {
    const rules = defaultRules();
    const inputs = [shopInput(), mobileInput(), emergencyInput()];
    for (const input of inputs) {
      const result = calculatePricing(input, rules);
      expect(result.isValid).toBe(true);
      for (const item of result.lineItems) {
        expect(item.label.toLowerCase()).not.toMatch(/rural area/);
        expect(item.label.toLowerCase()).not.toMatch(/callout slab/);
        expect(item.label.toLowerCase()).not.toMatch(/zone [a-z]/);
        expect(item.label.toLowerCase()).not.toMatch(/emergency_surcharge/);
      }
    }
  });

  it('backend-origin distance enforced: engine uses provided distanceMiles directly — spec test 6 note', () => {
    // The engine uses whatever distanceMiles is passed; route-layer calls
    // resolveDistance() server-side and never accepts a client-provided distance.
    // Unit-testable behaviour: different distances produce different totals.
    const rules = defaultRules();
    const near = calculatePricing(mobileInput({ distanceMiles: 5 }), rules);
    const far = calculatePricing(mobileInput({ distanceMiles: 30 }), rules);
    expect(far.calloutFee).toBeGreaterThan(near.calloutFee);
  });
});

~~~

## lib/fitting-location-pricing.ts

~~~
import { Decimal } from 'decimal.js';

export const FITTING_AT_LOCATION_LABEL = 'Fitting at your location';
export const FITTING_LOCATION_MANUAL_QUOTE_ERROR = 'OUTSIDE_AUTO_PRICING_AREA';
export const FITTING_LOCATION_INVALID_DISTANCE_ERROR = 'FITTING_LOCATION_INVALID_DISTANCE';

/** Backend-only origin used to resolve service distance. Never trusted from frontend. */
export const GARAGE_ORIGIN_ADDRESS = '3, 10 Gateside St, Glasgow G31 1PD';

/** Maximum distance for automatic mobile pricing. Beyond this, a manual quote is required. */
export const MOBILE_AUTO_PRICING_MAX_MILES = 100;
export const MOBILE_MAX_DISTANCE_MILES = MOBILE_AUTO_PRICING_MAX_MILES;

export type FittingLocationPricingUnavailableReason =
  | 'INVALID_DISTANCE'
  | 'MANUAL_QUOTE_REQUIRED';

export type FittingLocationPricingResult =
  | {
      available: true;
      distanceMiles: number;
      travelFee: number;
      distanceServicePrice: number;
      fittingLabourFee: number;
      mobileFittingBasePrice: number;
      fittingPrice: number;
      displayPrice: string;
    }
  | {
      available: false;
      distanceMiles: number | null;
      fittingPrice: null;
      displayPrice: null;
      reason: FittingLocationPricingUnavailableReason;
      message: string;
    };

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function formatGbp(amount: number): string {
  return gbpFormatter.format(amount);
}

/**
 * Returns the portion of distance d that falls between from and to miles.
 * Used to build continuous (no-jump) piecewise travel fee tiers.
 */
export function milesBetween(distance: number, from: number, to: number): number {
  return Math.max(0, Math.min(distance, to) - from);
}

/**
 * Continuous travel fee with no step-jumps at tier boundaries.
 * Returns null when distance exceeds MOBILE_AUTO_PRICING_MAX_MILES.
 *
 * Tier structure:
 *   0–3 mi:  base £24 (flat)
 *   3–10 mi: £1.70/mile
 *   10–20 mi: £2.35/mile
 *   20–40 mi: £3.00/mile
 *   40–60 mi: £3.85/mile
 *   60–100 mi: £4.25/mile
 */
export function calculateTravelFee(distanceMiles: number): number | null {
  if (!Number.isFinite(distanceMiles) || distanceMiles < 0) return null;
  if (distanceMiles > MOBILE_AUTO_PRICING_MAX_MILES) return null;

  const d = distanceMiles;
  const fee = new Decimal(24)
    .plus(new Decimal(milesBetween(d, 3, 10)).times(1.7))
    .plus(new Decimal(milesBetween(d, 10, 20)).times(2.35))
    .plus(new Decimal(milesBetween(d, 20, 40)).times(3.0))
    .plus(new Decimal(milesBetween(d, 40, 60)).times(3.85))
    .plus(new Decimal(milesBetween(d, 60, 100)).times(4.25));

  return fee.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Calculates the v2 fitting-at-location price.
 *
 * In v2, labour is billed separately by the pricing engine.
 * This function returns only the travel (distance) component.
 * fittingLabourFee is always 0; fittingPrice equals travelFee.
 */
export function calculateFittingAtLocationPrice(
  distanceMiles: number | null | undefined,
): FittingLocationPricingResult {
  if (
    distanceMiles === null ||
    distanceMiles === undefined ||
    !Number.isFinite(distanceMiles) ||
    distanceMiles < 0
  ) {
    return {
      available: false,
      distanceMiles: null,
      fittingPrice: null,
      displayPrice: null,
      reason: 'INVALID_DISTANCE',
      message: 'Unable to calculate fitting-at-location price because the distance is invalid.',
    };
  }

  if (distanceMiles > MOBILE_AUTO_PRICING_MAX_MILES) {
    return {
      available: false,
      distanceMiles,
      fittingPrice: null,
      displayPrice: null,
      reason: 'MANUAL_QUOTE_REQUIRED',
      message: `This fitting location is over ${MOBILE_AUTO_PRICING_MAX_MILES} miles away and needs a manual quote.`,
    };
  }

  const travelFee = calculateTravelFee(distanceMiles)!;

  return {
    available: true,
    distanceMiles,
    travelFee,
    distanceServicePrice: travelFee,
    fittingLabourFee: 0,
    mobileFittingBasePrice: travelFee,
    fittingPrice: travelFee,
    displayPrice: formatGbp(travelFee),
  };
}

~~~

## lib/quick-book-pricing.ts

~~~
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankHolidays, pricingRules, tyreProducts } from '@/lib/db/schema';
import {
  calculatePricing,
  parsePricingRules,
  resolveMode,
  type PricingContext,
  type PricingBreakdown,
  type TyreSelection,
} from '@/lib/pricing-engine';
import { normalizeTyreSize } from '@/lib/inventory/tyre-size';
import type { WeatherPricingContext } from '@/lib/weather';
import { calculateWeatherSurcharge } from '@/lib/pricing/weather-modifier';
import { calculateTrafficSurcharge } from '@/lib/pricing/traffic-modifier';
import {
  FITTING_LOCATION_MANUAL_QUOTE_ERROR,
  MOBILE_AUTO_PRICING_MAX_MILES,
} from '@/lib/fitting-location-pricing';

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
  fittingLocation?: 'shop' | 'mobile';
  pricingContext?: PricingContext;
  durationMinutes?: number | null;
  weatherContext?: WeatherPricingContext | null;
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

export function resolveQuickBookBookingType(pricingContext: PricingContext): 'emergency' | 'scheduled' {
  if (
    pricingContext === 'emergency_mobile_fitting' ||
    pricingContext === 'admin_quick_book' ||
    pricingContext === 'assisted_chat'
  ) {
    return 'emergency';
  }

  return 'scheduled';
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
  if (!Number.isFinite(unitPrice)) return null;

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

  breakdown.lineItems = breakdown.lineItems.filter((line) => {
    return line.label !== 'Admin adjustment' && !line.label.startsWith('Admin adjustment - ');
  });

  if (normalizedAdjustment !== 0) {
    const adjustmentReason = _adjustmentReason?.trim();
    const adjustmentLine = {
      label: adjustmentReason ? `Admin adjustment - ${adjustmentReason}` : 'Admin adjustment',
      amount: normalizedAdjustment,
      type: normalizedAdjustment >= 0 ? 'surcharge' as const : 'discount' as const,
      code: 'ADMIN_ADJUSTMENT' as const,
    };
    const subtotalIndex = breakdown.lineItems.findIndex((line) => line.type === 'subtotal');
    const insertIndex = subtotalIndex >= 0 ? subtotalIndex : breakdown.lineItems.length;
    breakdown.lineItems.splice(insertIndex, 0, adjustmentLine);

    breakdown.subtotal = Math.round((breakdown.subtotal + normalizedAdjustment) * 100) / 100;
    breakdown.total = Math.round((breakdown.total + normalizedAdjustment) * 100) / 100;
    breakdown.totalPrice = breakdown.total;
    breakdown.adminAdjustmentAmount = normalizedAdjustment;
    breakdown.adminAdjustmentReason = adjustmentReason || null;

    if (normalizedAdjustment >= 0) {
      breakdown.totalSurcharges = Math.round((breakdown.totalSurcharges + normalizedAdjustment) * 100) / 100;
    } else {
      breakdown.discountAmount = Math.round((breakdown.discountAmount + Math.abs(normalizedAdjustment)) * 100) / 100;
    }
  }

  for (const line of breakdown.lineItems) {
    if (line.type === 'subtotal') line.amount = breakdown.subtotal;
    if (line.type === 'total') line.amount = breakdown.total;
  }

  return breakdown;
}

function calculateQuickBookWeatherModifier(
  weatherContext: WeatherPricingContext | null | undefined,
  mode: import('@/lib/pricing/weather-modifier').PricingMode,
) {
  if (!weatherContext) {
    return calculateWeatherSurcharge({ mode });
  }

  return calculateWeatherSurcharge({
    condition: weatherContext.conditionLabel,
    severity: weatherContext.weatherReason,
    precipitationMm: weatherContext.precipitationIntensity,
    windMph: weatherContext.windSpeed * 2.23694,
    temperatureC: weatherContext.temperature,
    mode,
  });
}

export async function calculateQuickBookPricing(
  input: QuickBookPricingInput
): Promise<QuickBookPricingResult> {
  const bookingDate = input.bookingDate ?? new Date();
  const pricingContext = input.pricingContext ?? 'admin_quick_book';
  const fittingLocation = input.fittingLocation ?? 'mobile';
  const normalizedTyreSize = input.tyreSize?.trim() ? normalizeTyreSize(input.tyreSize) : null;
  const resolveTyreFromSize = input.resolveTyreFromSize !== false;
  const requireTyreForFit = input.requireTyreForFit ?? false;

  const bookingType = resolveQuickBookBookingType(pricingContext);
  const mode = resolveMode({ pricingContext, fittingLocation, bookingType });

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
  const weatherModifier = calculateQuickBookWeatherModifier(input.weatherContext, mode);
  const trafficModifier = calculateTrafficSurcharge({
    distanceMiles: input.distanceMiles,
    durationMinutes: input.durationMinutes ?? null,
    mode,
  });

  const breakdown = calculatePricing(
    {
      tyreSelections,
      distanceMiles: input.distanceMiles,
      bookingType,
      pricingContext,
      mode,
      bookingDate,
      isBankHoliday: holidayRows.length > 0,
      serviceType: input.serviceType,
      tyreQuantity: input.tyreCount,
      fittingLocation,
      weatherSurcharge: weatherModifier.surcharge,
      weatherSurchargeCode: weatherModifier.code,
      weatherManualQuoteRequired: weatherModifier.manualQuoteRequired,
      trafficSurcharge: trafficModifier.surcharge,
      trafficSurchargeCode: trafficModifier.code,
      trafficDelayMinutes: trafficModifier.delayMinutes,
    },
    rules,
    true,
  );

  if (!breakdown.isValid) {
    if (breakdown.error === 'WEATHER_MANUAL_QUOTE_REQUIRED') {
      throw new QuickBookPricingError('Current weather conditions need a manual quote.', 422);
    }
    if (breakdown.error === FITTING_LOCATION_MANUAL_QUOTE_ERROR) {
      throw new QuickBookPricingError(
        `This fitting location is over ${MOBILE_AUTO_PRICING_MAX_MILES} miles away and needs a manual quote.`,
        422,
      );
    }
    if (breakdown.error === 'FITTING_LOCATION_INVALID_DISTANCE') {
      throw new QuickBookPricingError(
        'Unable to calculate fitting-at-location price because the service distance is invalid.',
        400,
      );
    }
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

~~~

