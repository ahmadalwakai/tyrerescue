import type { AssistedChatBookingType, AssistedChatDraft } from '../types/assisted-chat';

export interface BookingTiming {
  bookingType: AssistedChatBookingType;
  scheduledAt: string | null;
}

const LONDON = 'Europe/London';
const wallClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function parts(date: Date) {
  const values = Object.fromEntries(wallClock.formatToParts(date).map((item) => [item.type, item.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export function getLondonDateString(date = new Date()): string {
  return parts(date).date;
}

/** Convert an offered London slot without using the phone's local timezone. */
export function londonSlotToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(target).toISOString().slice(0, 10) !== date) return null;
  const normalizedTime = time.slice(0, 5);
  // UK civil time is UTC or UTC+1. Reject gaps and ambiguous wall times rather
  // than silently selecting a different appointment at a DST transition.
  const matches = [target, target - 60 * 60 * 1000].filter((candidate) => {
    const local = parts(new Date(candidate));
    return local.date === date && local.time === normalizedTime;
  });
  return matches.length === 1 ? new Date(matches[0]).toISOString() : null;
}

function normalizedInstant(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  const calendarDay = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendarDay) || new Date(calendarDay).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function normalizeBookingTiming(value: { bookingType?: unknown; scheduledAt?: unknown }): BookingTiming {
  return value.bookingType === 'scheduled'
    ? { bookingType: 'scheduled', scheduledAt: normalizedInstant(value.scheduledAt) }
    : { bookingType: 'emergency', scheduledAt: null };
}

export function getBookingTimingPayload(draft: Partial<BookingTiming>): BookingTiming {
  return normalizeBookingTiming(draft);
}

export function getBookingScheduleError(draft: Partial<BookingTiming>, now = new Date()): string | null {
  if (draft.bookingType !== 'scheduled') return null;
  const scheduledAt = normalizedInstant(draft.scheduledAt);
  if (!scheduledAt) return 'Choose a date and available time for the scheduled booking.';
  const appointment = new Date(scheduledAt);
  if (appointment.getTime() <= now.getTime()) return 'This appointment has passed. Choose another available time.';
  const today = getLondonDateString(now);
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 14);
  if (getLondonDateString(appointment) > horizon.toISOString().slice(0, 10)) {
    return 'Choose an available appointment within the next 14 days.';
  }
  return null;
}

export function formatBookingSchedule(draft: Partial<BookingTiming>): string {
  if (draft.bookingType !== 'scheduled') return 'Emergency — now';
  const scheduledAt = normalizedInstant(draft.scheduledAt);
  if (!scheduledAt) return 'Scheduled — choose an appointment';
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(scheduledAt))} (UK time)`;
}

/** An old backend that ignores appointment fields must never price a scheduled
 * request as emergency and let it proceed to payment. */
export function assertBookingTimingResponse(expected: Partial<BookingTiming>, response: Partial<BookingTiming>): void {
  if (expected.bookingType !== 'scheduled') return;
  const returned = normalizeBookingTiming(response);
  if (returned.bookingType !== 'scheduled' || !returned.scheduledAt || returned.scheduledAt !== normalizedInstant(expected.scheduledAt)) {
    throw new Error('The server did not confirm this appointment. Refresh the scheduled booking before continuing.');
  }
}

export function buildBookingSchedulePatch(
  draft: AssistedChatDraft,
  bookingType: AssistedChatBookingType,
  scheduledAt: string | null,
): Partial<AssistedChatDraft> {
  if (draft.dispatchedBookingId || draft.dispatchedRefNumber || draft.paymentLink) {
    throw new Error('This booking is already created. Open Bookings to review it before changing its appointment.');
  }
  if (bookingType !== 'emergency' && bookingType !== 'scheduled') throw new Error('Choose Emergency or Scheduled.');
  const timing = normalizeBookingTiming({ bookingType, scheduledAt });
  if (bookingType === 'scheduled' && scheduledAt && !timing.scheduledAt) throw new Error('Choose a valid available appointment.');
  if ((draft.bookingType ?? 'emergency') === timing.bookingType && (draft.scheduledAt ?? null) === timing.scheduledAt) return {};
  return {
    ...timing,
    quote: null,
    priceNeedsRefresh: Boolean(draft.quote || draft.quickBookingId || draft.priceNeedsRefresh),
    manualPriceGbp: null,
    savedQuoteId: null,
    savedQuoteRef: null,
    paymentChoice: null,
    paymentLink: null,
  };
}
