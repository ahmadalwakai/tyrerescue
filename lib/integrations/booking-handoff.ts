import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, bookings, bookingStatusHistory } from '@/lib/db';
import { generateRefNumber } from '@/lib/utils';
import type { ProjectSource } from './project-sources';
import { formatProjectReference } from './project-sources';
import { sendUrgentBookingTopicPush } from '@/lib/notifications/urgent-booking-push';

type BookingInsert = typeof bookings.$inferInsert;

const createFromQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  sourceApp: z.string().trim().max(60).optional(),
  externalReference: z.string().trim().min(1).max(120).optional(),
  externalRef: z.string().trim().min(1).max(120).optional(),
  customerName: z.string().trim().min(1).max(255),
  customerEmail: z.string().trim().email().max(255),
  customerPhone: z.string().trim().min(5).max(20),
  tyrePhotoUrl: z.string().url().optional(),
  vehicleReg: z.string().trim().max(10).optional(),
  vehicleMake: z.string().trim().max(100).optional(),
  vehicleModel: z.string().trim().max(100).optional(),
  tyreSizeDisplay: z.string().trim().max(20).optional(),
  lockingNutStatus: z.enum(['has_key', 'no_key', 'standard']).optional(),
  notes: z.string().trim().max(1000).optional(),
  fulfillmentOption: z.enum(['delivery', 'fitting']).optional().nullable(),
  paymentFlow: z.enum(['payment_intent', 'external_checkout']).optional(),
});

const linkExistingSchema = z.object({
  sourceApp: z.string().trim().max(60).optional(),
  tyreRescueRefNumber: z.string().trim().min(1).max(20),
  externalReference: z.string().trim().min(1).max(120).optional(),
  externalRef: z.string().trim().min(1).max(120).optional(),
});

const moneyLike = z.union([z.number(), z.string().trim().min(1)]);
const coordLike = z.union([z.number(), z.string().trim().min(1)]);

const directBookingSchema = z.object({
  sourceApp: z.string().trim().max(60).optional(),
  externalReference: z.string().trim().min(1).max(120).optional(),
  externalRef: z.string().trim().min(1).max(120).optional(),
  customerName: z.string().trim().min(1).max(255),
  customerEmail: z.string().trim().email().max(255),
  customerPhone: z.string().trim().min(5).max(20),
  addressLine: z.string().trim().min(3).max(500),
  lat: coordLike,
  lng: coordLike,
  distanceMiles: moneyLike.optional(),
  distanceSource: z.string().trim().max(20).optional(),
  bookingType: z.string().trim().min(1).max(80).default('mobile_fitting'),
  serviceType: z.string().trim().min(1).max(120),
  quantity: z.coerce.number().int().min(1).max(8).default(1),
  tyreSizeDisplay: z.string().trim().max(20).optional(),
  vehicleReg: z.string().trim().max(16).optional(),
  vehicleMake: z.string().trim().max(100).optional(),
  vehicleModel: z.string().trim().max(100).optional(),
  tyrePhotoUrl: z.string().url().optional(),
  scheduledAt: z.string().trim().max(80).optional(),
  lockingNutStatus: z.enum(['has_key', 'no_key', 'standard']).optional(),
  notes: z.string().trim().max(2000).optional(),
  paymentType: z.enum(['cash', 'full', 'deposit']).default('cash'),
  status: z.enum(['awaiting_payment', 'paid']).optional(),
  totalAmount: moneyLike,
  subtotal: moneyLike.optional(),
  vatAmount: moneyLike.optional(),
  depositAmountPence: z.coerce.number().int().min(0).optional(),
  remainingBalancePence: z.coerce.number().int().min(0).optional(),
  priceSnapshot: z.record(z.string(), z.unknown()).optional(),
  gclid: z.string().trim().max(255).optional(),
  utmTerm: z.string().trim().max(255).optional(),
  utmContent: z.string().trim().max(255).optional(),
});

function validationError(error: z.ZodError) {
  return NextResponse.json(
    { error: 'Invalid request body', details: error.flatten() },
    { status: 400 },
  );
}

function readExternalReference(data: { externalReference?: string; externalRef?: string }): string | null {
  return (data.externalReference ?? data.externalRef ?? '').trim() || null;
}

function toMoneyString(value: number | string | undefined | null): string | null {
  if (value == null || value === '') return null;
  const numberValue = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(numberValue)) return null;
  return numberValue.toFixed(2);
}

function toCoordString(value: number | string | undefined | null): string | null {
  if (value == null || value === '') return null;
  const numberValue = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(numberValue)) return null;
  return numberValue.toFixed(6);
}

function toScheduledAt(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function generateUniqueBookingRef(): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const refNumber = generateRefNumber();
    const [clash] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.refNumber, refNumber))
      .limit(1);

    if (!clash) return refNumber;
  }

  return null;
}

function cleanOptional(value: string | undefined): string | null {
  return value?.trim() || null;
}

function sourceOriginNote(source: ProjectSource): string {
  return `[via ${source.origin.replace(/^https?:\/\//, '')}]`;
}

function sendProjectBookingAlert(input: {
  bookingId: string;
  source: ProjectSource;
  externalReference: string | null;
  customerName: string;
  customerPhone: string;
}) {
  const sourceDisplay = formatProjectReference(input.source.label, input.externalReference);

  void sendUrgentBookingTopicPush({
    bookingId: input.bookingId,
    customerPhone: input.customerPhone,
    createdAt: new Date().toISOString(),
    title: 'New project booking received',
    body: sourceDisplay
      ? `${sourceDisplay} — ${input.customerName}`
      : `${input.source.label} booking — ${input.customerName}`,
  }).catch((error) => {
    console.error('[project-booking-handoff] urgent admin push failed:', error);
  });
}

async function findBookingByExternalReference(source: ProjectSource, externalReference: string) {
  const [existing] = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      status: bookings.status,
      sourceApp: bookings.sourceApp,
      sourceLabel: bookings.sourceLabel,
      externalReference: bookings.externalReference,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.sourceApp, source.app),
        eq(bookings.externalReference, externalReference),
      ),
    )
    .limit(1);

  return existing ?? null;
}

export async function markBookingSource(
  bookingId: string,
  source: ProjectSource,
  externalReference: string,
) {
  const existing = await findBookingByExternalReference(source, externalReference);
  if (existing && existing.id !== bookingId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: 'External reference is already linked to another Tyre Rescue booking',
          booking: existing,
          sourceDisplay: formatProjectReference(existing.sourceLabel, existing.externalReference),
        },
        { status: 409 },
      ),
    };
  }

  const [booking] = await db
    .update(bookings)
    .set({
      sourceApp: source.app,
      sourceLabel: source.label,
      externalReference,
      utmSource: source.app,
      utmMedium: 'integration',
      utmCampaign: source.campaign,
      landingPage: source.origin,
      referrer: source.origin,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
    .returning({
      id: bookings.id,
      refNumber: bookings.refNumber,
      status: bookings.status,
      sourceApp: bookings.sourceApp,
      sourceLabel: bookings.sourceLabel,
      externalReference: bookings.externalReference,
    });

  if (!booking) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Could not link booking source' }, { status: 500 }),
    };
  }

  await db.insert(bookingStatusHistory).values({
    bookingId: booking.id,
    fromStatus: booking.status,
    toStatus: booking.status,
    actorRole: 'system',
    note: `${source.label} reference linked: ${externalReference}`,
  });

  return { ok: true as const, booking };
}

async function linkExistingBooking(source: ProjectSource, body: unknown) {
  const parsed = linkExistingSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const externalReference = readExternalReference(parsed.data);
  if (!externalReference) {
    return NextResponse.json({ error: 'externalReference is required' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.refNumber, parsed.data.tyreRescueRefNumber.toUpperCase()))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Tyre Rescue booking not found' }, { status: 404 });
  }

  const result = await markBookingSource(existing.id, source, externalReference);
  if (!result.ok) return result.response;

  return NextResponse.json({
    success: true,
    mode: 'linked',
    booking: result.booking,
    sourceDisplay: formatProjectReference(result.booking.sourceLabel, result.booking.externalReference),
  });
}

async function createBookingFromQuote(request: Request, source: ProjectSource, body: unknown) {
  const parsed = createFromQuoteSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const externalReference = readExternalReference(parsed.data);
  if (!externalReference) {
    return NextResponse.json({ error: 'externalReference is required' }, { status: 400 });
  }

  const existing = await findBookingByExternalReference(source, externalReference);
  if (existing) {
    return NextResponse.json(
      {
        error: 'External reference is already linked to a Tyre Rescue booking',
        booking: existing,
        sourceDisplay: formatProjectReference(existing.sourceLabel, existing.externalReference),
      },
      { status: 409 },
    );
  }

  const origin = new URL(request.url).origin;
  const createResponse = await fetch(`${origin}/api/bookings/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteId: parsed.data.quoteId,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      tyrePhotoUrl: parsed.data.tyrePhotoUrl,
      vehicleReg: parsed.data.vehicleReg,
      vehicleMake: parsed.data.vehicleMake,
      vehicleModel: parsed.data.vehicleModel,
      tyreSizeDisplay: parsed.data.tyreSizeDisplay,
      lockingNutStatus: parsed.data.lockingNutStatus,
      notes: parsed.data.notes,
      fulfillmentOption: parsed.data.fulfillmentOption,
      utm_source: source.app,
      utm_medium: 'integration',
      utm_campaign: source.campaign,
      landing_page: source.origin,
      referrer: source.origin,
      paymentFlow: parsed.data.paymentFlow,
    }),
  });

  const payload = await createResponse.json().catch(() => null) as
    | { bookingId?: string; refNumber?: string; stripeClientSecret?: string | null; total?: number; error?: string }
    | null;

  if (!createResponse.ok || !payload?.bookingId) {
    return NextResponse.json(
      {
        error: payload?.error ?? 'Failed to create Tyre Rescue booking',
        details: payload,
      },
      { status: createResponse.status || 502 },
    );
  }

  const result = await markBookingSource(payload.bookingId, source, externalReference);
  if (!result.ok) return result.response;

  sendProjectBookingAlert({
    bookingId: payload.bookingId,
    source,
    externalReference,
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
  });

  return NextResponse.json({
    success: true,
    mode: 'created',
    booking: result.booking,
    refNumber: payload.refNumber,
    stripeClientSecret: payload.stripeClientSecret,
    total: payload.total,
    sourceDisplay: formatProjectReference(result.booking.sourceLabel, result.booking.externalReference),
  }, { status: 201 });
}

async function createDirectProjectBooking(source: ProjectSource, body: unknown) {
  const parsed = directBookingSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const externalReference = readExternalReference(parsed.data);
  if (!externalReference) {
    return NextResponse.json({ error: 'externalReference is required' }, { status: 400 });
  }

  const existing = await findBookingByExternalReference(source, externalReference);
  if (existing) {
    return NextResponse.json(
      {
        error: 'External reference is already linked to a Tyre Rescue booking',
        booking: existing,
        sourceDisplay: formatProjectReference(existing.sourceLabel, existing.externalReference),
      },
      { status: 409 },
    );
  }

  const lat = toCoordString(parsed.data.lat);
  const lng = toCoordString(parsed.data.lng);
  const totalAmount = toMoneyString(parsed.data.totalAmount);
  const distanceMiles = toMoneyString(parsed.data.distanceMiles);

  const missing: string[] = [];
  if (!lat) missing.push('lat');
  if (!lng) missing.push('lng');
  if (!totalAmount) missing.push('totalAmount');

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing or invalid fields: ${missing.join(', ')}` },
      { status: 400 },
    );
  }

  const safeLat = lat as string;
  const safeLng = lng as string;
  const safeTotalAmount = totalAmount as string;
  const refNumber = await generateUniqueBookingRef();
  if (!refNumber) {
    return NextResponse.json({ error: 'Could not generate booking reference' }, { status: 500 });
  }

  const subtotal = toMoneyString(parsed.data.subtotal) ?? safeTotalAmount;
  const vatAmount = toMoneyString(parsed.data.vatAmount) ?? '0.00';
  const scheduledAt = toScheduledAt(parsed.data.scheduledAt);
  const sourceDisplay = formatProjectReference(source.label, externalReference);
  const notes = [
    sourceOriginNote(source),
    sourceDisplay,
    parsed.data.notes,
  ]
    .filter(Boolean)
    .join('\n');

  const bookingInsert: BookingInsert = {
    refNumber,
    sourceApp: source.app,
    sourceLabel: source.label,
    externalReference,
    status: parsed.data.status ?? (parsed.data.paymentType === 'cash' ? 'paid' : 'awaiting_payment'),
    bookingType: parsed.data.bookingType,
    serviceType: parsed.data.serviceType,
    addressLine: parsed.data.addressLine,
    lat: safeLat,
    lng: safeLng,
    distanceMiles,
    distanceSource: cleanOptional(parsed.data.distanceSource),
    quantity: parsed.data.quantity,
    tyreSizeDisplay: cleanOptional(parsed.data.tyreSizeDisplay),
    vehicleReg: cleanOptional(parsed.data.vehicleReg),
    vehicleMake: cleanOptional(parsed.data.vehicleMake),
    vehicleModel: cleanOptional(parsed.data.vehicleModel),
    tyrePhotoUrl: cleanOptional(parsed.data.tyrePhotoUrl),
    customerName: parsed.data.customerName,
    customerEmail: parsed.data.customerEmail,
    customerPhone: parsed.data.customerPhone,
    scheduledAt,
    priceSnapshot: {
      source: source.app,
      sourceLabel: source.label,
      externalReference,
      ...(parsed.data.priceSnapshot ?? {}),
    },
    subtotal,
    vatAmount,
    totalAmount: safeTotalAmount,
    paymentType: parsed.data.paymentType,
    depositAmountPence: parsed.data.depositAmountPence ?? null,
    remainingBalancePence: parsed.data.remainingBalancePence ?? null,
    lockingNutStatus: parsed.data.lockingNutStatus ?? null,
    notes,
    utmSource: source.app,
    utmMedium: 'integration',
    utmCampaign: source.campaign,
    utmTerm: cleanOptional(parsed.data.utmTerm),
    utmContent: cleanOptional(parsed.data.utmContent),
    gclid: cleanOptional(parsed.data.gclid),
    landingPage: source.origin,
    referrer: source.origin,
  };

  const [created] = await db
    .insert(bookings)
    .values(bookingInsert)
    .returning({
      id: bookings.id,
      refNumber: bookings.refNumber,
      status: bookings.status,
      sourceApp: bookings.sourceApp,
      sourceLabel: bookings.sourceLabel,
      externalReference: bookings.externalReference,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      totalAmount: bookings.totalAmount,
    });

  await db.insert(bookingStatusHistory).values({
    bookingId: created.id,
    fromStatus: null,
    toStatus: created.status,
    actorRole: 'system',
    note: `${source.label} direct booking created: ${externalReference}`,
  });

  sendProjectBookingAlert({
    bookingId: created.id,
    source,
    externalReference,
    customerName: created.customerName,
    customerPhone: created.customerPhone,
  });

  return NextResponse.json({
    success: true,
    mode: 'created_direct',
    booking: created,
    refNumber: created.refNumber,
    sourceDisplay: formatProjectReference(created.sourceLabel, created.externalReference),
  }, { status: 201 });
}

export async function handleProjectBookingHandoff(request: Request, source: ProjectSource, body: unknown) {
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if ('quoteId' in body) {
    return createBookingFromQuote(request, source, body);
  }

  if ('tyreRescueRefNumber' in body) {
    return linkExistingBooking(source, body);
  }

  return createDirectProjectBooking(source, body);
}
