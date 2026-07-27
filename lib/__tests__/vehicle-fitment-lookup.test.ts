import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveVehicleFitmentLookup } from '@/lib/vehicle-fitment-lookup';
import type {
  TyreFitmentOption,
  TyreFitmentResolution,
  Vehicle,
  VrmLookupResult,
} from '@/types/vehicle';
import type { ConfirmedFitmentStoreRecord } from '@/lib/vehicle-fitment-store';

const lookupVrmMock = vi.hoisted(() => vi.fn());
const loadLocalMock = vi.hoisted(() => vi.fn());
const resolveCatalogMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dvla', () => ({
  normalizeVrm: (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, ''),
  isValidVrm: (value: string) => /^[A-Z0-9]{2,8}$/.test(value.toUpperCase().replace(/[^A-Z0-9]+/g, '')),
  lookupVrm: lookupVrmMock,
}));

vi.mock('@/lib/vehicle-fitment-store', () => ({
  loadConfirmedVrmFitmentByRegistration: loadLocalMock,
  vehicleFromConfirmedFitmentRecord: (record: ConfirmedFitmentStoreRecord): Vehicle => ({
    registrationNumber: record.registrationNumber,
    make: record.make ?? 'UNKNOWN',
    model: record.model,
    yearOfManufacture: record.yearOfManufacture,
    fuelType:
      record.fuelType === 'PETROL' ||
      record.fuelType === 'DIESEL' ||
      record.fuelType === 'ELECTRIC' ||
      record.fuelType === 'HYBRID'
        ? record.fuelType
        : 'OTHER',
    colour: record.colour,
  }),
  vehicleIdentityConflictFields: (record: ConfirmedFitmentStoreRecord, vehicle: Vehicle): string[] => {
    const fields: string[] = [];
    if (record.make && vehicle.make && record.make !== vehicle.make) fields.push('make');
    if (
      record.yearOfManufacture != null &&
      vehicle.yearOfManufacture != null &&
      record.yearOfManufacture !== vehicle.yearOfManufacture
    ) {
      fields.push('yearOfManufacture');
    }
    if (record.fuelType && vehicle.fuelType && record.fuelType !== vehicle.fuelType) fields.push('fuelType');
    return fields;
  },
}));

vi.mock('@/lib/vehicle-tyre-catalog', () => ({
  optionsFromConfirmedFitmentRecord: (record: ConfirmedFitmentStoreRecord) =>
    record.options as unknown as TyreFitmentOption[],
  resolveTyreFitmentsByVrm: resolveCatalogMock,
}));

vi.mock('@/lib/vehicle-tyre-ai', () => ({
  assistTyreFitmentSelection: vi.fn(async (_vehicle: Vehicle, options: TyreFitmentOption[]) => {
    const recommended = options.find(
      (option) => option.source === 'local_vrm_catalog' && option.confidence === 'high',
    );
    return {
      provider: 'deterministic',
      recommendedOptionId: recommended?.id ?? null,
      summary: recommended ? 'Verified tyre fitment.' : 'No verified tyre fitment.',
      warnings: recommended ? [] : ['Confirm the tyre sidewall before booking.'],
    };
  }),
  isVerifiedTyreFitmentRecommendation: (option: TyreFitmentOption) =>
    option.source === 'local_vrm_catalog' && option.confidence === 'high',
}));

const focusVehicle: Vehicle = {
  registrationNumber: 'AB12CDE',
  make: 'FORD',
  model: 'FOCUS',
  yearOfManufacture: 2019,
  fuelType: 'PETROL',
  colour: 'BLUE',
};

const localOption: TyreFitmentOption = {
  id: 'local-vrm-205-55r16',
  label: 'Previously confirmed',
  front: {
    width: '205',
    aspect: '55',
    rim: '16',
    sizeDisplay: '205/55R16',
    source: 'local_vrm_catalog',
  },
  rear: {
    width: '205',
    aspect: '55',
    rim: '16',
    sizeDisplay: '205/55R16',
    source: 'local_vrm_catalog',
  },
  source: 'local_vrm_catalog',
  sourceLabel: 'Locally confirmed',
  confidence: 'high',
};

const catalogueOption: TyreFitmentOption = {
  ...localOption,
  id: 'catalogue-205-55r16',
  source: 'local_vehicle_catalog',
  sourceLabel: 'Tyre Rescue vehicle catalogue',
  confidence: 'medium',
  front: { ...localOption.front, source: 'local_vehicle_catalog' },
  rear: { ...localOption.rear, source: 'local_vehicle_catalog' },
};

function record(overrides: Partial<ConfirmedFitmentStoreRecord> = {}): ConfirmedFitmentStoreRecord {
  return {
    id: 'fitment-1',
    registrationNumber: 'AB12CDE',
    vehicleFingerprint: 'make=FORD|year=2019|fuel=PETROL',
    vehicleFingerprintPayload: {
      make: 'FORD',
      yearOfManufacture: 2019,
      fuelType: 'PETROL',
    },
    make: 'FORD',
    model: 'FOCUS',
    yearOfManufacture: 2019,
    fuelType: 'PETROL',
    colour: 'BLUE',
    options: [localOption as unknown as Record<string, unknown>],
    source: 'assisted_chat_sidewall',
    status: 'confirmed',
    reviewHistory: [],
    confirmedAt: new Date('2026-07-26T10:00:00Z'),
    ...overrides,
  };
}

function catalogResolution(options: TyreFitmentOption[]): TyreFitmentResolution {
  return {
    status: options.length ? 'local_catalog' : 'miss',
    provider: options.length ? 'local_vehicle_catalog' : null,
    options,
    messages: options.length
      ? ['No exact registration fitment was found.']
      : ['No local tyre fitment candidate was found.'],
  };
}

describe('resolveVehicleFitmentLookup', () => {
  beforeEach(() => {
    lookupVrmMock.mockReset();
    loadLocalMock.mockReset();
    resolveCatalogMock.mockReset();
    loadLocalMock.mockResolvedValue({ kind: 'missing', messages: [] });
    resolveCatalogMock.mockResolvedValue(catalogResolution([]));
  });

  it('returns a clear not-found state for DVLA 404 with no vehicle suggestions', async () => {
    lookupVrmMock.mockResolvedValue({
      ok: false,
      error: { code: 'not_found', message: 'No vehicle found.' },
    } satisfies VrmLookupResult);

    const result = await resolveVehicleFitmentLookup('nf12 abc');

    expect(result).toMatchObject({
      ok: false,
      status: 'dvla_not_found',
      requiresManualTyre: true,
      error: {
        code: 'not_found',
        message: 'Vehicle not found. Please check the registration number and try again.',
      },
    });
    expect(result.vehicle).toBeUndefined();
    expect(result.modelCandidates).toBeUndefined();
    expect(result.states).toEqual(['dvla_not_found', 'manual_tyre_required']);
  });

  it('returns catalogue candidates when DVLA resolves and no local VRM fitment exists', async () => {
    lookupVrmMock.mockResolvedValue({ ok: true, vehicle: focusVehicle } satisfies VrmLookupResult);
    resolveCatalogMock.mockResolvedValue(catalogResolution([catalogueOption]));

    const result = await resolveVehicleFitmentLookup('ab12 cde');

    expect(result).toMatchObject({
      status: 'catalogue_candidates',
      vehicleSource: 'dvla',
      requiresSidewallConfirmation: true,
      tyreSize: null,
      tyreOptions: [catalogueOption],
    });
    expect(loadLocalMock).toHaveBeenCalledWith('AB12CDE');
    expect(resolveCatalogMock).toHaveBeenCalledWith('AB12CDE', focusVehicle);
  });

  it('keeps a DVLA-resolved vehicle visible when the local tyre catalogue misses', async () => {
    lookupVrmMock.mockResolvedValue({ ok: true, vehicle: focusVehicle } satisfies VrmLookupResult);
    resolveCatalogMock.mockResolvedValue(catalogResolution([]));

    const result = await resolveVehicleFitmentLookup('ab12 cde');

    expect(result).toMatchObject({
      status: 'manual_tyre_required',
      vehicle: focusVehicle,
      vehicleSource: 'dvla',
      requiresManualTyre: true,
      tyreOptions: [],
    });
    expect(result.states).toEqual(['dvla_resolved', 'manual_tyre_required']);
  });

  it('does not use local confirmed vehicle data when DVLA returns 404', async () => {
    loadLocalMock.mockResolvedValue({
      kind: 'found',
      record: record(),
      messages: ['Found a previously sidewall-confirmed fitment for this registration.'],
    });
    lookupVrmMock.mockResolvedValue({
      ok: false,
      error: { code: 'not_found', message: 'No vehicle found.' },
    } satisfies VrmLookupResult);

    const result = await resolveVehicleFitmentLookup('ab12 cde');

    expect(result).toMatchObject({
      ok: false,
      status: 'dvla_not_found',
      error: {
        code: 'not_found',
        message: 'Vehicle not found. Please check the registration number and try again.',
      },
    });
    expect(result.vehicle).toBeUndefined();
    expect(result.localVehicle).toBeUndefined();
    expect(result.tyreOptions).toBeUndefined();
    expect(result.states).toEqual(['dvla_not_found', 'manual_tyre_required']);
  });

  it('returns manual recovery for malformed DVLA responses without a local record', async () => {
    lookupVrmMock.mockResolvedValue({
      ok: false,
      error: { code: 'malformed_response', message: 'DVLA returned malformed JSON.' },
    } satisfies VrmLookupResult);

    const result = await resolveVehicleFitmentLookup('ab12 cde');

    expect(result).toMatchObject({
      ok: false,
      status: 'dvla_unavailable',
      requiresManualTyre: true,
      error: {
        code: 'malformed_response',
        message: 'Unable to retrieve vehicle details. Please try again.',
      },
    });
    expect(result.vehicle).toBeUndefined();
    expect(result.states).toEqual(['dvla_unavailable', 'manual_tyre_required']);
  });

  it('reuses local confirmed fitments when DVLA identity still matches', async () => {
    loadLocalMock.mockResolvedValue({
      kind: 'found',
      record: record(),
      messages: ['Found a previously sidewall-confirmed fitment for this registration.'],
    });
    lookupVrmMock.mockResolvedValue({ ok: true, vehicle: focusVehicle } satisfies VrmLookupResult);

    const result = await resolveVehicleFitmentLookup('ab12 cde');

    expect(result).toMatchObject({
      status: 'locally_confirmed',
      vehicle: focusVehicle,
      vehicleSource: 'dvla',
      requiresSidewallConfirmation: true,
      tyreSize: { sizeDisplay: '205/55R16' },
    });
    expect(result.states).toContain('dvla_resolved');
    expect(result.states).toContain('locally_confirmed');
  });

  it('keeps the DVLA vehicle as the only vehicle when local confirmed data conflicts', async () => {
    loadLocalMock.mockResolvedValue({
      kind: 'found',
      record: record(),
      messages: ['Found a previously sidewall-confirmed fitment for this registration.'],
    });
    lookupVrmMock.mockResolvedValue({
      ok: true,
      vehicle: { ...focusVehicle, make: 'BMW', model: '3 SERIES', fuelType: 'DIESEL' },
    } satisfies VrmLookupResult);
    resolveCatalogMock.mockResolvedValue(catalogResolution([catalogueOption]));

    const result = await resolveVehicleFitmentLookup('ab12 cde');

    expect(result).toMatchObject({
      status: 'catalogue_candidates',
      vehicleSource: 'dvla',
      requiresSidewallConfirmation: true,
      tyreSize: null,
    });
    expect(result.identityConflict).toBeUndefined();
    expect(result.localVehicle).toBeUndefined();
    expect(result.vehicle).toMatchObject({ make: 'BMW', model: '3 SERIES', fuelType: 'DIESEL' });
    expect(result.tyreOptions?.[0].source).toBe('local_vehicle_catalog');
  });

  it('does not require model selection when DVLA has make/year but no model', async () => {
    lookupVrmMock.mockResolvedValue({
      ok: true,
      vehicle: {
        registrationNumber: 'HG18HFH',
        make: 'BMW',
        model: null,
        yearOfManufacture: 2018,
        fuelType: 'DIESEL',
        colour: 'BLUE',
      },
    } satisfies VrmLookupResult);
    resolveCatalogMock.mockResolvedValue(catalogResolution([catalogueOption, { ...catalogueOption, id: 'candidate-2' }]));

    const result = await resolveVehicleFitmentLookup('HG18HFH');

    expect(result).toMatchObject({
      status: 'multiple_fitments',
      requiresSidewallConfirmation: true,
      vehicle: {
        registrationNumber: 'HG18HFH',
        make: 'BMW',
        model: null,
      },
    });
    expect(result.requiresModelSelection).toBeUndefined();
    expect(result.modelCandidates).toBeUndefined();
    expect(result.states).toEqual(['dvla_resolved', 'multiple_fitments', 'sidewall_confirmation_required']);
  });

  it('keeps a no-model DVLA vehicle visible when one tyre candidate exists', async () => {
    lookupVrmMock.mockResolvedValue({
      ok: true,
      vehicle: {
        registrationNumber: 'HG18HFH',
        make: 'BMW',
        model: null,
        yearOfManufacture: 2018,
        fuelType: 'DIESEL',
        colour: 'BLUE',
      },
    } satisfies VrmLookupResult);
    resolveCatalogMock.mockResolvedValue(catalogResolution([catalogueOption]));

    const result = await resolveVehicleFitmentLookup('HG18HFH');

    expect(result).toMatchObject({
      status: 'catalogue_candidates',
      vehicleSource: 'dvla',
      vehicle: {
        registrationNumber: 'HG18HFH',
        make: 'BMW',
        model: null,
      },
    });
    expect(result.requiresModelSelection).toBeUndefined();
    expect(result.modelCandidates).toBeUndefined();
    expect(result.states).toEqual(['dvla_resolved', 'catalogue_candidates', 'sidewall_confirmation_required']);
  });
});
