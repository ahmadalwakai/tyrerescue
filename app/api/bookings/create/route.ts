import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createAdminNotification } from '@/lib/notifications';
import {
  bookings,
  bookingTyres,
  bookingStatusHistory,
  tyreProducts,
  inventoryReservations,
  quotes,
} from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { createPaymentIntent } from '@/lib/stripe';
import { generateRefNumber } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import type { PricingBreakdown } from '@/lib/pricing-engine';
import { Pool } from '@neondatabase/serverless';

// Input validation schema
const createBookingSchema = z.object({
  quoteId: z.string().uuid(),
  customerName: z.string().min(1).max(255),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().min(10).max(20),
  tyrePhotoUrl: z.string().url().optional(),
  vehicleReg: z.string().max(10).optional(),
  vehicleMake: z.string().max(100).optional(),
  vehicleModel: z.string().max(100).optional(),
  tyreSizeDisplay: z.string().max(20).optional(),
  lockingNutStatus: z.enum(['has_key', 'no_key', 'standard']).optional(),
  notes: z.string().max(1000).optional(),
  createAccount: z.boolean().optional(),
  fulfillmentOption: z.enum(['delivery', 'fitting']).optional().nullable(),
  // UTM / attribution
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(255).optional(),
  utm_term: z.string().max(255).optional(),
  utm_content: z.string().max(255).optional(),
  gclid: z.string().max(255).optional(),
  gbraid: z.string().max(255).optional(),
  wbraid: z.string().max(255).optional(),
  landing_page: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
});

type CreateBookingRequest = z.infer<typeof createBookingSchema>;

interface CreateBookingResponse {
  bookingId: string;
  refNumber: string;
  stripeClientSecret: string;
  total: number;
}

interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

interface TyreSelection {
  tyreId: string;
  quantity: number;
  service: 'fit' | 'repair' | 'assess';
  requiresTpms?: boolean;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateBookingResponse | ErrorResponse>> {
  try {
    // Check for authenticated user (optional)
    const session = await auth();
    const userId = session?.user?.id;

    // Parse and validate request body
    const body = await request.json();
    const validation = createBookingSchema.safeParse(body);

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

    const data: CreateBookingRequest = validation.data;

    // Retrieve quote from database with FOR UPDATE to prevent double-use
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock the quote row and check if it's valid
      const quoteResult = await client.query(
        `SELECT * FROM quotes WHERE id = $1 FOR UPDATE`,
        [data.quoteId]
      );

      if (quoteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            error: 'Quote not found. Please create a new quote.',
            code: 'QUOTE_EXPIRED',
          },
          { status: 400 }
        );
      }

      const quote = quoteResult.rows[0];

      // Check if quote has already been used
      if (quote.used) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            error: 'This quote has already been used. Please create a new quote.',
            code: 'QUOTE_EXPIRED',
          },
          { status: 400 }
        );
      }

      // Check if quote has expired
      const now = new Date();
      const expiresAt = new Date(quote.expires_at);

      if (now > expiresAt) {
        // Release the reservations and restore stock
        const tyreSelections: TyreSelection[] = quote.tyre_selections;
        await releaseQuoteReservations(client, tyreSelections);

        // Mark quote as used (expired)
        await client.query(
          `UPDATE quotes SET used = true WHERE id = $1`,
          [data.quoteId]
        );

        await client.query('COMMIT');
        return NextResponse.json(
          {
            error: 'Quote has expired. Please create a new quote.',
            code: 'QUOTE_EXPIRED',
          },
          { status: 400 }
        );
      }

      // Parse quote data
      const tyreSelections: TyreSelection[] = quote.tyre_selections;
      const breakdown: PricingBreakdown = quote.breakdown;
      const hasPreOrderItems = tyreSelections.some(
        (s: TyreSelection & { isPreOrder?: boolean }) => s.isPreOrder,
      );

      // Verify stock is still available (double-check against race conditions)
      const tyreIds = tyreSelections.map((s) => s.tyreId);
      const tyres = await db
        .select()
        .from(tyreProducts)
        .where(inArray(tyreProducts.id, tyreIds));

      const tyreMap = new Map(tyres.map((t) => [t.id, t]));
      const stockErrors: string[] = [];

      for (const selection of tyreSelections) {
        const tyre = tyreMap.get(selection.tyreId);

        if (!tyre) {
          stockErrors.push(`Tyre no longer exists: ${selection.tyreId}`);
          continue;
        }

        // Stock was already reserved in quote, so we check current stock
        // is non-negative (reservation already decremented it)
        const currentStock = tyre.stockNew ?? 0;

        if (currentStock < 0) {
          stockErrors.push(
            `${tyre.brand} ${tyre.pattern} is no longer available`
          );
        }
      }

      if (stockErrors.length > 0) {
        // Release reservations and restore stock
        await releaseQuoteReservations(client, tyreSelections);

        // Mark quote as used
        await client.query(
          `UPDATE quotes SET used = true WHERE id = $1`,
          [data.quoteId]
        );

        await client.query('COMMIT');
        return NextResponse.json(
          {
            error: 'Some tyres are no longer available',
            code: 'STOCK_NO_LONGER_AVAILABLE',
            details: stockErrors,
          },
          { status: 400 }
        );
      }

      // Generate booking reference
      const refNumber = generateRefNumber();

      // Create the booking
      const bookingId = uuidv4();
      const totalQuantity = tyreSelections.reduce(
        (sum, s) => sum + s.quantity,
        0
      );

      await db.insert(bookings).values({
        id: bookingId,
        refNumber,
        userId: userId || null,
        status: 'awaiting_payment',
        bookingType: quote.booking_type,
        serviceType: quote.service_type,
        addressLine: quote.address_line,
        lat: quote.lat.toString(),
        lng: quote.lng.toString(),
        distanceMiles: quote.distance_miles.toString(),
        quantity: totalQuantity,
        tyreSizeDisplay: data.tyreSizeDisplay || null,
        vehicleReg: data.vehicleReg || null,
        vehicleMake: data.vehicleMake || null,
        vehicleModel: data.vehicleModel || null,
        tyrePhotoUrl: data.tyrePhotoUrl || null,
        lockingNutStatus: data.lockingNutStatus || null,
        customerName: data.customerName,
        customerEmail: data.customerEmail.toLowerCase(),
        customerPhone: data.customerPhone,
        scheduledAt: quote.scheduled_at ? new Date(quote.scheduled_at) : null,
        priceSnapshot: breakdown,
        subtotal: breakdown.subtotal.toString(),
        vatAmount: breakdown.vatAmount.toString(),
        totalAmount: breakdown.total.toString(),
        quoteExpiresAt: expiresAt,
        notes: data.notes || null,
        hasPreOrderItems,
        fulfillmentOption: data.fulfillmentOption ?? null,
        // UTM attribution
        utmSource: data.utm_source || null,
        utmMedium: data.utm_medium || null,
        utmCampaign: data.utm_campaign || null,
        utmTerm: data.utm_term || null,
        utmContent: data.utm_content || null,
        gclid: data.gclid || null,
        landingPage: data.landing_page || null,
        referrer: data.referrer || null,
      });

      // Create booking tyres entries
      for (const selection of tyreSelections) {
        const tyre = tyreMap.get(selection.tyreId)!;
        const unitPrice = parseFloat(tyre.priceNew?.toString() ?? '0');

        await db.insert(bookingTyres).values({
          id: uuidv4(),
          bookingId,
          tyreId: selection.tyreId,
          quantity: selection.quantity,
          unitPrice: unitPrice.toString(),
          service: selection.service,
        });
      }

      // Update inventory reservations to link to this booking
      for (const selection of tyreSelections) {
        await db
          .update(inventoryReservations)
          .set({ bookingId })
          .where(
            and(
              eq(inventoryReservations.tyreId, selection.tyreId),
              eq(inventoryReservations.released, false)
            )
          );
      }

      // Record status history
      await db.insert(bookingStatusHistory).values({
        id: uuidv4(),
        bookingId,
        fromStatus: null,
        toStatus: 'awaiting_payment',
        actorUserId: userId || null,
        actorRole: userId ? 'customer' : 'system',
        note: 'Booking created, awaiting payment',
      });

      // Create Stripe Payment Intent
      const { clientSecret, paymentIntentId } = await createPaymentIntent(
        breakdown.total,
        {
          bookingId,
          refNumber,
          customerEmail: data.customerEmail,
        }
      );

      // Update booking with Stripe Payment Intent ID
      await db
        .update(bookings)
        .set({ stripePiId: paymentIntentId })
        .where(eq(bookings.id, bookingId));

      // Mark quote as used
      await client.query(
        `UPDATE quotes SET used = true WHERE id = $1`,
        [data.quoteId]
      );

      await client.query('COMMIT');

      // Notify admin of new booking (fire-and-forget)
      createAdminNotification({
        type: 'booking.created',
        title: 'New Booking',
        body: `Booking ${refNumber} — ${data.customerName} — ${data.customerPhone}`,
        entityType: 'booking',
        entityId: bookingId,
        link: `/admin/bookings/${refNumber}`,
        severity: 'info',
        createdBy: 'system',
      }).catch(console.error);

      return NextResponse.json({
        bookingId,
        refNumber,
        stripeClientSecret: clientSecret!,
        total: breakdown.total,
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('Booking creation error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * Release inventory reservations and restore stock
 */
async function releaseQuoteReservations(
  client: any,
  tyreSelections: TyreSelection[]
) {
  for (const selection of tyreSelections) {
    // Restore stock
    await client.query(
      `UPDATE tyre_products 
       SET stock_new = stock_new + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [selection.quantity, selection.tyreId]
    );

    // Mark reservations as released
    await client.query(
      `UPDATE inventory_reservations 
       SET released = true 
       WHERE tyre_id = $1 AND released = false`,
      [selection.tyreId]
    );
  }
}
