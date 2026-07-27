import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assistTyreFitmentSelection,
  isVerifiedTyreFitmentRecommendation,
} from '@/lib/vehicle-tyre-ai';
import type { TyreFitmentOption, TyreFitmentResolution, Vehicle } from '@/types/vehicle';

const askGroqStructuredMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/groq', () => ({
  askGroqStructured: askGroqStructuredMock,
}));

const vehicle: Vehicle = {
  registrationNumber: 'AB12CDE',
  make: 'FORD',
  model: 'FOCUS',
  yearOfManufacture: 2019,
  fuelType: 'PETROL',
  colour: 'BLUE',
};

const localSuggestionOption: TyreFitmentOption = {
  id: 'local-suggestion-195-65r15',
  label: 'FOCUS catalogue candidate',
  front: {
    width: '195',
    aspect: '65',
    rim: '15',
    sizeDisplay: '195/65R15',
    source: 'local_vehicle_catalog',
    oem: true,
  },
  rear: {
    width: '195',
    aspect: '65',
    rim: '15',
    sizeDisplay: '195/65R15',
    source: 'local_vehicle_catalog',
    oem: true,
  },
  source: 'local_vehicle_catalog',
  sourceLabel: 'Tyre Rescue vehicle catalog',
  confidence: 'medium',
  oem: true,
  staggered: false,
  notes: ['Confirm the exact variant and tyre sidewall before booking.'],
};

const confirmedOption: TyreFitmentOption = {
  id: 'confirmed-vrm-205-55r16',
  label: 'Previously confirmed for this registration',
  front: {
    width: '205',
    aspect: '55',
    rim: '16',
    sizeDisplay: '205/55R16',
    source: 'local_vrm_catalog',
    oem: true,
  },
  rear: {
    width: '205',
    aspect: '55',
    rim: '16',
    sizeDisplay: '205/55R16',
    source: 'local_vrm_catalog',
    oem: true,
  },
  source: 'local_vrm_catalog',
  sourceLabel: 'Tyre Rescue confirmed bookings',
  confidence: 'high',
  oem: true,
  staggered: false,
};

const localCandidateOption: TyreFitmentOption = {
  id: 'local-candidate-225-45r18',
  label: '3 SERIES catalogue candidate',
  front: {
    width: '225',
    aspect: '45',
    rim: '18',
    sizeDisplay: '225/45R18',
    source: 'local_vehicle_catalog',
    oem: true,
  },
  rear: {
    width: '225',
    aspect: '45',
    rim: '18',
    sizeDisplay: '225/45R18',
    source: 'local_vehicle_catalog',
    oem: true,
  },
  source: 'local_vehicle_catalog',
  sourceLabel: 'Tyre Rescue vehicle catalog',
  confidence: 'medium',
  oem: true,
  staggered: false,
};

const previousGroqKey = process.env.GROQ_API_KEY;

beforeEach(() => {
  delete process.env.GROQ_API_KEY;
  askGroqStructuredMock.mockReset();
});

afterEach(() => {
  if (previousGroqKey === undefined) {
    delete process.env.GROQ_API_KEY;
  } else {
    process.env.GROQ_API_KEY = previousGroqKey;
  }
});

describe('assistTyreFitmentSelection', () => {
  it('does not recommend local catalogue suggestions until sidewall confirmation', async () => {
    const resolution: TyreFitmentResolution = {
      options: [localSuggestionOption],
      status: 'local_catalog',
      provider: 'local_vehicle_catalog',
      messages: [],
    };

    const assistance = await assistTyreFitmentSelection(vehicle, [localSuggestionOption], resolution);

    expect(isVerifiedTyreFitmentRecommendation(localSuggestionOption)).toBe(false);
    expect(assistance.recommendedOptionId).toBeNull();
    expect(assistance.summary).toMatch(/no verified/i);
    expect(assistance.warnings.join(' ')).toMatch(/sidewall|door placard/i);
  });

  it('recommends high-confidence exact registration fitments', async () => {
    const resolution: TyreFitmentResolution = {
      options: [confirmedOption],
      status: 'local_catalog',
      provider: 'confirmed_vrm_history',
      messages: [],
    };

    const assistance = await assistTyreFitmentSelection(vehicle, [confirmedOption], resolution);

    expect(isVerifiedTyreFitmentRecommendation(confirmedOption)).toBe(true);
    expect(assistance.recommendedOptionId).toBe(confirmedOption.id);
    expect(assistance.summary).toMatch(/verified tyre fitment/i);
  });

  it('does not recommend ranked local catalogue candidates until sidewall confirmation', async () => {
    const resolution: TyreFitmentResolution = {
      options: [localCandidateOption],
      status: 'local_catalog',
      provider: 'local_vehicle_catalog',
      messages: [],
    };

    const assistance = await assistTyreFitmentSelection(vehicle, [localCandidateOption], resolution);

    expect(isVerifiedTyreFitmentRecommendation(localCandidateOption)).toBe(false);
    expect(assistance.recommendedOptionId).toBeNull();
    expect(assistance.warnings.join(' ')).toMatch(/sidewall|door placard/i);
  });

  it('rejects unknown Groq candidate ids instead of trusting invented recommendations', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    askGroqStructuredMock.mockResolvedValue({
      recommendedOptionId: 'invented-245-35r20',
      summary: 'Use the invented size.',
      warnings: [],
    });
    const resolution: TyreFitmentResolution = {
      options: [localCandidateOption],
      status: 'local_catalog',
      provider: 'local_vehicle_catalog',
      messages: [],
    };

    const assistance = await assistTyreFitmentSelection(vehicle, [localCandidateOption], resolution);

    expect(assistance.provider).toBe('groq');
    expect(assistance.recommendedOptionId).toBeNull();
    expect(assistance.warnings.join(' ')).toMatch(/AI recommendation was ignored/i);
  });
});
