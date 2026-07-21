import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { authMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings, type AdminQuoteDraft, type NewAdminQuoteDraft, type QuickBooking } from '@/lib/db/schema';
import {
  calculateQuickBookPricing,
  extractQuickBookTyreLineSelections,
  extractQuickBookTyreSnapshot,
  QuickBookPricingError,
  type QuickBookTyreLineInput,
  type QuickBookServiceType,
} from '@/lib/quick-book-pricing';
import { distanceResultToKm, resolveQuickBookDistance } from '@/lib/quick-book-distance';
import { normalizeUkPhoneNumber } from '@/lib/voodoo-sms';
import {
  ADMIN_QUOTE_PAYMENT_OPTIONS,
  ADMIN_QUOTE_STATUSES,
  type AdminQuote,
  type AdminQuoteNextAction,
  type AdminQuotePaymentHandoff,
  type AdminQuotePaymentOption,
  type AdminQuotePaymentSummary,
  type AdminQuoteStatus,
  type CreateAdminQuoteInput,
  type UpdateAdminQuoteInput,
} from '@/types/admin-quotes';

const DEFAULT_QUOTE_VALIDITY_MS = 2 * 60 * 60 * 1000;
const MAX_PRICE_AMOUNT_PENCE = 1_000_000;
const MAX_LOCKING_NUT_CHARGE_PENCE = 100_000;
const ADMIN_QUOTE_DEPOSIT_PERCENT = 20;

const EXPIRABLE_STATUSES: readonly AdminQuoteStatus[] = [
  'DRAFT',
  'QUOTED',
  'PAYMENT_PENDING',
];

const phoneSchema = z
  .string()
  .trim()
  .min(5, 'Enter a valid phone number')
  .max(30, 'Phone number is too long')
  .regex(/^[+\d\s().-]+$/, 'Enter a valid phone number')
  .nullable()
  .optional();

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const adminQuoteTyreLineSchema = z.object({
  id: nullableText(50),
  size: z.string().trim().min(1).max(30),
  quantity: z.number().int().min(1).max(10),
  brand: nullableText(80),
  pattern: nullableText(80),
  season: nullableText(40),
  source: nullableText(40),
  price: z.number().min(0).max(MAX_PRICE_AMOUNT_PENCE / 100).nullable().optional(),
});

export const adminQuoteStatusSchema = z.enum(ADMIN_QUOTE_STATUSES);
export const adminQuotePaymentOptionSchema = z.enum(ADMIN_QUOTE_PAYMENT_OPTIONS);

export const createAdminQuoteSchema = z.object({
  quickBookingId: z.string().uuid().nullable().optional(),
  customerName: nullableText(255),
  customerPhone: phoneSchema,
  address: nullableText(1_000),
  postcode: nullableText(20),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  tyreSize: nullableText(20),
  quantity: z.number().int().min(1).max(10).optional(),
  tyreLines: z.array(adminQuoteTyreLineSchema).max(6).optional(),
  items: z.array(adminQuoteTyreLineSchema).max(6).optional(),
  lockingWheelNutStatus: nullableText(50),
  lockingWheelNutChargePence: z.number().int().min(0).max(MAX_LOCKING_NUT_CHARGE_PENCE).nullable().optional(),
  priceAmount: z.number().int().min(0).max(MAX_PRICE_AMOUNT_PENCE).optional(),
  currency: z.literal('GBP').optional(),
  quoteStatus: adminQuoteStatusSchema.optional(),
  expiresAt: z.string().datetime().optional(),
  internalNotes: nullableText(2_000),
});

export const updateAdminQuoteSchema = z.object({
  quickBookingId: z.string().uuid().nullable().optional(),
  customerName: nullableText(255),
  customerPhone: phoneSchema,
  address: nullableText(1_000),
  postcode: nullableText(20),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  tyreSize: nullableText(20),
  quantity: z.number().int().min(1).max(10).optional(),
  tyreLines: z.array(adminQuoteTyreLineSchema).max(6).optional(),
  items: z.array(adminQuoteTyreLineSchema).max(6).optional(),
  lockingWheelNutStatus: nullableText(50),
  lockingWheelNutChargePence: z.number().int().min(0).max(MAX_LOCKING_NUT_CHARGE_PENCE).nullable().optional(),
  priceAmount: z.number().int().min(0).max(MAX_PRICE_AMOUNT_PENCE).optional(),
  quoteStatus: adminQuoteStatusSchema.optional(),
  expiresAt: z.string().datetime().optional(),
  internalNotes: nullableText(2_000),
  refreshPrice: z.boolean().optional(),
});

export const confirmAdminQuoteSchema = z.object({
  selectedPaymentOption: adminQuotePaymentOptionSchema,
  operatorNote: nullableText(2_000),
  idempotencyKey: z.string().trim().max(128).nullable().optional(),
});

export class AdminQuoteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminQuoteError';
    this.status = status;
  }
}

export type AdminQuoteAuth = {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin';
  };
};

export type AdminQuoteAuthResult =
  | { ok: true; session: AdminQuoteAuth }
  | { ok: false; status: 401 | 403; error: string };

export async function authenticateAdminQuoteRequest(request: Request): Promise<AdminQuoteAuthResult> {
  const session = await authMobile(request);
  if (!session) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (session.user.role !== 'admin') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return {
    ok: true,
    session: {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: 'admin',
      },
    },
  };
}

export function getDefaultQuoteExpiresAt(): Date {
  return new Date(Date.now() + DEFAULT_QUOTE_VALIDITY_MS);
}

export function getEffectiveAdminQuoteStatus(row: Pick<AdminQuoteDraft, 'quoteStatus' | 'expiresAt'>): AdminQuoteStatus {
  if (
    row.quoteStatus !== 'EXPIRED' &&
    EXPIRABLE_STATUSES.includes(row.quoteStatus) &&
    row.expiresAt.getTime() <= Date.now()
  ) {
    return 'EXPIRED';
  }
  return row.quoteStatus;
}

export function formatAdminQuotePrice(priceAmount: number, currency: 'GBP' = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(priceAmount / 100);
}

export function calculateAdminQuoteDeposit(priceAmountPence: number): {
  depositAmountPence: number;
  remainingBalancePence: number;
} {
  const depositAmountPence = Math.round((priceAmountPence * ADMIN_QUOTE_DEPOSIT_PERCENT) / 100);
  return {
    depositAmountPence,
    remainingBalancePence: priceAmountPence - depositAmountPence,
  };
}

function isDepositPaymentOption(paymentOption: AdminQuotePaymentOption | null): boolean {
  return paymentOption === 'DEPOSIT_20' || paymentOption === 'DEPOSIT_15';
}

export function getAdminQuoteNextAction(paymentOption: AdminQuotePaymentOption): Exclude<AdminQuoteNextAction, 'ALREADY_CONFIRMED' | 'RECALCULATE_REQUIRED'> {
  if (paymentOption === 'FULL_PAYMENT') return 'TAKE_FULL_PAYMENT';
  if (isDepositPaymentOption(paymentOption)) return 'TAKE_DEPOSIT';
  if (paymentOption === 'CASH_ON_ARRIVAL') return 'MARK_CASH_PENDING';
  return 'SEND_PAYMENT_LINK';
}

export function getAdminQuoteStatusForPaymentOption(paymentOption: AdminQuotePaymentOption): AdminQuoteStatus {
  return paymentOption === 'CASH_ON_ARRIVAL' ? 'CONFIRMED_BY_PHONE' : 'PAYMENT_PENDING';
}

export function buildAdminQuotePaymentSummary(
  priceAmountPence: number,
  paymentOption: AdminQuotePaymentOption | null,
): AdminQuotePaymentSummary {
  const deposit = isDepositPaymentOption(paymentOption) ? calculateAdminQuoteDeposit(priceAmountPence) : null;
  return {
    totalAmountPence: priceAmountPence,
    formattedTotal: formatAdminQuotePrice(priceAmountPence),
    depositAmountPence: deposit?.depositAmountPence ?? null,
    formattedDeposit: deposit ? formatAdminQuotePrice(deposit.depositAmountPence) : null,
    remainingBalancePence: deposit?.remainingBalancePence ?? null,
    formattedRemaining: deposit ? formatAdminQuotePrice(deposit.remainingBalancePence) : null,
  };
}

export function buildAdminQuotePaymentHandoff(input: {
  paymentOption: AdminQuotePaymentOption | null;
  quickBookingId: string | null;
}): AdminQuotePaymentHandoff {
  if (!input.paymentOption) {
    return {
      canStartPayment: false,
      paymentUrl: null,
      clientSecret: null,
      message: 'Choose a payment option before starting payment.',
    };
  }

  if (input.paymentOption === 'PAYMENT_LINK') {
    return {
      canStartPayment: false,
      paymentUrl: null,
      clientSecret: null,
      message: 'Saved quote payment links are not connected yet. Keep the quote confirmed and copy the payment instruction for now.',
    };
  }

  if (input.quickBookingId) {
    return {
      canStartPayment: false,
      paymentUrl: null,
      clientSecret: null,
      message: 'Use the existing quick booking payment flow to create the booking before taking payment.',
    };
  }

  return {
    canStartPayment: false,
    paymentUrl: null,
    clientSecret: null,
    message: 'No safe booking conversion route is connected to this saved quote yet.',
  };
}

function formatQuoteExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  }).format(expiresAt);
}

export function buildAdminQuoteWhatsAppMessage(input: {
  quoteRef: string;
  priceAmount: number;
  quantity: number;
  tyreSize: string | null;
  expiresAt: Date;
}): string {
  const tyreSize = input.tyreSize?.trim() || 'the requested size';
  return [
    `Your quote is ${formatAdminQuotePrice(input.priceAmount)} for ${input.quantity} tyre(s), size ${tyreSize}.`,
    `Quote ref: ${input.quoteRef}.`,
    `This quote is valid until ${formatQuoteExpiry(input.expiresAt)}.`,
    'Call or WhatsApp us to confirm.',
  ].join('\n');
}

export function buildAdminQuoteConfirmationWhatsAppMessages(input: {
  quoteRef: string;
  priceAmount: number;
}): Record<AdminQuotePaymentOption, string> {
  const formattedPrice = formatAdminQuotePrice(input.priceAmount);
  const deposit = calculateAdminQuoteDeposit(input.priceAmount);
  const formattedDeposit = formatAdminQuotePrice(deposit.depositAmountPence);
  const formattedRemaining = formatAdminQuotePrice(deposit.remainingBalancePence);

  return {
    FULL_PAYMENT: `Your quote ${input.quoteRef} is confirmed. The total is ${formattedPrice}. Please complete payment to secure the job.`,
    DEPOSIT_20: `Your quote ${input.quoteRef} is confirmed. Deposit: ${formattedDeposit}. Remaining balance: ${formattedRemaining}. Please complete the deposit to secure the job.`,
    DEPOSIT_15: `Your quote ${input.quoteRef} is confirmed. Deposit: ${formattedDeposit}. Remaining balance: ${formattedRemaining}. Please complete the deposit to secure the job.`,
    CASH_ON_ARRIVAL: `Your quote ${input.quoteRef} is confirmed for ${formattedPrice}. Payment is marked as cash on arrival.`,
    PAYMENT_LINK: `Your quote ${input.quoteRef} is confirmed for ${formattedPrice}. Please use the payment link provided to secure the job.`,
  };
}

function isAdminQuotePaymentOption(value: string | null): value is AdminQuotePaymentOption {
  return ADMIN_QUOTE_PAYMENT_OPTIONS.includes(value as AdminQuotePaymentOption);
}

function getSmsAvailability(customerPhone: string | null): { available: boolean; reason: string | null } {
  if (process.env.VOODOO_SMS_ENABLED === 'false') {
    return { available: false, reason: 'SMS sending is disabled for this environment.' };
  }
  if (!process.env.VOODOO_SMS_API_KEY) {
    return { available: false, reason: 'SMS service is not configured for this environment.' };
  }
  if (!customerPhone || !normalizeUkPhoneNumber(customerPhone)) {
    return { available: false, reason: 'A valid UK mobile number is required before sending SMS.' };
  }
  return { available: true, reason: null };
}

export function serializeAdminQuote(row: AdminQuoteDraft): AdminQuote {
  const quoteStatus = getEffectiveAdminQuoteStatus(row);
  const latitude = row.latitude == null ? null : Number(row.latitude);
  const longitude = row.longitude == null ? null : Number(row.longitude);
  const currency = row.currency === 'GBP' ? 'GBP' : 'GBP';
  const sms = getSmsAvailability(row.customerPhone);
  const selectedPaymentOption = isAdminQuotePaymentOption(row.selectedPaymentOption) ? row.selectedPaymentOption : null;

  return {
    id: row.id,
    quoteRef: row.quoteRef,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    address: row.address,
    postcode: row.postcode,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    tyreSize: row.tyreSize,
    quantity: row.quantity,
    lockingWheelNutStatus: row.lockingWheelNutStatus,
    lockingWheelNutChargePence: row.lockingWheelNutChargePence,
    priceAmount: row.priceAmount,
    currency,
    quoteStatus,
    isExpired: quoteStatus === 'EXPIRED',
    expiresAt: row.expiresAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    confirmationMethod: row.confirmationMethod === 'PHONE' ? 'PHONE' : null,
    selectedPaymentOption,
    quickBookingId: row.quickBookingId,
    createdByAdminId: row.createdByAdminId,
    internalNotes: row.internalNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    whatsappMessage: buildAdminQuoteWhatsAppMessage({
      quoteRef: row.quoteRef,
      priceAmount: row.priceAmount,
      quantity: row.quantity,
      tyreSize: row.tyreSize,
      expiresAt: row.expiresAt,
    }),
    confirmationWhatsAppMessages: buildAdminQuoteConfirmationWhatsAppMessages({
      quoteRef: row.quoteRef,
      priceAmount: row.priceAmount,
    }),
    smsAvailable: sms.available,
    smsUnavailableReason: sms.reason,
  };
}

function optionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePriceAmountPence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(MAX_PRICE_AMOUNT_PENCE, Math.round(value)));
}

function normalizeQuoteTyreLines(input: {
  tyreLines?: QuickBookTyreLineInput[] | null;
  items?: QuickBookTyreLineInput[] | null;
}): QuickBookTyreLineInput[] {
  const rawLines = Array.isArray(input.tyreLines) && input.tyreLines.length > 0
    ? input.tyreLines
    : Array.isArray(input.items)
    ? input.items
    : [];

  return rawLines.flatMap((line, index) => {
    const size = optionalString(line.size);
    if (!size) return [];
    return [{
      id: optionalString(line.id) ?? `tyre-${index + 1}`,
      size,
      quantity: Math.max(1, Math.min(10, Math.round(Number(line.quantity) || 1))),
      brand: optionalString(line.brand),
      pattern: optionalString(line.pattern),
      season: optionalString(line.season),
      source: optionalString(line.source),
      price: typeof line.price === 'number' && Number.isFinite(line.price) ? line.price : null,
    }];
  });
}

function quickBookingTyreLines(quickBooking: QuickBooking | null): QuickBookTyreLineInput[] {
  if (!quickBooking) return [];
  const stored = extractQuickBookTyreLineSelections({ priceBreakdown: quickBooking.priceBreakdown });
  if (stored.length > 0) {
    return stored.map((line, index) => ({
      id: line.id || `tyre-${index + 1}`,
      size: line.normalizedSize ?? line.sizeDisplay ?? line.requestedSize,
      quantity: line.quantity,
      brand: line.brand,
      pattern: line.pattern,
      price: line.unitPrice,
    }));
  }

  if (!quickBooking.tyreSize) return [];
  return [{
    id: 'tyre-1',
    size: quickBooking.tyreSize,
    quantity: quickBooking.tyreCount ?? 1,
  }];
}

function totalTyreLineQuantity(lines: QuickBookTyreLineInput[]): number {
  return lines.reduce((sum, line) => sum + Math.max(1, Math.min(10, Math.round(Number(line.quantity) || 1))), 0);
}

async function findQuickBooking(quickBookingId: string | null | undefined): Promise<QuickBooking | null> {
  if (!quickBookingId) return null;
  const [row] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, quickBookingId))
    .limit(1);
  if (!row) {
    throw new AdminQuoteError('Quick booking not found', 400);
  }
  return row;
}

type QuotePricingInput = CreateAdminQuoteInput | UpdateAdminQuoteInput;

async function calculateQuotePrice(input: QuotePricingInput, quickBooking: QuickBooking | null): Promise<{
  priceAmount: number;
  tyreSize: string | null;
  quantity: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  postcode: string | null;
}> {
  const explicitTyreLines = normalizeQuoteTyreLines(input);
  const storedTyreLines = quickBookingTyreLines(quickBooking);
  const tyreLines = explicitTyreLines.length > 0 ? explicitTyreLines : storedTyreLines;
  const lineQuantity = totalTyreLineQuantity(tyreLines);
  const quantity = lineQuantity || (input.quantity ?? quickBooking?.tyreCount ?? 1);
  const tyreSize = optionalString(input.tyreSize) ?? optionalString(tyreLines[0]?.size) ?? quickBooking?.tyreSize ?? null;
  const latitude = input.latitude ?? optionalNumber(quickBooking?.locationLat);
  const longitude = input.longitude ?? optionalNumber(quickBooking?.locationLng);
  const address = optionalString(input.address) ?? quickBooking?.locationAddress ?? null;
  const postcode = optionalString(input.postcode) ?? quickBooking?.locationPostcode ?? null;
  const explicitFinalPayablePence = normalizePriceAmountPence(input.priceAmount);
  const forceRecalculation = 'refreshPrice' in input && input.refreshPrice === true;
  const hasExplicitLockingNutCharge = Object.prototype.hasOwnProperty.call(input, 'lockingWheelNutChargePence');
  const lockingWheelNutChargePence = hasExplicitLockingNutCharge ? input.lockingWheelNutChargePence ?? 0 : 0;
  const quickBookingAdminAdjustmentAmount = optionalNumber(quickBooking?.adminAdjustmentAmount);
  const recalculationAdminAdjustmentAmount =
    hasExplicitLockingNutCharge
      ? lockingWheelNutChargePence / 100
      : quickBookingAdminAdjustmentAmount ?? 0;
  const recalculationAdminAdjustmentReason =
    hasExplicitLockingNutCharge
      ? lockingWheelNutChargePence > 0
        ? 'Locking wheel nut removal'
        : null
      : quickBooking?.adminAdjustmentReason ?? null;

  if (explicitFinalPayablePence != null && !forceRecalculation) {
    return {
      priceAmount: explicitFinalPayablePence,
      tyreSize,
      quantity,
      latitude,
      longitude,
      address,
      postcode,
    };
  }

  const canCalculate = Boolean((tyreLines.length > 0 || tyreSize) && (quickBooking || (latitude != null && longitude != null)));

  if (!canCalculate) {
    if (explicitFinalPayablePence == null) {
      throw new AdminQuoteError('Unable to calculate quote price from the supplied data', 400);
    }
    return {
      priceAmount: explicitFinalPayablePence,
      tyreSize,
      quantity,
      latitude,
      longitude,
      address,
      postcode,
    };
  }

  const serviceType = (quickBooking?.serviceType ?? 'fit') as QuickBookServiceType;
  const quickBreakdown = quickBooking?.priceBreakdown as Record<string, unknown> | null | undefined;
  let distanceKm = optionalNumber(quickBooking?.distanceKm);
  let pricingDistanceMiles =
    typeof quickBreakdown?.pricingDistanceMiles === 'number' && Number.isFinite(quickBreakdown.pricingDistanceMiles)
      ? quickBreakdown.pricingDistanceMiles
      : distanceKm != null
      ? distanceKm * 0.621371
      : null;
  if (distanceKm == null && latitude != null && longitude != null) {
    const distanceResult = await resolveQuickBookDistance({ lat: latitude, lng: longitude });
    distanceKm = distanceResultToKm(distanceResult);
    pricingDistanceMiles = distanceResult.pricingDistanceMiles;
  }

  const selectedTyreLineSnapshots = quickBooking && explicitTyreLines.length === 0
    ? extractQuickBookTyreLineSelections({ priceBreakdown: quickBooking.priceBreakdown })
    : [];
  const selectedTyreSnapshot = quickBooking && selectedTyreLineSnapshots.length === 0
    ? extractQuickBookTyreSnapshot({
        selectedTyreProductId: quickBooking.selectedTyreProductId,
        selectedTyreUnitPrice: quickBooking.selectedTyreUnitPrice,
        selectedTyreBrand: quickBooking.selectedTyreBrand,
        selectedTyrePattern: quickBooking.selectedTyrePattern,
        selectedTyreSizeDisplay: quickBooking.tyreSize,
      })
    : null;
  const adminDistanceLimitMiles =
    typeof quickBreakdown?.adminDistanceLimitMiles === 'number' && Number.isFinite(quickBreakdown.adminDistanceLimitMiles)
      ? quickBreakdown.adminDistanceLimitMiles
      : undefined;

  try {
    const priced = await calculateQuickBookPricing({
      serviceType,
      tyreSize,
      tyreCount: quantity,
      tyreLines,
      distanceMiles: pricingDistanceMiles ?? (distanceKm ?? 5) * 0.621371,
      selectedTyreSnapshot,
      selectedTyreSnapshots: selectedTyreLineSnapshots,
      resolveTyreFromSize: selectedTyreLineSnapshots.length === 0 && !selectedTyreSnapshot,
      requireTyreForFit: serviceType === 'fit' && Boolean(tyreSize),
      adminAdjustmentAmount: recalculationAdminAdjustmentAmount,
      adminAdjustmentReason: recalculationAdminAdjustmentReason,
      adminDistanceLimitMiles,
      pricingContext: 'manual_quote',
    });

    return {
      priceAmount: Math.round(priced.breakdown.total * 100),
      tyreSize: priced.normalizedTyreSize ?? tyreSize,
      quantity,
      latitude,
      longitude,
      address,
      postcode,
    };
  } catch (error) {
    if (error instanceof QuickBookPricingError) {
      throw new AdminQuoteError(error.message, error.status);
    }
    throw error;
  }
}

export async function buildAdminQuoteInsert(input: CreateAdminQuoteInput, createdByAdminId: string): Promise<NewAdminQuoteDraft> {
  const quickBooking = await findQuickBooking(input.quickBookingId);
  const priced = await calculateQuotePrice(input, quickBooking);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : getDefaultQuoteExpiresAt();

  return {
    customerName: optionalString(input.customerName) ?? quickBooking?.customerName ?? null,
    customerPhone: optionalString(input.customerPhone) ?? quickBooking?.customerPhone ?? null,
    address: priced.address,
    postcode: priced.postcode,
    latitude: priced.latitude == null ? null : String(priced.latitude),
    longitude: priced.longitude == null ? null : String(priced.longitude),
    tyreSize: priced.tyreSize,
    quantity: priced.quantity,
    lockingWheelNutStatus: optionalString(input.lockingWheelNutStatus),
    lockingWheelNutChargePence: input.lockingWheelNutChargePence ?? 0,
    priceAmount: priced.priceAmount,
    currency: 'GBP',
    quoteStatus: input.quoteStatus ?? 'QUOTED',
    expiresAt,
    quickBookingId: quickBooking?.id ?? null,
    createdByAdminId,
    internalNotes: optionalString(input.internalNotes),
    updatedAt: new Date(),
  };
}

export async function buildAdminQuoteUpdate(input: UpdateAdminQuoteInput, existing: AdminQuoteDraft): Promise<Partial<NewAdminQuoteDraft>> {
  const requestedQuickBookingId = input.quickBookingId === undefined ? existing.quickBookingId : input.quickBookingId;
  const quickBooking = await findQuickBooking(requestedQuickBookingId);
  const explicitFinalPayablePence = normalizePriceAmountPence(input.priceAmount);
  const hasExplicitFinalPayable = explicitFinalPayablePence != null && input.refreshPrice !== true;
  const shouldRefreshPrice = Boolean(
    !hasExplicitFinalPayable &&
      (input.refreshPrice ||
      input.quickBookingId !== undefined ||
      input.tyreSize !== undefined ||
      input.quantity !== undefined ||
      input.latitude !== undefined ||
      input.longitude !== undefined ||
      input.lockingWheelNutChargePence !== undefined),
  );

  const mergedForPricing: UpdateAdminQuoteInput = {
    quickBookingId: requestedQuickBookingId,
    customerName: input.customerName ?? existing.customerName,
    customerPhone: input.customerPhone ?? existing.customerPhone,
    address: input.address ?? existing.address,
    postcode: input.postcode ?? existing.postcode,
    latitude: input.latitude ?? optionalNumber(existing.latitude),
    longitude: input.longitude ?? optionalNumber(existing.longitude),
    tyreSize: input.tyreSize ?? existing.tyreSize,
    quantity: input.quantity ?? existing.quantity,
    lockingWheelNutStatus: input.lockingWheelNutStatus ?? existing.lockingWheelNutStatus,
    lockingWheelNutChargePence: input.lockingWheelNutChargePence ?? existing.lockingWheelNutChargePence ?? 0,
    ...(input.refreshPrice === true ? { refreshPrice: true } : {}),
    ...(explicitFinalPayablePence != null ? { priceAmount: explicitFinalPayablePence } : {}),
  };

  const update: Partial<NewAdminQuoteDraft> = { updatedAt: new Date() };

  if (input.customerName !== undefined) update.customerName = optionalString(input.customerName);
  if (input.customerPhone !== undefined) update.customerPhone = optionalString(input.customerPhone);
  if (input.address !== undefined) update.address = optionalString(input.address);
  if (input.postcode !== undefined) update.postcode = optionalString(input.postcode);
  if (input.latitude !== undefined) update.latitude = input.latitude == null ? null : String(input.latitude);
  if (input.longitude !== undefined) update.longitude = input.longitude == null ? null : String(input.longitude);
  if (input.tyreSize !== undefined) update.tyreSize = optionalString(input.tyreSize);
  if (input.quantity !== undefined) update.quantity = input.quantity;
  if (input.lockingWheelNutStatus !== undefined) update.lockingWheelNutStatus = optionalString(input.lockingWheelNutStatus);
  if (input.lockingWheelNutChargePence !== undefined) update.lockingWheelNutChargePence = input.lockingWheelNutChargePence ?? 0;
  if (input.quoteStatus !== undefined) update.quoteStatus = input.quoteStatus;
  if (input.expiresAt !== undefined) update.expiresAt = new Date(input.expiresAt);
  if (input.internalNotes !== undefined) update.internalNotes = optionalString(input.internalNotes);
  if (input.quickBookingId !== undefined) update.quickBookingId = quickBooking?.id ?? null;

  if (shouldRefreshPrice) {
    const priced = await calculateQuotePrice(mergedForPricing, quickBooking);
    update.priceAmount = priced.priceAmount;
    update.tyreSize = priced.tyreSize;
    update.quantity = priced.quantity;
    update.latitude = priced.latitude == null ? null : String(priced.latitude);
    update.longitude = priced.longitude == null ? null : String(priced.longitude);
    update.address = priced.address;
    update.postcode = priced.postcode;
    if (input.refreshPrice) {
      update.expiresAt = getDefaultQuoteExpiresAt();
      if (getEffectiveAdminQuoteStatus(existing) === 'EXPIRED') {
        update.quoteStatus = 'QUOTED';
      }
    }
  } else if (explicitFinalPayablePence != null) {
    update.priceAmount = explicitFinalPayablePence;
  }

  return update;
}
