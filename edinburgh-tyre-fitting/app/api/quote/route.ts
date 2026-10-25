import { NextResponse } from 'next/server';
import { quoteRequestSchema } from '@/lib/booking-schema';
import { geocodeEdinburghAddress } from '@/lib/geo';
import { getServiceOption, serviceNeedsTyreSize } from '@/lib/pricing';
import { siteConfig } from '@/lib/site';
import {
  buildScheduledAt,
  getTyreRescueLiveQuote,
  isTyreRescueApiError,
} from '@/lib/tyre-rescue-live-quote';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = quoteRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Enter a service, quantity and Edinburgh-area address.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const geocode = await geocodeEdinburghAddress(body.location);
  const outsideServiceArea = geocode.distanceMiles > siteConfig.serviceRadiusMiles;
  const service = getServiceOption(body.service);
  const tyreSize = body.tyreSize?.trim() || '';

  if (serviceNeedsTyreSize(body.service) && (!tyreSize || /^not\s*sure$/i.test(tyreSize))) {
    return NextResponse.json(
      {
        error: 'Add the tyre size to get a live Tyre Rescue price.',
        needsTyreSize: true,
        location: {
          label: geocode.label,
          distanceMiles: Number(geocode.distanceMiles.toFixed(1)),
          source: geocode.source,
          confidence: geocode.confidence,
          inServiceArea: !outsideServiceArea,
          serviceRadiusMiles: siteConfig.serviceRadiusMiles,
          coordinates: geocode.coordinates,
        },
      },
      { status: 422 },
    );
  }

  if (outsideServiceArea) {
    return NextResponse.json(
      {
        error: `This location is ${Math.round(geocode.distanceMiles)} miles from Edinburgh, outside the ${siteConfig.serviceRadiusMiles}-mile booking area.`,
        location: {
          label: geocode.label,
          distanceMiles: Number(geocode.distanceMiles.toFixed(1)),
          source: geocode.source,
          confidence: geocode.confidence,
          inServiceArea: false,
          serviceRadiusMiles: siteConfig.serviceRadiusMiles,
          coordinates: geocode.coordinates,
        },
      },
      { status: 409 },
    );
  }

  try {
    const scheduledAt = buildScheduledAt(body.preferredDate, body.preferredTime);
    const liveQuote = await getTyreRescueLiveQuote({
      service: body.service,
      quantity: body.quantity,
      addressLine: geocode.label,
      lat: geocode.coordinates.lat,
      lng: geocode.coordinates.lng,
      tyreSize: body.tyreSize,
      urgency: body.urgency,
      scheduledAt,
    });

    return NextResponse.json({
      quoteId: liveQuote.quoteId,
      expiresAt: liveQuote.expiresAt,
      service: {
        value: service.value,
        label: service.label,
      },
      location: {
        label: geocode.label,
        distanceMiles: Number(liveQuote.distanceMiles.toFixed(1)),
        distanceBand: liveQuote.distanceBand,
        source: geocode.source,
        confidence: geocode.confidence,
        inServiceArea: true,
        serviceRadiusMiles: siteConfig.serviceRadiusMiles,
        coordinates: geocode.coordinates,
      },
      price: {
        basePrice: liveQuote.serviceTotal,
        perTyrePrice: liveQuote.tyreTotal,
        distanceSurcharge: liveQuote.travelTotal,
        subtotal: liveQuote.subtotal,
        vatAmount: liveQuote.vatAmount,
        totalAmount: liveQuote.totalAmount,
      },
      availability: liveQuote.eligibility,
      tyre: liveQuote.matchedTyre,
      stock: {
        specialOrderRequired: liveQuote.specialOrderRequired,
        leadTime: liveQuote.leadTime,
        details: liveQuote.tyreDetails,
      },
      warning:
        liveQuote.warning ??
        (geocode.confidence === 'manual_review'
          ? 'Location will be checked before the visit is confirmed.'
          : null),
    });
  } catch (error) {
    if (isTyreRescueApiError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.status },
      );
    }

    console.error('[edinburgh-tyre-fitting] live quote failed:', error);
    return NextResponse.json(
      { error: 'Live Tyre Rescue pricing is unavailable. Please call or try again.' },
      { status: 502 },
    );
  }
}
