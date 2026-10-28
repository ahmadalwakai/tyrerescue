import type { ReturningCustomerBooking, ReturningCustomerMatch } from '@/types/assisted-chat';
import { normalizeUkPhone } from './returning-customer';

export type IncomingCallerHistoryStatus = 'idle' | 'checking' | 'found' | 'not_found' | 'unavailable';

export interface IncomingCallerHistoryResult {
  status: IncomingCallerHistoryStatus;
  matches: ReturningCustomerMatch[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isBooking(value: unknown): value is ReturningCustomerBooking {
  if (!isRecord(value) || typeof value.refNumber !== 'string' || !value.refNumber.trim()
    || typeof value.status !== 'string' || !isNullableString(value.createdAt)
    || (value.createdAt !== null && !Number.isFinite(Date.parse(value.createdAt)))) return false;
  const textFields = ['addressLine', 'vehicleReg', 'vehicleMake', 'vehicleModel', 'tyreSize',
    'lockingNutStatus', 'paymentType', 'totalAmount'];
  return textFields.every((field) => isNullableString(value[field]))
    && isNullableNumber(value.lat) && isNullableNumber(value.lng)
    && (value.quantity === null || (typeof value.quantity === 'number'
      && Number.isInteger(value.quantity) && value.quantity > 0));
}

function isPhoneMatch(value: unknown, phone: string): value is ReturningCustomerMatch {
  if (!isRecord(value) || typeof value.key !== 'string' || !value.key.trim()
    || (value.confidence !== 'linked_account' && value.confidence !== 'phone')
    || !Array.isArray(value.reasons) || !value.reasons.every((reason) => typeof reason === 'string')
    || !isRecord(value.customer) || !isNullableString(value.customer.name)
    || !isNullableString(value.customer.email) || typeof value.customer.phone !== 'string'
    || normalizeUkPhone(value.customer.phone) !== phone || typeof value.customer.accountLinked !== 'boolean'
    || typeof value.bookingCount !== 'number' || !Number.isSafeInteger(value.bookingCount) || value.bookingCount < 1
    || !Array.isArray(value.bookings) || value.bookings.length < 1 || value.bookings.length > 5
    || !value.bookings.every(isBooking)
    || value.bookingCount < value.bookings.length) return false;
  return true;
}

/** A phone-only lookup must never reuse a draft address or another caller's history. */
export function parseIncomingCallerHistory(value: unknown, incomingPhone: string): IncomingCallerHistoryResult {
  const phone = normalizeUkPhone(incomingPhone);
  if (!phone || !isRecord(value) || !Array.isArray(value.matches) || value.matches.length > 20
    || !value.matches.every((match) => isPhoneMatch(match, phone))) {
    return { status: 'unavailable', matches: [] };
  }
  const matches = value.matches as ReturningCustomerMatch[];
  // Duplicate identity keys cannot be presented as separate, trustworthy records.
  if (new Set(matches.map((match) => match.key)).size !== matches.length) {
    return { status: 'unavailable', matches: [] };
  }
  return { status: matches.length > 0 ? 'found' : 'not_found', matches };
}
