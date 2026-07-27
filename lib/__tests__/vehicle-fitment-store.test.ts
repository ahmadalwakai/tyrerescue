import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDvlaVehicleFingerprint,
  saveConfirmedVrmFitmentRecord,
  VehicleFitmentIdentityConflictError,
} from '@/lib/vehicle-fitment-store';

const dbMock = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

function dbRow(overrides: Record<string, unknown> = {}) {
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
        front: { sizeDisplay: '205/55R16' },
        rear: { sizeDisplay: '205/55R16' },
      },
    ],
    source: 'assisted_chat_sidewall',
    status: 'confirmed',
    reviewHistory: [],
    confirmedBy: null,
    confirmedAt: new Date('2026-07-26T10:00:00Z'),
    createdAt: new Date('2026-07-26T10:00:00Z'),
    updatedAt: new Date('2026-07-26T10:00:00Z'),
    ...overrides,
  };
}

function createTransactionMock(rows: unknown[]) {
  const selectQuery = {
    from: vi.fn(() => selectQuery),
    where: vi.fn(() => selectQuery),
    limit: vi.fn(async () => rows),
  };
  const insertValues = vi.fn(async () => undefined);
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const tx = {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => selectQuery),
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => ({ set: updateSet })),
  };
  dbMock.transaction.mockImplementation(async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx));
  return { tx, insertValues, updateSet, updateWhere };
}

const vehicle = {
  registrationNumber: 'AB12CDE',
  make: 'FORD',
  model: 'FOCUS',
  yearOfManufacture: 2019,
  fuelType: 'PETROL' as const,
  colour: 'BLUE',
};

describe('buildDvlaVehicleFingerprint', () => {
  beforeEach(() => {
    dbMock.transaction.mockReset();
  });

  it('uses DVLA identity fields and deliberately excludes model', () => {
    const baseVehicle = {
      make: 'BMW',
      model: '1 SERIES',
      registrationNumber: 'HG18HFH',
      yearOfManufacture: 2018,
      fuelType: 'DIESEL',
      colour: 'BLUE',
    };
    const differentModelVehicle = {
      make: 'BMW',
      model: '3 SERIES',
      registrationNumber: 'HG18HFH',
      yearOfManufacture: 2018,
      fuelType: 'DIESEL',
      colour: 'BLUE',
    };
    const transferredPlateVehicle = {
      make: 'FORD',
      model: 'FOCUS',
      registrationNumber: 'HG18HFH',
      yearOfManufacture: 2018,
      fuelType: 'PETROL',
      colour: 'BLUE',
    };
    const base = buildDvlaVehicleFingerprint(baseVehicle);
    const differentModel = buildDvlaVehicleFingerprint(differentModelVehicle);
    const transferredPlate = buildDvlaVehicleFingerprint(transferredPlateVehicle);

    expect(base.value).toBe('make=BMW|year=2018|fuel=DIESEL');
    expect(base.payload).toMatchObject({ colour: 'BLUE' });
    expect(base.value).toBe(differentModel.value);
    expect(base.value).not.toBe(transferredPlate.value);
  });

  it('serializes confirmed fitment writes with a transaction-scoped registration lock', async () => {
    const { tx, insertValues } = createTransactionMock([]);

    const result = await saveConfirmedVrmFitmentRecord({
      registrationNumber: 'ab12 cde',
      vehicle,
      sizeDisplay: '205/55R16',
      confirmedAt: new Date('2026-07-26T12:00:00Z'),
      options: [
        {
          front: { sizeDisplay: '205/55R16' },
          rear: { sizeDisplay: '205/55R16' },
        },
      ],
    });

    expect(result).toMatchObject({ registrationNumber: 'AB12CDE', saved: true, optionCount: 1 });
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    const executeMock = tx.execute as unknown as { mock: { calls: unknown[][] } };
    const lockQueryJson = JSON.stringify(executeMock.mock.calls[0]?.[0]);
    expect(lockQueryJson).toContain('pg_advisory_xact_lock(hashtext(');
    expect(lockQueryJson).toContain('AB12CDE');
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ registrationNumber: 'AB12CDE' }));
  });

  it('treats duplicate same-vehicle confirmations as already known inside the locked transaction', async () => {
    const { tx, updateSet } = createTransactionMock([dbRow()]);

    const result = await saveConfirmedVrmFitmentRecord({
      registrationNumber: 'ab12 cde',
      vehicle,
      sizeDisplay: '205/55R16',
      confirmedAt: new Date('2026-07-26T12:00:00Z'),
      options: [
        {
          front: { sizeDisplay: '205/55R16' },
          rear: { sizeDisplay: '205/55R16' },
        },
      ],
    });

    expect(result).toMatchObject({ saved: false, optionCount: 1 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'confirmed',
        options: expect.arrayContaining([
          expect.objectContaining({ front: expect.objectContaining({ sizeDisplay: '205/55R16' }) }),
        ]),
      }),
    );
  });

  it('marks conflicting same-registration confirmations for review without overwriting fitments', async () => {
    const { tx, updateSet } = createTransactionMock([dbRow()]);

    await expect(
      saveConfirmedVrmFitmentRecord({
        registrationNumber: 'ab12 cde',
        vehicle: {
          ...vehicle,
          make: 'BMW',
          model: '1 SERIES',
          fuelType: 'DIESEL',
        },
        sizeDisplay: '225/45R18',
        confirmedAt: new Date('2026-07-26T12:00:00Z'),
        options: [
          {
            front: { sizeDisplay: '225/45R18' },
            rear: { sizeDisplay: '225/45R18' },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(VehicleFitmentIdentityConflictError);

    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'conflict_review',
        reviewHistory: expect.arrayContaining([
          expect.objectContaining({ action: 'vehicle_fingerprint_changed' }),
        ]),
      }),
    );
  });
});
