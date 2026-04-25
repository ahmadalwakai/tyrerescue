/**
 * Vehicle / VRM lookup / instant-quote types — shared by server, API
 * routes and client components.
 */

export type FuelType = 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'OTHER';

export interface Vehicle {
  registrationNumber: string;
  make: string;
  model: string | null;
  yearOfManufacture: number | null;
  fuelType: FuelType;
  colour: string | null;
}

export interface TyreSize {
  width: string;   // e.g. "205"
  aspect: string;  // e.g. "55"
  rim: string;     // e.g. "16"
  /** True when this is the canonical OEM fitment for the vehicle. */
  oem?: boolean;
  /** True when the size could not be matched and a category fallback was used. */
  fallback?: boolean;
}

export type VehicleCategory = 'city' | 'hatchback' | 'saloon' | 'suv' | 'van';

export type VrmErrorCode =
  | 'invalid_format'
  | 'not_found'
  | 'rate_limited'
  | 'upstream_error'
  | 'network'
  | 'disabled'
  | 'unknown';

export interface VrmError {
  code: VrmErrorCode;
  message: string;
}

export type VrmLookupResult =
  | { ok: true; vehicle: Vehicle }
  | { ok: false; error: VrmError };

export type QuoteServiceKey = 'fitting' | 'emergency' | 'punctureRepair';

export interface QuoteRequest {
  tyreSize: TyreSize;
  service: QuoteServiceKey;
  quantity: number;
}

export interface QuoteBreakdownLine {
  label: string;
  amount: number;
}

export interface QuoteResult {
  service: QuoteServiceKey;
  quantity: number;
  tyreSize: TyreSize;
  /** Lower bound of the all-in quote in GBP (incl. fitting + budget tyres). */
  from: number;
  /** Upper bound of the all-in quote in GBP (incl. fitting + premium tyres). */
  to: number;
  /** Per-tyre fitting / callout fee component, before quantity. */
  fittingFee: number;
  currency: 'GBP';
  breakdown: QuoteBreakdownLine[];
  notes: string[];
  /** Time-of-day / demand surcharge applied to the totals, if any. */
  surcharge?: {
    label: string;
    /** Multiplier applied on top of the base totals (e.g. 1.15 = +15%). */
    multiplier: number;
    /** Cash uplift on the lower bound (`from`) in GBP. */
    amount: number;
  };
}
