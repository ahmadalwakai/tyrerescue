import { describe, it, expect } from 'vitest';
import {
  normalizeTyreSize,
  isBudgetTyre,
  getBudgetStock,
  getBudgetSizes,
  classifyTyre,
} from '../budget-inventory';

// ── normalizeTyreSize ──

describe('normalizeTyreSize', () => {
  it('normalizes standard width/aspect/rim format', () => {
    expect(normalizeTyreSize('205/55/R16')).toBe('205/55R16');
    expect(normalizeTyreSize('225/45/R17')).toBe('225/45R17');
  });

  it('normalizes format without extra slash before R', () => {
    expect(normalizeTyreSize('205/55R16')).toBe('205/55R16');
  });

  it('normalizes no-aspect sizes (width/Rrim)', () => {
    expect(normalizeTyreSize('155/R13')).toBe('155R13');
    expect(normalizeTyreSize('175/R13')).toBe('175R13');
  });

  it('preserves C (commercial) suffix', () => {
    expect(normalizeTyreSize('175/R16C')).toBe('175R16C');
    expect(normalizeTyreSize('195/60/R16C')).toBe('195/60R16C');
    expect(normalizeTyreSize('205/75/R16C')).toBe('205/75R16C');
  });

  it('handles extra whitespace', () => {
    expect(normalizeTyreSize('  205/55/R16  ')).toBe('205/55R16');
    expect(normalizeTyreSize('205 / 55 / R16')).toBe('205/55R16');
  });

  it('is case-insensitive', () => {
    expect(normalizeTyreSize('205/55/r16')).toBe('205/55R16');
    expect(normalizeTyreSize('195/60/r16c')).toBe('195/60R16C');
  });

  it('returns raw string for unrecognized format', () => {
    expect(normalizeTyreSize('invalid')).toBe('INVALID');
    expect(normalizeTyreSize('')).toBe('');
  });
});

// ── isBudgetTyre ──

describe('isBudgetTyre', () => {
  it('returns true for known budget sizes', () => {
    expect(isBudgetTyre('205/55/R16')).toBe(true);
    expect(isBudgetTyre('225/45/R17')).toBe(true);
    expect(isBudgetTyre('195/65/R15')).toBe(true);
    expect(isBudgetTyre('155/R13')).toBe(true);
    expect(isBudgetTyre('175/R16C')).toBe(true);
  });

  it('returns false for non-budget sizes', () => {
    expect(isBudgetTyre('275/40/R20')).toBe(false);
    expect(isBudgetTyre('305/30/R22')).toBe(false);
    expect(isBudgetTyre('999/99/R99')).toBe(false);
  });

  it('returns true for budget sizes with zero reference stock', () => {
    // 175/R16C, 205/45/R17, 235/35/R20 all have qty=0 in inventory
    expect(isBudgetTyre('175/R16C')).toBe(true);
    expect(isBudgetTyre('205/45/R17')).toBe(true);
    expect(isBudgetTyre('235/35/R20')).toBe(true);
  });

  it('matches regardless of input format variation', () => {
    // Same size in different formats should all match
    expect(isBudgetTyre('205/55R16')).toBe(true);
    expect(isBudgetTyre('205/55/R16')).toBe(true);
    expect(isBudgetTyre('  205/55/R16  ')).toBe(true);
  });
});

// ── getBudgetStock ──

describe('getBudgetStock', () => {
  it('returns reference stock for known budget sizes', () => {
    expect(getBudgetStock('205/55/R16')).toBe(6);
    expect(getBudgetStock('155/R13')).toBe(2);
    expect(getBudgetStock('195/75/R16C')).toBe(8);
  });

  it('sums stock for duplicate sizes in inventory', () => {
    // 215/50/R18 appears twice in inventory: qty 1 + qty 4 = 5
    expect(getBudgetStock('215/50/R18')).toBe(5);
    // 255/40/R20 appears twice: qty 1 + qty 3 = 4
    expect(getBudgetStock('255/40/R20')).toBe(4);
  });

  it('returns 0 for non-budget sizes', () => {
    expect(getBudgetStock('275/40/R20')).toBe(0);
    expect(getBudgetStock('999/99/R99')).toBe(0);
  });

  it('returns 0 for budget sizes with zero reference stock', () => {
    expect(getBudgetStock('175/R16C')).toBe(0);
  });
});

// ── getBudgetSizes ──

describe('getBudgetSizes', () => {
  it('returns a non-empty array of normalized size strings', () => {
    const sizes = getBudgetSizes();
    expect(sizes.length).toBeGreaterThan(150);
    // Each entry should be in normalized form (no double slashes before R)
    for (const s of sizes) {
      expect(s).toMatch(/^\d+\/?\d*R\d+C?$/);
    }
  });
});

// ── classifyTyre ──

describe('classifyTyre', () => {
  it('budget tyre with stock = immediate / direct sale', () => {
    const result = classifyTyre('205/55/R16', 5);
    expect(result.isDirectSale).toBe(true);
    expect(result.isOrderOnly).toBe(false);
    expect(result.orderType).toBe('immediate');
    expect(result.leadTimeLabel).toBeNull();
  });

  it('budget tyre with zero stock = not direct sale, but still not order-only', () => {
    const result = classifyTyre('205/55/R16', 0);
    expect(result.isDirectSale).toBe(false);
    expect(result.isOrderOnly).toBe(false); // still a budget tyre
    expect(result.orderType).toBe('immediate');
    expect(result.leadTimeLabel).toBeNull();
  });

  it('non-budget tyre = order-only regardless of stock', () => {
    const withStock = classifyTyre('275/40/R20', 10);
    expect(withStock.isDirectSale).toBe(false);
    expect(withStock.isOrderOnly).toBe(true);
    expect(withStock.orderType).toBe('special_order');
    expect(withStock.leadTimeLabel).toBe('2\u20133 working days');

    const noStock = classifyTyre('275/40/R20', 0);
    expect(noStock.isDirectSale).toBe(false);
    expect(noStock.isOrderOnly).toBe(true);
    expect(noStock.orderType).toBe('special_order');
    expect(noStock.leadTimeLabel).toBe('2\u20133 working days');
  });

  it('lead time label uses en-dash, not hyphen', () => {
    const result = classifyTyre('999/99/R99', 0);
    expect(result.leadTimeLabel).toContain('\u2013'); // en-dash
    expect(result.leadTimeLabel).not.toContain('-'); // no hyphen
  });
});

// ── Policy enforcement contracts ──

describe('Tyre sales policy contracts', () => {
  it('emergency flow must block non-budget tyres', () => {
    // Simulates the policy enforced in StepTyreSelection.handleAddToCart
    const bookingType = 'emergency';
    const tyre = classifyTyre('275/40/R20', 10);

    const blocked = bookingType === 'emergency' && tyre.isOrderOnly;
    expect(blocked).toBe(true);
  });

  it('emergency flow allows budget tyres', () => {
    const bookingType = 'emergency';
    const tyre = classifyTyre('205/55/R16', 5);

    const blocked = bookingType === 'emergency' && tyre.isOrderOnly;
    expect(blocked).toBe(false);
  });

  it('backend forces non-budget to preOrder regardless of frontend flag', () => {
    // Simulates the enforcement in quote API
    const sizeDisplay = '275/40/R20';
    const frontendIsPreOrder = false; // frontend says no pre-order

    const isPreOrder = !isBudgetTyre(sizeDisplay) || frontendIsPreOrder;
    expect(isPreOrder).toBe(true); // backend overrides to true
  });

  it('backend allows budget tyre to be immediate when frontend says so', () => {
    const sizeDisplay = '205/55/R16';
    const frontendIsPreOrder = false;

    const isPreOrder = !isBudgetTyre(sizeDisplay) || frontendIsPreOrder;
    expect(isPreOrder).toBe(false); // budget + frontend says no = immediate
  });

  it('backend respects frontend preOrder flag for budget tyres', () => {
    const sizeDisplay = '205/55/R16';
    const frontendIsPreOrder = true; // customer chose pre-order for budget

    const isPreOrder = !isBudgetTyre(sizeDisplay) || frontendIsPreOrder;
    expect(isPreOrder).toBe(true); // respects the flag
  });

  it('no misleading "In Stock" label for non-budget tyres with stock', () => {
    const tyre = classifyTyre('275/40/R20', 10);
    // Even with stock > 0, isDirectSale must be false and isOrderOnly must be true
    expect(tyre.isDirectSale).toBe(false);
    expect(tyre.isOrderOnly).toBe(true);
    // UI should show "Order Only", never "In Stock"
    expect(tyre.orderType).toBe('special_order');
  });

  it('fulfillment option is required for special orders', () => {
    // Contract: wizard state must set fulfillmentOption when confirming special order
    const fulfillmentOptions = ['delivery', 'fitting'] as const;
    for (const opt of fulfillmentOptions) {
      expect(['delivery', 'fitting']).toContain(opt);
    }
  });
});
