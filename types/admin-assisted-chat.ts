/**
 * Shared types for the Admin Assisted Booking Chat workflow.
 *
 * All operational data is persisted on the existing `quick_bookings` table via
 * the existing `/api/admin/quick-book` endpoints. These types describe the
 * client-side draft and a small number of fields surfaced by the chat UI; they
 * do NOT introduce any new DB columns or alternate booking lifecycle.
 */

export type LockingNutAnswer = 'yes' | 'no' | 'unknown';

export type AssistedChatPaymentChoice = 'cash' | 'deposit' | 'full';

export interface AssistedChatCustomer {
  /** Optional UK phone. Required only when sending SMS / WhatsApp link. */
  phone: string;
  /** Optional friendly name (defaults to "Walk-in"). */
  name: string;
}

export interface AssistedChatLocation {
  /** Mapbox formatted label (place_name). */
  label: string;
  lat: number | null;
  lng: number | null;
  postcode: string | null;
}

export interface AssistedChatTyreSelection {
  /** Canonical size string e.g. "205/55R16". */
  size: string;
  quantity: number;
}

export interface AssistedChatLockingWheelNut {
  answer: LockingNutAnswer;
  /** GBP charge (positive number) when answer === 'no'. */
  chargeGbp: number | null;
}

export interface AssistedChatQuoteLine {
  label: string;
  amount: number;
  type: string;
  quantity?: number;
  unitPrice?: number;
}

export interface AssistedChatServiceOrigin {
  lat: number;
  lng: number;
  source: 'driver' | 'garage' | null;
  driverId: string | null;
  etaMinutes: number | null;
}

export interface AssistedChatQuoteBreakdown {
  /** Engine subtotal (excludes VAT). */
  subtotal: number;
  vatAmount: number;
  /** Engine total (includes locking-nut adjustment when sent through PATCH). */
  total: number;
  lineItems: AssistedChatQuoteLine[];
  adminAdjustmentAmount?: number | null;
  adminAdjustmentReason?: string | null;
  serviceOrigin: AssistedChatServiceOrigin | null;
  distanceKm: number | null;
}

export interface AssistedChatDraft {
  /** ID of the underlying quick_bookings row (created on first "Get price"). */
  quickBookingId: string | null;
  /** Saved internal admin quote id, when this priced draft has been stored. */
  savedQuoteId: string | null;
  /** Human-friendly saved internal quote ref, e.g. TRQ-1048. */
  savedQuoteRef: string | null;
  customer: AssistedChatCustomer;
  location: AssistedChatLocation;
  tyre: AssistedChatTyreSelection;
  lockingNut: AssistedChatLockingWheelNut;
  /** Optional admin note — persisted to `quick_bookings.notes` on dispatch. */
  note: string;
  /** Last successful quote, if any. */
  quote: AssistedChatQuoteBreakdown | null;
  paymentChoice: AssistedChatPaymentChoice | null;
  /** Last dispatch ref number (for idempotency / display). */
  dispatchedRefNumber: string | null;
  /** Last update epoch ms — used to expire stale drafts. */
  updatedAt: number;
}

export interface AssistedChatDispatchResponseLineItem {
  label: string;
  amount: number;
  type: string;
}

export interface AssistedChatDispatchResponse {
  bookingId: string;
  refNumber: string;
  invoiceNumber: string;
  paymentMethod: 'stripe' | 'cash' | 'deposit';
  paymentUrl: string | null;
  stripeClientSecret: string | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  breakdown: {
    subtotal: number;
    vatAmount: number;
    total: number;
    lineItems: AssistedChatDispatchResponseLineItem[];
  };
}
