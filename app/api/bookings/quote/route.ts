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
} from '@/lib/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import {
  calculatePricing,
  parsePricingRules,
  type TyreSelection,
  type PricingBreakdown,
} from '@/lib/pricing-engine';
import {
  getDrivingDistanceMiles,
  haversineDistanceMiles,
  SERVICE_CENTER,
} from '@/lib/mapbox';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from '@neondatabase/serverless';

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
});

type QuoteRequest = z.infer<typeof quoteRequestSchema>;

interface QuoteResponse {
  quoteId: string;
  expiresAt: string;
  breakdown: PricingBreakdown;
  distanceMiles: number;
  driverEtaMinutes?: number;
  tyreDetails: Array<{
    tyreId: string;
    brand: string;
    pattern: string;
    sizeDisplay: string;
    quantity: number;
    unitPrice: number;
    available: boolean;
  }>;
}

interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<QuoteResponse | ErrorResponse>> {
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

    // Calculate distance from service center to customer
    const customerLocation = { lat: data.lat, lng: data.lng };
    let distanceMiles: number;
    let durationMinutes: number | undefined;

    // Try to get driving distance, fall back to straight-line distance
    const drivingResult = await getDrivingDistanceMiles(
      { lat: SERVICE_CENTER.lat, lng: SERVICE_CENTER.lng },
      customerLocation
    );

    if (drivingResult) {
      distanceMiles = drivingResult.distanceMiles;
      durationMinutes = drivingResult.durationMinutes;
    } else {
      // Fallback to Haversine distance (multiply by 1.3 for road approximation)
      distanceMiles =
        haversineDistanceMiles(SERVICE_CENTER, customerLocation) * 1.3;
    }

    // Check if within service area (50 miles max)
    const maxServiceMiles = 50;
    if (distanceMiles > maxServiceMiles) {
      return NextResponse.json(
        {
          error: `Location is outside our service area. We cover up to ${maxServiceMiles} miles from Glasgow. Please call 0141 266 0690 for assistance.`,
          code: 'OUTSIDE_SERVICE_AREA',
        },
        { status: 400 }
      );
    }

    // Repair with no tyre selections — skip stock checks entirely
    const isRepairOnly = data.serviceType === 'repair' && data.tyreSelections.length === 0;

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

    // Check for available driver (for emergency bookings) - outside transaction
    let driverEtaMinutes: number | undefined;
    if (data.bookingType === 'emergency') {
      const availableDrivers = await db
        .select()
        .from(drivers)
        .where(
          and(eq(drivers.isOnline, true), eq(drivers.status, 'available'))
        )
        .limit(1);

      if (availableDrivers.length > 0) {
        const driver = availableDrivers[0];
        if (driver.currentLat && driver.currentLng) {
          const driverDriving = await getDrivingDistanceMiles(
            {
              lat: parseFloat(driver.currentLat),
              lng: parseFloat(driver.currentLng),
            },
            customerLocation
          );
          if (driverDriving) {
            driverEtaMinutes = driverDriving.durationMinutes;
          }
        }
        if (!driverEtaMinutes && durationMinutes) {
          driverEtaMinutes = durationMinutes;
        }
      }
    }

    // Get pricing rules from database
    const rules = await db.select().from(pricingRules);
    const parsedRules = parsePricingRules(
      rules.map((r) => ({ key: r.key, value: r.value }))
    );

    // Check if booking date is a bank holiday
    const bookingDate = data.scheduledAt
      ? new Date(data.scheduledAt)
      : new Date();
    const bookingDateStr = bookingDate.toISOString().split('T')[0];

    const [holiday] = await db
      .select()
      .from(bankHolidays)
      .where(eq(bankHolidays.date, bookingDateStr))
      .limit(1);

    const isBankHoliday = !!holiday;

    // Repair-only fast path — no stock to lock, no transaction needed
    if (isRepairOnly) {
      const vatRule = rules.find((r) => r.key === 'vat_registered');
      const vatRegistered = vatRule ? vatRule.value === 'true' : true;

      const breakdown = calculatePricing(
        {
          tyreSelections: [],
          distanceMiles,
          bookingType: data.bookingType,
          bookingDate,
          isBankHoliday,
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
        expiresAt,
        used: false,
      });

      return NextResponse.json({
        quoteId,
        expiresAt: expiresAt.toISOString(),
        breakdown,
        distanceMiles,
        driverEtaMinutes,
        tyreDetails: [],
      });
    }

    // Use raw SQL transaction with FOR UPDATE SKIP LOCKED for race condition prevention
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock and check stock for each tyre atomically
      const tyreDetails: QuoteResponse['tyreDetails'] = [];
      const pricingSelections: TyreSelection[] = [];
      const stockErrors: string[] = [];

      for (const selection of data.tyreSelections) {
        const tyre = tyreMap.get(selection.tyreId)!;
        const isPreOrder = selection.isPreOrder ?? false;

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
      const vatRule = rules.find((r) => r.key === 'vat_registered');
      const vatRegistered = vatRule ? vatRule.value === 'true' : true;

      const breakdown = calculatePricing(
        {
          tyreSelections: pricingSelections,
          distanceMiles,
          bookingType: data.bookingType,
          bookingDate,
          isBankHoliday,
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
        // Skip stock decrement for pre-order items
        if (selection.isPreOrder) continue;

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

      // Store quote in database
      await client.query(
        `INSERT INTO quotes (id, lat, lng, address_line, booking_type, service_type, tyre_selections, scheduled_at, distance_miles, breakdown, expires_at, used)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false)`,
        [
          quoteId,
          data.lat,
          data.lng,
          data.addressLine,
          data.bookingType,
          data.serviceType,
          JSON.stringify(data.tyreSelections),
          data.scheduledAt ? new Date(data.scheduledAt) : null,
          distanceMiles,
          JSON.stringify(breakdown),
          expiresAt,
        ]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        quoteId,
        expiresAt: expiresAt.toISOString(),
        breakdown,
        distanceMiles,
        driverEtaMinutes,
        tyreDetails,
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('Quote creation error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
