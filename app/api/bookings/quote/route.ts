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
