import { NextResponse } from 'next/server';
import { bookingRequestSchema } from '@/lib/booking-schema';
import { geocodeEdinburghAddress } from '@/lib/geo';
import { getServiceOption, serviceNeedsTyreSize } from '@/lib/pricing';
import { getBookingReturnOrigin, siteConfig } from '@/lib/site';
import { sendBookingEmail } from '@/lib/email';
import { getTyreRescueIntegrationConfigStatus, handoffBookingToTyreRescue } from '@/lib/tyre-rescue';
import { createBookingCheckoutSession, getStripeConfigStatus } from '@/lib/stripe';
import {
  buildScheduledAt,
  getTyreRescueLiveQuote,
  isTyreRescueApiError,
  type LiveQuoteResult,
} from '@/lib/tyre-rescue-live-quote';

export const dynamic = 'force-dynamic';

function createExternalReference(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/\D/g, '')
    .slice(0, 14);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ETF-${stamp}-${random}`;
}

async function handleBookingRequest(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = bookingRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the booking details and try again.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const geocode = await geocodeEdinburghAddress(body.location);

  if (geocode.distanceMiles > siteConfig.serviceRadiusMiles) {
    return NextResponse.json(
      {
        error: `This location is ${Math.round(geocode.distanceMiles)} miles from Edinburgh. The booking area is ${siteConfig.serviceRadiusMiles} miles.`,
      },
      { status: 400 },
    );
  }

  const service = getServiceOption(body.service);
  const tyreSize = body.tyreSize?.trim() || '';

  if (serviceNeedsTyreSize(body.service) && (!tyreSize || /^not\s*sure$/i.test(tyreSize))) {
    return NextResponse.json(
      { error: 'Add the tyre size before secure checkout so live Tyre Rescue pricing and stock can be confirmed.' },
      { status: 422 },
    );
  }

  const integrationConfig = getTyreRescueIntegrationConfigStatus();
  const stripeConfig = getStripeConfigStatus();
  const missingConfig = [
    integrationConfig.configured ? null : 'tyre_rescue_integration',
    stripeConfig.configured ? null : 'stripe_checkout',
  ].filter(Boolean);

  if (missingConfig.length > 0) {
    return NextResponse.json(
      {
        error: 'Secure booking checkout is not fully configured. Please call or try again shortly.',
        code: 'BOOKING_CHECKOUT_NOT_CONFIGURED',
        missingConfig,
      },
      { status: 503 },
    );
  }

  const externalReference = createExternalReference();
  const scheduledAt = buildScheduledAt(body.preferredDate, body.preferredTime);
  const notes = [
    body.notes,
    `Urgency: ${body.urgency}`,
    `Access: ${body.accessType}`,
    `Locking wheel nut: ${body.lockingNutStatus}`,
    body.utmCampaign ? `Campaign: ${body.utmCampaign}` : null,
    body.parkingNotes ? `Parking/access notes: ${body.parkingNotes}` : null,
    body.preferredDate ? `Preferred date: ${body.preferredDate}` : null,
    body.preferredTime ? `Preferred time: ${body.preferredTime}` : null,
    geocode.confidence === 'manual_review' ? 'Location requires manual verification.' : null,
  ]
    .filter(Boolean)
    .join('\n');

  let liveQuote: LiveQuoteResult | null = null;
  let liveQuoteTotalAmount: number | null = null;
  let quoteId = body.quoteId;

  async function createFreshQuote() {
    liveQuote = await getTyreRescueLiveQuote({
      service: body.service,
      quantity: body.quantity,
      addressLine: geocode.label,
      lat: geocode.coordinates.lat,
      lng: geocode.coordinates.lng,
      tyreSize: body.tyreSize,
      urgency: body.urgency,
      scheduledAt,
    });
    quoteId = liveQuote.quoteId;
    liveQuoteTotalAmount = liveQuote.totalAmount;
  }

  try {
    if (!quoteId) {
      await createFreshQuote();
    }
  } catch (error) {
    if (isTyreRescueApiError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }

    console.error('[edinburgh-tyre-fitting] booking quote failed:', error);
    return NextResponse.json(
      { error: 'Could not get live Tyre Rescue pricing. Please call or try again.' },
      { status: 502 },
    );
  }

  const quotePayload = {
    quoteId: quoteId as string,
    externalReference,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    customerPhone: body.customerPhone,
    vehicleReg: body.vehicleReg || undefined,
    vehicleMake: body.vehicleMake || undefined,
    vehicleModel: body.vehicleModel || undefined,
    tyreSizeDisplay: body.tyreSize || undefined,
    lockingNutStatus: body.lockingNutStatus === 'unknown' ? undefined : body.lockingNutStatus,
    notes,
    fulfillmentOption: 'fitting' as const,
    paymentFlow: 'external_checkout' as const,
  };

  let handoff;
  try {
    handoff = await handoffBookingToTyreRescue(quotePayload);
  } catch (error) {
    console.error('[edinburgh-tyre-fitting] booking handoff failed:', error);
    return NextResponse.json(
      { error: 'Could not send the booking to Tyre Rescue. Please call or try again.', code: 'HANDOFF_FAILED' },
      { status: 502 },
    );
  }

  if ((!handoff.success || !handoff.refNumber) && body.quoteId) {
    try {
      await createFreshQuote();
      try {
        handoff = await handoffBookingToTyreRescue({
          ...quotePayload,
          quoteId: quoteId as string,
        });
      } catch (handoffError) {
        console.error('[edinburgh-tyre-fitting] booking handoff retry failed:', handoffError);
        return NextResponse.json(
          { error: 'Could not send the booking to Tyre Rescue. Please call or try again.', code: 'HANDOFF_FAILED' },
          { status: 502 },
        );
      }
    } catch (error) {
      if (isTyreRescueApiError(error)) {
        return NextResponse.json(
          { error: error.message, code: error.code, details: error.details },
          { status: error.status },
        );
      }
    }
  }

  if (!handoff.success || !handoff.refNumber) {
    return NextResponse.json(
      { error: 'Could not create the booking. Please call or try again.' },
      { status: 502 },
    );
  }

  const totalAmount = Number(handoff.total ?? liveQuoteTotalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return NextResponse.json(
      { error: 'Could not confirm the live Tyre Rescue price. Please call or try again.' },
      { status: 502 },
    );
  }

  if (!handoff.booking?.id) {
    return NextResponse.json(
      { error: 'Could not prepare secure payment. Please call or try again.' },
      { status: 502 },
    );
  }

  const requestUrl = new URL(request.url);
  const origin = getBookingReturnOrigin(requestUrl.origin);
  const finalParams = new URLSearchParams({
    ref: handoff.refNumber,
    requestRef: externalReference,
    total: String(totalAmount),
    payment: 'success',
  });
  const cancelParams = new URLSearchParams({
    ref: handoff.refNumber,
    requestRef: externalReference,
    total: String(totalAmount),
    payment: 'cancelled',
  });
  let checkout;
  try {
    checkout = await createBookingCheckoutSession({
      amount: totalAmount,
      bookingId: handoff.booking.id,
      refNumber: handoff.refNumber,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      requestReference: externalReference,
      successUrl: `${origin.replace(/\/$/, '')}/final?${finalParams.toString()}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin.replace(/\/$/, '')}/final?${cancelParams.toString()}`,
    });
  } catch (error) {
    console.error('[edinburgh-tyre-fitting] stripe checkout failed:', error);
    return NextResponse.json(
      { error: 'Could not prepare secure payment. Please call or try again.', code: 'STRIPE_CHECKOUT_FAILED' },
      { status: 502 },
    );
  }

  if (!checkout.checkoutUrl) {
    return NextResponse.json(
      { error: 'Could not prepare secure payment. Please call or try again.' },
      { status: 502 },
    );
  }

  void sendBookingEmail({
    refNumber: handoff.refNumber,
    externalReference,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    customerPhone: body.customerPhone,
    serviceLabel: service.label,
    addressLine: geocode.label,
    totalAmount,
  }).catch((error) => {
    console.error('[edinburgh-tyre-fitting] resend email failed:', error);
  });

  return NextResponse.json(
    {
      success: true,
      refNumber: handoff.refNumber,
      externalReference,
      totalAmount,
      checkoutUrl: checkout.checkoutUrl,
    },
    { status: 201 },
  );
}

export async function POST(request: Request) {
  try {
    return await handleBookingRequest(request);
  } catch (error) {
    console.error('[edinburgh-tyre-fitting] booking request failed:', error);
    return NextResponse.json(
      {
        error: 'Could not process the booking request. Please call or try again.',
        code: 'BOOKING_REQUEST_FAILED',
      },
      { status: 502 },
    );
  }
}
