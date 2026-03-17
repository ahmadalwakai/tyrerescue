import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  tyreProducts,
  pricingRules,
  inventoryReservations,
  drivers,
  bankHolidays,
  quotes,
  serviceAreas,
} from '@/lib/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import {
  calculatePricing,
  parsePricingRules,
  type TyreSelection,
  type PricingBreakdown,
} from '@/lib/pricing-engine';
import {
  resolveDistance,
  type DistanceResult,
} from '@/lib/mapbox';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from '@neondatabase/serverless';
import { getSurgeMultiplier } from '@/lib/surge';
import { isBudgetTyre } from '@/lib/budget-inventory';

// Input validation schema
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
});

type QuoteRequest = z.infer<typeof quoteRequestSchema>;

interface QuoteResponse {
  quoteId: string;
  expiresAt: string;
  breakdown: PricingBreakdown;
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
  error: string;
  code: string;
  details?: unknown;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<QuoteResponse | ErrorResponse>> {
  const startTime = Date.now();
  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = quoteRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          code: 'VALIDATION_ERROR',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const data: QuoteRequest = validation.data;
    console.log('[QUOTE START]', { bookingType: data.bookingType, serviceType: data.serviceType, tyreCount: data.tyreSelections.length, lat: data.lat, lng: data.lng });

    const customerLocation = { lat: data.lat, lng: data.lng };
    const isRepairOnly = data.serviceType === 'repair' && data.tyreSelections.length === 0;

    // Determine booking date for bank holiday check
    const bookingDate = data.scheduledAt
      ? new Date(data.scheduledAt)
      : new Date();
    const bookingDateStr = bookingDate.toISOString().split('T')[0];

    // --- Parallel data loading (pricing rules, bank holiday, drivers, service areas) ---
    const [rulesRows, holidayResult, driverRows, areaRows] = await Promise.all([
      db.select().from(pricingRules),
      db.select().from(bankHolidays).where(eq(bankHolidays.date, bookingDateStr)).limit(1),
      db.select({
        id: drivers.id,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
      })
        .from(drivers)
        .where(and(eq(drivers.isOnline, true), eq(drivers.status, 'available'))),
      db.select({
        id: serviceAreas.id,
        name: serviceAreas.name,
        centerLat: serviceAreas.centerLat,
        centerLng: serviceAreas.centerLng,
        radiusMiles: serviceAreas.radiusMiles,
      }).from(serviceAreas).where(eq(serviceAreas.active, true)),
    ]);

    const parsedRules = parsePricingRules(
      rulesRows.map((r) => ({ key: r.key, value: r.value }))
    );
    const isBankHoliday = holidayResult.length > 0;

    // Build driver candidates — skip drivers with invalid coordinates
    const driverCandidates = driverRows
      .filter((d) => d.currentLat != null && d.currentLng != null)
      .map((d) => ({
        id: d.id,
        lat: parseFloat(d.currentLat!),
        lng: parseFloat(d.currentLng!),
      }))
      .filter((d) => !isNaN(d.lat) && !isNaN(d.lng));

    // Build service area candidates
    const areaCandidates = areaRows
      .filter((a) => a.centerLat != null && a.centerLng != null)
      .map((a) => ({
        id: a.id,
        lat: Number(a.centerLat),
        lng: Number(a.centerLng),
      }));

    // --- Resolve distance (driver → service area → SERVICE_CENTER) ---
    console.log('[DISTANCE CALC]', { driverCount: driverCandidates.length, areaCount: areaCandidates.length });
    const distanceResult = await resolveDistance(
      customerLocation,
      driverCandidates,
      areaCandidates,
    );

    const distanceMiles = distanceResult.distanceMiles;

    // Check if within service area — single source of truth from DB
    if (distanceMiles > parsedRules.max_service_miles) {
      return NextResponse.json(
        {
          error: `Location is outside our service area (${Math.round(distanceMiles)} miles). We cover up to ${parsedRules.max_service_miles} miles. Please call 0141 266 0690 for assistance.`,
          code: 'OUTSIDE_SERVICE_AREA',
        },
        { status: 400 }
      );
    }

    // Derive driver ETA for emergency bookings from distance resolution
    const driverEtaMinutes =
      data.bookingType === 'emergency' && distanceResult.distanceSource === 'driver'
        ? distanceResult.durationMinutes ?? undefined
        : undefined;

    // Repair with no tyre selections — skip stock checks entirely

    let tyreMap = new Map<string, typeof tyreProducts.$inferSelect>();

    if (!isRepairOnly) {
      // Get tyre product details (read-only query before transaction)
      const tyreIds = data.tyreSelections.map((s) => s.tyreId);
      const tyres = await db
        .select()
        .from(tyreProducts)
        .where(inArray(tyreProducts.id, tyreIds));

      // Create a map for quick lookup
      tyreMap = new Map(tyres.map((t) => [t.id, t]));

      // Validate each tyre exists
      for (const selection of data.tyreSelections) {
        const tyre = tyreMap.get(selection.tyreId);
        if (!tyre) {
          return NextResponse.json(
            {
              error: `Tyre not found: ${selection.tyreId}`,
              code: 'TYRE_NOT_FOUND',
            },
            { status: 400 }
          );
        }
      }
    }

    // Repair-only fast path — no stock to lock, no transaction needed
    if (isRepairOnly) {
      console.log('[PRICING CALC] repair-only path');
      const vatRule = rulesRows.find((r) => r.key === 'vat_registered');
      const vatRegistered = vatRule ? vatRule.value === 'true' : true;

      // Fetch AI surge multiplier if surge pricing is enabled
      let surgeMultiplier: number | undefined;
      if (parsedRules.surge_pricing_enabled) {
        surgeMultiplier = await getSurgeMultiplier();
      }

      const breakdown = calculatePricing(
        {
          tyreSelections: [],
          distanceMiles,
          bookingType: data.bookingType,
          bookingDate,
          isBankHoliday,
          surgeMultiplier,
          serviceType: 'repair',
          tyreQuantity: data.quantity || 1,
        },
        parsedRules,
        vatRegistered
      );

      if (!breakdown.isValid) {
        return NextResponse.json(
          {
            error: breakdown.error || 'Failed to calculate pricing',
            code: breakdown.error === 'OUTSIDE_SERVICE_AREA'
              ? 'OUTSIDE_SERVICE_AREA'
              : 'PRICING_ERROR',
          },
          { status: 400 }
        );
      }

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
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        distanceMiles: String(distanceMiles),
        breakdown: breakdown as unknown as Record<string, unknown>,
        metadata: distanceResult as unknown as Record<string, unknown>,
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
        tyreDetails: [],
        specialOrderRequired: false,
        leadTime: null,
        debug: {
          quoteDurationMs,
          distanceProvider: distanceResult.distanceProvider,
          distanceSource: distanceResult.distanceSource,
          selectedDriverId: distanceResult.selectedDriverId,
          selectedServiceAreaId: distanceResult.selectedServiceAreaId,
          fallbackReason: distanceResult.fallbackReason,
        },
      });
    }

    // Use raw SQL transaction with FOR UPDATE SKIP LOCKED for race condition prevention
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 8_000,
    });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = \'8s\'');
      await client.query('SET LOCAL idle_in_transaction_session_timeout = \'8s\'');

      // Lock and check stock for each tyre atomically
      const tyreDetails: QuoteResponse['tyreDetails'] = [];
      const pricingSelections: TyreSelection[] = [];
      const stockErrors: string[] = [];

      // Build backend-enforced preOrder map BEFORE stock loop
      const preOrderMap = new Map<string, boolean>();
      for (const selection of data.tyreSelections) {
        const tyre = tyreMap.get(selection.tyreId)!;
        preOrderMap.set(selection.tyreId, !isBudgetTyre(tyre.sizeDisplay) || (selection.isPreOrder ?? false));
      }

      for (const selection of data.tyreSelections) {
        const tyre = tyreMap.get(selection.tyreId)!;

        // Backend enforcement: non-budget tyres are ALWAYS pre-order
        const isPreOrder = preOrderMap.get(selection.tyreId)!;

        if (isPreOrder) {
          // Pre-order: no stock lock needed, use catalogue price
          const price = parseFloat(tyre.priceNew?.toString() ?? '0');

          tyreDetails.push({
            tyreId: tyre.id,
            brand: tyre.brand,
            pattern: tyre.pattern,
            sizeDisplay: tyre.sizeDisplay,
            quantity: selection.quantity,
            unitPrice: price,
            available: true,
          });

          pricingSelections.push({
            tyreId: tyre.id,
            quantity: selection.quantity,
            unitPrice: price,
            service: selection.service,
            requiresTpms: selection.requiresTpms,
          });
          continue;
        }

        // SELECT FOR UPDATE SKIP LOCKED to prevent race conditions
        const result = await client.query(
          `SELECT id, stock_new as stock, available_new as available, price_new as price
           FROM tyre_products 
           WHERE id = $1 
           FOR UPDATE SKIP LOCKED`,
          [selection.tyreId]
        );

        if (result.rows.length === 0) {
          stockErrors.push(
            `${tyre.brand} ${tyre.pattern} is currently being reserved by another customer`
          );
          continue;
        }

        const row = result.rows[0];
        const stock = row.stock ?? 0;
        const available = row.available;
        const price = parseFloat(row.price ?? '0');

        if (!available) {
          stockErrors.push(
            `${tyre.brand} ${tyre.pattern} is not currently available`
          );
        } else if (stock < selection.quantity) {
          stockErrors.push(
            `Insufficient stock for ${tyre.brand} ${tyre.pattern}. Requested: ${selection.quantity}, Available: ${stock}`
          );
        }

        tyreDetails.push({
          tyreId: tyre.id,
          brand: tyre.brand,
          pattern: tyre.pattern,
          sizeDisplay: tyre.sizeDisplay,
          quantity: selection.quantity,
          unitPrice: price,
          available: !!available && stock >= selection.quantity,
        });

        pricingSelections.push({
          tyreId: tyre.id,
          quantity: selection.quantity,
          unitPrice: price,
          service: selection.service,
          requiresTpms: selection.requiresTpms,
        });
      }

      if (stockErrors.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            error: 'Some tyres are not available',
            code: 'STOCK_UNAVAILABLE',
            details: stockErrors,
          },
          { status: 400 }
        );
      }

      // Run pricing engine
      console.log('[PRICING CALC] tyre path', { tyreCount: data.tyreSelections.length });
      const vatRule = rulesRows.find((r) => r.key === 'vat_registered');
      const vatRegistered = vatRule ? vatRule.value === 'true' : true;

      // Fetch AI surge multiplier if surge pricing is enabled
      let surgeMultiplier: number | undefined;
      if (parsedRules.surge_pricing_enabled) {
        surgeMultiplier = await getSurgeMultiplier();
      }

      const breakdown = calculatePricing(
        {
          tyreSelections: pricingSelections,
          distanceMiles,
          bookingType: data.bookingType,
          bookingDate,
          isBankHoliday,
          surgeMultiplier,
        },
        parsedRules,
        vatRegistered
      );

      if (!breakdown.isValid) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            error: breakdown.error || 'Failed to calculate pricing',
            code: breakdown.error === 'OUTSIDE_SERVICE_AREA'
              ? 'OUTSIDE_SERVICE_AREA'
              : 'PRICING_ERROR',
          },
          { status: 400 }
        );
      }

      // Generate quote ID and expiry
      const quoteId = uuidv4();
      const expiresAt = new Date(breakdown.quoteExpiresAt);

      // Decrement stock and create reservations within the same transaction
      for (const selection of data.tyreSelections) {
        // Skip stock decrement for pre-order items (use backend-enforced map)
        if (preOrderMap.get(selection.tyreId)) continue;

        // Atomic decrement with check
        const updateResult = await client.query(
          `UPDATE tyre_products 
           SET stock_new = stock_new - $1,
               updated_at = NOW()
           WHERE id = $2 AND stock_new >= $1
           RETURNING id`,
          [selection.quantity, selection.tyreId]
        );

        if (updateResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            {
              error: 'Stock changed during processing. Please try again.',
              code: 'STOCK_CHANGED',
            },
            { status: 409 }
          );
        }

        // Create inventory reservation
        const reservationId = uuidv4();
        await client.query(
          `INSERT INTO inventory_reservations (id, tyre_id, booking_id, quantity, expires_at, released)
           VALUES ($1, $2, NULL, $3, $4, false)`,
          [reservationId, selection.tyreId, selection.quantity, expiresAt]
        );
      }

      // Build corrected selections with backend-enforced isPreOrder
      const correctedSelections = data.tyreSelections.map((sel) => {
        const t = tyreMap.get(sel.tyreId)!;
        return { ...sel, isPreOrder: !isBudgetTyre(t.sizeDisplay) || (sel.isPreOrder ?? false) };
      });
      const hasSpecialOrder = correctedSelections.some((s) => s.isPreOrder);

      // Store quote in database (with distance metadata for auditability)
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
          JSON.stringify(correctedSelections),
          data.scheduledAt ? new Date(data.scheduledAt) : null,
          distanceMiles,
          JSON.stringify(breakdown),
          JSON.stringify({ ...distanceResult, fulfillmentOption: data.fulfillmentOption ?? null }),
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
        tyreDetails,
        specialOrderRequired: hasSpecialOrder,
        leadTime: hasSpecialOrder ? '2\u20133 working days' : null,
        debug: {
          quoteDurationMs,
          distanceProvider: distanceResult.distanceProvider,
          distanceSource: distanceResult.distanceSource,
          selectedDriverId: distanceResult.selectedDriverId,
          selectedServiceAreaId: distanceResult.selectedServiceAreaId,
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
      {
        error: 'Failed to generate quote',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
