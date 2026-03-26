import { NextRequest, NextResponse } from 'next/server';
import { getSlotsWithOccupancyForDate } from '@/lib/availability';

interface TimeSlot {
  slotId: string;
  date: string;
  time: string;
  label: string;
  timeStart: string;
  timeEnd: string;
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Validate against London business dates (tomorrow to 14 days).
    const todayLondon = londonDateString();
    const minDate = addDays(todayLondon, 1);
    const maxDate = addDays(todayLondon, 14);

    if (date < minDate || date > maxDate) {
      return NextResponse.json(
        { error: 'Date must be between tomorrow and 14 days from now' },
        { status: 400 }
      );
    }

    const slots: TimeSlot[] = (await getSlotsWithOccupancyForDate(date, { activeOnly: true })).map(
      (slot) => ({
        slotId: slot.id,
        date: slot.date,
        time: slot.time,
        label: slot.label,
        timeStart: slot.timeStart,
        timeEnd: slot.timeEnd,
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
