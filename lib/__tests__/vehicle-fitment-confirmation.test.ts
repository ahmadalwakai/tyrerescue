import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveConfirmedVrmFitment } from '@/lib/vehicle-fitment-confirmation';
import { saveConfirmedVrmFitmentRecord } from '@/lib/vehicle-fitment-store';

vi.mock('@/lib/vehicle-fitment-store', () => ({
  saveConfirmedVrmFitmentRecord: vi.fn(async (input: { registrationNumber: string; sizeDisplay: string; options: unknown[] }) => ({
    registrationNumber: input.registrationNumber,
    saved: true,
    optionCount: input.options.length,
    sizeDisplay: input.sizeDisplay,
    vehicleFingerprint: 'make=BMW|year=2018|fuel=DIESEL|colour=BLUE',
  })),
}));

const mockedSave = vi.mocked(saveConfirmedVrmFitmentRecord);

describe('saveConfirmedVrmFitment', () => {
  beforeEach(() => {
    mockedSave.mockClear();
  });

  it('normalizes and sends sidewall-confirmed registration fitments to the DB store', async () => {
    const result = await saveConfirmedVrmFitment({
      registrationNumber: 'hg18 hfh',
      vehicle: {
        registrationNumber: 'HG18HFH',
        make: 'BMW',
        model: '1 SERIES',
        yearOfManufacture: 2018,
        fuelType: 'DIESEL',
        colour: 'BLUE',
      },
      tyreSizes: ['225/45R18'],
      confirmedAt: new Date('2026-07-26T10:00:00Z'),
      confirmedByUserId: 'admin-1',
    });

    expect(result).toMatchObject({
      registrationNumber: 'HG18HFH',
      saved: true,
      sizeDisplay: '225/45R18',
    });
    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationNumber: 'HG18HFH',
        sizeDisplay: '225/45R18',
        confirmedByUserId: 'admin-1',
        options: [
          expect.objectContaining({
            front: expect.objectContaining({ sizeDisplay: '225/45R18' }),
            rear: expect.objectContaining({ sizeDisplay: '225/45R18' }),
            confidence: 'high',
          }),
        ],
      }),
    );
  });

  it('persists multiple confirmed tyre lines with quantities', async () => {
    const result = await saveConfirmedVrmFitment({
      registrationNumber: 'hg18 hfh',
      vehicle: {
        registrationNumber: 'HG18HFH',
        make: 'BMW',
        model: '1 SERIES',
        yearOfManufacture: 2018,
        fuelType: 'DIESEL',
        colour: 'BLUE',
      },
      tyreLines: [
        { size: '225/45R18', quantity: 2, axle: 'front', loadIndex: '95', speedIndex: 'Y', xl: true },
        { size: '255/35R18', quantity: 2, axle: 'rear', runFlat: true },
      ],
      confirmedAt: new Date('2026-07-26T10:00:00Z'),
      confirmedByUserId: 'admin-1',
    });

    expect(result.sizeDisplay).toBe('Front 225/45R18 / Rear 255/35R18');
    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sizeDisplay: 'Front 225/45R18 / Rear 255/35R18',
        options: [
          expect.objectContaining({
            oem: false,
            source: 'assisted_chat_sidewall',
            front: expect.objectContaining({ sizeDisplay: '225/45R18' }),
            rear: expect.objectContaining({ sizeDisplay: '255/35R18' }),
            tyreLines: [
              {
                id: 'tyre-1',
                size: '225/45R18',
                quantity: 2,
                axle: 'front',
                loadIndex: '95',
                speedIndex: 'Y',
                runFlat: null,
                xl: true,
                commercial: false,
              },
              {
                id: 'tyre-2',
                size: '255/35R18',
                quantity: 2,
                axle: 'rear',
                loadIndex: null,
                speedIndex: null,
                runFlat: true,
                xl: null,
                commercial: false,
              },
            ],
          }),
        ],
      }),
    );
  });
});
