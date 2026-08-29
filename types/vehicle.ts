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
  /** DVLA-returned first registration month, format "YYYY-MM". More reliable
   *  than yearOfManufacture for catalog lookups since UK catalog data is
   *  organised by registration year, not manufacture year. */
  monthOfFirstRegistration?: string | null;
  fuelType: FuelType;
  colour: string | null;
}

export interface TyreSize {
  width: string;   // e.g. "205"
  aspect: string;  // e.g. "55"
  rim: string;     // e.g. "16"
  /** Canonical display value when it came from a catalog, e.g. "205/55R16". */
  sizeDisplay?: string;
  loadIndex?: string;
  speedIndex?: string;
  runFlat?: boolean;
  xl?: boolean;
  commercial?: boolean;
  source?: TyreFitmentSource;
  /** True when a trusted source marks this as an OEM fitment for the vehicle. */
  oem?: boolean;
  /** True when the size is an unverified fallback suggestion. */
  fallback?: boolean;
}

export interface TyreFitmentLine {
  id?: string | null;
  size: TyreSize;
  quantity: number;
  axle?: string | null;
  loadIndex?: string | null;
  speedIndex?: string | null;
  runFlat?: boolean | null;
  xl?: boolean | null;
  commercial?: boolean | null;
}

export type VehicleCategory = 'city' | 'hatchback' | 'saloon' | 'suv' | 'van';

export type TyreFitmentSource =
  | 'local_vrm_catalog'
  | 'local_vehicle_catalog'
  | 'static_dataset'
  | 'assisted_chat_sidewall';

export type TyreFitmentConfidence = 'high' | 'medium' | 'low';

export interface TyreFitmentOption {
  id: string;
  label: string;
  front: TyreSize;
  rear: TyreSize;
  source: TyreFitmentSource;
  sourceLabel: string;
  confidence: TyreFitmentConfidence;
  oem?: boolean;
  optional?: boolean;
  staggered?: boolean;
  vehicleModel?: string;
  vehicleVariant?: string | null;
  fitmentRank?: number;
  notes?: string[];
  tyreLines?: TyreFitmentLine[];
}

export type TyreCatalogStatus = 'hit' | 'local_catalog' | 'miss' | 'not_configured' | 'error';

export interface TyreFitmentResolution {
  options: TyreFitmentOption[];
  status: TyreCatalogStatus;
  provider: string | null;
  messages: string[];
}

export interface TyreFitmentAssistance {
  provider: 'groq' | 'deterministic';
  recommendedOptionId: string | null;
  summary: string;
  warnings: string[];
}

export type VehicleFitmentLookupStatus =
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

export type VehicleDataSource = 'dvla' | 'locally_confirmed' | 'manual';

export interface VehicleModelCandidate {
  id: string;
  make: string;
  model: string;
  variants: string[];
  from: number;
  to: number;
  matchReason: string;
}

export interface VehicleIdentityConflict {
  registrationNumber: string;
  currentVehicle: Vehicle;
  previousVehicle: Vehicle;
  conflictFields: string[];
  message: string;
}

export interface VehicleFitmentLookupResponse {
  ok: boolean;
  status: VehicleFitmentLookupStatus;
  states: VehicleFitmentLookupStatus[];
  vehicle?: Vehicle;
  localVehicle?: Vehicle;
  vehicleSource?: VehicleDataSource;
  tyreSize?: TyreSize | null;
  tyreOptions?: TyreFitmentOption[];
  tyreAssistance?: TyreFitmentAssistance;
  tyreCatalogStatus?: TyreCatalogStatus;
  modelCandidates?: VehicleModelCandidate[];
  identityConflict?: VehicleIdentityConflict;
  requiresModelSelection?: boolean;
  requiresManualVehicle?: boolean;
  requiresManualTyre?: boolean;
  requiresSidewallConfirmation?: boolean;
  requiresIdentityConfirmation?: boolean;
  messages?: string[];
  error?: { code: VrmErrorCode | 'identity_conflict' | 'manual_required'; message: string };
}

export type VrmErrorCode =
  | 'invalid_format'
  | 'not_found'
  | 'rate_limited'
  | 'upstream_error'
  | 'malformed_response'
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
