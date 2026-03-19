/**
 * Default Price Maps — Single Source of Truth
 *
 * Rim-based suggested pricing for budget, mid, and premium tiers.
 * Used by seed scripts and stock import routes.
 *
 * No DB access — pure data and helpers only.
 */

// ── Budget tier (single rim → price) ────────────────────

export const DEFAULT_BUDGET_PRICE_BY_RIM: Readonly<Record<number, number>> = {
  10: 48, 12: 48, 13: 48, 14: 48, 15: 58, 16: 58,
  17: 72, 18: 72, 19: 92, 20: 92, 21: 115,
};

// ── Multi-tier (rim → price per tier) ───────────────────

export const DEFAULT_PRICE_BY_RIM: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  budget:  { 13: 48, 14: 48, 15: 58, 16: 58, 17: 72, 18: 72, 19: 92, 20: 92, 21: 115, 22: 130, 23: 145 },
  mid:     { 13: 72, 14: 72, 15: 85, 16: 85, 17: 105, 18: 105, 19: 135, 20: 135, 21: 160, 22: 180, 23: 200 },
  premium: { 13: 95, 14: 95, 15: 115, 16: 115, 17: 145, 18: 145, 19: 175, 20: 175, 21: 210, 22: 240, 23: 270 },
};

// ── Helpers ─────────────────────────────────────────────

/**
 * Get the default price for a budget tyre by rim size.
 * Returns null if the rim size has no default price.
 */
export function getDefaultBudgetPrice(rim: number): number | null {
  return DEFAULT_BUDGET_PRICE_BY_RIM[rim] ?? null;
}

/**
 * Get the default price by rim and tier.
 * Falls back to budget price, then null.
 */
export function getDefaultPriceByRim(rim: number, tier: 'budget' | 'mid' | 'premium' = 'budget'): number | null {
  return DEFAULT_PRICE_BY_RIM[tier]?.[rim] ?? DEFAULT_BUDGET_PRICE_BY_RIM[rim] ?? null;
}

/**
 * Get the default price as a string for DB storage.
 * Returns a fallback string if no price is found.
 */
export function getDefaultPriceString(rim: number, tier: 'budget' | 'mid' | 'premium' = 'budget'): string {
  const price = getDefaultPriceByRim(rim, tier);
  return String(price ?? 58);
}
