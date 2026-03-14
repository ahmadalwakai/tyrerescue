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
  quantity: number;
  conditionAssessment: 'repair' | 'replacement' | 'not_sure' | null;
  tyrePhotoUrl: string | null;
  lockingNutStatus: 'has_key' | 'no_key' | 'standard' | null;
  
  // Step 4: Tyre Selection
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
  quantity: 1,
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

export function getStepsForBookingType(bookingType: BookingType | null): StepConfig[] {
  if (bookingType === 'emergency') {
    // Skip schedule step for emergency bookings
    return WIZARD_STEPS.filter(step => step.key !== 'schedule').map((step, index) => ({
      ...step,
      number: index + 1,
    }));
  }
  return WIZARD_STEPS;
}
