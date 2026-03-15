/**
 * Booking Wizard Types
 * 
 * Shared type definitions for the booking wizard components.
 */

import type { PricingBreakdown } from '@/lib/pricing-engine';

export type { PricingBreakdown };

export type BookingType = 'emergency' | 'scheduled';
export type ServiceType = 'repair' | 'fit' | 'both' | 'assess';

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
}

export interface WizardState {
  // Step 1: Service Type
  bookingType: BookingType | null;
  
  // Step 2: Location
  address: string;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
  
  // Step 3: Tyre Details
  vehicleReg: string;
  vehicleMake: string;
  vehicleModel: string;
  tyreSize: TyreSize;
  conditionAssessment: 'repair' | 'replacement' | 'not_sure' | null;
  tyrePhotoUrl: string | null;
  lockingNutStatus: 'has_key' | 'no_key' | 'standard' | null;
  
  // Step 4: Tyre Selection (cart)
  selectedTyres: SelectedTyre[];
  serviceType: ServiceType | null;
  
  // Step 5: Schedule (for scheduled bookings)
  scheduledDate: string | null;
  scheduledTime: string | null;
  slotId: string | null;
  
  // Step 6: Pricing
  quoteId: string | null;
  breakdown: PricingBreakdown | null;
  quoteExpiresAt: string | null;
  
  // Step 7: Customer Details
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  createAccount: boolean;
  
  // Step 8: Payment
  bookingId: string | null;
  refNumber: string | null;
  stripeClientSecret: string | null;
}

export const initialWizardState: WizardState = {
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
  selectedTyres: [],
  serviceType: null,
  scheduledDate: null,
  scheduledTime: null,
  slotId: null,
  quoteId: null,
  breakdown: null,
  quoteExpiresAt: null,
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  createAccount: false,
  bookingId: null,
  refNumber: null,
  stripeClientSecret: null,
};

// ── Cart helpers ──

export function addToCart(
  cart: SelectedTyre[],
  tyre: Omit<SelectedTyre, 'quantity'>,
  qty = 1,
): SelectedTyre[] {
  const existing = cart.find((t) => t.tyreId === tyre.tyreId);
  if (existing) {
    return cart.map((t) =>
      t.tyreId === tyre.tyreId
        ? { ...t, quantity: Math.min(t.quantity + qty, 4) }
        : t,
    );
  }
  const totalItems = cart.reduce((s, t) => s + t.quantity, 0);
  if (totalItems + qty > 4) return cart;
  return [...cart, { ...tyre, quantity: qty }];
}

export function removeFromCart(cart: SelectedTyre[], tyreId: string): SelectedTyre[] {
  return cart.filter((t) => t.tyreId !== tyreId);
}

export function updateCartQuantity(
  cart: SelectedTyre[],
  tyreId: string,
  quantity: number,
): SelectedTyre[] {
  if (quantity <= 0) return removeFromCart(cart, tyreId);
  const otherTotal = cart
    .filter((t) => t.tyreId !== tyreId)
    .reduce((s, t) => s + t.quantity, 0);
  const clamped = Math.min(quantity, 4 - otherTotal);
  if (clamped <= 0) return cart;
  return cart.map((t) => (t.tyreId === tyreId ? { ...t, quantity: clamped } : t));
}

export function cartTotal(cart: SelectedTyre[]): number {
  return cart.reduce((sum, t) => sum + t.unitPrice * t.quantity, 0);
}

export function cartItemCount(cart: SelectedTyre[]): number {
  return cart.reduce((sum, t) => sum + t.quantity, 0);
}

export type WizardStep = 
  | 'service-type'
  | 'location'
  | 'tyre-details'
  | 'tyre-selection'
  | 'schedule'
  | 'pricing'
  | 'customer-details'
  | 'payment';

export interface StepConfig {
  key: WizardStep;
  number: number;
  name: string;
  isOptional?: boolean;
}

export const WIZARD_STEPS: StepConfig[] = [
  { key: 'service-type', number: 1, name: 'Service Type' },
  { key: 'location', number: 2, name: 'Location' },
  { key: 'tyre-details', number: 3, name: 'Tyre Details' },
  { key: 'tyre-selection', number: 4, name: 'Select Tyres' },
  { key: 'schedule', number: 5, name: 'Schedule', isOptional: true },
  { key: 'pricing', number: 6, name: 'Quote' },
  { key: 'customer-details', number: 7, name: 'Your Details' },
  { key: 'payment', number: 8, name: 'Payment' },
];

export function getStepsForBookingType(
  bookingType: BookingType | null,
  serviceType?: ServiceType | null,
): StepConfig[] {
  let steps = WIZARD_STEPS as StepConfig[];

  if (bookingType === 'emergency') {
    // Skip schedule step for emergency bookings
    steps = steps.filter(step => step.key !== 'schedule');
  }

  if (serviceType === 'repair') {
    // Skip tyre selection for repair — no product to pick
    steps = steps.filter(step => step.key !== 'tyre-selection');
  }

  // Re-number steps sequentially
  return steps.map((step, index) => ({
    ...step,
    number: index + 1,
  }));
}
