/**
 * Canonical tyre-detail normaliser.
 *
 * One place that converts raw DB rows + booking fields into the single
 * NormalisedTyreDetails shape consumed by every UI consumer.
 *
 * Reads from (in priority order):
 *   1. booking.priceSnapshot.tyreLines             → canonical items[]
 *   2. bookingTyres rows joined with tyreProducts  → items[]
 *   3. booking.tyreSizeDisplay                     → fallback size
 *   4. booking.quantity                            → fallback quantity
 *   5. booking.lockingNutStatus                    → hasLockingNutKey
 *   6. booking.notes (Fitting location: …)         → fittingLocation
 */

import {
  formatTyreDisplayLine,
  resolveBookingTyreDisplay,
  totalTyreLineQuantity,
} from './tyre-line-display';

export interface NormalisedTyreItem {
  size?: string;
  axle?: string | null;
  loadIndex?: string | null;
  speedIndex?: string | null;
  runFlat?: boolean | null;
  xl?: boolean | null;
  commercial?: boolean | null;
  brand?: string;
  /** pattern / model name from tyre catalogue */
  model?: string;
  type?: string;
  service?: string;
  price?: number;
  quantity: number;
  label?: string;
}

export interface NormalisedTyreDetails {
  size?: string;
  quantity: number;
  items: NormalisedTyreItem[];
  hasLockingNutKey?: boolean | null;
  fittingLocation?: string | null;
}

/** Fields read from the bookings table */
export interface BookingTyreSourceFields {
  tyreSizeDisplay?: string | null;
  quantity: number;
  priceSnapshot?: unknown;
  lockingNutStatus?: string | null;
  serviceType: string;
  notes?: string | null;
}

/** Fields read from bookingTyres JOIN tyreProducts */
export interface RawBookingTyreRow {
  brand?: string | null;
  pattern?: string | null;
  /** from tyreProducts.sizeDisplay */
  sizeDisplay?: string | null;
  width?: number | null;
  aspect?: number | null;
  rim?: number | null;
  quantity: number;
  unitPrice: string;
  service: string;
}

/**
 * True when the service type never involves selling a tyre product.
 * Covers both the wizard-native values (repair, assess) and the
 * admin quick-book mapped values (puncture_repair, locking_nut_removal).
 */
export function isRepairOrAssessService(serviceType: string): boolean {
  return ['repair', 'puncture_repair', 'assess', 'locking_nut', 'locking_nut_removal'].includes(serviceType);
}

/**
 * True when tyre details are considered present and meaningful.
 * An item list is sufficient; a size+quantity without items is also valid.
 */
export function hasValidTyreDetails(details: NormalisedTyreDetails): boolean {
  return details.items.length > 0 || (details.quantity > 0 && details.size != null);
}

/**
 * Convert raw DB data into NormalisedTyreDetails.
 *
 * Call this in every server-side data-fetch so that all UI consumers
 * receive a single, typed shape.
 */
export function normaliseTyreDetailsFromDb(
  booking: BookingTyreSourceFields,
  tyreRows: RawBookingTyreRow[],
): NormalisedTyreDetails {
  const resolved = resolveBookingTyreDisplay({
    priceSnapshot: booking.priceSnapshot,
    tyreRows,
    tyreSizeDisplay: booking.tyreSizeDisplay,
    quantity: booking.quantity,
  });
  const items: NormalisedTyreItem[] = resolved.lines.map((line) => ({
    size: line.size,
    axle: line.axle ?? null,
    loadIndex: line.loadIndex ?? null,
    speedIndex: line.speedIndex ?? null,
    runFlat: line.runFlat ?? null,
    xl: line.xl ?? null,
    commercial: line.commercial ?? null,
    brand: line.brand ?? undefined,
    model: line.pattern ?? undefined,
    service: line.service ?? undefined,
    price: line.unitPrice ?? undefined,
    quantity: line.quantity,
    label: formatTyreDisplayLine(line),
  }));

  const totalQtyFromItems = totalTyreLineQuantity(resolved.lines);
  const quantity = totalQtyFromItems > 0 ? totalQtyFromItems : booking.quantity;
  const size = resolved.lines[0]?.size ?? booking.tyreSizeDisplay ?? undefined;

  // 'standard' → null (not applicable), 'has_key' → true, 'no_key' → false
  let hasLockingNutKey: boolean | null = null;
  if (booking.lockingNutStatus === 'has_key') hasLockingNutKey = true;
  else if (booking.lockingNutStatus === 'no_key') hasLockingNutKey = false;

  // Extract fitting location note appended by the booking create route
  let fittingLocation: string | null = null;
  if (booking.notes) {
    const m = booking.notes.match(/Fitting location:\s*(shop|mobile)/i);
    if (m) fittingLocation = m[1].toLowerCase();
  }

  return { size, quantity, items, hasLockingNutKey, fittingLocation };
}

/**
 * GBP formatter for use in both server and client rendering.
 * Uses Intl.NumberFormat so separators and currency symbol are locale-correct.
 */
export function formatGBP(amount: number | string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    Number(amount),
  );
}
