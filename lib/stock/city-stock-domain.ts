export const CITY_STOCK_MOVEMENT_TYPES = [
  'RECEIVED',
  'SALE',
  'SALE_REVERSAL',
  'RETURN',
  'DAMAGED',
  'CORRECTION',
] as const;

export const CITY_STOCK_SALE_CHANNELS = [
  'GARAGE',
  'EMERGENCY_CALL_OUT',
] as const;

export type CityStockMovementType = typeof CITY_STOCK_MOVEMENT_TYPES[number];
export type CityStockSaleChannel = typeof CITY_STOCK_SALE_CHANNELS[number];
export type CityStockMovementSign = 'positive' | 'negative' | 'either';

export interface CityStockBalanceRecord {
  currentStock: number | null;
  reservedStock: number | null;
  orderedStock: number | null;
  minStock: number | null;
  targetStock: number | null;
}

export interface CityStockSnapshot {
  currentStock: number;
  reservedStock: number;
  orderedStock: number;
  availableStock: number;
  minStock: number;
  targetStock: number;
  suggestedBuy: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isOvercommitted: boolean;
}

export function sanitizeCityStockQuantity(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function computeCityStockSnapshot(balance: CityStockBalanceRecord): CityStockSnapshot {
  const currentStock = sanitizeCityStockQuantity(balance.currentStock);
  const reservedStock = sanitizeCityStockQuantity(balance.reservedStock);
  const orderedStock = sanitizeCityStockQuantity(balance.orderedStock);
  const minStock = sanitizeCityStockQuantity(balance.minStock);
  const targetStock = sanitizeCityStockQuantity(balance.targetStock);
  const availableStock = currentStock - reservedStock;
  const suggestedBuy = Math.max(0, targetStock - currentStock - orderedStock);

  return {
    currentStock,
    reservedStock,
    orderedStock,
    availableStock,
    minStock,
    targetStock,
    suggestedBuy,
    isLowStock: availableStock > 0 && availableStock <= minStock,
    isOutOfStock: availableStock <= 0,
    isOvercommitted: reservedStock > currentStock,
  };
}

export function expectedMovementSign(type: CityStockMovementType): CityStockMovementSign {
  switch (type) {
    case 'RECEIVED':
    case 'SALE_REVERSAL':
    case 'RETURN':
      return 'positive';
    case 'SALE':
    case 'DAMAGED':
      return 'negative';
    case 'CORRECTION':
      return 'either';
  }
}

export function validateCityStockMovementDelta(
  movementType: CityStockMovementType,
  quantityDelta: number,
): { valid: true } | { valid: false; error: string } {
  if (!Number.isInteger(quantityDelta)) {
    return { valid: false, error: 'Quantity delta must be an integer' };
  }
  if (quantityDelta === 0) {
    return { valid: false, error: 'Quantity delta must not be zero' };
  }

  const expected = expectedMovementSign(movementType);
  if (expected === 'positive' && quantityDelta < 0) {
    return { valid: false, error: `${movementType} requires a positive quantity delta` };
  }
  if (expected === 'negative' && quantityDelta > 0) {
    return { valid: false, error: `${movementType} requires a negative quantity delta` };
  }

  return { valid: true };
}

export function normalizeMissingTyreSize(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function buildStockIdempotencyKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part): part is string | number => part !== null && part !== undefined && `${part}`.length > 0)
    .map((part) => `${part}`.trim())
    .join(':');
}
