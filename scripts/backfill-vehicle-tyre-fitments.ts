import { createHash } from 'crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { bookings, invoices, quickBookings, vehicleTyreFitments } from '../lib/db/schema';
import { normalizeVrm, isValidVrm } from '../lib/vrm';
import { buildDvlaVehicleFingerprint, saveConfirmedVrmFitmentRecord } from '../lib/vehicle-fitment-store';
import { parseTyreSizeText } from '../lib/vehicle-tyre-catalog';
import type { Vehicle } from '../types/vehicle';

type JsonRecord = Record<string, unknown>;

interface Candidate {
  source: 'booking' | 'quick_booking' | 'invoice_booking';
  sourceId: string;
  registrationNumber: string;
  vehicle: Vehicle;
  tyreLines: Array<{
    size: string;
    quantity: number;
    sourcePath: string;
    axle?: string | null;
    loadIndex?: string | null;
    speedIndex?: string | null;
    runFlat?: boolean | null;
    xl?: boolean | null;
    commercial?: boolean | null;
  }>;
  confidence: 'structured';
  notes: string[];
  sourceRefs?: Array<{ source: Candidate['source']; sourceId: string }>;
}

interface ReviewItem {
  source: Candidate['source'];
  sourceId: string;
  reason: string;
  registrationNumber?: string | null;
  make?: string | null;
  model?: string | null;
  tyreSize?: string | null;
}

type RejectionCategory =
  | 'invalid_tyre_size_format'
  | 'missing_vrm'
  | 'missing_vehicle_identity'
  | 'missing_structured_tyre_lines'
  | 'insufficient_data'
  | 'rejected_other';

interface RejectedItem {
  source: Candidate['source'];
  sourceId: string;
  categories: RejectionCategory[];
  primaryCategory: RejectionCategory;
  reason: string;
  registrationNumber?: string | null;
  make?: string | null;
  model?: string | null;
  tyreSize?: string | null;
  tyreSizePattern?: string | null;
}

type SourceStats = {
  scannedRows: number;
  structurallyValid: number;
  accepted: number;
  ambiguous: number;
  conflicting: number;
  invalidTyreSizes: number;
  missingVrms: number;
  missingVehicleIdentity: number;
  missingStructuredTyreLines: number;
  insufficientData: number;
  rejectedOther: number;
  existingRecords: number;
  wouldInsert: number;
  wouldSkip: number;
  review: number;
  rejected: number;
};

type SourceResult = {
  source: Candidate['source'];
  candidates: Candidate[];
  review: ReviewItem[];
  rejected: RejectedItem[];
  stats: SourceStats;
};

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const reviewed = args.has('--reviewed');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length)) || 500) : 500;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function boolValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'runflat', 'run flat'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return null;
}

function emptyStats(): SourceStats {
  return {
    scannedRows: 0,
    structurallyValid: 0,
    accepted: 0,
    ambiguous: 0,
    conflicting: 0,
    invalidTyreSizes: 0,
    missingVrms: 0,
    missingVehicleIdentity: 0,
    missingStructuredTyreLines: 0,
    insufficientData: 0,
    rejectedOther: 0,
    existingRecords: 0,
    wouldInsert: 0,
    wouldSkip: 0,
    review: 0,
    rejected: 0,
  };
}

function emptyStatsBySource(): Record<Candidate['source'], SourceStats> {
  return {
    booking: emptyStats(),
    quick_booking: emptyStats(),
    invoice_booking: emptyStats(),
  };
}

function vehicleFromStructuredFields(input: {
  registrationNumber: string | null;
  make: string | null;
  model: string | null;
  yearOfManufacture?: number | null;
  fuelType?: string | null;
  colour?: string | null;
}): Vehicle | null {
  const registrationNumber = input.registrationNumber ? normalizeVrm(input.registrationNumber) : '';
  if (!registrationNumber || !isValidVrm(registrationNumber) || !input.make?.trim()) return null;
  return {
    registrationNumber,
    make: input.make.trim().toUpperCase(),
    model: input.model?.trim().toUpperCase() || null,
    yearOfManufacture: input.yearOfManufacture ?? null,
    fuelType:
      input.fuelType === 'PETROL' ||
      input.fuelType === 'DIESEL' ||
      input.fuelType === 'ELECTRIC' ||
      input.fuelType === 'HYBRID'
        ? input.fuelType
        : 'OTHER',
    colour: input.colour?.trim().toUpperCase() || null,
  };
}

function maskedVrm(value: string | null | undefined): string | null {
  const normalized = value ? normalizeVrm(value) : '';
  if (!normalized) return null;
  if (normalized.length <= 3) return '*'.repeat(normalized.length);
  return `${'*'.repeat(normalized.length - 3)}${normalized.slice(-3)}`;
}

function sanitizedTyrePattern(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  return raw
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[0-9]/g, '9')
    .replace(/[A-Z]/g, 'A');
}

function rawTyreTextsFromJson(value: unknown, fallback: string | null | undefined): string[] {
  const record = asRecord(value);
  const lines = asArray(record?.tyreLines ?? record?.items);
  const fromJson = lines
    .map((line) => {
      const lineRecord = asRecord(line);
      return text(lineRecord?.size ?? lineRecord?.tyreSize ?? lineRecord?.sizeDisplay);
    })
    .filter((line): line is string => Boolean(line));
  const fallbackText = text(fallback);
  return [...fromJson, ...(fallbackText ? [fallbackText] : [])];
}

function pushRejected(target: RejectedItem[], stats: SourceStats, item: RejectedItem): void {
  target.push(item);
  stats.rejected += 1;
  for (const category of item.categories) {
    if (category === 'invalid_tyre_size_format') stats.invalidTyreSizes += 1;
    else if (category === 'missing_vrm') stats.missingVrms += 1;
    else if (category === 'missing_vehicle_identity') stats.missingVehicleIdentity += 1;
    else if (category === 'missing_structured_tyre_lines') stats.missingStructuredTyreLines += 1;
    else if (category === 'insufficient_data') stats.insufficientData += 1;
    else stats.rejectedOther += 1;
  }
}

function classifyRejectedRow(input: {
  source: Candidate['source'];
  sourceId: string;
  registrationNumber: string | null;
  make: string | null;
  model: string | null;
  tyreSize: string | null;
  rawTyreTexts: string[];
  vehicle: Vehicle | null;
  hasTyreLines: boolean;
}): RejectedItem {
  const categories: RejectionCategory[] = [];
  const normalizedVrm = input.registrationNumber ? normalizeVrm(input.registrationNumber) : '';
  if (!normalizedVrm) categories.push('missing_vrm');
  else if (!isValidVrm(normalizedVrm) || !input.make?.trim()) categories.push('missing_vehicle_identity');

  if (!input.hasTyreLines) {
    if (input.rawTyreTexts.length > 0) categories.push('invalid_tyre_size_format');
    else categories.push('missing_structured_tyre_lines');
  }

  if (categories.length > 1) categories.push('insufficient_data');
  if (categories.length === 0) categories.push('rejected_other');

  const uniqueCategories = [...new Set(categories)];
  const firstTyreText = input.rawTyreTexts[0] ?? input.tyreSize ?? null;
  return {
    source: input.source,
    sourceId: input.sourceId,
    categories: uniqueCategories,
    primaryCategory: uniqueCategories[0],
    registrationNumber: maskedVrm(input.registrationNumber),
    make: input.make,
    model: input.model,
    tyreSize: firstTyreText,
    tyreSizePattern: sanitizedTyrePattern(firstTyreText),
    reason: uniqueCategories.join(', '),
  };
}

function tyreLine(size: string | null, quantity: unknown, sourcePath: string): Candidate['tyreLines'][number] | null {
  const parsed = parseTyreSizeText(size);
  if (!parsed?.sizeDisplay) return null;
  const qty = Math.max(1, Math.min(10, Math.round(Number(quantity) || 1)));
  return {
    size: parsed.sizeDisplay,
    quantity: qty,
    sourcePath,
    commercial: parsed.commercial ?? null,
  };
}

function linesFromJson(value: unknown, sourcePath: string): Candidate['tyreLines'] {
  const record = asRecord(value);
  const lines = asArray(record?.tyreLines ?? record?.items);
  return lines
    .map((line, index): Candidate['tyreLines'][number] | null => {
      const lineRecord = asRecord(line);
      const parsedLine = tyreLine(
        text(lineRecord?.size ?? lineRecord?.tyreSize ?? lineRecord?.sizeDisplay),
        lineRecord?.quantity,
        `${sourcePath}.tyreLines[${index}]`,
      );
      if (!parsedLine) return null;
      return {
        ...parsedLine,
        axle: text(lineRecord?.axle ?? lineRecord?.position)?.toLowerCase() ?? null,
        loadIndex: text(lineRecord?.loadIndex ?? lineRecord?.load_index),
        speedIndex: text(lineRecord?.speedIndex ?? lineRecord?.speed_index),
        runFlat: boolValue(lineRecord?.runFlat ?? lineRecord?.run_flat),
        xl: boolValue(lineRecord?.xl),
        commercial: boolValue(lineRecord?.commercial) ?? parsedLine.commercial ?? null,
      };
    })
    .filter((line): line is Candidate['tyreLines'][number] => Boolean(line));
}

function uniqueLines(lines: Candidate['tyreLines']): Candidate['tyreLines'] {
  const byKey = new Map<string, Candidate['tyreLines'][number]>();
  for (const line of lines) {
    const key = [
      line.size.toUpperCase(),
      line.axle ?? '',
      line.loadIndex ?? '',
      line.speedIndex ?? '',
      line.runFlat ?? '',
      line.xl ?? '',
      line.commercial ?? '',
    ].join('|');
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, quantity: existing.quantity + line.quantity } : line);
  }
  return [...byKey.values()];
}

function sameVehicle(a: Vehicle, b: Vehicle): boolean {
  return buildDvlaVehicleFingerprint(a).value === buildDvlaVehicleFingerprint(b).value;
}

function lineSignature(line: Candidate['tyreLines'][number]): string {
  return [
    line.quantity,
    line.size.toUpperCase(),
    line.axle ?? '',
    line.loadIndex ?? '',
    line.speedIndex ?? '',
    line.runFlat ?? '',
    line.xl ?? '',
    line.commercial ?? '',
  ].join(':');
}

function mergeCandidates(candidates: Candidate[]): { accepted: Candidate[]; review: ReviewItem[] } {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = candidate.registrationNumber;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const accepted: Candidate[] = [];
  const review: ReviewItem[] = [];

  for (const [registrationNumber, group] of groups) {
    const first = group[0];
    const conflictingVehicle = group.some((candidate) => !sameVehicle(first.vehicle, candidate.vehicle));
    const sizeSets = new Set(group.map((candidate) => candidate.tyreLines.map(lineSignature).sort().join('|')));
    if (conflictingVehicle || sizeSets.size > 1) {
      group.forEach((candidate) => {
        review.push({
          source: candidate.source,
          sourceId: candidate.sourceId,
          registrationNumber,
          make: candidate.vehicle.make,
          model: candidate.vehicle.model,
          tyreSize: candidate.tyreLines.map((line) => `${line.quantity} x ${line.size}`).join(', '),
          reason: conflictingVehicle
            ? 'Structured records disagree on the DVLA-stable vehicle identity.'
            : 'Structured records disagree on tyre sizes.',
        });
      });
      continue;
    }

    accepted.push({
      ...first,
      tyreLines: uniqueLines(group.flatMap((candidate) => candidate.tyreLines)),
      notes: [...new Set(group.flatMap((candidate) => candidate.notes))],
      sourceRefs: group.map((candidate) => ({ source: candidate.source, sourceId: candidate.sourceId })),
    });
  }

  return { accepted, review };
}

async function bookingCandidates(): Promise<SourceResult> {
  const rows = await db
    .select({
      id: bookings.id,
      registrationNumber: bookings.vehicleReg,
      make: bookings.vehicleMake,
      model: bookings.vehicleModel,
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      quantity: bookings.quantity,
      priceSnapshot: bookings.priceSnapshot,
    })
    .from(bookings)
    .where(sql`${bookings.vehicleReg} IS NOT NULL`)
    .orderBy(asc(bookings.createdAt), asc(bookings.id))
    .limit(limit);

  const candidates: Candidate[] = [];
  const review: ReviewItem[] = [];
  const rejected: RejectedItem[] = [];
  const stats = emptyStats();
  stats.scannedRows = rows.length;

  for (const row of rows) {
    const vehicle = vehicleFromStructuredFields({
      registrationNumber: row.registrationNumber,
      make: row.make,
      model: row.model,
    });
    const jsonLines = linesFromJson(row.priceSnapshot, 'bookings.priceSnapshot');
    const legacyLine = tyreLine(row.tyreSizeDisplay, row.quantity, 'bookings.tyreSizeDisplay');
    const lines = uniqueLines(jsonLines.length > 0
      ? jsonLines
      : [legacyLine].filter((line): line is Candidate['tyreLines'][number] => Boolean(line)));

    if (!vehicle || lines.length === 0) {
      pushRejected(rejected, stats, classifyRejectedRow({
        source: 'booking',
        sourceId: row.id,
        registrationNumber: row.registrationNumber,
        make: row.make,
        model: row.model,
        tyreSize: row.tyreSizeDisplay,
        rawTyreTexts: rawTyreTextsFromJson(row.priceSnapshot, row.tyreSizeDisplay),
        vehicle,
        hasTyreLines: lines.length > 0,
      }));
      continue;
    }

    stats.structurallyValid += 1;
    candidates.push({
      source: 'booking',
      sourceId: row.id,
      registrationNumber: vehicle.registrationNumber,
      vehicle,
      tyreLines: lines,
      confidence: 'structured',
      notes: ['Backfilled from booking structured vehicle and tyre fields.'],
    });
  }

  return { source: 'booking', candidates, review, rejected, stats };
}

async function quickBookingCandidates(): Promise<SourceResult> {
  const rows = await db
    .select({
      id: quickBookings.id,
      tyreSize: quickBookings.tyreSize,
      tyreCount: quickBookings.tyreCount,
      priceBreakdown: quickBookings.priceBreakdown,
    })
    .from(quickBookings)
    .where(sql`${quickBookings.priceBreakdown} IS NOT NULL`)
    .orderBy(asc(quickBookings.createdAt), asc(quickBookings.id))
    .limit(limit);

  const candidates: Candidate[] = [];
  const review: ReviewItem[] = [];
  const rejected: RejectedItem[] = [];
  const stats = emptyStats();
  stats.scannedRows = rows.length;

  for (const row of rows) {
    const breakdown = asRecord(row.priceBreakdown);
    const vehicleRecord = asRecord(breakdown?.vehicle);
    const vehicle = vehicleFromStructuredFields({
      registrationNumber: text(vehicleRecord?.registrationNumber),
      make: text(vehicleRecord?.make),
      model: text(vehicleRecord?.model),
      yearOfManufacture: numberValue(vehicleRecord?.yearOfManufacture),
      fuelType: text(vehicleRecord?.fuelType),
      colour: text(vehicleRecord?.colour),
    });
    const jsonLines = linesFromJson(row.priceBreakdown, 'quickBookings.priceBreakdown');
    const legacyLine = tyreLine(row.tyreSize, row.tyreCount, 'quickBookings.tyreSize');
    const lines = uniqueLines(jsonLines.length > 0
      ? jsonLines
      : [legacyLine].filter((line): line is Candidate['tyreLines'][number] => Boolean(line)));

    if (!vehicle || lines.length === 0) {
      pushRejected(rejected, stats, classifyRejectedRow({
        source: 'quick_booking',
        sourceId: row.id,
        registrationNumber: text(vehicleRecord?.registrationNumber),
        make: text(vehicleRecord?.make),
        model: text(vehicleRecord?.model),
        tyreSize: row.tyreSize,
        rawTyreTexts: rawTyreTextsFromJson(row.priceBreakdown, row.tyreSize),
        vehicle,
        hasTyreLines: lines.length > 0,
      }));
      continue;
    }

    stats.structurallyValid += 1;
    candidates.push({
      source: 'quick_booking',
      sourceId: row.id,
      registrationNumber: vehicle.registrationNumber,
      vehicle,
      tyreLines: lines,
      confidence: 'structured',
      notes: ['Backfilled from quick booking structured price breakdown.'],
    });
  }

  return { source: 'quick_booking', candidates, review, rejected, stats };
}

async function invoiceLinkedBookingCandidates(): Promise<SourceResult> {
  const rows = await db
    .select({
      invoiceId: invoices.id,
      bookingId: bookings.id,
      registrationNumber: bookings.vehicleReg,
      make: bookings.vehicleMake,
      model: bookings.vehicleModel,
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      quantity: bookings.quantity,
      priceSnapshot: bookings.priceSnapshot,
    })
    .from(invoices)
    .innerJoin(bookings, eq(invoices.bookingId, bookings.id))
    .where(sql`${bookings.vehicleReg} IS NOT NULL`)
    .orderBy(asc(invoices.issueDate), asc(invoices.id))
    .limit(limit);

  const candidates: Candidate[] = [];
  const review: ReviewItem[] = [];
  const rejected: RejectedItem[] = [];
  const stats = emptyStats();
  stats.scannedRows = rows.length;

  for (const row of rows) {
    const vehicle = vehicleFromStructuredFields({
      registrationNumber: row.registrationNumber,
      make: row.make,
      model: row.model,
    });
    const jsonLines = linesFromJson(row.priceSnapshot, 'invoices.booking.priceSnapshot');
    const legacyLine = tyreLine(row.tyreSizeDisplay, row.quantity, 'invoices.booking.tyreSizeDisplay');
    const lines = uniqueLines(jsonLines.length > 0
      ? jsonLines
      : [legacyLine].filter((line): line is Candidate['tyreLines'][number] => Boolean(line)));

    if (!vehicle || lines.length === 0) {
      pushRejected(rejected, stats, classifyRejectedRow({
        source: 'invoice_booking',
        sourceId: row.invoiceId,
        registrationNumber: row.registrationNumber,
        make: row.make,
        model: row.model,
        tyreSize: row.tyreSizeDisplay,
        rawTyreTexts: rawTyreTextsFromJson(row.priceSnapshot, row.tyreSizeDisplay),
        vehicle,
        hasTyreLines: lines.length > 0,
      }));
      continue;
    }

    stats.structurallyValid += 1;
    candidates.push({
      source: 'invoice_booking',
      sourceId: row.invoiceId,
      registrationNumber: vehicle.registrationNumber,
      vehicle,
      tyreLines: lines,
      confidence: 'structured',
      notes: [`Backfilled through invoice ${row.invoiceId} linked to booking ${row.bookingId}; invoice item text was not used.`],
    });
  }

  return { source: 'invoice_booking', candidates, review, rejected, stats };
}

async function loadExistingFitmentStatuses(registrationNumbers: string[]): Promise<Map<string, string>> {
  const uniqueRegistrations = [...new Set(registrationNumbers)].sort();
  if (uniqueRegistrations.length === 0) return new Map();

  const rows = await db
    .select({
      registrationNumber: vehicleTyreFitments.registrationNumber,
      status: vehicleTyreFitments.status,
    })
    .from(vehicleTyreFitments)
    .where(inArray(vehicleTyreFitments.registrationNumber, uniqueRegistrations))
    .orderBy(asc(vehicleTyreFitments.registrationNumber));

  return new Map(rows.map((row) => [row.registrationNumber, row.status]));
}

function sortedAccepted(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    const registration = a.registrationNumber.localeCompare(b.registrationNumber);
    if (registration !== 0) return registration;
    const source = a.source.localeCompare(b.source);
    if (source !== 0) return source;
    return a.sourceId.localeCompare(b.sourceId);
  });
}

function sortedReview(review: ReviewItem[]): ReviewItem[] {
  return [...review].sort((a, b) => {
    const registration = (a.registrationNumber ?? '').localeCompare(b.registrationNumber ?? '');
    if (registration !== 0) return registration;
    const source = a.source.localeCompare(b.source);
    if (source !== 0) return source;
    return a.sourceId.localeCompare(b.sourceId);
  });
}

function sortedRejected(rejected: RejectedItem[]): RejectedItem[] {
  return [...rejected].sort((a, b) => {
    const category = a.primaryCategory.localeCompare(b.primaryCategory);
    if (category !== 0) return category;
    const registration = (a.registrationNumber ?? '').localeCompare(b.registrationNumber ?? '');
    if (registration !== 0) return registration;
    const source = a.source.localeCompare(b.source);
    if (source !== 0) return source;
    return a.sourceId.localeCompare(b.sourceId);
  });
}

function redactedReviewItem(item: ReviewItem): ReviewItem {
  return {
    ...item,
    registrationNumber: maskedVrm(item.registrationNumber),
  };
}

function redactedVehicle(vehicle: Vehicle): Record<string, unknown> {
  return {
    ...vehicle,
    registrationNumber: maskedVrm(vehicle.registrationNumber),
  };
}

function invalidTyreSizeGroups(rejected: RejectedItem[]) {
  const groups = new Map<string, {
    reason: string;
    tyreSizePattern: string | null;
    count: number;
    sources: Partial<Record<Candidate['source'], number>>;
  }>();

  for (const item of rejected) {
    if (!item.categories.includes('invalid_tyre_size_format')) continue;
    const key = `${item.reason}|${item.tyreSizePattern ?? 'unknown'}`;
    const existing = groups.get(key) ?? {
      reason: item.reason,
      tyreSizePattern: item.tyreSizePattern ?? null,
      count: 0,
      sources: {},
    };
    existing.count += 1;
    existing.sources[item.source] = (existing.sources[item.source] ?? 0) + 1;
    groups.set(key, existing);
  }

  return [...groups.values()].sort((a, b) => {
    const reason = a.reason.localeCompare(b.reason);
    if (reason !== 0) return reason;
    return (a.tyreSizePattern ?? '').localeCompare(b.tyreSizePattern ?? '');
  });
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function digestReport(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

async function run() {
  if (write && !reviewed) {
    throw new Error('Refusing to write without --reviewed. Run the dry run first and approve the review list.');
  }

  const sources = await Promise.all([
    bookingCandidates(),
    quickBookingCandidates(),
    invoiceLinkedBookingCandidates(),
  ]);
  const candidates = sources.flatMap((source) => source.candidates);
  const sourceReview = sources.flatMap((source) => source.review);
  const sourceRejected = sources.flatMap((source) => source.rejected);
  const merged = mergeCandidates(candidates);
  const existingStatuses = await loadExistingFitmentStatuses(
    merged.accepted.map((candidate) => candidate.registrationNumber),
  );
  const sourceStats = emptyStatsBySource();
  for (const sourceResult of sources) {
    sourceStats[sourceResult.source] = { ...sourceResult.stats };
  }

  for (const item of sourceReview) {
    sourceStats[item.source].review += 1;
  }
  for (const item of merged.review) {
    const conflict = /vehicle identity/i.test(item.reason);
    if (conflict) sourceStats[item.source].conflicting += 1;
    else sourceStats[item.source].ambiguous += 1;
    sourceStats[item.source].review += 1;
  }

  const accepted = sortedAccepted(merged.accepted);
  for (const candidate of accepted) {
    const sourceRefs = candidate.sourceRefs ?? [{ source: candidate.source, sourceId: candidate.sourceId }];
    const exists = existingStatuses.has(candidate.registrationNumber);
    for (const ref of sourceRefs) {
      sourceStats[ref.source].accepted += 1;
      if (exists) {
        sourceStats[ref.source].existingRecords += 1;
        sourceStats[ref.source].wouldSkip += 1;
      } else {
        sourceStats[ref.source].wouldInsert += 1;
      }
    }
  }

  let written = 0;
  const writeErrors: ReviewItem[] = [];

  if (write) {
    for (const candidate of accepted) {
      if (existingStatuses.has(candidate.registrationNumber)) continue;
      try {
        const uniqueSizes = uniqueLines(candidate.tyreLines);
        const front = parseTyreSizeText(uniqueSizes[0]?.size);
        const rear = parseTyreSizeText(uniqueSizes[1]?.size) ?? front;
        if (!front || !rear) continue;
        await saveConfirmedVrmFitmentRecord({
          registrationNumber: candidate.registrationNumber,
          vehicle: candidate.vehicle,
          confirmedByUserId: null,
          sizeDisplay: front.sizeDisplay === rear.sizeDisplay
            ? front.sizeDisplay ?? candidate.tyreLines[0].size
            : `Front ${front.sizeDisplay} / Rear ${rear.sizeDisplay}`,
          options: [
            {
              label: 'Reviewed historical structured booking fitment',
              front,
              rear,
              confidence: 'high',
              oem: false,
              source: 'assisted_chat_sidewall',
              notes: candidate.notes,
              tyreLines: uniqueSizes,
            },
          ],
        });
        written += 1;
      } catch (error) {
        writeErrors.push({
          source: candidate.source,
          sourceId: candidate.sourceId,
          registrationNumber: candidate.registrationNumber,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const item of writeErrors) {
    sourceStats[item.source].review += 1;
  }

  const review = sortedReview([...sourceReview, ...merged.review, ...writeErrors]);
  const rejected = sortedRejected(sourceRejected);
  const failedWrites = new Set(writeErrors.map((item) => item.registrationNumber).filter(Boolean));
  const report = {
    mode: write ? 'write' : 'dry-run',
    limit,
    totals: {
      recordsScanned: Object.values(sourceStats).reduce((sum, stats) => sum + stats.scannedRows, 0),
      structurallyValid: Object.values(sourceStats).reduce((sum, stats) => sum + stats.structurallyValid, 0),
      acceptedRecords: accepted.length,
      ambiguous: Object.values(sourceStats).reduce((sum, stats) => sum + stats.ambiguous, 0),
      conflicting: Object.values(sourceStats).reduce((sum, stats) => sum + stats.conflicting, 0),
      invalidTyreSizes: Object.values(sourceStats).reduce((sum, stats) => sum + stats.invalidTyreSizes, 0),
      missingVrms: Object.values(sourceStats).reduce((sum, stats) => sum + stats.missingVrms, 0),
      missingVehicleIdentity: Object.values(sourceStats).reduce((sum, stats) => sum + stats.missingVehicleIdentity, 0),
      missingStructuredTyreLines: Object.values(sourceStats).reduce((sum, stats) => sum + stats.missingStructuredTyreLines, 0),
      insufficientData: Object.values(sourceStats).reduce((sum, stats) => sum + stats.insufficientData, 0),
      rejectedOther: Object.values(sourceStats).reduce((sum, stats) => sum + stats.rejectedOther, 0),
      existingRecords: accepted.filter((candidate) => existingStatuses.has(candidate.registrationNumber)).length,
      wouldInsert: accepted.filter((candidate) => !existingStatuses.has(candidate.registrationNumber)).length,
      wouldSkip: accepted.filter((candidate) => existingStatuses.has(candidate.registrationNumber)).length,
      reviewCount: review.length,
      rejectedCount: rejected.length,
    },
    sourceStats,
    written,
    dryRunGuarantee: write
      ? 'Writes were requested with --write and --reviewed.'
      : 'No database writes are performed without --write and --reviewed.',
    deterministicOrdering: ['registrationNumber', 'source', 'sourceId'],
    categoryOverlapSemantics:
      'Rejected rows appear once in rejected[]. Category counters are independent, so a row missing both VRM and tyre details increments each relevant category plus insufficientData. reviewCount is reserved for conflicting structured records and write failures.',
    acceptedPreviewLimit: 5,
    acceptedPreview: accepted.slice(0, 5).map((candidate) => ({
      registrationNumber: maskedVrm(candidate.registrationNumber),
      vehicle: redactedVehicle(candidate.vehicle),
      tyreLines: candidate.tyreLines,
      existingStatus: existingStatuses.get(candidate.registrationNumber) ?? null,
      action: existingStatuses.has(candidate.registrationNumber)
        ? 'would_skip_existing'
        : write && failedWrites.has(candidate.registrationNumber)
        ? 'write_failed'
        : write
        ? 'written'
        : 'would_insert',
      sources: candidate.notes,
      sourceRefs: candidate.sourceRefs ?? [{ source: candidate.source, sourceId: candidate.sourceId }],
    })),
    accepted: accepted.map((candidate) => ({
      registrationNumber: maskedVrm(candidate.registrationNumber),
      vehicle: redactedVehicle(candidate.vehicle),
      tyreLines: candidate.tyreLines,
      existingStatus: existingStatuses.get(candidate.registrationNumber) ?? null,
      action: existingStatuses.has(candidate.registrationNumber)
        ? 'would_skip_existing'
        : write && failedWrites.has(candidate.registrationNumber)
        ? 'write_failed'
        : write
        ? 'written'
        : 'would_insert',
      sources: candidate.notes,
      sourceRefs: candidate.sourceRefs ?? [{ source: candidate.source, sourceId: candidate.sourceId }],
    })),
    invalidTyreSizeGroups: invalidTyreSizeGroups(rejected),
    rejected,
    review: review.map(redactedReviewItem),
  };

  console.log(JSON.stringify({
    ...report,
    deterministicDigest: digestReport(report),
  }, null, 2));
}

run().catch((error) => {
  console.error('[backfill-vehicle-tyre-fitments] failed', error);
  process.exitCode = 1;
});
