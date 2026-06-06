import { Pool } from '@neondatabase/serverless';
import { SLOT_OCCUPANCY_STATUSES } from '@/lib/availability';

const DEFAULT_DAYS_AHEAD = 14;
const DEFAULT_SLOT_MINUTES = 60;
const DEFAULT_TIMEZONE = 'Europe/London';
const DEFAULT_MAX_BOOKINGS = 2;
const SYNC_LOCK_KEY = 770266090;

export interface SyncAvailabilityOptions {
  daysAhead?: number;
  slotMinutes?: number;
  timezone?: string;
  dryRun?: boolean;
}

export interface SyncAvailabilityResult {
  created: number;
  skippedExisting: number;
  disabledExpired: number;
  recalculated: number;
  daysAhead: number;
  slotMinutes: number;
}

export interface AvailabilitySlotCandidate {
  date: string;
  timeStart: string;
  timeEnd: string;
}

interface ExistingSlotRow {
  id: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  maxBookings: number;
}

interface QueryResult<Row extends object = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

interface QueryClient {
  query<Row extends object = Record<string, unknown>>(
    queryText: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

function getPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8_000,
  });
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function normalizeTimeValue(value: string): string {
  const [hours, minutes] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

function toMinutes(value: string): number {
  const [hours, minutes] = normalizeTimeValue(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getZonedDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getZonedDateTimeParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get('year')),
    month: Number(byType.get('month')),
    day: Number(byType.get('day')),
    hour: Number(byType.get('hour')),
    minute: Number(byType.get('minute')),
  };
}

function zonedDateTimeToUtcDate(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = normalizeTimeValue(time).split(':').map(Number);
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  for (let i = 0; i < 2; i++) {
    const current = getZonedDateTimeParts(guess, timezone);
    const targetWallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const currentWallClockAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      0,
    );
    const deltaMs = targetWallClockAsUtc - currentWallClockAsUtc;
    if (deltaMs === 0) break;
    guess = new Date(guess.getTime() + deltaMs);
  }

  return guess;
}

function workingWindowForDate(_date: string): { start: string; end: string } | null {
  return { start: '09:00', end: '18:00' };
}

export function buildAvailabilitySlotCandidates(
  options: Required<Pick<SyncAvailabilityOptions, 'daysAhead' | 'slotMinutes' | 'timezone'>> & {
    now?: Date;
  },
): AvailabilitySlotCandidate[] {
  const now = options.now ?? new Date();
  const today = getZonedDate(now, options.timezone);
  const candidates: AvailabilitySlotCandidate[] = [];

  for (let offset = 0; offset <= options.daysAhead; offset++) {
    const date = addDays(today, offset);
    const window = workingWindowForDate(date);
    if (!window) continue;

    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    for (let cursor = start; cursor + options.slotMinutes <= end; cursor += options.slotMinutes) {
      const timeStart = fromMinutes(cursor);
      const timeEnd = fromMinutes(cursor + options.slotMinutes);
      const slotStartUtc = zonedDateTimeToUtcDate(date, timeStart, options.timezone);
      const slotEndUtc = zonedDateTimeToUtcDate(date, timeEnd, options.timezone);
      if (slotStartUtc <= now || slotEndUtc <= now) continue;
      candidates.push({ date, timeStart, timeEnd });
    }
  }

  return candidates;
}

function overlaps(a: AvailabilitySlotCandidate, b: ExistingSlotRow): boolean {
  if (a.date !== b.date) return false;
  return toMinutes(a.timeStart) < toMinutes(b.timeEnd) && toMinutes(a.timeEnd) > toMinutes(b.timeStart);
}

function resolveMaxBookings(candidate: AvailabilitySlotCandidate, existingSlots: ExistingSlotRow[]): number {
  const matchingPattern = existingSlots.find(
    (slot) =>
      slot.timeStart === candidate.timeStart &&
      slot.timeEnd === candidate.timeEnd &&
      Number.isFinite(slot.maxBookings) &&
      slot.maxBookings > 0,
  );

  return matchingPattern?.maxBookings ?? DEFAULT_MAX_BOOKINGS;
}

async function loadSlotsInRange(
  client: QueryClient,
  fromDate: string,
  toDate: string,
): Promise<ExistingSlotRow[]> {
  const { rows } = await client.query<ExistingSlotRow>(
    `SELECT
        id,
        "date"::text AS "date",
        time_start::text AS "timeStart",
        time_end::text AS "timeEnd",
        COALESCE(max_bookings, $3)::int AS "maxBookings"
       FROM availability_slots
      WHERE "date" >= $1::date
        AND "date" <= $2::date
      ORDER BY "date", time_start`,
    [fromDate, toDate, DEFAULT_MAX_BOOKINGS],
  );

  return rows.map((row) => ({
    ...row,
    timeStart: normalizeTimeValue(row.timeStart),
    timeEnd: normalizeTimeValue(row.timeEnd),
    maxBookings: Math.max(1, Number(row.maxBookings || DEFAULT_MAX_BOOKINGS)),
  }));
}

async function disableExpiredSlots(
  client: QueryClient,
  timezone: string,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    const { rows } = await client.query(
      `SELECT id
         FROM availability_slots
        WHERE active = true
          AND (("date" + time_end) AT TIME ZONE $1) <= NOW()`,
      [timezone],
    );
    return rows.length;
  }

  const result = await client.query(
    `UPDATE availability_slots
        SET active = false
      WHERE active = true
        AND (("date" + time_end) AT TIME ZONE $1) <= NOW()`,
    [timezone],
  );

  return result.rowCount ?? 0;
}

async function recalculateBookedCounts(
  client: QueryClient,
  fromDate: string,
  toDate: string,
  timezone: string,
  dryRun: boolean,
): Promise<number> {
  const slots = await loadSlotsInRange(client, fromDate, toDate);
  let recalculated = 0;

  for (const slot of slots) {
    const { rows } = await client.query<{ booked: number }>(
      `SELECT COUNT(*)::int AS booked
         FROM bookings
        WHERE booking_type = 'scheduled'
          AND scheduled_at IS NOT NULL
          AND status = ANY($1::text[])
          AND date(scheduled_at AT TIME ZONE $2) = $3::date
          AND (scheduled_at AT TIME ZONE $2)::time >= $4::time
          AND (scheduled_at AT TIME ZONE $2)::time < $5::time`,
      [[...SLOT_OCCUPANCY_STATUSES], timezone, slot.date, slot.timeStart, slot.timeEnd],
    );
    const booked = Number(rows[0]?.booked ?? 0);

    if (!dryRun) {
      await client.query(
        `UPDATE availability_slots
            SET booked_count = $1
          WHERE id = $2::uuid`,
        [booked, slot.id],
      );
    }

    recalculated += 1;
  }

  return recalculated;
}

export async function hasFutureAvailabilitySlots(
  options?: Pick<SyncAvailabilityOptions, 'daysAhead' | 'timezone'>,
): Promise<boolean> {
  const daysAhead = normalizePositiveInteger(options?.daysAhead, DEFAULT_DAYS_AHEAD);
  const timezone = options?.timezone ?? DEFAULT_TIMEZONE;
  const today = getZonedDate(new Date(), timezone);
  const toDate = addDays(today, daysAhead);
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `SELECT id
         FROM availability_slots
        WHERE "date" >= $1::date
          AND "date" <= $2::date
          AND active = true
          AND (("date" + time_end) AT TIME ZONE $3) > NOW()
        LIMIT 1`,
      [today, toDate, timezone],
    );
    return rows.length > 0;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function syncAvailabilitySlots(
  options: SyncAvailabilityOptions = {},
): Promise<SyncAvailabilityResult> {
  const daysAhead = normalizePositiveInteger(options.daysAhead, DEFAULT_DAYS_AHEAD);
  const slotMinutes = normalizePositiveInteger(options.slotMinutes, DEFAULT_SLOT_MINUTES);
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const dryRun = options.dryRun === true;
  const now = new Date();
  const today = getZonedDate(now, timezone);
  const toDate = addDays(today, daysAhead);
  const candidates = buildAvailabilitySlotCandidates({
    daysAhead,
    slotMinutes,
    timezone,
    now,
  });

  const pool = getPool();
  const client = await pool.connect();

  let created = 0;
  let skippedExisting = 0;
  let disabledExpired = 0;
  let recalculated = 0;

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = \'15s\'');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SYNC_LOCK_KEY]);

    disabledExpired = await disableExpiredSlots(client, timezone, dryRun);

    const existingSlots = await loadSlotsInRange(client, today, toDate);

    for (const candidate of candidates) {
      if (existingSlots.some((slot) => overlaps(candidate, slot))) {
        skippedExisting += 1;
        continue;
      }

      const maxBookings = resolveMaxBookings(candidate, existingSlots);

      if (dryRun) {
        created += 1;
        existingSlots.push({
          id: `dry-run-${created}`,
          date: candidate.date,
          timeStart: candidate.timeStart,
          timeEnd: candidate.timeEnd,
          maxBookings,
        });
        continue;
      }

      const result = await client.query(
        `INSERT INTO availability_slots ("date", time_start, time_end, max_bookings, booked_count, active)
         SELECT $1::date, $2::time, $3::time, $4::int, 0, true
          WHERE NOT EXISTS (
            SELECT 1
              FROM availability_slots
             WHERE "date" = $1::date
               AND $2::time < time_end
               AND $3::time > time_start
          )
         RETURNING id, "date"::text AS "date", time_start::text AS "timeStart", time_end::text AS "timeEnd", max_bookings::int AS "maxBookings"`,
        [candidate.date, candidate.timeStart, candidate.timeEnd, maxBookings],
      );

      if (result.rows.length === 0) {
        skippedExisting += 1;
        continue;
      }

      const row = result.rows[0] as ExistingSlotRow;
      existingSlots.push({
        id: row.id,
        date: row.date,
        timeStart: normalizeTimeValue(row.timeStart),
        timeEnd: normalizeTimeValue(row.timeEnd),
        maxBookings: Math.max(1, Number(row.maxBookings || maxBookings)),
      });
      created += 1;
    }

    recalculated = await recalculateBookedCounts(client, today, toDate, timezone, dryRun);

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    return {
      created,
      skippedExisting,
      disabledExpired,
      recalculated,
      daysAhead,
      slotMinutes,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
