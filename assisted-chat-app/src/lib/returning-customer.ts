import type { AssistedChatDraft, ReturningCustomerMatch } from '@/types/assisted-chat';
import { createBookingTyreLine } from './assisted-chat-workflow';

/** Mirrors the server: a UK number normalised to 44XXXXXXXXX(X), or null. */
export function normalizeUkPhone(input: string): string | null {
  const cleaned = input.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!/^\+?[\d\s().-]+$/.test(cleaned)) return null;
  let digits = cleaned.replace(/\(0\)/g, '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `44${digits.slice(1)}`;
  return /^44[1-9]\d{8,9}$/.test(digits) ? digits : null;
}

export const CONFIDENCE_LABELS: Record<ReturningCustomerMatch['confidence'], string> = {
  linked_account: 'Returning customer (account bookings with this number)',
  phone: 'Returning customer (same number)',
  address_tyre: 'Likely match (address + tyre)',
  review: 'Possible match: check first',
};

/** A caller's history must never fill a draft belonging to another number. */
export function incomingCallerDetailsBlockReason(context: {
  callerPhone: string;
  phoneInput: string;
  customerPhone: string;
  hasSavedBooking: boolean;
}): string | null {
  if (context.hasSavedBooking) return 'Start a new booking before using these caller details.';
  const callerPhone = normalizeUkPhone(context.callerPhone);
  if (!callerPhone) return 'Customer history could not be verified for this number.';
  if ([context.phoneInput, context.customerPhone].some((phone) => phone.trim() && normalizeUkPhone(phone) !== callerPhone)) {
    return 'This draft has a different phone number. Start a new booking or select the caller number before using these details.';
  }
  return null;
}

export interface FillResult {
  patch: Partial<AssistedChatDraft>;
  filled: string[];
}

/**
 * Details the operator may copy from a confirmed match. Only empty fields are
 * filled: anything already typed, a chosen location, entered tyres or an
 * existing price are never replaced.
 */
export function fillEmptyFromMatch(draft: AssistedChatDraft, match: ReturningCustomerMatch): FillResult {
  const latest = match.bookings[0];
  const patch: Partial<AssistedChatDraft> = {};
  const filled: string[] = [];
  const customer = { ...draft.customer };
  if (!customer.name.trim() && match.customer.name) { customer.name = match.customer.name; filled.push('name'); }
  if (!customer.email.trim() && match.customer.email) { customer.email = match.customer.email; filled.push('email'); }
  if (!customer.phone.trim() && match.customer.phone) { customer.phone = match.customer.phone; filled.push('phone'); }
  if (filled.length > 0) patch.customer = customer;

  const located = match.bookings.find((booking) => booking.addressLine && booking.lat !== null && booking.lng !== null);
  const locationEmpty = !draft.location.address.trim() && draft.location.lat === null && draft.location.lng === null;
  if (locationEmpty && !draft.quote && located) {
    patch.location = {
      method: 'address', address: located.addressLine ?? '', lat: located.lat, lng: located.lng,
      postcode: null, link: null, whatsappLink: null, status: 'received',
    };
    filled.push('address');
  }

  const tyresEmpty = draft.tyreLines.every((line) => !line.size.trim());
  if (tyresEmpty && !draft.quote && latest?.tyreSize) {
    patch.tyreLines = [createBookingTyreLine({ id: 'tyre-1', size: latest.tyreSize, quantity: latest.quantity ?? 1 })];
    filled.push('tyre size');
  }
  return { patch, filled };
}

/**
 * Query for the match endpoint: a complete UK number and/or an address the
 * operator confirmed from the suggestions. The tyre size is sent only with an
 * address (it only strengthens address matches). Empty when there is nothing
 * safe to match on.
 */
export function buildMatchQuery(input: { phone: string; confirmedAddress: string | null; tyreSize: string }): string {
  const params = new URLSearchParams();
  const phone = normalizeUkPhone(input.phone);
  const address = input.confirmedAddress?.trim() ?? '';
  if (phone) params.set('phone', phone);
  if (address) {
    params.set('address', address);
    if (input.tyreSize.trim()) params.set('tyreSize', input.tyreSize.trim());
  }
  return phone || address ? params.toString() : '';
}
