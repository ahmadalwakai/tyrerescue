import { createHash } from 'crypto';
import { normalizeUkPhoneForMatching } from '@/lib/contact-normalization';

export type VirtualLandlineDirection = 'incoming' | 'outgoing' | 'missed' | 'unknown';

export interface VirtualLandlineDetectedColumns {
  callerNumber?: string;
  destinationNumber?: string;
  direction?: string;
  startTime?: string;
  date?: string;
  time?: string;
  endTime?: string;
  duration?: string;
  callStatus?: string;
  recordingUrl?: string;
  providerCallId?: string;
}

export interface VirtualLandlineParsedCall {
  importKey: string;
  providerCallId: string | null;
  direction: VirtualLandlineDirection;
  callStatus: string;
  callerNumberRaw: string | null;
  destinationNumberRaw: string | null;
  callerNumberNormalized: string | null;
  destinationNumberNormalized: string | null;
  customerPhoneNormalized: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  sourceRowNumber: number;
  rawRow: Record<string, string>;
}

export interface VirtualLandlineInvalidRow {
  rowNumber: number;
  reason: string;
  rawRow: Record<string, string>;
}

export interface VirtualLandlineImportCounts {
  incoming: number;
  outgoing: number;
  missed: number;
  unknown: number;
  recordingRows: number;
  withheldRows: number;
}

export interface VirtualLandlineParsedImport {
  headers: string[];
  detectedColumns: VirtualLandlineDetectedColumns;
  calls: VirtualLandlineParsedCall[];
  duplicateRows: VirtualLandlineInvalidRow[];
  invalidRows: VirtualLandlineInvalidRow[];
  warningRows: VirtualLandlineInvalidRow[];
  counts: VirtualLandlineImportCounts;
  totalRows: number;
}

const FORMULA_PREFIX_RE = /^[=+\-@]/;
const WITHHELD_RE = /\b(withheld|anonymous|private|restricted|unavailable|unknown|no caller id|blocked)\b/i;
const EXPLICIT_TZ_RE = /(z|gmt|bst|[+-]\d{2}:?\d{2})$/i;

function cleanCell(value: string): string {
  return value.replace(/\u0000/g, '').trim();
}

export function escapeSpreadsheetFormula(value: string): string {
  const cleaned = cleanCell(value);
  return FORMULA_PREFIX_RE.test(cleaned) ? `'${cleaned}` : cleaned;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDelimiter(csv: string): string {
  const firstLine = csv.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const candidates = [',', ';', '\t'];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length - 1,
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

function parseCsvMatrix(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const delimiter = detectDelimiter(csv);

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cleanCell(field));
      field = '';
    } else if (char === '\n') {
      row.push(cleanCell(field));
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error('CSV contains an unterminated quoted field.');
  }

  row.push(cleanCell(field));
  rows.push(row);

  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

const HEADER_HINTS = new Set([
  'call id',
  'caller number',
  'called number',
  'destination number',
  'incoming outgoing',
  'call date',
  'start time',
  'duration',
  'duration mins secs',
  'cost gbp',
  'call status',
  'recording url',
]);

function headerScore(cells: string[]): number {
  return cells.reduce((score, cell) => {
    const normalized = normalizeHeader(cell);
    if (HEADER_HINTS.has(normalized)) return score + 2;
    return [...HEADER_HINTS].some((hint) => normalized.includes(hint)) ? score + 1 : score;
  }, 0);
}

function findHeaderRowIndex(matrix: string[][]): number {
  let bestIndex = 0;
  let bestScore = 0;

  matrix.forEach((cells, index) => {
    const score = headerScore(cells);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 2 ? bestIndex : 0;
}

export function parseCsvRows(csv: string): { headers: string[]; rows: Array<{ rowNumber: number; row: Record<string, string> }> } {
  const matrix = parseCsvMatrix(csv);
  if (matrix.length === 0) return { headers: [], rows: [] };

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headers = matrix[headerRowIndex].map((header, index) => {
    const cleaned = cleanCell(header).replace(/^\uFEFF/, '');
    return cleaned || `Column ${index + 1}`;
  });

  const rows = matrix.slice(headerRowIndex + 1).map((cells, index) => {
    const row: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      row[header] = cleanCell(cells[headerIndex] ?? '');
    });
    if (cells.length > headers.length) {
      row['Extra columns'] = cells.slice(headers.length).map(cleanCell).join(' | ');
    }
    return { rowNumber: headerRowIndex + index + 2, row };
  });

  return { headers, rows };
}

const COLUMN_SYNONYMS: Record<keyof VirtualLandlineDetectedColumns, string[]> = {
  callerNumber: [
    'caller number',
    'caller',
    'caller id',
    'calling number',
    'cli',
    'from',
    'source number',
    'number',
  ],
  destinationNumber: [
    'destination number',
    'destination',
    'called number',
    'dialled number',
    'dialed number',
    'ddi',
    'to',
    'target number',
  ],
  direction: ['direction', 'call direction', 'type', 'call type', 'incoming outgoing'],
  startTime: ['start time', 'started at', 'call start', 'call started', 'datetime', 'date time', 'timestamp'],
  date: ['date', 'call date'],
  time: ['time', 'call time'],
  endTime: ['end time', 'ended at', 'call end', 'call ended'],
  duration: ['duration', 'call duration', 'length', 'talk time'],
  callStatus: ['status', 'call status', 'result', 'disposition', 'outcome'],
  recordingUrl: ['recording url', 'recording link', 'recording', 'recording uri'],
  providerCallId: ['call id', 'callid', 'provider call id', 'interaction id', 'uuid', 'id'],
};

function findColumn(headers: string[], role: keyof VirtualLandlineDetectedColumns): string | undefined {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  const synonyms = COLUMN_SYNONYMS[role];

  for (const synonym of synonyms) {
    const exact = normalizedHeaders.find((entry) => entry.normalized === synonym);
    if (exact) return exact.header;
  }

  for (const synonym of synonyms) {
    const loose = normalizedHeaders.find((entry) => entry.normalized.includes(synonym));
    if (loose) return loose.header;
  }

  return undefined;
}

export function detectVirtualLandlineColumns(headers: string[]): VirtualLandlineDetectedColumns {
  const detected: VirtualLandlineDetectedColumns = {};
  (Object.keys(COLUMN_SYNONYMS) as Array<keyof VirtualLandlineDetectedColumns>).forEach((role) => {
    const column = findColumn(headers, role);
    if (column) detected[role] = column;
  });
  return detected;
}

function getValue(row: Record<string, string>, column: string | undefined): string {
  return column ? cleanProviderCell(row[column] ?? '') : '';
}

function cleanProviderCell(value: string): string {
  const cleaned = cleanCell(value);
  const numericExcelLiteral = cleaned.match(/^="?([+()]?\d[\d\s().-]*)"?$/);
  if (numericExcelLiteral) return cleanCell(numericExcelLiteral[1]);

  const withheldExcelLiteral = cleaned.match(/^="?((?:withheld|anonymous|private|restricted|unavailable|unknown|no caller id|blocked))"?$/i);
  if (withheldExcelLiteral) return cleanCell(withheldExcelLiteral[1]);

  return cleaned;
}

function ukLocalParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function ukLocalToUtcDate(year: number, month: number, day: number, hour: number, minute: number, second: number): Date | null {
  for (const offsetMinutes of [60, 0]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute - offsetMinutes, second));
    const local = ukLocalParts(candidate);
    if (
      local.year === year &&
      local.month === month &&
      local.day === day &&
      local.hour === hour &&
      local.minute === minute &&
      local.second === second
    ) {
      return candidate;
    }
  }

  return null;
}

function validateDateParts(year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseVirtualLandlineDateTime(input: string): Date | null {
  const raw = cleanCell(input);
  if (!raw) return null;

  const hasExplicitTimezone = EXPLICIT_TZ_RE.test(raw);
  const iso = hasExplicitTimezone ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(iso)) {
    return new Date(iso);
  }

  const ymdMatch = raw.match(
    /^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:[ T,]+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  if (ymdMatch) {
    const [, yearRaw, monthRaw, dayRaw, hourRaw = '0', minuteRaw = '0', secondRaw = '0', ampm] = ymdMatch;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);
    if (ampm?.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (ampm?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return validateDateParts(year, month, day, hour, minute, second)
      ? ukLocalToUtcDate(year, month, day, hour, minute, second)
      : null;
  }

  const ukMatch = raw.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T,]+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  if (ukMatch) {
    const [, dayRaw, monthRaw, yearRaw, hourRaw = '0', minuteRaw = '0', secondRaw = '0', ampm] = ukMatch;
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);
    if (ampm?.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (ampm?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return validateDateParts(year, month, day, hour, minute, second)
      ? ukLocalToUtcDate(year, month, day, hour, minute, second)
      : null;
  }

  return null;
}

export function parseVirtualLandlineDurationSeconds(value: string): number | null {
  const raw = cleanCell(value).toLowerCase();
  if (!raw) return null;
  if (/^-/.test(raw)) return null;

  const numeric = Number(raw.replace(/(?:seconds?|secs?|s)$/i, '').trim());
  if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);

  const colon = raw.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const first = Number(colon[1]);
    const second = Number(colon[2]);
    const third = colon[3] != null ? Number(colon[3]) : null;
    if (second > 59 || (third != null && third > 59)) return null;
    if (third == null) return first * 60 + second;
    return first * 3600 + second * 60 + third;
  }

  const words = raw.match(/(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?/);
  if (words && (words[1] || words[2] || words[3])) {
    return Number(words[1] ?? 0) * 3600 + Number(words[2] ?? 0) * 60 + Number(words[3] ?? 0);
  }

  return null;
}

export function isWithheldVirtualLandlineNumber(value: string | null): boolean {
  return value ? WITHHELD_RE.test(value) : false;
}

export function validateRecordingUrl(value: string): string | null {
  const raw = cleanCell(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeVirtualLandlineDirection(input: string, status: string): VirtualLandlineDirection {
  const combined = `${input} ${status}`.toLowerCase();
  if (/\b(missed|unanswered|no answer|abandoned|not answered|failed)\b/.test(combined)) return 'missed';
  if (/\b(outgoing|outbound|out|made|dialled|dialed)\b/.test(combined)) return 'outgoing';
  if (/\b(incoming|inbound|in|received)\b/.test(combined)) return 'incoming';
  return 'unknown';
}

function safeRawRow(row: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [escapeSpreadsheetFormula(key), escapeSpreadsheetFormula(value)]),
  );
}

function deriveImportKey(input: {
  providerCallId: string | null;
  direction: VirtualLandlineDirection;
  customerPhoneNormalized: string;
  callerNumberNormalized: string | null;
  destinationNumberNormalized: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
}): string {
  if (input.providerCallId) {
    return `vl:${createHash('sha256').update(input.providerCallId).digest('hex').slice(0, 48)}`;
  }

  const stable = [
    input.direction,
    input.customerPhoneNormalized,
    input.callerNumberNormalized ?? '',
    input.destinationNumberNormalized ?? '',
    input.startedAt.toISOString(),
    input.endedAt?.toISOString() ?? '',
    String(input.durationSeconds ?? ''),
  ].join('|');

  return `vl:${createHash('sha256').update(stable).digest('hex').slice(0, 48)}`;
}

function normalizeStatus(input: string, direction: VirtualLandlineDirection): string {
  const raw = cleanCell(input).toLowerCase();
  if (raw) return raw.slice(0, 80);
  if (direction === 'missed') return 'missed';
  return 'unknown';
}

function isSummaryRow(row: Record<string, string>): boolean {
  const values = Object.values(row).map((value) => normalizeHeader(cleanProviderCell(value)));
  return values.some((value) => value === 'subtotal' || value === 'total');
}

export function parseVirtualLandlineCsv(csv: string): VirtualLandlineParsedImport {
  const { headers, rows } = parseCsvRows(csv);
  const detectedColumns = detectVirtualLandlineColumns(headers);
  const calls: VirtualLandlineParsedCall[] = [];
  const invalidRows: VirtualLandlineInvalidRow[] = [];
  const warningRows: VirtualLandlineInvalidRow[] = [];
  const duplicateRows: VirtualLandlineInvalidRow[] = [];
  const seenImportKeys = new Set<string>();
  const counts: VirtualLandlineImportCounts = {
    incoming: 0,
    outgoing: 0,
    missed: 0,
    unknown: 0,
    recordingRows: 0,
    withheldRows: 0,
  };
  let totalRows = 0;

  for (const entry of rows) {
    const row = entry.row;
    if (isSummaryRow(row)) continue;
    totalRows += 1;
    const rawRow = safeRawRow(row);
    const providerCallId = getValue(row, detectedColumns.providerCallId) || null;
    const callerNumberRaw = getValue(row, detectedColumns.callerNumber) || null;
    const destinationNumberRaw = getValue(row, detectedColumns.destinationNumber) || null;
    const hasWithheldNumber =
      isWithheldVirtualLandlineNumber(callerNumberRaw) || isWithheldVirtualLandlineNumber(destinationNumberRaw);
    if (hasWithheldNumber) counts.withheldRows += 1;
    const callerNumberNormalized = callerNumberRaw ? normalizeUkPhoneForMatching(callerNumberRaw) : null;
    const destinationNumberNormalized = destinationNumberRaw ? normalizeUkPhoneForMatching(destinationNumberRaw) : null;
    let direction = normalizeVirtualLandlineDirection(
      getValue(row, detectedColumns.direction),
      getValue(row, detectedColumns.callStatus),
    );
    let callStatus = normalizeStatus(getValue(row, detectedColumns.callStatus), direction);
    const datePart = getValue(row, detectedColumns.date);
    const timePart = getValue(row, detectedColumns.time);
    const startValue = getValue(row, detectedColumns.startTime) || [datePart, timePart].filter(Boolean).join(' ');
    const startedAt = parseVirtualLandlineDateTime(startValue);
    const durationRaw = getValue(row, detectedColumns.duration);
    const durationSeconds = parseVirtualLandlineDurationSeconds(durationRaw);
    let endedAt = parseVirtualLandlineDateTime(getValue(row, detectedColumns.endTime));

    if (!getValue(row, detectedColumns.callStatus) && direction === 'incoming' && durationSeconds === 0) {
      direction = 'missed';
      callStatus = 'missed';
    }

    if (!startedAt) {
      invalidRows.push({ rowNumber: entry.rowNumber, reason: 'Missing or invalid start time.', rawRow });
      continue;
    }

    if (durationRaw && durationSeconds == null) {
      invalidRows.push({ rowNumber: entry.rowNumber, reason: 'Invalid call duration.', rawRow });
      continue;
    }

    if (!endedAt && durationSeconds != null) {
      endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    }

    const customerPhoneNormalized =
      direction === 'outgoing'
        ? destinationNumberNormalized
        : direction === 'incoming' || direction === 'missed'
          ? callerNumberNormalized
          : callerNumberNormalized ?? destinationNumberNormalized;

    if (!customerPhoneNormalized) {
      invalidRows.push({ rowNumber: entry.rowNumber, reason: 'No valid UK customer phone number detected.', rawRow });
      continue;
    }

    const recordingRaw = getValue(row, detectedColumns.recordingUrl);
    const recordingUrl = validateRecordingUrl(recordingRaw);
    if (recordingUrl) {
      counts.recordingRows += 1;
    } else if (recordingRaw) {
      warningRows.push({ rowNumber: entry.rowNumber, reason: 'Invalid recording URL ignored.', rawRow });
    }
    const importKey = deriveImportKey({
      providerCallId,
      direction,
      customerPhoneNormalized,
      callerNumberNormalized,
      destinationNumberNormalized,
      startedAt,
      endedAt,
      durationSeconds,
    });

    const parsed: VirtualLandlineParsedCall = {
      importKey,
      providerCallId,
      direction,
      callStatus,
      callerNumberRaw,
      destinationNumberRaw,
      callerNumberNormalized,
      destinationNumberNormalized,
      customerPhoneNormalized,
      startedAt,
      endedAt,
      durationSeconds,
      recordingUrl,
      sourceRowNumber: entry.rowNumber,
      rawRow,
    };

    if (seenImportKeys.has(importKey)) {
      duplicateRows.push({ rowNumber: entry.rowNumber, reason: 'Duplicate call in this CSV.', rawRow });
      continue;
    }

    seenImportKeys.add(importKey);
    calls.push(parsed);
    if (direction === 'incoming') counts.incoming += 1;
    else if (direction === 'outgoing') counts.outgoing += 1;
    else if (direction === 'missed') counts.missed += 1;
    else counts.unknown += 1;
  }

  return {
    headers,
    detectedColumns,
    calls,
    duplicateRows,
    invalidRows,
    warningRows,
    counts,
    totalRows,
  };
}

export function summarizeVirtualLandlineImportOutcome(
  parsed: VirtualLandlineParsedImport,
  insertedRows: Array<{ id?: string; direction: string }>,
) {
  const duplicate = parsed.duplicateRows.length + (parsed.calls.length - insertedRows.length);
  const invalid = parsed.invalidRows.length;
  return {
    imported: insertedRows.length,
    skipped: duplicate + invalid,
    duplicate,
    invalid,
    missedCalls: insertedRows.filter((call) => call.direction === 'missed').length,
    missedInteractionIds: insertedRows
      .filter((call): call is { id: string; direction: string } => call.direction === 'missed' && typeof call.id === 'string')
      .map((call) => call.id),
  };
}
