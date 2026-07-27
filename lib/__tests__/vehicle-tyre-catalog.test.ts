import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseTyreSizeText,
  resolveTyreFitmentsByVrm,
} from '@/lib/vehicle-tyre-catalog';
import type { ConfirmedFitmentStoreRecord } from '@/lib/vehicle-fitment-store';
import type { Vehicle } from '@/types/vehicle';

const loadConfirmedVrmFitmentMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/vehicle-fitment-store', () => ({
  buildDvlaVehicleFingerprint: (vehicle: {
    make?: string | null;
    yearOfManufacture?: number | null;
    fuelType?: string | null;
    colour?: string | null;
  }) => ({
    value: [
      `make=${vehicle.make?.toUpperCase() ?? ''}`,
      `year=${vehicle.yearOfManufacture ?? ''}`,
      `fuel=${vehicle.fuelType?.toUpperCase() ?? ''}`,
    ].join('|'),
    payload: {
      make: vehicle.make?.toUpperCase() ?? null,
      yearOfManufacture: vehicle.yearOfManufacture ?? null,
      fuelType: vehicle.fuelType?.toUpperCase() ?? null,
      colour: vehicle.colour?.toUpperCase() ?? null,
    },
  }),
  loadConfirmedVrmFitment: loadConfirmedVrmFitmentMock,
}));

const focusVehicle: Vehicle = {
  registrationNumber: 'AB12CDE',
  make: 'FORD',
  model: 'FOCUS',
  yearOfManufacture: 2019,
  fuelType: 'PETROL',
  colour: 'BLUE',
};

function confirmedRecord(overrides: Partial<ConfirmedFitmentStoreRecord> = {}): ConfirmedFitmentStoreRecord {
  return {
    id: 'fitment-1',
    registrationNumber: 'AB12CDE',
    vehicleFingerprint: 'make=FORD|year=2019|fuel=PETROL',
    vehicleFingerprintPayload: {
      make: 'FORD',
      yearOfManufacture: 2019,
      fuelType: 'PETROL',
      colour: 'BLUE',
    },
    make: 'FORD',
    model: 'FOCUS',
    yearOfManufacture: 2019,
    fuelType: 'PETROL',
    colour: 'BLUE',
    options: [
      {
        label: 'Sidewall confirmed in Assisted Chat',
        front: { sizeDisplay: '205/55R16' },
        rear: { sizeDisplay: '205/55R16' },
        confidence: 'high',
        tyreLines: [
          { id: 'tyre-1', size: '205/55R16', quantity: 1, axle: 'front' },
          { id: 'tyre-2', size: '225/45R17', quantity: 1, axle: 'rear' },
          { id: 'tyre-3', size: '205/55R16', quantity: 1, axle: 'spare' },
        ],
      },
    ],
    source: 'assisted_chat_sidewall',
    status: 'confirmed',
    reviewHistory: [],
    confirmedAt: new Date('2026-07-26T10:00:00Z'),
    ...overrides,
  };
}

function optionSizeKey(option: { front: { sizeDisplay?: string }; rear: { sizeDisplay?: string } }): string {
  return `${option.front.sizeDisplay}|${option.rear.sizeDisplay}`;
}

describe('parseTyreSizeText', () => {
  it('normalizes common catalog tyre size formats', () => {
    expect(parseTyreSizeText('225/45R17')?.sizeDisplay).toBe('225/45R17');
    expect(parseTyreSizeText('225/40 ZR18')?.sizeDisplay).toBe('225/40R18');
    expect(parseTyreSizeText('215/65/R16C')?.sizeDisplay).toBe('215/65R16C');
  });

  it('rejects values outside sensible tyre ranges', () => {
    expect(parseTyreSizeText('050/45R17')).toBeNull();
    expect(parseTyreSizeText('225/45R99')).toBeNull();
  });
});

describe('resolveTyreFitmentsByVrm', () => {
  beforeEach(() => {
    loadConfirmedVrmFitmentMock.mockResolvedValue({ kind: 'missing', messages: [] });
  });

  it('returns high-confidence local confirmed registration fitments first', async () => {
    loadConfirmedVrmFitmentMock.mockResolvedValueOnce({
      kind: 'match',
      record: confirmedRecord(),
      messages: ['Matched a previously sidewall-confirmed fitment for this DVLA vehicle fingerprint.'],
    });

    const result = await resolveTyreFitmentsByVrm('ab12 cde', focusVehicle);

    expect(result).toMatchObject({
      status: 'local_catalog',
      provider: 'vehicle_tyre_fitments',
    });
    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({
      source: 'local_vrm_catalog',
      sourceLabel: 'Locally confirmed',
      confidence: 'high',
      front: { sizeDisplay: '205/55R16' },
      rear: { sizeDisplay: '225/45R17' },
      staggered: true,
    });
    expect(result.options[0].tyreLines).toEqual([
      expect.objectContaining({ id: 'tyre-1', size: expect.objectContaining({ sizeDisplay: '205/55R16' }), axle: 'front' }),
      expect.objectContaining({ id: 'tyre-2', size: expect.objectContaining({ sizeDisplay: '225/45R17' }), axle: 'rear' }),
      expect.objectContaining({ id: 'tyre-3', size: expect.objectContaining({ sizeDisplay: '205/55R16' }), axle: 'spare' }),
    ]);
    expect(result.options[0].notes?.join(' ')).toMatch(/more than two tyre lines/i);
  });

  it('returns ranked local catalogue candidates without marking them verified', async () => {
    const result = await resolveTyreFitmentsByVrm('AB12CDE', focusVehicle);

    expect(result.status).toBe('local_catalog');
    expect(result.provider).toBe('local_vehicle_catalog');
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.options[0]).toMatchObject({
      source: 'local_vehicle_catalog',
      sourceLabel: 'Tyre Rescue vehicle catalogue',
      confidence: 'medium',
    });
    expect(result.options[0].notes?.join(' ')).toMatch(/Confirm the exact variant and tyre sidewall/i);
    expect(result.messages.join(' ')).toMatch(/No exact registration fitment was found/i);
  });

  it('surfaces multiple make-level model candidates when DVLA does not provide a model', async () => {
    const result = await resolveTyreFitmentsByVrm('HG18HFH', {
      registrationNumber: 'HG18HFH',
      make: 'BMW',
      model: null,
      yearOfManufacture: 2018,
      fuelType: 'DIESEL',
      colour: 'BLUE',
    });

    expect(result.status).toBe('local_catalog');
    expect(result.options.length).toBeGreaterThan(1);
    expect(result.options[0].notes?.join(' ')).toMatch(/DVLA did not provide the model/i);
    expect(new Set(result.options.map(optionSizeKey)).size).toBe(result.options.length);
  });

  it('requires manual sidewall entry when no local candidate exists', async () => {
    const result = await resolveTyreFitmentsByVrm('ZZ99ZZZ', {
      registrationNumber: 'ZZ99ZZZ',
      make: 'MADEUP',
      model: 'NOTAREALMODEL',
      yearOfManufacture: 2019,
      fuelType: 'PETROL',
      colour: 'BLUE',
    });

    expect(result).toMatchObject({
      status: 'miss',
      provider: null,
      options: [],
    });
    expect(result.messages.join(' ')).toMatch(/Enter the tyre size from the sidewall manually/i);
  });
});
