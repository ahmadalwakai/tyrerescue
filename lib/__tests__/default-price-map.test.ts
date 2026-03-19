import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BUDGET_PRICE_BY_RIM,
  DEFAULT_PRICE_BY_RIM,
  getDefaultBudgetPrice,
  getDefaultPriceByRim,
  getDefaultPriceString,
} from '../inventory/default-price-map';

describe('DEFAULT_BUDGET_PRICE_BY_RIM', () => {
  it('has prices for common budget rim sizes', () => {
    expect(DEFAULT_BUDGET_PRICE_BY_RIM[13]).toBe(48);
    expect(DEFAULT_BUDGET_PRICE_BY_RIM[16]).toBe(58);
    expect(DEFAULT_BUDGET_PRICE_BY_RIM[17]).toBe(72);
    expect(DEFAULT_BUDGET_PRICE_BY_RIM[21]).toBe(115);
  });
});

describe('DEFAULT_PRICE_BY_RIM', () => {
  it('has budget, mid, and premium tiers', () => {
    expect(DEFAULT_PRICE_BY_RIM).toHaveProperty('budget');
    expect(DEFAULT_PRICE_BY_RIM).toHaveProperty('mid');
    expect(DEFAULT_PRICE_BY_RIM).toHaveProperty('premium');
  });

  it('premium prices are higher than budget', () => {
    expect(DEFAULT_PRICE_BY_RIM['premium'][16]).toBeGreaterThan(DEFAULT_PRICE_BY_RIM['budget'][16]);
  });
});

describe('getDefaultBudgetPrice', () => {
  it('returns price for known rim size', () => {
    expect(getDefaultBudgetPrice(16)).toBe(58);
  });

  it('returns null for unknown rim size', () => {
    expect(getDefaultBudgetPrice(99)).toBeNull();
  });
});

describe('getDefaultPriceByRim', () => {
  it('returns budget price by default', () => {
    expect(getDefaultPriceByRim(16)).toBe(58);
  });

  it('returns mid price when specified', () => {
    expect(getDefaultPriceByRim(16, 'mid')).toBe(85);
  });

  it('returns premium price when specified', () => {
    expect(getDefaultPriceByRim(16, 'premium')).toBe(115);
  });

  it('falls back to budget for unknown tier rim', () => {
    expect(getDefaultPriceByRim(10)).toBe(48); // only in budget map
  });

  it('returns null for completely unknown rim', () => {
    expect(getDefaultPriceByRim(99)).toBeNull();
  });
});

describe('getDefaultPriceString', () => {
  it('returns string price for known rim', () => {
    expect(getDefaultPriceString(16)).toBe('58');
  });

  it('returns fallback string for unknown rim', () => {
    expect(getDefaultPriceString(99)).toBe('58');
  });

  it('returns tier-specific price string', () => {
    expect(getDefaultPriceString(16, 'premium')).toBe('115');
  });
});
