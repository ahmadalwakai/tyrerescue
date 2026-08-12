export interface BookingTyreRowSource {
  brand?: string | null;
  pattern?: string | null;
  sizeDisplay?: string | null;
  width?: number | string | null;
  aspect?: number | string | null;
  rim?: number | string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  service?: string | null;
}

export interface BookingTyreDisplayLine {
  id?: string | null;
  size: string;
  quantity: number;
  axle?: string | null;
  loadIndex?: string | null;
  speedIndex?: string | null;
  runFlat?: boolean | null;
  xl?: boolean | null;
  commercial?: boolean | null;
  brand?: string | null;
  pattern?: string | null;
  service?: string | null;
  unitPrice?: number | null;
  source?: string | null;
}

export type BookingTyreDisplaySource = 'canonical' | 'booking_tyres' | 'legacy' | 'empty';

export interface ResolvedBookingTyreDisplay {
  source: BookingTyreDisplaySource;
  lines: BookingTyreDisplayLine[];
}

export interface BookingTyreDisplayInput {
  priceSnapshot?: unknown;
  tyreRows?: BookingTyreRowSource[] | null;
  tyreSizeDisplay?: string | null;
  quantity?: number | string | null;
}

type JsonRecord = Record<string, unknown>;

const STANDARD_SIZE_PATTERN = /^(\d{3})\/(\d{2,3})\/?Z?R(\d{2})(C?)$/i;
const COMPACT_SIZE_PATTERN = /^(\d{3})\/?R(\d{2})(C?)$/i;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function boolValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function quantityValue(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed == null) return null;
  const quantity = Math.round(parsed);
  return quantity > 0 && quantity <= 20 ? quantity : null;
}

function getCaseInsensitive(record: JsonRecord | null, key: string): unknown {
  if (!record) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  const found = Object.keys(record).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return found ? record[found] : undefined;
}

function firstText(record: JsonRecord | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = text(getCaseInsensitive(record, key));
    if (value) return value;
  }
  return null;
}

function firstBoolean(record: JsonRecord | null, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = boolValue(getCaseInsensitive(record, key));
    if (value !== null) return value;
  }
  return null;
}

function canonicalSizeText(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const standard = compact.match(STANDARD_SIZE_PATTERN);
  if (standard) {
    const width = Number(standard[1]);
    const aspect = Number(standard[2]);
    const rim = Number(standard[3]);
    if (width < 100 || width > 400 || aspect < 20 || aspect > 100 || rim < 10 || rim > 26) {
      return null;
    }
    return `${width}/${aspect}R${rim}${standard[4] ? 'C' : ''}`;
  }
  const compactSize = compact.match(COMPACT_SIZE_PATTERN);
  if (compactSize) {
    const width = Number(compactSize[1]);
    const rim = Number(compactSize[2]);
    if (width < 100 || width > 400 || rim < 10 || rim > 26) return null;
    return `${width}/R${rim}${compactSize[3] ? 'C' : ''}`;
  }
  return null;
}

function looseDisplayText(value: unknown): string | null {
  return text(value)?.toUpperCase().replace(/\s+/g, '') ?? null;
}

function sizeFromStructuredValue(value: unknown, strict: boolean): string | null {
  const direct = strict ? canonicalSizeText(value) : looseDisplayText(value);
  if (direct) return direct;

  const record = asRecord(value);
  if (!record) return null;

  const named = firstText(record, [
    'sizeDisplay',
    'normalizedSize',
    'requestedSize',
    'tyreSize',
    'tyre_size',
    'size',
  ]);
  const namedSize = strict ? canonicalSizeText(named) : looseDisplayText(named);
  if (namedSize) return namedSize;

  const width = firstText(record, ['width', 'sectionWidth', 'SectionWidth']);
  const aspect = firstText(record, ['aspect', 'aspectRatio', 'AspectRatio']);
  const rim = firstText(record, ['rim', 'rimDiameter', 'RimDiameter', 'wheelDiameter']);
  if (!width || !rim) return null;

  const commercial =
    firstBoolean(record, ['commercial', 'Commercial']) ??
    (typeof named === 'string' && /C$/i.test(named));
  return aspect
    ? canonicalSizeText(`${width}/${aspect}R${rim}${commercial ? 'C' : ''}`)
    : canonicalSizeText(`${width}/R${rim}${commercial ? 'C' : ''}`);
}

function snapshotLinesArray(snapshot: unknown): unknown[] {
  const record = asRecord(snapshot);
  const direct = record ? getCaseInsensitive(record, 'tyreLines') : undefined;
  if (Array.isArray(direct)) return direct;

  const priceBreakdown = asRecord(getCaseInsensitive(record, 'priceBreakdown'));
  const nested = priceBreakdown ? getCaseInsensitive(priceBreakdown, 'tyreLines') : undefined;
  return Array.isArray(nested) ? nested : [];
}

function lineFromCanonicalValue(value: unknown, index: number): BookingTyreDisplayLine | null {
  const record = asRecord(value);
  if (!record) return null;

  const size =
    sizeFromStructuredValue(getCaseInsensitive(record, 'size'), true) ??
    sizeFromStructuredValue(record, true);
  const quantity = quantityValue(getCaseInsensitive(record, 'quantity'));
  if (!size || quantity == null) return null;

  return {
    id: firstText(record, ['id', 'lineId', 'line_id']) ?? `tyre-${index + 1}`,
    size,
    quantity,
    axle: firstText(record, ['axle', 'position']),
    loadIndex: firstText(record, ['loadIndex', 'load_index']),
    speedIndex: firstText(record, ['speedIndex', 'speed_index']),
    runFlat: firstBoolean(record, ['runFlat', 'run_flat']),
    xl: firstBoolean(record, ['xl']),
    commercial: firstBoolean(record, ['commercial']),
    brand: firstText(record, ['brand']),
    pattern: firstText(record, ['pattern', 'model']),
    service: firstText(record, ['service']),
    unitPrice: numberValue(getCaseInsensitive(record, 'unitPrice')),
    source: firstText(record, ['source']),
  };
}

export function extractCanonicalTyreLines(snapshot: unknown): BookingTyreDisplayLine[] {
  return snapshotLinesArray(snapshot)
    .map((line, index) => lineFromCanonicalValue(line, index))
    .filter((line): line is BookingTyreDisplayLine => Boolean(line));
}

export function tyreRowsToDisplayLines(rows: BookingTyreRowSource[] | null | undefined): BookingTyreDisplayLine[] {
  return (rows ?? []).flatMap((row, index) => {
    const size =
      sizeFromStructuredValue(row.sizeDisplay, false) ??
      (row.width != null && row.aspect != null && row.rim != null
        ? canonicalSizeText(`${row.width}/${row.aspect}R${row.rim}`)
        : null);
    const quantity = quantityValue(row.quantity) ?? 1;
    if (!size) return [];
    return [{
      id: `booking-tyre-${index + 1}`,
      size,
      quantity,
      brand: row.brand ?? null,
      pattern: row.pattern ?? null,
      service: row.service ?? null,
      unitPrice: numberValue(row.unitPrice),
    }];
  });
}

export function legacyTyreLine(
  tyreSizeDisplay: string | null | undefined,
  quantity: number | string | null | undefined,
): BookingTyreDisplayLine[] {
  const size = looseDisplayText(tyreSizeDisplay);
  const qty = quantityValue(quantity);
  if (!size || qty == null) return [];
  return [{ id: 'legacy-tyre-1', size, quantity: qty }];
}

export function resolveBookingTyreDisplay(input: BookingTyreDisplayInput): ResolvedBookingTyreDisplay {
  const canonicalLines = extractCanonicalTyreLines(input.priceSnapshot);
  if (canonicalLines.length > 0) return { source: 'canonical', lines: canonicalLines };

  const rowLines = tyreRowsToDisplayLines(input.tyreRows);
  if (rowLines.length > 0) return { source: 'booking_tyres', lines: rowLines };

  const legacyLines = legacyTyreLine(input.tyreSizeDisplay, input.quantity);
  if (legacyLines.length > 0) return { source: 'legacy', lines: legacyLines };

  return { source: 'empty', lines: [] };
}

export function totalTyreLineQuantity(lines: BookingTyreDisplayLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function axleLabel(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === 'front') return 'Front';
  if (normalized === 'rear') return 'Rear';
  if (normalized === 'all' || normalized === 'both') return 'All tyres';
  if (normalized === 'unknown' || normalized === 'unspecified') return 'Unknown axle';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatTyreDisplayLine(line: BookingTyreDisplayLine): string {
  const parts: string[] = [];
  const axle = axleLabel(line.axle);
  if (axle) parts.push(`${axle}:`);
  parts.push(line.size);

  const loadSpeed = `${line.loadIndex ?? ''}${line.speedIndex ?? ''}`.trim();
  if (loadSpeed) parts.push(loadSpeed);
  if (line.runFlat === true) parts.push('run-flat');
  if (line.xl === true) parts.push('XL');
  if (line.commercial === true && !/C$/i.test(line.size)) parts.push('commercial');

  const product = [line.brand, line.pattern].filter(Boolean).join(' ').trim();
  if (product) parts.push(`- ${product}`);

  parts.push(`x${line.quantity}`);
  return parts.join(' ');
}

export function summarizeTyreDisplayLines(lines: BookingTyreDisplayLine[]): string {
  return lines.map(formatTyreDisplayLine).join(', ');
}

export function displayStringsForBookingTyres(input: BookingTyreDisplayInput): string[] {
  return resolveBookingTyreDisplay(input).lines.map(formatTyreDisplayLine);
}

function updateFirstCanonicalLine(rawLine: unknown, tyreSizeDisplay: string | null | undefined, quantity: number | undefined): unknown {
  const record = asRecord(rawLine);
  if (!record) return rawLine;
  const next: JsonRecord = { ...record };
  const nextSize = tyreSizeDisplay ? looseDisplayText(tyreSizeDisplay) : null;

  if (nextSize) {
    if (typeof next.size === 'string') next.size = nextSize;
    if (asRecord(next.size)) {
      next.size = {
        ...(next.size as JsonRecord),
        sizeDisplay: nextSize,
      };
    }
    if ('normalizedSize' in next) next.normalizedSize = nextSize;
    if ('sizeDisplay' in next) next.sizeDisplay = nextSize;
    if ('requestedSize' in next) next.requestedSize = nextSize;
    if (!('normalizedSize' in next) && !('sizeDisplay' in next) && !('requestedSize' in next) && !('size' in next)) {
      next.normalizedSize = nextSize;
    }
  }

  if (quantity !== undefined) {
    next.quantity = quantity;
  }

  return next;
}

export function applyPrimaryTyreEditToSnapshot(
  existingSnapshot: unknown,
  edit: {
    tyreSizeDisplay?: string | null;
    quantity?: number;
  },
): {
  usedCanonical: boolean;
  priceSnapshot: Record<string, unknown> | null;
  tyreSizeDisplay?: string | null;
  quantity?: number;
} {
  const base = asRecord(existingSnapshot);
  const rawLines = snapshotLinesArray(existingSnapshot);
  const canonicalLines = extractCanonicalTyreLines(existingSnapshot);
  if (!base || rawLines.length === 0 || canonicalLines.length === 0) {
    return {
      usedCanonical: false,
      priceSnapshot: base,
    };
  }

  const editedRawLines = rawLines.map((line, index) =>
    index === 0 ? updateFirstCanonicalLine(line, edit.tyreSizeDisplay, edit.quantity) : line,
  );
  const editedSnapshot = { ...base, tyreLines: editedRawLines };
  const editedLines = extractCanonicalTyreLines(editedSnapshot);
  const totalQuantity = totalTyreLineQuantity(editedLines);

  return {
    usedCanonical: true,
    priceSnapshot: editedSnapshot,
    tyreSizeDisplay: editedLines[0]?.size ?? edit.tyreSizeDisplay ?? null,
    quantity: totalQuantity > 0 ? totalQuantity : undefined,
  };
}
