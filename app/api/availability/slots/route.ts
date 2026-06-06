import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSlotsWithOccupancyForDate,
  isPublicBookingScheduleSlot,
} from '@/lib/availability';
import { syncAvailabilitySlots } from '@/lib/availability-sync';

export const dynamic = 'force-dynamic';

interface TimeSlot {
  slotId: string;
  date: string;
  time: string;
  label: string;
  timeStart: string;
  timeEnd: string;
  active: boolean;
  maxBookings: number;
  bookedCount: number;
  available: boolean;
  spotsLeft: number;
}

const LONDON_TZ = 'Europe/London';

function londonDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function isDefaultBusinessDate(dateStr: string): boolean {
  return Boolean(dateStr);
}

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawDate = searchParams.get('date');

    if (!rawDate) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 },
      );
    }

    const parsed = querySchema.safeParse({ date: rawDate });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const { date } = parsed.data;

    // Validate against London business dates (today to 14 days).
    const todayLondon = londonDateString();
    const minDate = todayLondon;
    const maxDate = addDays(todayLondon, 14);

    if (date < minDate || date > maxDate) {
      return NextResponse.json(
        { error: 'Date must be between today and 14 days from now' },
        { status: 400 }
      );
    }

    let slotsForDate = await getSlotsWithOccupancyForDate(date, { activeOnly: false });

    if (slotsForDate.length === 0 && isDefaultBusinessDate(date)) {
      await syncAvailabilitySlots({
        daysAhead: 14,
        slotMinutes: 60,
        timezone: LONDON_TZ,
      });
      slotsForDate = await getSlotsWithOccupancyForDate(date, { activeOnly: false });
    }

    const slots: TimeSlot[] = slotsForDate
      .filter((slot) => slot.active && slot.available && isPublicBookingScheduleSlot(slot))
      .map(
      (slot) => ({
        slotId: slot.id,
        date: slot.date,
        time: slot.time,
        label: slot.label,
        timeStart: slot.timeStart,
        timeEnd: slot.timeEnd,
        active: slot.active,
        maxBookings: slot.maxBookings,
        bookedCount: slot.bookedCount,
        available: slot.available,
        spotsLeft: slot.spotsLeft,
      }),
    );

    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Error fetching availability slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}
