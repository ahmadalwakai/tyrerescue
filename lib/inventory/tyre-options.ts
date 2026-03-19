/**
 * Tyre Filter Options — Single Source of Truth
 *
 * Shared constants for width, profile, and rim filter dropdowns.
 * Used by admin inventory, admin stock, and public tyre listing pages.
 *
 * No logic — just data constants.
 */

/** All tyre widths available in the catalogue (mm) */
export const WIDTH_OPTIONS = [
  155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285,
] as const;

/** Common tyre profile/aspect ratios */
export const PROFILE_OPTIONS = [
  30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80,
] as const;

/**
 * All rim sizes tracked.
 * StockClient includes 10 and 12 for commercial/budget tyres.
 * InventoryClient starts at 13 for standard passenger tyres.
 */
export const RIM_OPTIONS = [
  10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
] as const;

/** Standard passenger rim sizes (excludes 10, 12) */
export const RIM_OPTIONS_STANDARD = [
  13, 14, 15, 16, 17, 18, 19, 20, 21,
] as const;
