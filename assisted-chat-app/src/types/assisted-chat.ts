// Local mirror of the relevant subset of types from
// `<repo-root>/types/admin-assisted-chat.ts`. Kept local because the Expo app
// is not in the Next.js tsconfig include path. Field shapes match exactly.

export type LockingNutAnswer = 'yes' | 'no' | 'unknown';
export type AssistedChatPaymentChoice = 'cash' | 'deposit' | 'full';
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
  tyre: AssistedChatTyreSelection;
  lockingNut: AssistedChatLockingWheelNut;
  quickBookingId: string | null;
  note: string;
  quote: AssistedChatQuoteBreakdown | null;
  priceNeedsRefresh: boolean;
  paymentChoice: AssistedChatPaymentChoice | null;
  paymentLink: StripePaymentLinkState | null;
  dispatchedRefNumber: string | null;
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

