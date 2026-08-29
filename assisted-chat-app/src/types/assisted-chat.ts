// Local mirror of the relevant subset of types from
// `<repo-root>/types/admin-assisted-chat.ts`. Kept local because the Expo app
// is not in the Next.js tsconfig include path. Field shapes match exactly.

export type LockingNutAnswer = 'yes' | 'no' | 'unknown';
export type AssistedChatServiceType = 'fit' | 'repair' | 'assess' | 'locking_nut';
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

export interface AssistedChatVehicle {
  registrationNumber: string;
  make: string;
  model: string | null;
  yearOfManufacture: number | null;
  monthOfFirstRegistration?: string | null;
  fuelType: 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'OTHER';
  colour: string | null;
}

export interface AssistedChatTyreSize {
  width: string;
  aspect: string;
  rim: string;
  sizeDisplay?: string;
  loadIndex?: string;
  speedIndex?: string;
  runFlat?: boolean;
  xl?: boolean;
  commercial?: boolean;
  source?: string;
  oem?: boolean;
  fallback?: boolean;
}

export interface AssistedChatTyreFitmentOption {
  id: string;
  label: string;
  front: AssistedChatTyreSize;
  rear: AssistedChatTyreSize;
  source: string;
  sourceLabel: string;
  confidence: 'high' | 'medium' | 'low';
  oem?: boolean;
  optional?: boolean;
  staggered?: boolean;
  vehicleModel?: string;
  vehicleVariant?: string | null;
  fitmentRank?: number;
  notes?: string[];
  tyreLines?: Array<{
    id?: string | null;
    size: AssistedChatTyreSize;
    quantity: number;
    axle?: string | null;
    loadIndex?: string | null;
    speedIndex?: string | null;
    runFlat?: boolean | null;
    xl?: boolean | null;
    commercial?: boolean | null;
  }>;
}

export type AssistedChatVehicleFitmentLookupStatus =
  | 'dvla_resolved'
  | 'locally_confirmed'
  | 'model_required'
  | 'multiple_models'
  | 'catalogue_candidates'
  | 'multiple_fitments'
  | 'identity_conflict'
  | 'manual_vehicle_required'
  | 'manual_tyre_required'
  | 'sidewall_confirmation_required'
  | 'dvla_not_found'
  | 'dvla_unavailable';

export interface AssistedChatVehicleModelCandidate {
  id: string;
  make: string;
  model: string;
  variants: string[];
  from: number;
  to: number;
  matchReason: string;
}

export interface AssistedChatVehicleIdentityConflict {
  registrationNumber: string;
  currentVehicle: AssistedChatVehicle;
  previousVehicle: AssistedChatVehicle;
  conflictFields: string[];
  message: string;
}

export interface AssistedChatTyreAssistance {
  provider: 'groq' | 'deterministic';
  recommendedOptionId: string | null;
  summary: string;
  warnings: string[];
}

export interface AssistedChatVehicleFitmentLookupResponse {
  ok: boolean;
  status?: AssistedChatVehicleFitmentLookupStatus;
  states?: AssistedChatVehicleFitmentLookupStatus[];
  vehicle?: AssistedChatVehicle;
  localVehicle?: AssistedChatVehicle;
  vehicleSource?: 'dvla' | 'locally_confirmed' | 'manual';
  tyreSize?: AssistedChatTyreSize | null;
  tyreOptions?: AssistedChatTyreFitmentOption[];
  tyreAssistance?: AssistedChatTyreAssistance;
  tyreCatalogStatus?: 'hit' | 'local_catalog' | 'miss' | 'not_configured' | 'error';
  modelCandidates?: AssistedChatVehicleModelCandidate[];
  identityConflict?: AssistedChatVehicleIdentityConflict;
  requiresModelSelection?: boolean;
  requiresManualVehicle?: boolean;
  requiresManualTyre?: boolean;
  requiresSidewallConfirmation?: boolean;
  requiresIdentityConfirmation?: boolean;
  messages?: string[];
  error?: { code: string; message: string };
}

export type BookingTyreLine = {
  id: string;
  size: string;
  quantity: number;
  axle?: string | null;
  loadIndex?: string | null;
  speedIndex?: string | null;
  runFlat?: boolean | null;
  xl?: boolean | null;
  commercial?: boolean | null;
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
  serviceDistanceMiles?: number | null;
  pricingDistanceMiles?: number | null;
  pricingDurationMinutes?: number | null;
  garageDistanceMiles?: number | null;
  pricingDistanceSource?: 'driver' | 'garage' | 'garage_floor' | null;
  distanceFloorApplied?: boolean | null;
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
  serviceType: AssistedChatServiceType;
  tyreLines: BookingTyreLine[];
  vehicle: AssistedChatVehicle | null;
  tyreConfirmedFromSidewall: boolean;
  lockingNut: AssistedChatLockingWheelNut;
  quickBookingId: string | null;
  virtualLandlineInteractionId: string | null;
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
  price?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
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
      serviceDistanceMiles?: number | null;
      pricingDistanceMiles?: number | null;
      pricingDurationMinutes?: number | null;
      garageDistanceMiles?: number | null;
      pricingDistanceSource?: 'driver' | 'garage' | 'garage_floor' | null;
      distanceFloorApplied?: boolean | null;
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
      serviceDistanceMiles?: number | null;
      pricingDistanceMiles?: number | null;
      pricingDurationMinutes?: number | null;
      garageDistanceMiles?: number | null;
      pricingDistanceSource?: 'driver' | 'garage' | 'garage_floor' | null;
      distanceFloorApplied?: boolean | null;
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
    serviceDistanceMiles?: number | null;
    pricingDistanceMiles?: number | null;
    pricingDurationMinutes?: number | null;
    garageDistanceMiles?: number | null;
    pricingDistanceSource?: 'driver' | 'garage' | 'garage_floor' | null;
    distanceFloorApplied?: boolean | null;
    fittingPrice?: number | null;
    tyrePrice?: number | null;
    totalPrice?: number | null;
    tyreLines?: BookingTyreLine[];
    adminAdjustmentAmount?: number | null;
    adminAdjustmentReason?: string | null;
    serviceOrigin?: AssistedChatQuoteBreakdown['serviceOrigin'];
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
  serviceType?: AssistedChatServiceType;
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

