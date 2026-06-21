export type BookingType = 'emergency' | 'scheduled';
export type ServiceType = 'repair' | 'fit' | 'both' | 'assess';
export type FittingLocation = 'shop' | 'mobile';
export type ConditionAssessment = 'repair' | 'replacement' | 'not_sure';
export type LockingNutStatus = 'has_key' | 'no_key' | 'standard';

export interface TyreSize {
  width: string;
  aspect: string;
  rim: string;
}

export interface SelectedTyre {
  tyreId: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  quantity: number;
  unitPrice: number;
  service: 'fit' | 'repair' | 'assess';
  requiresTpms?: boolean;
  isPreOrder?: boolean;
  orderConfirmed?: boolean;
}

export interface PricingLineItem {
  type: string;
  label: string;
  amount: number;
}

export interface PricingBreakdown {
  subtotal: number;
  vatAmount: number;
  total: number;
  totalPrice?: number;
  tyrePrice?: number;
  fittingPrice?: number;
  lineItems?: PricingLineItem[];
  isValid?: boolean;
  error?: string | null;
}

export interface BookingState {
  bookingType: BookingType | null;
  address: string;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
  vehicleReg: string;
  vehicleMake: string;
  vehicleModel: string;
  tyreSize: TyreSize;
  conditionAssessment: ConditionAssessment | null;
  tyrePhotoUrl: string | null;
  lockingNutStatus: LockingNutStatus;
  quantity: number;
  selectedTyres: SelectedTyre[];
  serviceType: ServiceType | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  slotId: string | null;
  fittingLocation: FittingLocation | null;
  fulfillmentOption: 'delivery' | 'fitting' | null;
  quoteId: string | null;
  breakdown: PricingBreakdown | null;
  quoteExpiresAt: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  emergencyEtaLabel: string | null;
  nearestDriverName: string | null;
  bookingId: string | null;
  refNumber: string | null;
  stripeClientSecret: string | null;
  invoiceDownloadToken: string | null;
}

export type WizardStep =
  | 'service'
  | 'location'
  | 'eligibility'
  | 'details'
  | 'tyres'
  | 'schedule'
  | 'quote'
  | 'customer'
  | 'payment'
  | 'done';

export interface TyreProduct {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  tier: string;
  speedRating: string | null;
  loadIndex: number | null;
  wetGrip: string | null;
  fuelEfficiency: string | null;
  priceNew: number | null;
  stockNew: number;
  isLocalStock: boolean | null;
  availableNew: boolean;
  isOrderOnly: boolean;
  orderType: 'immediate' | 'special_order';
  leadTimeLabel: string | null;
}

export interface TimeSlot {
  slotId: string;
  date: string;
  time: string;
  label: string;
  timeStart: string;
  timeEnd: string;
  available: boolean;
  spotsLeft: number;
}

export interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

export const initialBookingState: BookingState = {
  bookingType: null,
  address: '',
  lat: null,
  lng: null,
  distanceMiles: null,
  vehicleReg: '',
  vehicleMake: '',
  vehicleModel: '',
  tyreSize: { width: '', aspect: '', rim: '' },
  conditionAssessment: null,
  tyrePhotoUrl: null,
  lockingNutStatus: 'standard',
  quantity: 1,
  selectedTyres: [],
  serviceType: null,
  scheduledDate: null,
  scheduledTime: null,
  slotId: null,
  fittingLocation: null,
  fulfillmentOption: null,
  quoteId: null,
  breakdown: null,
  quoteExpiresAt: null,
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  emergencyEtaLabel: null,
  nearestDriverName: null,
  bookingId: null,
  refNumber: null,
  stripeClientSecret: null,
  invoiceDownloadToken: null,
};

export function getSteps(bookingType: BookingType | null, serviceType?: ServiceType | null): WizardStep[] {
  const emergency: WizardStep[] = [
    'service',
    'location',
    'eligibility',
    'details',
    'tyres',
    'quote',
    'customer',
    'payment',
  ];
  const scheduled: WizardStep[] = [
    'service',
    'location',
    'details',
    'tyres',
    'schedule',
    'quote',
    'customer',
    'payment',
  ];
  const base = bookingType === 'emergency' ? emergency : scheduled;
  return serviceType === 'repair' ? base.filter((step) => step !== 'tyres') : base;
}

export function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(1, Math.trunc(value)));
}

export function formatPrice(amount: number | null | undefined) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(amount || 0));
}

export function tyreSizeDisplay(size: TyreSize) {
  if (!size.width || !size.aspect || !size.rim) return '';
  return `${size.width}/${size.aspect}/R${size.rim}`;
}
