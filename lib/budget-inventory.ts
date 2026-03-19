/**
 * Budget Tyre Inventory — Single Source of Truth
 *
 * Classifies which tyre sizes are "budget" tier (immediate / direct-sale).
 * All sizes NOT in this list are special-order only (2–3 working days).
 *
 * Source: Owner-provided inventory dataset.
 * Update the BUDGET_INVENTORY array when stock catalogue changes.
 */

/** Normalize any tyre size string to a canonical form for comparison. */
export function normalizeTyreSize(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(\d+)\/?(\d+)?\/?R(\d+C?)$/);
  if (!m) return s;
  const [, width, aspect, rim] = m;
  return aspect ? `${width}/${aspect}R${rim}` : `${width}R${rim}`;
}

/**
 * Owner-provided budget inventory.
 * Format: [sizeDisplay, referenceStock]
 * referenceStock is a snapshot — actual stock is tracked in DB (stockNew).
 */
const BUDGET_INVENTORY: readonly [string, number][] = [
  ['155/R13', 2],
  ['155/65/R14', 2],
  ['155/70/R12', 1],
  ['155/80/R13', 1],
  ['165/60/R14', 3],
  ['165/60/R15', 2],
  ['165/65/R14', 3],
  ['165/65/R15', 2],
  ['165/70/R14', 3],
  ['175/R13', 3],
  ['175/R16C', 0],
  ['175/50/R15', 1],
  ['175/55/R20', 1],
  ['175/60/R15', 5],
  ['175/60/R16', 1],
  ['175/60/R18', 1],
  ['175/65/R14', 2],
  ['175/65/R15', 3],
  ['175/65/R17', 1],
  ['175/70/R13', 1],
  ['175/70/R14', 3],
  ['175/80/R16', 1],
  ['185/55/R15', 3],
  ['185/55/R16', 3],
  ['185/60/R14', 2],
  ['185/60/R15', 5],
  ['185/60/R16', 3],
  ['185/65/R14', 2],
  ['185/65/R15', 3],
  ['185/70/R14', 3],
  ['185/75/R16C', 2],
  ['195/40/R17', 2],
  ['195/45/R16', 6],
  ['195/50/R15', 3],
  ['195/50/R16', 2],
  ['195/55/R10', 2],
  ['195/55/R15', 2],
  ['195/55/R16', 5],
  ['195/60/R15', 5],
  ['195/60/R16', 4],
  ['195/60/R16C', 1],
  ['195/60/R18', 2],
  ['195/65/R15', 6],
  ['195/65/R16C', 3],
  ['195/70/R15C', 1],
  ['195/75/R16C', 8],
  ['205/40/R17', 3],
  ['205/40/R18', 3],
  ['205/45/R16', 3],
  ['205/45/R17', 0],
  ['205/50/R16', 1],
  ['205/50/R17', 4],
  ['205/55/R15', 1],
  ['205/55/R16', 6],
  ['205/55/R17', 3],
  ['205/55/R19', 4],
  ['205/60/R15', 2],
  ['205/60/R16', 4],
  ['205/65/R15', 1],
  ['205/65/R15C', 2],
  ['205/65/R16', 1],
  ['205/65/R16C', 4],
  ['205/75/R16C', 2],
  ['215/40/R16', 1],
  ['215/40/R17', 2],
  ['215/40/R18', 2],
  ['215/45/R16', 4],
  ['215/45/R17', 4],
  ['215/45/R18', 2],
  ['215/45/R20', 1],
  ['215/50/R17', 8],
  ['215/50/R18', 1],
  ['215/50/R18', 4],
  ['215/55/R16', 2],
  ['215/55/R17', 6],
  ['215/55/R18', 4],
  ['215/60/R16', 3],
  ['215/60/R16C', 3],
  ['215/60/R17', 4],
  ['215/60/R17C', 2],
  ['215/65/R15C', 9],
  ['215/65/R16', 3],
  ['215/65/R16C', 3],
  ['215/65/R17', 2],
  ['215/70/R15C', 3],
  ['215/70/R16', 3],
  ['215/70/R16C', 2],
  ['215/75/R16C', 1],
  ['225/30/R20', 1],
  ['225/35/R17', 1],
  ['225/35/R18', 2],
  ['225/35/R19', 4],
  ['225/35/R20', 2],
  ['225/40/R18', 1],
  ['225/40/R19', 3],
  ['225/40/R20', 2],
  ['225/45/R17', 6],
  ['225/45/R18', 6],
  ['225/45/R19', 1],
  ['225/50/R16', 1],
  ['225/50/R17', 4],
  ['225/50/R18', 3],
  ['225/55/R16', 1],
  ['225/55/R17', 4],
  ['225/55/R18', 5],
  ['225/55/R19', 2],
  ['225/60/R17', 3],
  ['225/60/R18', 3],
  ['225/65/R16C', 3],
  ['225/65/R17', 4],
  ['225/65/R18', 1],
  ['225/70/R15C', 2],
  ['225/70/R16', 2],
  ['225/75/R16C', 1],
  ['235/35/R19', 4],
  ['235/35/R20', 0],
  ['235/40/R18', 3],
  ['235/40/R19', 2],
  ['235/45/R17', 2],
  ['235/45/R18', 3],
  ['235/45/R19', 3],
  ['235/45/R20', 2],
  ['235/45/R21', 2],
  ['235/50/R18', 3],
  ['235/50/R19', 3],
  ['235/50/R20', 2],
  ['235/55/R17', 2],
  ['235/55/R18', 1],
  ['235/55/R19', 3],
  ['235/60/R16', 1],
  ['235/60/R17', 2],
  ['235/60/R18', 3],
  ['235/65/R16C', 3],
  ['235/65/R17', 2],
  ['235/65/R18', 1],
  ['245/30/R20', 1],
  ['245/35/R18', 4],
  ['245/35/R19', 2],
  ['245/35/R20', 2],
  ['245/40/R17', 3],
  ['245/40/R18', 3],
  ['245/40/R19', 4],
  ['245/40/R20', 1],
  ['245/40/R21', 1],
  ['245/45/R17', 2],
  ['245/45/R18', 3],
  ['245/45/R19', 2],
  ['245/45/R20', 2],
  ['245/45/R21', 1],
  ['245/50/R18', 2],
  ['245/50/R19', 2],
  ['245/50/R20', 2],
  ['255/30/R19', 2],
  ['255/30/R20', 3],
  ['255/35/R18', 2],
  ['255/35/R19', 3],
  ['255/35/R20', 3],
  ['255/35/R21', 2],
  ['255/40/R18', 2],
  ['255/40/R19', 2],
  ['255/40/R20', 1],
  ['255/40/R20', 3],
  ['255/40/R21', 2],
  ['255/45/R18', 3],
  ['255/45/R19', 4],
  ['255/45/R20', 2],
  ['255/50/R19', 2],
  ['255/50/R20', 2],
  ['255/55/R18', 2],
  ['255/55/R19', 2],
  ['255/55/R20', 3],
  ['255/60/R18', 2],
  ['255/60/R19', 1],
  ['255/65/R18', 1],
];

// Build lookup structures at module load time (handles duplicate sizes by summing)
const _stockMap = new Map<string, number>();
for (const [size, qty] of BUDGET_INVENTORY) {
  const key = normalizeTyreSize(size);
  _stockMap.set(key, (_stockMap.get(key) ?? 0) + qty);
}
const _sizeSet = new Set(_stockMap.keys());

/** All budget sizeDisplay strings as stored in the inventory (for SQL IN clauses). */
export const BUDGET_SIZES: string[] = BUDGET_INVENTORY.map(([size]) => size);

/** True if the size exists in the budget inventory (regardless of current stock). */
export function isBudgetTyre(sizeDisplay: string): boolean {
  return _sizeSet.has(normalizeTyreSize(sizeDisplay));
}

/** Reference stock from the inventory snapshot. Returns 0 for non-budget sizes. */
export function getBudgetStock(sizeDisplay: string): number {
  return _stockMap.get(normalizeTyreSize(sizeDisplay)) ?? 0;
}

/** All normalized budget sizes (for testing / debugging). */
export function getBudgetSizes(): string[] {
  return [..._sizeSet];
}

export interface TyreClassification {
  isImmediateAvailable: boolean;
  isSpecialOrder: boolean;
  fulfilmentType: 'immediate' | 'special_order';
  leadTimeLabel: string | null;
  reason: string;
  /** @deprecated Use isImmediateAvailable */
  isDirectSale: boolean;
  /** @deprecated Use isSpecialOrder */
  isOrderOnly: boolean;
  /** @deprecated Use fulfilmentType */
  orderType: 'immediate' | 'special_order';
}

/**
 * Derive fulfilment classification for a tyre product.
 *
 * Immediate / direct-fit requires ALL of:
 *  - size exists in approved budget inventory list
 *  - season = summer
 *  - tier = budget (or unset — defaults treated as non-budget)
 *  - stockNew > 0
 *
 * Everything else is bookable as special order (2–3 working days).
 */
export function classifyTyre(
  sizeDisplay: string,
  stockNew: number,
  season?: string | null,
  tier?: string | null,
): TyreClassification {
  const approvedSize = isBudgetTyre(sizeDisplay);
  const isSummer = (season ?? '').toLowerCase() === 'summer';
  const isBudgetTier = (tier ?? '').toLowerCase() === 'budget';
  const hasStock = (stockNew ?? 0) > 0;

  const immediate = approvedSize && isSummer && isBudgetTier && hasStock;

  let reason: string;
  if (immediate) {
    reason = 'Approved budget summer size with stock';
  } else if (!approvedSize) {
    reason = 'Size not in approved immediate list';
  } else if (!isSummer) {
    reason = 'Not a summer tyre';
  } else if (!isBudgetTier) {
    reason = 'Not budget tier';
  } else {
    reason = 'No stock available';
  }

  return {
    isImmediateAvailable: immediate,
    isSpecialOrder: !immediate,
    fulfilmentType: immediate ? 'immediate' : 'special_order',
    leadTimeLabel: immediate ? null : '2\u20133 working days',
    reason,
    // Backwards-compat aliases
    isDirectSale: immediate,
    isOrderOnly: !immediate,
    orderType: immediate ? 'immediate' : 'special_order',
  };
}
