export type SessionRole = 'driver' | 'admin';
export type CityRole = 'viewer' | 'operator' | 'manager';
export type SaleChannel = 'GARAGE' | 'EMERGENCY_CALL_OUT';

export interface StockUser {
  id: string;
  email: string;
  name: string;
  role: SessionRole;
  driverId?: string;
}

export interface LoginResponse {
  token: string;
  user: StockUser;
}

export interface StockCity {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  roleInCity: CityRole;
}

export interface StockShift {
  id: string;
  userId: string;
  cityId: string;
  citySlug?: string;
  cityName?: string;
  startedAt: string | null;
  endedAt: string | null;
  status: 'active' | 'ended';
}

export interface InventoryItem {
  balanceId: string;
  cityId: string;
  tyreProductId: string;
  product: {
    brand: string;
    pattern: string;
    sizeDisplay: string;
    season: string | null;
    priceNew: number | null;
    availableNew: boolean;
  };
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  orderedStock: number;
  minStock: number;
  targetStock: number;
  suggestedBuy: number;
  updatedAt: string | null;
}

export interface StockMovement {
  id: string;
  movementType: string;
  quantityDelta: number;
  previousBalance: number;
  resultingBalance: number;
  actorName: string | null;
  saleChannel: SaleChannel | null;
  occurredAt: string | null;
  product: {
    brand: string;
    pattern: string;
    sizeDisplay: string;
  };
}
