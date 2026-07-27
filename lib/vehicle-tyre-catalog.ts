/**
 * SERVER-ONLY tyre fitment resolver.
 *
 * Runtime sources are deliberately local:
 * 1. Neon `vehicle_tyre_fitments` records confirmed by an operator.
 * 2. Read-only exact-registration seed JSON, if populated.
 * 3. The internal legacy make/model/year JSON catalogue.
 *
 * Catalogue rows are suggestions only. Booking/pricing still requires an
 * operator to confirm the tyre sidewall.
 */

import localVrmCatalog from '@/lib/data/vrm-tyre-fitments.json';
import {
  diagnoseTyreCatalogCandidates,
  findTyreSizeCandidatesForVehicle,
} from '@/lib/tyre-sizes';
import {
  buildDvlaVehicleFingerprint,
  loadConfirmedVrmFitment,
  type ConfirmedFitmentStoreRecord,
} from '@/lib/vehicle-fitment-store';
import type {
  TyreFitmentOption,
  TyreFitmentResolution,
  TyreFitmentLine,
  TyreFitmentSource,
  TyreSize,
  Vehicle,
} from '@/types/vehicle';

const MAX_OPTIONS = 16;

type JsonRecord = Record<string, unknown>;

interface LocalVrmCatalogDataset {
  records?: unknown[];
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function boolValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'runflat', 'run flat'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return undefined;
}

function getCaseInsensitive(record: JsonRecord | null, key: string): unknown {
  if (!record) return undefined;
  const exact = record[key];
  if (exact !== undefined) return exact;
  const found = Object.keys(record).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return found ? record[found] : undefined;
}

function firstString(record: JsonRecord | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(getCaseInsensitive(record, key));
    if (value) return value;
  }
  return null;
}

function firstBoolean(record: JsonRecord | null, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = boolValue(getCaseInsensitive(record, key));
    if (value !== undefined) return value;
  }
  return undefined;
}

function tyreDisplay(size: TyreSize): string {
  const suffix = `${size.rim}${size.commercial ? 'C' : ''}`;
  return `${size.width}/${size.aspect}R${suffix}`;
}

function sameTyreSize(a: TyreSize, b: TyreSize): boolean {
  return (
    a.width === b.width &&
    a.aspect === b.aspect &&
    a.rim === b.rim &&
    Boolean(a.commercial) === Boolean(b.commercial)
  );
}

function withTyreMeta(
  size: TyreSize,
  record: JsonRecord | null,
  source: TyreFitmentSource,
): TyreSize {
  const enriched: TyreSize = {
    ...size,
    source,
    sizeDisplay: size.sizeDisplay ?? tyreDisplay(size),
  };
  const loadIndex = firstString(record, ['loadIndex', 'LoadIndex', 'load_index']);
  const speedIndex = firstString(record, ['speedIndex', 'SpeedIndex', 'speed_index']);
  const runFlat = firstBoolean(record, ['runFlat', 'RunFlat', 'run_flat']);
  const xl = firstBoolean(record, ['xl', 'XL']);
  const commercial = firstBoolean(record, ['commercial', 'Commercial']);
  if (loadIndex) enriched.loadIndex = loadIndex;
  if (speedIndex) enriched.speedIndex = speedIndex;
  if (runFlat !== undefined) enriched.runFlat = runFlat;
  if (xl !== undefined) enriched.xl = xl;
  if (commercial !== undefined) enriched.commercial = commercial;
  return enriched;
}

export function parseTyreSizeText(input: unknown): TyreSize | null {
  const text = stringValue(input);
  if (!text) return null;

  const match = text
    .toUpperCase()
    .replace(/\s+/g, '')
    .match(/(\d{3})\/(\d{2,3})\/?Z?R(\d{2})(C)?\b/);

  if (!match) return null;

  const width = Number(match[1]);
  const aspect = Number(match[2]);
  const rim = Number(match[3]);
  if (width < 100 || width > 400 || aspect < 20 || aspect > 100 || rim < 10 || rim > 26) {
    return null;
  }

  const commercial = match[4] === 'C';
  return {
    width: String(width),
    aspect: String(aspect),
    rim: String(rim),
    commercial,
    sizeDisplay: `${width}/${aspect}R${rim}${commercial ? 'C' : ''}`,
  };
}

function sizeFromStructuredTyre(record: JsonRecord | null): TyreSize | null {
  if (!record) return null;

  const direct = parseTyreSizeText(
    firstString(record, [
      'Size',
      'size',
      'TyreSize',
      'tyreSize',
      'tyre_size',
      'sizeDisplay',
    ]),
  );
  if (direct) return direct;

  const width = firstString(record, ['SectionWidth', 'sectionWidth', 'width', 'Width']);
  const aspect = firstString(record, ['AspectRatio', 'aspectRatio', 'aspect', 'Aspect']);
  const rim = firstString(record, ['RimDiameter', 'rimDiameter', 'rim', 'Rim', 'WheelDiameter']);
  if (!width || !aspect || !rim) return null;

  return parseTyreSizeText(`${width}/${aspect}R${rim}`);
}

function sourceLabel(source: TyreFitmentSource): string {
  switch (source) {
    case 'local_vrm_catalog':
      return 'Locally confirmed';
    case 'local_vehicle_catalog':
      return 'Tyre Rescue vehicle catalogue';
    case 'static_dataset':
      return 'Read-only local seed';
    case 'assisted_chat_sidewall':
      return 'Assisted Chat sidewall confirmation';
  }
}

function createOption(args: {
  source: TyreFitmentSource;
  label: string;
  front: TyreSize;
  rear?: TyreSize | null;
  confidence: TyreFitmentOption['confidence'];
  oem?: boolean;
  optional?: boolean;
  vehicleModel?: string;
  vehicleVariant?: string | null;
  fitmentRank?: number;
  notes?: string[];
  tyreLines?: TyreFitmentLine[];
}): TyreFitmentOption {
  const rear = args.rear ?? args.front;
  const staggered = !sameTyreSize(args.front, rear);
  const key = `${args.source}-${tyreDisplay(args.front)}-${tyreDisplay(rear)}-${args.label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    id: key,
    label: args.label,
    front: {
      ...args.front,
      oem: args.oem,
      fallback: false,
      source: args.source,
      sizeDisplay: args.front.sizeDisplay ?? tyreDisplay(args.front),
    },
    rear: {
      ...rear,
      oem: args.oem,
      fallback: false,
      source: args.source,
      sizeDisplay: rear.sizeDisplay ?? tyreDisplay(rear),
    },
    source: args.source,
    sourceLabel: sourceLabel(args.source),
    confidence: args.confidence,
    oem: args.oem,
    optional: args.optional,
    staggered,
    vehicleModel: args.vehicleModel,
    vehicleVariant: args.vehicleVariant,
    fitmentRank: args.fitmentRank,
    notes: args.notes?.filter(Boolean),
    tyreLines: args.tyreLines?.map((line, index) => ({
      ...line,
      id: line.id ?? `tyre-${index + 1}`,
      quantity: Math.max(1, Math.min(10, Math.round(Number(line.quantity) || 1))),
      size: {
        ...line.size,
        source: args.source,
        sizeDisplay: line.size.sizeDisplay ?? tyreDisplay(line.size),
      },
    })),
  };
}

function pushUnique(options: TyreFitmentOption[], option: TyreFitmentOption): void {
  const key = `${option.source}|${tyreDisplay(option.front)}|${tyreDisplay(option.rear)}`;
  const exists = options.some(
    (existing) => `${existing.source}|${tyreDisplay(existing.front)}|${tyreDisplay(existing.rear)}` === key,
  );
  if (!exists) options.push(option);
}

function dedupeOptionsBySize(options: TyreFitmentOption[]): TyreFitmentOption[] {
  const unique: TyreFitmentOption[] = [];
  options.forEach((option) => pushUnique(unique, option));
  return unique;
}

function normalizeRegistration(value: unknown): string {
  return stringValue(value)?.toUpperCase().replace(/[^A-Z0-9]+/g, '') ?? '';
}

function localTyreSizeFromValue(value: unknown, source: TyreFitmentSource): TyreSize | null {
  const direct = parseTyreSizeText(value);
  if (direct) return { ...direct, source };

  const record = asRecord(value);
  if (!record) return null;

  const structured = sizeFromStructuredTyre(record);
  if (!structured) return null;

  return withTyreMeta(structured, record, source);
}

function quantityValue(value: unknown): number {
  const quantity = Number(value);
  return Math.max(1, Math.min(10, Math.round(Number.isFinite(quantity) ? quantity : 1)));
}

function localTyreLineFromValue(
  value: unknown,
  source: TyreFitmentSource,
  index: number,
): TyreFitmentLine | null {
  const record = asRecord(value);
  const size = localTyreSizeFromValue(value, source);
  if (!size) return null;
  const axle = firstString(record, ['axle', 'Axle', 'position', 'Position']);
  return {
    id: firstString(record, ['id', 'lineId', 'line_id']) ?? `tyre-${index + 1}`,
    size,
    quantity: quantityValue(getCaseInsensitive(record, 'quantity')),
    axle: axle ? axle.toLowerCase() : null,
    loadIndex: size.loadIndex ?? firstString(record, ['loadIndex', 'LoadIndex', 'load_index']),
    speedIndex: size.speedIndex ?? firstString(record, ['speedIndex', 'SpeedIndex', 'speed_index']),
    runFlat: size.runFlat ?? firstBoolean(record, ['runFlat', 'RunFlat', 'run_flat']) ?? null,
    xl: size.xl ?? firstBoolean(record, ['xl', 'XL']) ?? null,
    commercial: size.commercial ?? firstBoolean(record, ['commercial', 'Commercial']) ?? null,
  };
}

function localOptionFromValue(
  raw: unknown,
  source: TyreFitmentSource,
  fallbackLabel: string,
): TyreFitmentOption | null {
  const record = asRecord(raw);
  const tyreLines = asArray(getCaseInsensitive(record, 'tyreLines'));
  const parsedTyreLines = tyreLines
    .map((line, index) => localTyreLineFromValue(line, source, index))
    .filter((line): line is TyreFitmentLine => Boolean(line));
  const firstLine = parsedTyreLines[0] ?? null;
  const secondDistinctLine = parsedTyreLines
    .find((line) => {
      if (!firstLine) return false;
      return !sameTyreSize(firstLine.size, line.size);
    });

  const frontValue =
    firstLine?.size ??
    (record
      ? getCaseInsensitive(record, 'front') ??
        getCaseInsensitive(record, 'Front') ??
        getCaseInsensitive(record, 'size') ??
        getCaseInsensitive(record, 'Size') ??
        getCaseInsensitive(record, 'tyreSize') ??
        getCaseInsensitive(record, 'tyre_size')
      : raw);
  const rearValue = secondDistinctLine?.size ?? (record
    ? getCaseInsensitive(record, 'rear') ?? getCaseInsensitive(record, 'Rear')
    : undefined);

  const front = localTyreSizeFromValue(frontValue, source);
  if (!front) return null;
  const rear = localTyreSizeFromValue(rearValue, source) ?? front;
  const confidence = firstString(record, ['confidence', 'Confidence']);
  const parsedConfidence =
    confidence === 'high' || confidence === 'medium' || confidence === 'low'
      ? confidence
      : source === 'local_vrm_catalog'
        ? 'high'
        : 'medium';
  const oem = firstBoolean(record, ['oem', 'Oem', 'OEM']) ?? source === 'local_vrm_catalog';
  const optional = firstBoolean(record, ['optional', 'Optional']) ?? false;
  const notesValue = getCaseInsensitive(record, 'notes') ?? getCaseInsensitive(record, 'Notes');
  const notes = asArray(notesValue)
    .map((note) => stringValue(note))
    .filter((note): note is string => Boolean(note));

  if (tyreLines.length > 2) {
    notes.push('This confirmation included more than two tyre lines; review all saved line details before repeating the booking.');
  }

  return createOption({
    source,
    label: firstString(record, ['label', 'Label', 'description', 'Description']) ?? fallbackLabel,
    front,
    rear,
    confidence: parsedConfidence,
    oem,
    optional,
    notes,
    tyreLines: parsedTyreLines.length > 0 ? parsedTyreLines : undefined,
  });
}

function optionsFromLocalValues(
  values: unknown[],
  source: TyreFitmentSource,
  fallbackLabel: string,
): TyreFitmentOption[] {
  const options: TyreFitmentOption[] = [];
  values.forEach((value, index) => {
    const option = localOptionFromValue(
      value,
      source,
      index === 0 ? fallbackLabel : `${fallbackLabel} ${index + 1}`,
    );
    if (option) pushUnique(options, option);
  });
  return options.slice(0, MAX_OPTIONS);
}

export function optionsFromConfirmedFitmentRecord(
  record: ConfirmedFitmentStoreRecord,
): TyreFitmentOption[] {
  return optionsFromLocalValues(
    record.options,
    'local_vrm_catalog',
    'Previously confirmed registration fitment',
  );
}

function upperRecordText(record: JsonRecord | null, key: string): string | null {
  const value = stringValue(getCaseInsensitive(record, key));
  return value ? value.toUpperCase() : null;
}

function numberRecordValue(record: JsonRecord | null, key: string): number | null {
  const value = getCaseInsensitive(record, key);
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function legacySeedRecordMatchesVehicle(record: JsonRecord, vehicle: Vehicle): boolean {
  const make = upperRecordText(record, 'make');
  if (make && make !== vehicle.make.toUpperCase()) return false;

  const year = numberRecordValue(record, 'yearOfManufacture');
  if (year != null && vehicle.yearOfManufacture != null && year !== vehicle.yearOfManufacture) return false;

  const fuelType = upperRecordText(record, 'fuelType');
  if (fuelType && vehicle.fuelType && fuelType !== vehicle.fuelType.toUpperCase()) return false;

  return true;
}

function lookupReadOnlySeedVrmOptions(
  vrm: string,
  vehicle: Vehicle,
): { options: TyreFitmentOption[]; messages: string[] } {
  const dataset = localVrmCatalog as LocalVrmCatalogDataset;
  const normalized = normalizeRegistration(vrm);
  const options: TyreFitmentOption[] = [];
  const messages: string[] = [];
  const currentFingerprint = buildDvlaVehicleFingerprint(vehicle).value;

  for (const raw of dataset.records ?? []) {
    const record = asRecord(raw);
    if (!record || normalizeRegistration(getCaseInsensitive(record, 'registrationNumber')) !== normalized) {
      continue;
    }

    const storedFingerprint =
      firstString(record, ['vehicleFingerprint', 'vehicle_fingerprint', 'dvlaFingerprint']) ?? null;
    if (storedFingerprint && storedFingerprint !== currentFingerprint) {
      messages.push('Read-only seed fitment was ignored because the DVLA vehicle fingerprint changed.');
      continue;
    }
    if (!storedFingerprint && !legacySeedRecordMatchesVehicle(record, vehicle)) {
      messages.push('Read-only seed fitment was ignored because its vehicle details do not match DVLA.');
      continue;
    }

    const fitments = asArray(getCaseInsensitive(record, 'options'));
    const values = fitments.length > 0 ? fitments : [record];
    optionsFromLocalValues(
      values,
      storedFingerprint ? 'local_vrm_catalog' : 'static_dataset',
      storedFingerprint ? 'Confirmed registration seed fitment' : 'Suggested registration seed fitment',
    ).forEach((option) => {
      option.notes = [
        ...(option.notes ?? []),
        storedFingerprint
          ? 'Matched read-only seed data with the same DVLA fingerprint.'
          : 'Read-only seed data has no DVLA fingerprint; confirm the tyre sidewall before quoting.',
      ];
      pushUnique(options, option);
    });
  }

  return { options: options.slice(0, MAX_OPTIONS), messages };
}

function localCandidateOptions(vehicle: Vehicle): { options: TyreFitmentOption[]; messages: string[] } {
  const diagnostics = diagnoseTyreCatalogCandidates(vehicle.make, vehicle.model, vehicle.yearOfManufacture);
  const candidates = findTyreSizeCandidatesForVehicle(
    vehicle.make,
    vehicle.model,
    vehicle.yearOfManufacture,
    MAX_OPTIONS,
  ).map((candidate, index) =>
    createOption({
      source: 'local_vehicle_catalog',
      label: `${candidate.model}${candidate.variant ? ` ${candidate.variant}` : ''} catalogue candidate`,
      front: {
        ...candidate.size,
        source: 'local_vehicle_catalog',
      },
      rear: {
        ...(candidate.rearSize ?? candidate.size),
        source: 'local_vehicle_catalog',
      },
      confidence: 'medium',
      oem: true,
      optional: Boolean(candidate.optional || candidate.variant),
      vehicleModel: candidate.model,
      vehicleVariant: candidate.variant,
      fitmentRank: index + 1,
      notes: [
        candidate.matchReason,
        vehicle.model
          ? 'Confirm the exact variant and tyre sidewall before booking.'
          : 'DVLA did not provide the model; confirm the model, variant and tyre sidewall before booking.',
        ...diagnostics.messages,
      ],
    }),
  );
  return { options: dedupeOptionsBySize(candidates).slice(0, MAX_OPTIONS), messages: diagnostics.messages };
}

export async function resolveTyreFitmentsByVrm(
  vrm: string,
  vehicle: Vehicle,
): Promise<TyreFitmentResolution> {
  const confirmed = await loadConfirmedVrmFitment(vrm, vehicle);
  const confirmedMessages = confirmed.messages;
  if (confirmed.kind === 'match') {
    const options = optionsFromConfirmedFitmentRecord(confirmed.record);
    if (options.length > 0) {
      return {
        options,
        status: 'local_catalog',
        provider: 'vehicle_tyre_fitments',
        messages: confirmedMessages,
      };
    }
  }

  const seed = lookupReadOnlySeedVrmOptions(vrm, vehicle);
  if (seed.options.length > 0) {
    return {
      options: seed.options,
      status: 'local_catalog',
      provider: 'readonly_seed_vrm_catalog',
      messages: [...confirmedMessages, ...seed.messages, 'Matched a read-only registration seed catalog.'],
    };
  }

  const localCandidates = localCandidateOptions(vehicle);
  if (localCandidates.options.length > 0) {
    return {
      options: localCandidates.options,
      status: 'local_catalog',
      provider: 'local_vehicle_catalog',
      messages: [
        ...confirmedMessages,
        ...seed.messages,
        ...localCandidates.messages,
        'No exact registration fitment was found. Showing local catalogue candidates for model, variant and sidewall confirmation.',
      ],
    };
  }

  return {
    options: [],
    status: 'miss',
    provider: null,
    messages: [
      ...confirmedMessages,
      ...seed.messages,
      'No local tyre fitment candidate was found. Enter the tyre size from the sidewall manually.',
    ],
  };
}
