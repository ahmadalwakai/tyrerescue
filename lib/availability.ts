import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { availabilitySlots, bookings } from '@/lib/db/schema';

export const SLOT_OCCUPANCY_STATUSES = [
  'pricing_ready',
  'awaiting_payment',
  'paid',
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
] as const;

export type SlotValidationCode =
  | 'SCHEDULED_TIME_REQUIRED'
  | 'SLOT_NOT_FOUND'
  | 'SLOT_INACTIVE'
  | 'SLOT_FULL';

export interface AvailabilitySlotBase {
  id: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  maxBookings: number;
  active: boolean;
}

export interface AvailabilitySlotWithOccupancy extends AvailabilitySlotBase {
  bookedCount: number;
  spotsLeft: number;
  available: boolean;
  time: string;
  label: string;
}

interface ScheduledBookingRow {
  id: string;
  scheduledAt: Date;
}

const LONDON_TIME_ZONE = 'Europe/London';

const londonDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: LONDON_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const londonTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const londonDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function normalizeTimeValue(value: string): string {
  const [hours, minutes] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

function toMinutes(timeValue: string): number {
  const [hours, minutes] = normalizeTimeValue(timeValue).split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTimeLabel(timeValue: string): string {
  const [hourRaw, minuteRaw] = normalizeTimeValue(timeValue).split(':');
  const hour = Number(hourRaw);
  const twelveHour = hour % 12 || 12;
  const period = hour < 12 ? 'am' : 'pm';
  return `${twelveHour}:${minuteRaw}${period}`;
}

function buildSlotLabel(timeStart: string, timeEnd: string): string {
  return `${formatTimeLabel(timeStart)} - ${formatTimeLabel(timeEnd)}`;
}

function getLondonDate(date: Date): string {
  return londonDateFormatter.format(date);
}

function getLondonTime(date: Date): string {
  return normalizeTimeValue(londonTimeFormatter.format(date));
}

function getLondonDateTimeParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = londonDateTimeFormatter.formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(valueByType.get('year')),
    month: Number(valueByType.get('month')),
    day: Number(valueByType.get('day')),
    hour: Number(valueByType.get('hour')),
    minute: Number(valueByType.get('minute')),
  };
}

export function londonDateTimeToUtcDate(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = normalizeTimeValue(time).split(':').map(Number);

  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  // Two correction passes handle BST transitions reliably.
  for (let i = 0; i < 2; i++) {
    const london = getLondonDateTimeParts(guess);
    const targetWallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const currentWallClockAsUtc = Date.UTC(
      london.year,
      london.month - 1,
      london.day,
      london.hour,
      london.minute,
      0,
    );
    const deltaMs = targetWallClockAsUtc - currentWallClockAsUtc;
    if (deltaMs === 0) break;
    guess = new Date(guess.getTime() + deltaMs);
  }

  return guess;
}

function bookingFallsInSlot(bookingTime: string, slotStart: string, slotEnd: string): boolean {
  const bookingMinutes = toMinutes(bookingTime);
  const slotStartMinutes = toMinutes(slotStart);
  const slotEndMinutes = toMinutes(slotEnd);
  return bookingMinutes >= slotStartMinutes && bookingMinutes < slotEndMinutes;
}

async function getScheduledBookingsForDate(
  date: string,
  excludeBookingId?: string,
): Promise<ScheduledBookingRow[]> {
  const whereParts = [
    eq(bookings.bookingType, 'scheduled'),
    inArray(bookings.status, [...SLOT_OCCUPANCY_STATUSES]),
    sql`date(${bookings.scheduledAt} at time zone ${LONDON_TIME_ZONE}) = ${date}`,
  ];

  if (excludeBookingId) {
    whereParts.push(ne(bookings.id, excludeBookingId));
  }

  const rows = await db
    .select({
      id: bookings.id,
      scheduledAt: bookings.scheduledAt,
    })
    .from(bookings)
    .where(and(...whereParts));

  return rows
    .filter((row): row is { id: string; scheduledAt: Date } => Boolean(row.scheduledAt))
    .map((row) => ({ id: row.id, scheduledAt: row.scheduledAt }));
}

async function getSlotsForDate(date: string): Promise<AvailabilitySlotBase[]> {
  const rows = await db
    .select({
      id: availabilitySlots.id,
      date: availabilitySlots.date,
      timeStart: availabilitySlots.timeStart,
      timeEnd: availabilitySlots.timeEnd,
      maxBookings: availabilitySlots.maxBookings,
      active: availabilitySlots.active,
    })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.date, date))
    .orderBy(asc(availabilitySlots.timeStart));

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    timeStart: normalizeTimeValue(row.timeStart),
    timeEnd: normalizeTimeValue(row.timeEnd),
    maxBookings: Math.max(1, Number(row.maxBookings ?? 1)),
    active: row.active !== false,
  }));
}

function withOccupancy(
  slots: AvailabilitySlotBase[],
  bookingsForDate: ScheduledBookingRow[],
): AvailabilitySlotWithOccupancy[] {
  const counts = new Map<string, number>();

  for (const booking of bookingsForDate) {
    const bookingTime = getLondonTime(booking.scheduledAt);
    const matchedSlot = slots.find((slot) =>
      bookingFallsInSlot(bookingTime, slot.timeStart, slot.timeEnd),
    );

    if (!matchedSlot) continue;

    counts.set(matchedSlot.id, (counts.get(matchedSlot.id) ?? 0) + 1);
  }

  return slots.map((slot) => {
    const bookedCount = counts.get(slot.id) ?? 0;
    const spotsLeft = Math.max(slot.maxBookings - bookedCount, 0);

    return {
      ...slot,
      bookedCount,
      spotsLeft,
      available: slot.active && spotsLeft > 0,
      time: slot.timeStart,
      label: buildSlotLabel(slot.timeStart, slot.timeEnd),
    };
  });
}

export async function getSlotsWithOccupancyForDate(
  date: string,
  options?: {
    activeOnly?: boolean;
    excludeBookingId?: string;
  },
): Promise<AvailabilitySlotWithOccupancy[]> {
  const slots = await getSlotsForDate(date);
  if (slots.length === 0) return [];

  const bookingsForDate = await getScheduledBookingsForDate(date, options?.excludeBookingId);
  const enriched = withOccupancy(slots, bookingsForDate);

  if (options?.activeOnly) {
    return enriched.filter((slot) => slot.active);
  }

  return enriched;
}

export async function getSlotsWithOccupancy(
  options?: {
    fromDate?: string;
    toDate?: string;
    includeInactive?: boolean;
  },
): Promise<AvailabilitySlotWithOccupancy[]> {
  const whereParts = [];

  if (options?.fromDate) {
    whereParts.push(gte(availabilitySlots.date, options.fromDate));
  }

  if (options?.toDate) {
    whereParts.push(lte(availabilitySlots.date, options.toDate));
  }

  const rows = await db
    .select({
      id: availabilitySlots.id,
      date: availabilitySlots.date,
      timeStart: availabilitySlots.timeStart,
      timeEnd: availabilitySlots.timeEnd,
      maxBookings: availabilitySlots.maxBookings,
      active: availabilitySlots.active,
    })
    .from(availabilitySlots)
    .where(whereParts.length > 0 ? and(...whereParts) : undefined)
    .orderBy(asc(availabilitySlots.date), asc(availabilitySlots.timeStart));

  const slots = rows.map((row) => ({
    id: row.id,
    date: row.date,
    timeStart: normalizeTimeValue(row.timeStart),
    timeEnd: normalizeTimeValue(row.timeEnd),
    maxBookings: Math.max(1, Number(row.maxBookings ?? 1)),
    active: row.active !== false,
  }));

  if (slots.length === 0) return [];

  const dates = [...new Set(slots.map((slot) => slot.date))];
  const bookingsByDate = new Map<string, ScheduledBookingRow[]>();

  await Promise.all(
    dates.map(async (date) => {
      const rowsForDate = await getScheduledBookingsForDate(date);
      bookingsByDate.set(date, rowsForDate);
    }),
  );

  const slotsByDate = new Map<string, AvailabilitySlotBase[]>();
  for (const slot of slots) {
    const existing = slotsByDate.get(slot.date) ?? [];
    existing.push(slot);
    slotsByDate.set(slot.date, existing);
  }

  const enriched = dates.flatMap((date) => {
    const dateSlots = slotsByDate.get(date) ?? [];
    const rowsForDate = bookingsByDate.get(date) ?? [];
    return withOccupancy(dateSlots, rowsForDate);
  });

  if (options?.includeInactive === false) {
    return enriched.filter((slot) => slot.active);
  }

  return enriched;
}

export async function validateScheduledSlotForBooking(
  scheduledAt: Date | null,
  options?: {
    excludeBookingId?: string;
  },
): Promise<
  | { ok: true; slot: AvailabilitySlotWithOccupancy }
  | { ok: false; code: SlotValidationCode; message: string }
> {
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return {
      ok: false,
      code: 'SCHEDULED_TIME_REQUIRED',
      message: 'Scheduled booking requires a scheduled service time.',
    };
  }

  const date = getLondonDate(scheduledAt);
  const time = getLondonTime(scheduledAt);

  const slots = await getSlotsWithOccupancyForDate(date, {
    activeOnly: false,
    excludeBookingId: options?.excludeBookingId,
  });

  const matchingSlot = slots.find((slot) => bookingFallsInSlot(time, slot.timeStart, slot.timeEnd));

  if (!matchingSlot) {
    return {
      ok: false,
      code: 'SLOT_NOT_FOUND',
      message: 'Selected scheduled time does not match any configured availability slot.',
    };
  }

  if (!matchingSlot.active) {
    return {
      ok: false,
      code: 'SLOT_INACTIVE',
      message: 'Selected scheduled time is no longer active.',
    };
  }

  if (matchingSlot.spotsLeft <= 0) {
    return {
      ok: false,
      code: 'SLOT_FULL',
      message: 'Selected scheduled time is fully booked.',
    };
  }

  return { ok: true, slot: matchingSlot };
}

export function isValidSlotRange(timeStart: string, timeEnd: string): boolean {
  return toMinutes(timeStart) < toMinutes(timeEnd);
}

export async function findOverlappingSlot(
  date: string,
  timeStart: string,
  timeEnd: string,
): Promise<AvailabilitySlotBase | null> {
  const slots = await getSlotsForDate(date);
  const start = toMinutes(timeStart);
  const end = toMinutes(timeEnd);

  const overlap = slots.find((slot) => {
    const slotStart = toMinutes(slot.timeStart);
    const slotEnd = toMinutes(slot.timeEnd);
    return start < slotEnd && end > slotStart;
  });

  return overlap ?? null;
}

export async function slotHasBlockingBookings(slotId: string): Promise<boolean> {
  const slotRow = await db
    .select({
      id: availabilitySlots.id,
      date: availabilitySlots.date,
      timeStart: availabilitySlots.timeStart,
      timeEnd: availabilitySlots.timeEnd,
    })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.id, slotId))
    .limit(1);

  if (slotRow.length === 0) {
    return false;
  }

  const slot = slotRow[0];
  const slots = await getSlotsWithOccupancyForDate(slot.date, { activeOnly: false });
  const match = slots.find((candidate) => candidate.id === slot.id);
  return Boolean(match && match.bookedCount > 0);
}
