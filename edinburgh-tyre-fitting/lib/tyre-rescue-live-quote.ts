import type { BookingRequest } from './booking-schema';
import { siteConfig } from './site';

type BookingService = BookingRequest['service'];
type BookingUrgency = BookingRequest['urgency'];

type TyreRescueBookingType = 'emergency' | 'scheduled';
type TyreRescueServiceType = 'repair' | 'fit' | 'both' | 'assess';
interface TyreRescueLineItem {
  label: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  type: 'tyre' | 'service' | 'callout' | 'surcharge' | 'discount' | 'subtotal' | 'vat' | 'total';
  code?: string;
}

export interface TyreRescuePricingBreakdown {
  lineItems: TyreRescueLineItem[];
  totalTyreCost?: number;
  totalServiceFee?: number;
  calloutFee?: number;
  totalSurcharges?: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  quoteExpiresAt?: string;
  isValid?: boolean;
  tyreSubtotal?: number;
  serviceSubtotal?: number;
  distanceServicePrice?: number;
  fittingPrice?: number;
  tyrePrice?: number;
  totalPrice?: number;
}

interface TyreProduct {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  priceNew: number | null;
  stockNew: number | null;
  availableStock?: number | null;
  isLocalStock?: boolean | null;
  availableNew?: boolean | null;
}

interface TyreRescueQuoteResponse {
  quoteId: string;
  expiresAt: string;
  breakdown: TyreRescuePricingBreakdown;
  distanceMiles: number;
  driverEtaMinutes?: number;
  tyreDetails?: Array<{
    tyreId: string;
    brand: string;
    pattern: string;
    sizeDisplay: string;
    quantity: number;
    unitPrice: number;
    available: boolean;
  }>;
  specialOrderRequired?: boolean;
  leadTime?: string | null;
  weatherContext?: unknown;
  demandContext?: unknown;
  distanceMetadata?: Record<string, unknown>;
}

interface EligibilityResponse {
  eligible: boolean;
  etaMinMinutes?: number;
  etaMaxMinutes?: number;
  etaLabel?: string;
  distanceMiles?: number;
  source?: string;
  driverId?: string | null;
  driverName?: string | null;
  routeDurationMinutes?: number | null;
  driversOnline?: number;
  message?: string;
}

export interface LiveQuoteInput {
  service: BookingService;
  quantity: number;
  addressLine: string;
  lat: number;
  lng: number;
  tyreSize?: string;
  urgency?: BookingUrgency;
  scheduledAt?: string;
}

export interface LiveQuoteResult {
  quoteId: string;
  expiresAt: string;
  bookingType: TyreRescueBookingType;
  serviceType: TyreRescueServiceType;
  breakdown: TyreRescuePricingBreakdown;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  serviceTotal: number;
  tyreTotal: number;
  travelTotal: number;
  distanceMiles: number;
  distanceBand: string;
  driverEtaMinutes?: number;
  eligibility?: EligibilityResponse | null;
  matchedTyre?: {
    tyreId: string;
    brand: string;
    pattern: string;
    sizeDisplay: string;
    unitPrice: number;
    quantity: number;
    availableStock: number;
    isPreOrder: boolean;
  } | null;
  warning: string | null;
  tyreDetails: TyreRescueQuoteResponse['tyreDetails'];
  specialOrderRequired: boolean;
  leadTime: string | null;
}

class TyreRescueApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status = 502, code?: string, details?: unknown) {
    super(message);
    this.name = 'TyreRescueApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isTyreRescueApiError(error: unknown): error is TyreRescueApiError {
  return error instanceof TyreRescueApiError;
}

function projectIntegrationHeaders(): Record<string, string> {
  const secret = process.env.EDINBURGH_TYRE_FITTING_INTEGRATION_SECRET?.trim();
  if (!secret) {
    throw new TyreRescueApiError(
      'Edinburgh live pricing integration secret is not configured.',
      500,
      'INTEGRATION_SECRET_MISSING',
    );
  }

  return {
    'x-integration-key': secret,
    'x-source-app': siteConfig.integrationSource,
  };
}

export function buildScheduledAt(date?: string, time?: string): string | undefined {
  if (!date) return undefined;

  const hour =
    time === 'morning'
      ? '09:00'
      : time === 'afternoon'
        ? '13:00'
        : time === 'evening'
          ? '17:30'
          : '10:00';

  const scheduledAt = new Date(`${date}T${hour}:00.000+01:00`);
  if (Number.isNaN(scheduledAt.getTime())) return undefined;
  return scheduledAt.toISOString();
}

function tyreRescueBaseUrl(): string {
  return (process.env.TYRE_RESCUE_API_BASE_URL || 'https://www.tyrerescue.uk').replace(/\/$/, '');
}

async function readApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${tyreRescueBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as
    | { error?: string; message?: string; code?: string; details?: unknown }
    | T
    | null;

  if (!response.ok) {
    const errorPayload = payload as { error?: string; message?: string; code?: string; details?: unknown } | null;
    throw new TyreRescueApiError(
      errorPayload?.message || errorPayload?.error || 'Tyre Rescue live pricing is unavailable.',
      response.status,
      errorPayload?.code,
      errorPayload?.details,
    );
  }

  return payload as T;
}

function parseTyreSize(raw?: string): { width: string; aspect: string; rim: string } | null {
  const value = raw?.trim();
  if (!value || /^not\s*sure$/i.test(value)) return null;

  const normalized = value.toUpperCase().replace(/ZR/g, 'R').replace(/\s+/g, '');
  const slashMatch = normalized.match(/^(\d{3})\/?(\d{2,3})\/?R?(\d{2})$/);
  if (slashMatch) {
    return { width: slashMatch[1], aspect: slashMatch[2], rim: slashMatch[3] };
  }

  const looseMatch = normalized.match(/(\d{3})\D+(\d{2,3})\D+R?(\d{2})/);
  if (!looseMatch) return null;
  return { width: looseMatch[1], aspect: looseMatch[2], rim: looseMatch[3] };
}

function resolveBookingType(input: LiveQuoteInput): TyreRescueBookingType {
  if (input.scheduledAt && input.urgency === 'scheduled') return 'scheduled';
  return 'emergency';
}

function resolveServiceType(service: BookingService): TyreRescueServiceType {
  if (service === 'puncture_repair') return 'repair';
  if (service === 'locking_wheel_nut') return 'assess';
  return 'fit';
}

function distanceBand(distanceMiles: number): string {
  if (distanceMiles <= 12) return 'Edinburgh local';
  if (distanceMiles <= 30) return 'Outer Edinburgh';
  return 'Countryside 50-mile cover';
}

function money(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) / 100 : 0;
}

function sumLineItems(
  breakdown: TyreRescuePricingBreakdown,
  predicate: (item: TyreRescueLineItem) => boolean,
): number {
  return money(breakdown.lineItems?.filter(predicate).reduce((sum, item) => sum + money(item.amount), 0) ?? 0);
}

async function fetchEligibility(input: LiveQuoteInput): Promise<EligibilityResponse | null> {
  try {
    return await readApiJson<EligibilityResponse>('/api/availability/eligibility', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...projectIntegrationHeaders(),
      },
      body: JSON.stringify({
        lat: input.lat,
        lng: input.lng,
        pricingOrigin: { sourceApp: siteConfig.integrationSource },
      }),
    });
  } catch {
    return null;
  }
}

async function findTyreProduct(
  tyreSize: { width: string; aspect: string; rim: string },
  quantity: number,
): Promise<LiveQuoteResult['matchedTyre']> {
  const params = new URLSearchParams({
    width: tyreSize.width,
    aspect: tyreSize.aspect,
    rim: tyreSize.rim,
    limit: '30',
  });
  const payload = await readApiJson<{ tyres?: TyreProduct[] }>(`/api/tyres?${params.toString()}`);
  const tyres = payload.tyres ?? [];
  const priced = tyres
    .filter((tyre) => tyre.availableNew !== false && money(tyre.priceNew) > 0)
    .map((tyre) => ({
      ...tyre,
      price: money(tyre.priceNew),
      available: Number(tyre.availableStock ?? tyre.stockNew ?? 0),
    }));

  const inStock = priced.filter((tyre) => tyre.available >= quantity);
  const candidates = inStock.length > 0 ? inStock : priced;
  candidates.sort((a, b) => a.price - b.price);

  const tyre = candidates[0];
  if (!tyre) return null;

  return {
    tyreId: tyre.id,
    brand: tyre.brand,
    pattern: tyre.pattern,
    sizeDisplay: tyre.sizeDisplay,
    unitPrice: tyre.price,
    quantity,
    availableStock: tyre.available,
    isPreOrder: tyre.available < quantity || tyre.isLocalStock === false,
  };
}

export async function getTyreRescueLiveQuote(input: LiveQuoteInput): Promise<LiveQuoteResult> {
  const quantity = Math.max(1, Math.min(4, Number.isFinite(input.quantity) ? Math.trunc(input.quantity) : 1));
  const bookingType = resolveBookingType(input);
  const serviceType = resolveServiceType(input.service);
  const parsedTyreSize = parseTyreSize(input.tyreSize);
  const needsTyreStock = serviceType === 'fit';
  const matchedTyre = needsTyreStock && parsedTyreSize
    ? await findTyreProduct(parsedTyreSize, quantity)
    : null;

  if (needsTyreStock && parsedTyreSize && !matchedTyre) {
    throw new TyreRescueApiError(
      'No matching live Tyre Rescue tyre stock was found for that size. Please check the size or call us so we can confirm it.',
      409,
      'TYRE_STOCK_NOT_FOUND',
    );
  }

  const tyreSelections = matchedTyre
    ? [
        {
          tyreId: matchedTyre.tyreId,
          quantity,
          service: 'fit' as const,
          requiresTpms: false,
          isPreOrder: matchedTyre.isPreOrder,
        },
      ]
    : [];

  const quotePayload = {
    lat: input.lat,
    lng: input.lng,
    addressLine: input.addressLine,
    bookingType,
    serviceType,
    tyreSelections,
    quantity: tyreSelections.length === 0 ? quantity : undefined,
    fittingLocation: 'mobile' as const,
    scheduledAt: bookingType === 'scheduled' ? input.scheduledAt : undefined,
    pricingOrigin: { sourceApp: siteConfig.integrationSource },
  };

  const [quote, eligibility] = await Promise.all([
    readApiJson<TyreRescueQuoteResponse>('/api/bookings/quote', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-visit-count': '1',
        ...projectIntegrationHeaders(),
      },
      body: JSON.stringify(quotePayload),
    }),
    fetchEligibility(input),
  ]);

  const breakdown = quote.breakdown;
  const tyreTotal = money(breakdown.totalTyreCost ?? breakdown.tyreSubtotal ?? breakdown.tyrePrice)
    || sumLineItems(breakdown, (item) => item.type === 'tyre' || item.code === 'TYRE_SUBTOTAL');
  const serviceTotal = money(breakdown.totalServiceFee ?? breakdown.serviceSubtotal ?? breakdown.fittingPrice)
    || sumLineItems(breakdown, (item) => item.type === 'service');
  const travelTotal = money(breakdown.distanceServicePrice)
    || sumLineItems(breakdown, (item) => item.type === 'callout' || item.code === 'TRAVEL_DISTANCE');

  let warning: string | null = null;
  if (needsTyreStock && !parsedTyreSize) {
    warning = 'Tyre stock and tyre price will be confirmed after the tyre size is checked.';
  } else if (matchedTyre?.isPreOrder) {
    warning = 'This tyre may need to be confirmed from available supply before dispatch.';
  }

  return {
    quoteId: quote.quoteId,
    expiresAt: quote.expiresAt,
    bookingType,
    serviceType,
    breakdown,
    subtotal: money(breakdown.subtotal),
    vatAmount: money(breakdown.vatAmount),
    totalAmount: money(breakdown.total),
    serviceTotal,
    tyreTotal,
    travelTotal,
    distanceMiles: money(quote.distanceMiles),
    distanceBand: distanceBand(money(quote.distanceMiles)),
    driverEtaMinutes: quote.driverEtaMinutes,
    eligibility,
    matchedTyre,
    warning,
    tyreDetails: quote.tyreDetails ?? [],
    specialOrderRequired: Boolean(quote.specialOrderRequired || matchedTyre?.isPreOrder),
    leadTime: quote.leadTime ?? null,
  };
}
