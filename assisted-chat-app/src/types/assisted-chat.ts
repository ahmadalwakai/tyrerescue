// Local mirror of the relevant subset of types from
// `<repo-root>/types/admin-assisted-chat.ts`. Kept local because the Expo app
// is not in the Next.js tsconfig include path. Field shapes match exactly.

export type LockingNutAnswer = 'yes' | 'no' | 'unknown';
export type AssistedChatPaymentChoice = 'cash' | 'deposit' | 'full';
export type CustomerEmailMode = 'walk_in_customer' | 'send_customer_confirmation';
export type PaymentChoice = AssistedChatPaymentChoice;
export type PaymentLinkKind = 'deposit' | 'full';
export type AssistedChatLocationMethod = 'address' | 'link';

export interface AssistedChatCustomer {
  phone: string;
  name: string;
  email: string;
}

export interface AssistedChatLocation {
  method: AssistedChatLocationMethod;
  address: string;
  lat: number | null;
  lng: number | null;
  postcode: string | null;
  link: string | null;
  whatsappLink: string | null;
  status: 'idle' | 'pending' | 'received';
}

export interface AssistedChatTyreSelection {
  size: string;
  quantity: number;
}

export type BookingTyreLine = {
  id: string;
  size: string;
  quantity: number;
  brand?: string | null;
  pattern?: string | null;
  season?: string | null;
  source?: string | null;
  price?: number | null;
};

export interface AssistedChatLockingWheelNut {
  answer: LockingNutAnswer;
  chargeGbp: number | null;
}

export interface AssistedChatQuoteLine {
  label: string;
  amount: number;
  type: string;
  quantity?: number;
  unitPrice?: number;
}

export interface AssistedChatQuoteBreakdown {
  subtotal: number;
  vatAmount: number;
  total: number;
  lineItems: AssistedChatQuoteLine[];
  distanceKm: number | null;
  distanceMiles?: number | null;
  fittingPrice?: number | null;
  tyrePrice?: number | null;
  totalPrice?: number | null;
  tyreLines?: BookingTyreLine[];
  adminAdjustmentAmount?: number | null;
  adminAdjustmentReason?: string | null;
  serviceOrigin?: {
    lat: number;
    lng: number;
    source: 'driver' | 'garage';
    driverId: string | null;
    etaMinutes: number | null;
  } | null;
}

export interface AssistedChatDraft {
  customer: AssistedChatCustomer;
  location: AssistedChatLocation;
  tyreLines: BookingTyreLine[];
  lockingNut: AssistedChatLockingWheelNut;
  quickBookingId: string | null;
  savedQuoteId: string | null;
  savedQuoteRef: string | null;
  note: string;
  quote: AssistedChatQuoteBreakdown | null;
  priceNeedsRefresh: boolean;
  /**
   * Operator-entered manual final price in GBP that overrides the engine
   * total for display, quote save, and dispatch. Null means use the engine
   * total. Cleared automatically whenever a fresh price is pulled.
   */
  manualPriceGbp: number | null;
  paymentChoice: AssistedChatPaymentChoice | null;
  paymentLink: StripePaymentLinkState | null;
  dispatchedRefNumber: string | null;
  /**
   * Booking UUID returned by the finalize endpoint. Persisted so the live
   * tracking card can resume after a screen reload (tracking endpoints are
   * keyed by bookingId, not by ref number).
   */
  dispatchedBookingId: string | null;
  customerEmailMode: CustomerEmailMode;
  updatedAt: number;
}

export interface TyreSizeSuggestion {
  size: string;
  count: number;
}

export interface QuickBookCreateResponse {
  locationLink: string | null;
  whatsappLink: string | null;
  whatsappText: string | null;
  booking: {
    id: string;
    status: string;
    locationLat: string | null;
    locationLng: string | null;
    locationAddress: string | null;
    locationPostcode?: string | null;
    locationLinkUsed?: boolean | null;
    distanceKm: string | null;
    totalPrice: string | null;
    basePrice: string | null;
    priceBreakdown: {
      lineItems: AssistedChatQuoteLine[];
      subtotal: number;
      vatAmount: number;
      total: number;
      distanceMiles?: number | null;
      fittingPrice?: number | null;
      tyrePrice?: number | null;
      totalPrice?: number | null;
      tyreLines?: BookingTyreLine[];
      adminAdjustmentAmount?: number | null;
      adminAdjustmentReason?: string | null;
      serviceOrigin?: AssistedChatQuoteBreakdown['serviceOrigin'];
    } | null;
  };
}

export interface QuickBookGetResponse {
  booking: QuickBookCreateResponse['booking'];
}

export interface SendLinkResponse {
  ok: boolean;
  method: 'sms' | 'whatsapp' | 'email' | 'copy';
  message?: string;
  link?: string;
  provider?: string;
  error?: string;
}

export interface QuickBookPatchResponse {
  booking: {
    id: string;
    totalPrice: string | null;
    basePrice: string | null;
    distanceKm: string | null;
    priceBreakdown: {
      lineItems: AssistedChatQuoteLine[];
      subtotal: number;
      vatAmount: number;
      total: number;
      distanceMiles?: number | null;
      fittingPrice?: number | null;
      tyrePrice?: number | null;
      totalPrice?: number | null;
      tyreLines?: BookingTyreLine[];
      adminAdjustmentAmount?: number | null;
      adminAdjustmentReason?: string | null;
      serviceOrigin?: AssistedChatQuoteBreakdown['serviceOrigin'];
    } | null;
  };
}

export interface StripePaymentLinkState {
  kind: PaymentLinkKind;
  paymentUrl: string;
  amountPence: number;
  remainingBalancePence: number | null;
  bookingId: string;
  refNumber: string;
  createdAtIso: string;
}

export interface QuickBookFinalizeResponse {
  bookingId: string;
  refNumber: string;
  invoiceNumber?: string;
  paymentMethod: 'stripe' | 'cash' | 'deposit';
  paymentUrl: string | null;
  stripeClientSecret?: null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  breakdown?: {
    subtotal: number;
    vatAmount: number;
    total: number;
    lineItems: AssistedChatQuoteLine[];
    distanceMiles?: number | null;
    fittingPrice?: number | null;
    tyrePrice?: number | null;
    totalPrice?: number | null;
    tyreLines?: BookingTyreLine[];
    adminAdjustmentAmount?: number | null;
    adminAdjustmentReason?: string | null;
  };
}

export type FinalizeResponse = QuickBookFinalizeResponse;

export interface DepositCheckoutResponse {
  checkoutUrl: string | null;
  sessionId: string;
  paymentIntentId: string | null;
  depositAmountPence: number;
  remainingBalancePence: number;
  depositAmount: number;
  remainingBalance: number;
}

export interface PaymentLinkResult {
  bookingId: string;
  refNumber: string;
  paymentChoice: AssistedChatPaymentChoice;
  paymentLink: StripePaymentLinkState | null;
}

// Response from POST /api/admin/bookings/[ref]/payment-link — an admin-created
// Stripe Checkout link for the OUTSTANDING balance of an existing job. Creating
// the link only means "awaiting payment" — never "paid". The Stripe webhook is
// the single source of truth for completion.
export interface AdminPaymentLinkResponse {
  ok: boolean;
  refNumber: string;
  bookingId: string;
  paymentUrl: string;
  sessionId: string;
  amountPence: number;
  outstandingPence: number;
  currency: string;
  status: 'awaiting_payment';
  createdAtIso: string;
}

// Operational-only snapshot of a customer the operator has handled. Stored
// locally in AsyncStorage so the operator can reuse details for repeat
// customers without re-typing. Never contains payment secrets.
export interface RecentCustomer {
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  customerAddress?: string;
  lat?: number | null;
  lng?: number | null;
  postcode?: string | null;
  tyreSize?: string;
  quantity?: number;
  tyreLines?: BookingTyreLine[];
  note?: string;
  lastUsedAtIso: string;
  lastBookingReference?: string;
}

export type StockConfidenceLevel =
  | 'unknown'
  | 'in-stock'
  | 'low-stock'
  | 'insufficient'
  | 'not-available'
  | 'no-match';

export interface StockConfidence {
  level: StockConfidenceLevel;
  label: string;
  detail?: string;
  /** True when the operator should be blocked from pricing. */
  blocking: boolean;
}

