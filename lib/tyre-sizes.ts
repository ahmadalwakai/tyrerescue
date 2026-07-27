/**
 * Resolve an OEM tyre size for a vehicle make/model/year.
 *
 * Source is the internal legacy JSON table at `lib/data/tyre-sizes.json`.
 * It is useful operational data, not guaranteed OE truth, so callers must
 * treat matches as candidates until an operator confirms the sidewall.
 */

import data from '@/lib/data/tyre-sizes.json';
import type { TyreSize, VehicleCategory, VehicleModelCandidate } from '@/types/vehicle';

interface RawTyreSize {
  width: string;
  aspect: string;
  rim: string;
  loadIndex?: string;
  speedIndex?: string;
  runFlat?: boolean;
  xl?: boolean;
  commercial?: boolean;
}

interface RawFitmentSet {
  label?: string;
  position?: 'standard' | 'optional';
  status?: 'suggested' | 'reviewed' | 'verified' | 'deprecated';
  source?: string;
  front?: RawTyreSize;
  rear?: RawTyreSize;
  size?: RawTyreSize;
  loadIndex?: string;
  speedIndex?: string;
  runFlat?: boolean;
  xl?: boolean;
  generation?: string;
  trim?: string;
  engine?: string;
  notes?: string[];
}

interface RawEntry {
  make: string;
  model: string;
  variant?: string;
  from: number;
  to: number;
  generation?: string;
  trim?: string;
  engine?: string;
  source?: string;
  status?: 'suggested' | 'reviewed' | 'verified' | 'deprecated';
  reviewHistory?: unknown[];
  size?: RawTyreSize;
  fitments?: RawFitmentSet[];
}

interface RawDataset {
  vehicles: RawEntry[];
}

const DATASET = data as RawDataset;

export interface TyreSizeCatalogCandidate {
  make: string;
  model: string;
  variant: string | null;
  from: number;
  to: number;
  size: TyreSize;
  rearSize?: TyreSize | null;
  optional?: boolean;
  score: number;
  matchReason: string;
}

export interface TyreCatalogDiagnostics {
  overlappingYearRanges: Array<{
    make: string;
    model: string;
    first: { from: number; to: number; variant: string | null; size: string | null };
    second: { from: number; to: number; variant: string | null; size: string | null };
    conflictingSizes: boolean;
  }>;
  messages: string[];
}

/** Conservative defaults are kept only for older callers that ask explicitly. */
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

const MAKE_ALIASES: Record<string, string> = {
  VW: 'VOLKSWAGEN',
  VOLKSWAGON: 'VOLKSWAGEN',
  MERCEDES: 'MERCEDES-BENZ',
  MERCEDESBENZ: 'MERCEDES-BENZ',
  LANDROVER: 'LAND ROVER',
};

const MODEL_ALIASES: Record<string, string> = {
  '1SERIES': '1 SERIES',
  '2SERIES': '2 SERIES',
  '3SERIES': '3 SERIES',
  '4SERIES': '4 SERIES',
  '5SERIES': '5 SERIES',
  '6SERIES': '6 SERIES',
  '7SERIES': '7 SERIES',
  '8SERIES': '8 SERIES',
  MODEL3: 'MODEL 3',
  MODELS: 'MODEL S',
  MODELX: 'MODEL X',
  MODELY: 'MODEL Y',
};

export function normalizeVehicleMake(make: string | null | undefined): string {
  const text = (make ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const compact = text.replace(/[^A-Z0-9]+/g, '');
  if (!compact) return '';
  return MAKE_ALIASES[compact] ?? text;
}

export function normalizeVehicleModel(model: string | null | undefined): string {
  const text = (model ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ');
  const compact = text.replace(/[^A-Z0-9]+/g, '');
  if (!compact) return '';
  return MODEL_ALIASES[compact] ?? text;
}

function tokenize(value: string): string[] {
  return value
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function modelScore(entryModel: string, modelKey: string): number {
  if (!modelKey) return 20;
  if (entryModel === modelKey) return 100;

  const entryTokens = new Set(tokenize(entryModel));
  const modelTokens = tokenize(modelKey);
  if (modelTokens.length === 0) return 0;

  const matches = modelTokens.filter((token) => entryTokens.has(token)).length;
  if (matches === 0) return 0;
  if (matches === modelTokens.length && modelTokens.length === entryTokens.size) return 90;
  if (matches === modelTokens.length) return 70;
  return matches >= 2 ? 35 + Math.round((matches / modelTokens.length) * 25) : 0;
}

function yearScore(entry: RawEntry, year: number | null): number {
  if (year == null) return 10;
  if (year >= entry.from && year <= entry.to) return 30;
  const distance = year < entry.from ? entry.from - year : year - entry.to;
  return distance <= 1 ? 10 : 0;
}

function tyreFromRawSize(raw: RawTyreSize, fitment?: RawFitmentSet): TyreSize {
  const commercial = Boolean(raw.commercial);
  return {
    width: raw.width,
    aspect: raw.aspect,
    rim: raw.rim,
    loadIndex: raw.loadIndex ?? fitment?.loadIndex,
    speedIndex: raw.speedIndex ?? fitment?.speedIndex,
    runFlat: raw.runFlat ?? fitment?.runFlat,
    xl: raw.xl ?? fitment?.xl,
    commercial,
    oem: true,
    sizeDisplay: `${raw.width}/${raw.aspect}R${raw.rim}${commercial ? 'C' : ''}`,
  };
}

function tyreDisplay(size: TyreSize | null): string | null {
  if (!size) return null;
  return size.sizeDisplay ?? `${size.width}/${size.aspect}R${size.rim}${size.commercial ? 'C' : ''}`;
}

function entryFitments(entry: RawEntry): RawFitmentSet[] {
  if (Array.isArray(entry.fitments) && entry.fitments.length > 0) return entry.fitments;
  return entry.size
    ? [
        {
          position: 'standard',
          status: entry.status ?? 'suggested',
          source: entry.source ?? 'legacy_tyre_sizes_json',
          size: entry.size,
          generation: entry.generation,
          trim: entry.trim ?? entry.variant,
          engine: entry.engine,
        },
      ]
    : [];
}

function fitmentSize(fitment: RawFitmentSet): TyreSize | null {
  const front = fitment.front ?? fitment.size;
  if (!front) return null;
  return tyreFromRawSize(front, fitment);
}

function fitmentRearSize(fitment: RawFitmentSet, front: TyreSize): TyreSize {
  return fitment.rear ? tyreFromRawSize(fitment.rear, fitment) : front;
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
  const makeKey = normalizeVehicleMake(make);
  const modelKey = normalizeVehicleModel(model);
  if (!makeKey && !modelKey) return null;

  const candidates = DATASET.vehicles.filter(
    (entry) => entry.make === makeKey && entry.model === modelKey
  );

  if (candidates.length > 0) {
    const matched =
      year != null
        ? candidates.find((c) => year >= c.from && year <= c.to) ?? candidates[0]
        : candidates[0];
    const fitment = entryFitments(matched).find((item) => item.position !== 'optional') ?? entryFitments(matched)[0];
    const size = fitment ? fitmentSize(fitment) : null;
    if (size) return size;
  }

  // No exact model match — fall back to category default.
  const category = categorizeVehicle(makeKey, modelKey);
  return CATEGORY_FALLBACK[category];
}

export function findTyreSizeCandidatesForVehicle(
  make: string,
  model: string | null,
  year: number | null,
  limit = 8
): TyreSizeCatalogCandidate[] {
  const makeKey = normalizeVehicleMake(make);
  const modelKey = normalizeVehicleModel(model);
  if (!makeKey) return [];

  const scored = DATASET.vehicles
    .filter((entry) => entry.make === makeKey)
    .flatMap((entry, index) => entryFitments(entry).map((fitment, fitmentIndex) => {
      const modelPoints = modelScore(entry.model, modelKey);
      const yearPoints = yearScore(entry, year);
      const optionalPenalty = fitment.position === 'optional' ? 6 : 0;
      const variantPenalty = entry.variant || fitment.trim ? 4 : 0;
      const reviewBonus = fitment.status === 'verified' ? 8 : fitment.status === 'reviewed' ? 4 : 0;
      const score = modelPoints + yearPoints + reviewBonus - variantPenalty - optionalPenalty;
      return { entry, fitment, index, fitmentIndex, score, modelPoints, yearPoints };
    }))
    .filter(({ score, modelPoints, yearPoints }) => {
      if (modelKey && modelPoints === 0) return false;
      if (year != null && yearPoints === 0) return false;
      return score > 0;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.fitment.position === 'optional') !== (b.fitment.position === 'optional')) {
        return a.fitment.position === 'optional' ? 1 : -1;
      }
      if (Boolean(a.entry.variant) !== Boolean(b.entry.variant)) return a.entry.variant ? 1 : -1;
      return a.index - b.index || a.fitmentIndex - b.fitmentIndex;
    });

  return scored.slice(0, limit).flatMap(({ entry, fitment, score }) => {
    const size = fitmentSize(fitment);
    if (!size) return [];
    const rearSize = fitmentRearSize(fitment, size);
    const qualifier = [entry.variant, fitment.trim, fitment.engine, fitment.generation]
      .filter(Boolean)
      .join(' ');
    const variant = qualifier || null;
    return [{
      make: entry.make,
      model: entry.model,
      variant,
      from: entry.from,
      to: entry.to,
      size,
      rearSize,
      optional: fitment.position === 'optional',
      score,
      matchReason: modelKey
        ? `Matched ${entry.make} ${entry.model}${variant ? ` ${variant}` : ''} for ${entry.from}-${entry.to}.`
        : `DVLA did not provide a model; ranked ${entry.make} ${entry.model}${variant ? ` ${variant}` : ''} by year ${year ?? 'unknown'}.`,
    }];
  });
}

export function findVehicleModelCandidates(
  make: string,
  year: number | null,
  limit = 24
): VehicleModelCandidate[] {
  const makeKey = normalizeVehicleMake(make);
  if (!makeKey) return [];

  const grouped = new Map<string, VehicleModelCandidate>();
  DATASET.vehicles
    .filter((entry) => {
      if (entry.make !== makeKey) return false;
      if (year == null) return true;
      return year >= entry.from && year <= entry.to;
    })
    .forEach((entry) => {
      const id = `${entry.make}-${entry.model}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const variant = entry.variant?.trim();
      const existing = grouped.get(id);
      if (existing) {
        existing.from = Math.min(existing.from, entry.from);
        existing.to = Math.max(existing.to, entry.to);
        if (variant && !existing.variants.includes(variant)) existing.variants.push(variant);
        return;
      }

      grouped.set(id, {
        id,
        make: entry.make,
        model: entry.model,
        variants: variant ? [variant] : [],
        from: entry.from,
        to: entry.to,
        matchReason:
          year == null
            ? `Matched ${entry.make} models because DVLA did not provide a model.`
            : `Matched ${entry.make} models covering ${year}.`,
      });
    });

  return [...grouped.values()]
    .sort((a, b) => a.model.localeCompare(b.model))
    .slice(0, limit);
}

export function diagnoseTyreCatalogCandidates(
  make: string,
  model: string | null,
  year: number | null
): TyreCatalogDiagnostics {
  const makeKey = normalizeVehicleMake(make);
  const modelKey = normalizeVehicleModel(model);
  const entries = DATASET.vehicles.filter((entry) => {
    if (entry.make !== makeKey) return false;
    if (modelKey && entry.model !== modelKey) return false;
    if (year == null) return true;
    return year >= entry.from && year <= entry.to;
  });

  const overlappingYearRanges: TyreCatalogDiagnostics['overlappingYearRanges'] = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const first = entries[i];
      const second = entries[j];
      if (first.model !== second.model) continue;
      if (Math.max(first.from, second.from) > Math.min(first.to, second.to)) continue;
      const firstSize = tyreDisplay(fitmentSize(entryFitments(first)[0]));
      const secondSize = tyreDisplay(fitmentSize(entryFitments(second)[0]));
      overlappingYearRanges.push({
        make: first.make,
        model: first.model,
        first: {
          from: first.from,
          to: first.to,
          variant: first.variant ?? null,
          size: firstSize,
        },
        second: {
          from: second.from,
          to: second.to,
          variant: second.variant ?? null,
          size: secondSize,
        },
        conflictingSizes: Boolean(firstSize && secondSize && firstSize !== secondSize),
      });
    }
  }

  const conflictCount = overlappingYearRanges.filter((item) => item.conflictingSizes).length;
  const messages: string[] = [];
  if (overlappingYearRanges.length > 0) {
    messages.push(
      conflictCount > 0
        ? 'The local catalogue has overlapping year ranges with conflicting sizes; confirm the exact sidewall before booking.'
        : 'The local catalogue has overlapping year ranges; confirm the exact vehicle variant and sidewall before booking.',
    );
  }

  return {
    overlappingYearRanges: overlappingYearRanges.slice(0, 12),
    messages,
  };
}

/** Test seam — exposes the dataset size so tests can assert it isn't empty. */
export function __datasetSizeForTests(): number {
  return DATASET.vehicles.length;
}
