import 'server-only';

import { isValidVrm, lookupVrm, normalizeVrm } from '@/lib/dvla';
import {
  assistTyreFitmentSelection,
  isVerifiedTyreFitmentRecommendation,
} from '@/lib/vehicle-tyre-ai';
import {
  optionsFromConfirmedFitmentRecord,
  resolveTyreFitmentsByVrm,
} from '@/lib/vehicle-tyre-catalog';
import {
  loadConfirmedVrmFitmentByRegistration,
  vehicleIdentityConflictFields,
} from '@/lib/vehicle-fitment-store';
import type {
  TyreFitmentAssistance,
  TyreFitmentOption,
  TyreFitmentResolution,
  Vehicle,
  VehicleFitmentLookupResponse,
  VehicleFitmentLookupStatus,
} from '@/types/vehicle';

function fitmentResolutionFromOptions(
  options: TyreFitmentOption[],
  provider: string | null,
  messages: string[],
): TyreFitmentResolution {
  return {
    options,
    provider,
    status: options.length > 0 ? 'local_catalog' : 'miss',
    messages,
  };
}

async function buildAssistance(
  vehicle: Vehicle,
  resolution: TyreFitmentResolution,
): Promise<{ assistance: TyreFitmentAssistance; tyreSize: VehicleFitmentLookupResponse['tyreSize'] }> {
  const assistance = await assistTyreFitmentSelection(vehicle, resolution.options, resolution);
  const recommended = assistance.recommendedOptionId
    ? resolution.options.find(
        (option) =>
          option.id === assistance.recommendedOptionId &&
          isVerifiedTyreFitmentRecommendation(option),
      ) ?? null
    : null;
  return { assistance, tyreSize: recommended?.front ?? null };
}

function uniqueStates(states: VehicleFitmentLookupStatus[]): VehicleFitmentLookupStatus[] {
  return [...new Set(states)];
}

function response(args: Omit<VehicleFitmentLookupResponse, 'ok' | 'states'> & {
  ok?: boolean;
  states?: VehicleFitmentLookupStatus[];
}): VehicleFitmentLookupResponse {
  return {
    ok: args.ok ?? true,
    ...args,
    states: uniqueStates(args.states ?? [args.status]),
  };
}

function statusForCatalog(options: TyreFitmentOption[]): { status: VehicleFitmentLookupStatus; states: VehicleFitmentLookupStatus[] } {
  const states: VehicleFitmentLookupStatus[] = ['dvla_resolved'];
  if (options.length === 0) {
    states.push('manual_tyre_required');
    return { status: 'manual_tyre_required', states };
  }
  const status = options.length > 1 ? 'multiple_fitments' : 'catalogue_candidates';
  states.push(status, 'sidewall_confirmation_required');
  return { status, states };
}

export async function resolveVehicleFitmentLookup(
  registrationNumber: string,
): Promise<VehicleFitmentLookupResponse> {
  const vrm = normalizeVrm(registrationNumber);
  if (!isValidVrm(vrm)) {
    return response({
      ok: false,
      status: 'dvla_not_found',
      states: ['dvla_not_found'],
      requiresManualTyre: true,
      error: { code: 'invalid_format', message: 'That does not look like a UK number plate.' },
      messages: ['Vehicle not found. Please check the registration number and try again.'],
    });
  }

  const local = await loadConfirmedVrmFitmentByRegistration(vrm);
  const localRecord = local.kind === 'found' ? local.record : null;
  const localOptions = localRecord ? optionsFromConfirmedFitmentRecord(localRecord) : [];

  const dvla = await lookupVrm(vrm);
  if (!dvla.ok) {
    const notFound = dvla.error.code === 'not_found';
    const message = notFound
      ? 'Vehicle not found. Please check the registration number and try again.'
      : 'Unable to retrieve vehicle details. Please try again.';
    return response({
      ok: false,
      status: notFound ? 'dvla_not_found' : 'dvla_unavailable',
      states: [notFound ? 'dvla_not_found' : 'dvla_unavailable', 'manual_tyre_required'],
      requiresManualTyre: true,
      messages: [message],
      error: { code: dvla.error.code, message },
    });
  }

  const vehicle = dvla.vehicle;

  if (localRecord && !vehicleIdentityConflictFields(localRecord, vehicle).length) {
    const resolution = fitmentResolutionFromOptions(
      localOptions,
      'vehicle_tyre_fitments',
      local.messages,
    );
    const { assistance, tyreSize } = await buildAssistance(vehicle, resolution);
    return response({
      status: 'locally_confirmed',
      states: ['dvla_resolved', 'locally_confirmed', 'sidewall_confirmation_required'],
      vehicle,
      vehicleSource: 'dvla',
      tyreSize,
      tyreOptions: localOptions,
      tyreAssistance: assistance,
      tyreCatalogStatus: resolution.status,
      requiresSidewallConfirmation: true,
      messages: resolution.messages,
    });
  }

  if (localRecord) {
    const resolution = await resolveTyreFitmentsByVrm(vrm, vehicle);
    const { assistance, tyreSize } = await buildAssistance(vehicle, resolution);
    const catalogState = statusForCatalog(resolution.options);
    return response({
      status: catalogState.status,
      states: catalogState.states,
      vehicle,
      vehicleSource: 'dvla',
      tyreSize,
      tyreOptions: resolution.options,
      tyreAssistance: assistance,
      tyreCatalogStatus: resolution.status,
      requiresManualTyre: resolution.options.length === 0,
      requiresSidewallConfirmation: resolution.options.length > 0,
      messages: resolution.messages,
    });
  }

  const resolution = await resolveTyreFitmentsByVrm(vrm, vehicle);
  const { assistance, tyreSize } = await buildAssistance(vehicle, resolution);
  const catalogState = statusForCatalog(resolution.options);

  return response({
    status: catalogState.status,
    states: catalogState.states,
    vehicle,
    vehicleSource: 'dvla',
    tyreSize,
    tyreOptions: resolution.options,
    tyreAssistance: assistance,
    tyreCatalogStatus: resolution.status,
    requiresManualTyre: resolution.options.length === 0,
    requiresSidewallConfirmation: resolution.options.length > 0,
    messages: resolution.messages,
  });
}
