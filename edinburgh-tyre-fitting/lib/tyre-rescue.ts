import { siteConfig } from './site';

export interface TyreRescueBookingPayload {
  externalReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressLine: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  distanceSource: string;
  bookingType: string;
  serviceType: string;
  quantity: number;
  tyreSizeDisplay?: string;
  vehicleReg?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  scheduledAt?: string;
  lockingNutStatus?: 'has_key' | 'no_key' | 'standard';
  notes?: string;
  paymentType: 'cash' | 'full' | 'deposit';
  status?: 'awaiting_payment' | 'paid';
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  priceSnapshot: Record<string, unknown>;
  gclid?: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface TyreRescueQuoteBookingPayload {
  quoteId: string;
  externalReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  tyrePhotoUrl?: string;
  vehicleReg?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  tyreSizeDisplay?: string;
  lockingNutStatus?: 'has_key' | 'no_key' | 'standard';
  notes?: string;
  fulfillmentOption?: 'delivery' | 'fitting' | null;
  paymentFlow?: 'payment_intent' | 'external_checkout';
}

export interface TyreRescueBookingResponse {
  success: boolean;
  mode?: string;
  refNumber?: string;
  total?: number;
  stripeClientSecret?: string | null;
  sourceDisplay?: string;
  booking?: {
    id: string;
    refNumber: string;
    status: string;
  };
  error?: string;
  details?: unknown;
}

interface TyreRescueDirectCreateResponse {
  bookingId?: string;
  refNumber?: string;
  stripeClientSecret?: string | null;
  total?: number;
  error?: string;
  code?: string;
  details?: unknown;
}

const TYRE_RESCUE_BOOKING_HANDOFF_PATH = '/api/integrations/edinburgh-tyre-fitting/bookings';

export function getTyreRescueIntegrationConfigStatus() {
  const secret = process.env.EDINBURGH_TYRE_FITTING_INTEGRATION_SECRET?.trim();
  return {
    configured: Boolean(secret),
    message: secret ? null : 'EDINBURGH_TYRE_FITTING_INTEGRATION_SECRET is not configured',
  };
}

export async function handoffBookingToTyreRescue(
  payload: TyreRescueBookingPayload | TyreRescueQuoteBookingPayload,
): Promise<TyreRescueBookingResponse> {
  const baseUrl = process.env.TYRE_RESCUE_API_BASE_URL || 'https://www.tyrerescue.uk';
  const secret = process.env.EDINBURGH_TYRE_FITTING_INTEGRATION_SECRET;

  if (!secret) {
    throw new Error('EDINBURGH_TYRE_FITTING_INTEGRATION_SECRET is not configured');
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${cleanBaseUrl}${TYRE_RESCUE_BOOKING_HANDOFF_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-integration-key': secret,
    },
    body: JSON.stringify({
      ...payload,
    }),
  });

  const data = (await response.json().catch(() => null)) as TyreRescueBookingResponse | null;

  if (response.status === 404 && 'quoteId' in payload) {
    return createTyreRescueBookingDirectly(cleanBaseUrl, payload);
  }

  if (!response.ok || !data?.success) {
    return {
      success: false,
      error: data?.error ?? 'Tyre Rescue rejected the booking handoff',
      details: data,
    };
  }

  return data;
}

async function createTyreRescueBookingDirectly(
  baseUrl: string,
  payload: TyreRescueQuoteBookingPayload,
): Promise<TyreRescueBookingResponse> {
  const sourceDisplay = `${siteConfig.name} reference ${payload.externalReference}`;
  const notes = [sourceDisplay, payload.notes].filter(Boolean).join('\n');
  const response = await fetch(`${baseUrl}/api/bookings/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sourceApp: siteConfig.integrationSource,
      externalReference: payload.externalReference,
      quoteId: payload.quoteId,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      customerPhone: payload.customerPhone,
      tyrePhotoUrl: payload.tyrePhotoUrl,
      vehicleReg: payload.vehicleReg,
      vehicleMake: payload.vehicleMake,
      vehicleModel: payload.vehicleModel,
      tyreSizeDisplay: payload.tyreSizeDisplay,
      lockingNutStatus: payload.lockingNutStatus,
      notes,
      fulfillmentOption: payload.fulfillmentOption,
      paymentFlow: payload.paymentFlow ?? 'external_checkout',
      utm_source: siteConfig.integrationSource,
      utm_medium: 'integration',
      utm_campaign: 'edinburgh_tyre_fitting_booking_handoff',
      landing_page: siteConfig.url,
      referrer: siteConfig.url,
    }),
  });

  const data = (await response.json().catch(() => null)) as TyreRescueDirectCreateResponse | null;

  if (!response.ok || !data?.bookingId || !data.refNumber) {
    return {
      success: false,
      error: data?.error ?? 'Tyre Rescue rejected the direct booking create request',
      details: data,
    };
  }

  return {
    success: true,
    mode: 'created_direct_fallback',
    refNumber: data.refNumber,
    stripeClientSecret: data.stripeClientSecret ?? null,
    total: data.total,
    sourceDisplay,
    booking: {
      id: data.bookingId,
      refNumber: data.refNumber,
      status: 'awaiting_payment',
    },
  };
}
