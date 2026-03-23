import { describe, it, expect, vi } from 'vitest';

// Mock the DB module to avoid neon() connection at import time
vi.mock('@/lib/db', () => ({
  db: {},
  bookings: {},
  drivers: {},
  surgePricingLog: {},
  bankHolidays: {},
}));

// Mock dependencies that surge.ts imports
vi.mock('@/lib/groq', () => ({
  askGroqJSON: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/pricing-config', () => ({
  getLondonTime: () => ({ hour: 14, hourStartIso: '', hourEndIso: '' }),
}));
vi.mock('@/lib/driver-presence', () => ({
  shouldDriverAppearOnline: () => false,
}));

import { computeDeterministicDemand, type DemandMetrics } from '../surge';

function defaultMetrics(overrides: Partial<DemandMetrics> = {}): DemandMetrics {
  return {
    activeBookingsToday: 3,
    emergencyPending: 0,
    availableDrivers: 4,
    currentHour: 14,
    dayOfWeek: 2,       // Tuesday
    isWeekend: false,
    isBankHoliday: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeDeterministicDemand', () => {
  it('returns 1.0 for normal demand conditions', () => {
    const result = computeDeterministicDemand(defaultMetrics());
    expect(result.multiplier).toBe(1.0);
    expect(result.reason).toBe('Normal demand');
    expect(result.confidence).toBe('low');
  });

  it('increases multiplier when no drivers available (+0.10)', () => {
    const result = computeDeterministicDemand(defaultMetrics({ availableDrivers: 0 }));
    expect(result.multiplier).toBe(1.10);
    expect(result.reason).toContain('No drivers available');
  });

  it('increases multiplier when only 1 driver available (+0.05)', () => {
    const result = computeDeterministicDemand(defaultMetrics({ availableDrivers: 1 }));
    expect(result.multiplier).toBe(1.05);
    expect(result.reason).toContain('Only 1 driver available');
  });

  it('increases multiplier for emergency backlog >=3 (+0.05)', () => {
    const result = computeDeterministicDemand(defaultMetrics({ emergencyPending: 4 }));
    expect(result.multiplier).toBe(1.05);
    expect(result.reason).toContain('emergency bookings pending');
  });

  it('does not increase multiplier for <3 emergencies', () => {
    const result = computeDeterministicDemand(defaultMetrics({ emergencyPending: 2 }));
    expect(result.multiplier).toBe(1.0);
  });

  it('increases multiplier for high volume day >=10 bookings (+0.05)', () => {
    const result = computeDeterministicDemand(defaultMetrics({ activeBookingsToday: 12 }));
    expect(result.multiplier).toBe(1.05);
    expect(result.reason).toContain('active bookings today');
  });

  it('increases multiplier for bank holiday (+0.03)', () => {
    const result = computeDeterministicDemand(defaultMetrics({ isBankHoliday: true }));
    expect(result.multiplier).toBe(1.03);
    expect(result.reason).toContain('Bank holiday');
  });

  it('increases multiplier for early morning (hour < 7) (+0.02)', () => {
    const result = computeDeterministicDemand(defaultMetrics({ currentHour: 5 }));
    expect(result.multiplier).toBe(1.02);
    expect(result.reason).toContain('Out-of-hours');
  });

  it('increases multiplier for late night (hour >= 21) (+0.02)', () => {
    const result = computeDeterministicDemand(defaultMetrics({ currentHour: 22 }));
    expect(result.multiplier).toBe(1.02);
    expect(result.reason).toContain('Out-of-hours');
  });

  it('does not add out-of-hours for normal business hour', () => {
    const result = computeDeterministicDemand(defaultMetrics({ currentHour: 14 }));
    expect(result.multiplier).toBe(1.0);
  });

  it('stacks multiple factors correctly', () => {
    const result = computeDeterministicDemand(defaultMetrics({
      availableDrivers: 0,       // +0.10
      emergencyPending: 5,       // +0.05
      activeBookingsToday: 15,   // +0.05
    }));
    // 1.0 + 0.10 + 0.05 + 0.05 = 1.20 (at cap)
    expect(result.multiplier).toBe(1.20);
    expect(result.confidence).toBe('high');
  });

  it('clamps to max 1.20 when factors exceed cap', () => {
    const result = computeDeterministicDemand(defaultMetrics({
      availableDrivers: 0,       // +0.10
      emergencyPending: 5,       // +0.05
      activeBookingsToday: 15,   // +0.05
      isBankHoliday: true,       // +0.03
      currentHour: 5,            // +0.02
    }));
    // 1.0 + 0.10 + 0.05 + 0.05 + 0.03 + 0.02 = 1.25 → clamped to 1.20
    expect(result.multiplier).toBe(1.20);
  });

  it('never goes below 0.90', () => {
    // No scenario currently decreases, but verify the clamp lower bound
    const result = computeDeterministicDemand(defaultMetrics());
    expect(result.multiplier).toBeGreaterThanOrEqual(0.90);
  });

  it('returns high confidence when >=2 factors are active', () => {
    const result = computeDeterministicDemand(defaultMetrics({
      availableDrivers: 0,
      isBankHoliday: true,
    }));
    expect(result.confidence).toBe('high');
  });

  it('returns medium confidence when exactly 1 factor is active', () => {
    const result = computeDeterministicDemand(defaultMetrics({
      isBankHoliday: true,
    }));
    expect(result.confidence).toBe('medium');
  });

  it('returns low confidence when no factors are active', () => {
    const result = computeDeterministicDemand(defaultMetrics());
    expect(result.confidence).toBe('low');
  });

  it('joins multiple reasons with semicolons', () => {
    const result = computeDeterministicDemand(defaultMetrics({
      availableDrivers: 1,
      isBankHoliday: true,
    }));
    expect(result.reason).toContain('; ');
    expect(result.reason).toContain('Only 1 driver available');
    expect(result.reason).toContain('Bank holiday');
  });
});
