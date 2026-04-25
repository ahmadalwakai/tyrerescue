/**
 * Resolve an OEM tyre size for a vehicle make/model/year.
 *
 * MVP source is a static JSON table at `lib/data/tyre-sizes.json`. When
 * an exact entry isn't found, we fall back to a category default — better
 * than nothing, and the UI is expected to flag the result as estimated.
 *
 * TODO: replace with a paid API (Tyre24 / MyTyres / CarwebData) once
 * commercials are agreed. Keep this module's interface stable so callers
 * don't need to change.
 */

import data from '@/lib/data/tyre-sizes.json';
import type { TyreSize, VehicleCategory } from '@/types/vehicle';

interface RawEntry {
  make: string;
  model: string;
  from: number;
  to: number;
  size: { width: string; aspect: string; rim: string };
}

interface RawDataset {
  vehicles: RawEntry[];
}

const DATASET = data as RawDataset;

/** Conservative defaults used when no exact match is found. */
const CATEGORY_FALLBACK: Record<VehicleCategory, TyreSize> = {
  city:      { width: '175', aspect: '65', rim: '14', fallback: true },
  hatchback: { width: '195', aspect: '65', rim: '15', fallback: true },
  saloon:    { width: '205', aspect: '55', rim: '16', fallback: true },
  suv:       { width: '225', aspect: '60', rim: '17', fallback: true },
  van:       { width: '215', aspect: '65', rim: '16', fallback: true },
};

/**
 * Loose category guess based on model-name keywords. Good enough to pick
 * a sensible fallback size when the exact vehicle isn't in the dataset.
 */
export function categorizeVehicle(make: string, model: string | null): VehicleCategory {
  const m = (model ?? '').toUpperCase();
  if (/SPRINTER|TRANSIT|VIVARO|TRAFIC|DUCATO|BERLINGO|PARTNER|CONNECT|CUSTOM/.test(m)) return 'van';
  if (/X[1-7]|Q[2-8]|SUV|TIGUAN|KUGA|RAV4|QASHQAI|TUCSON|SPORTAGE|MOKKA|3008|2008|GLA|GLC|XC|EVOQUE|F-PACE|DISCOVERY/.test(m))
    return 'suv';
  if (/A4|A6|3 SERIES|5 SERIES|PASSAT|MONDEO|INSIGNIA|SUPERB|E-CLASS|C-CLASS|XE|XF/.test(m)) return 'saloon';
  if (/PICANTO|AYGO|UP|C1|108|107|FIAT 500|PANDA|I10|MICRA|YARIS|JAZZ/.test(m)) return 'city';
  return 'hatchback';
}

function normalizeMake(make: string): string {
  return make.trim().toUpperCase();
}

function normalizeModel(model: string | null): string {
  return (model ?? '').trim().toUpperCase();
}

/**
 * Returns the closest matching OEM size, or a category fallback when no
 * record is found. Returns `null` only when both make and model are blank.
 */
export function getTyreSizeForVehicle(
  make: string,
  model: string | null,
  year: number | null
): TyreSize | null {
  const makeKey = normalizeMake(make);
  const modelKey = normalizeModel(model);
  if (!makeKey && !modelKey) return null;

  const candidates = DATASET.vehicles.filter(
    (entry) => entry.make === makeKey && entry.model === modelKey
  );

  if (candidates.length > 0) {
    const matched =
      year != null
        ? candidates.find((c) => year >= c.from && year <= c.to) ?? candidates[0]
        : candidates[0];
    return { ...matched.size, oem: true };
  }

  // No exact model match — fall back to category default.
  const category = categorizeVehicle(makeKey, modelKey);
  return CATEGORY_FALLBACK[category];
}

/** Test seam — exposes the dataset size so tests can assert it isn't empty. */
export function __datasetSizeForTests(): number {
  return DATASET.vehicles.length;
}
