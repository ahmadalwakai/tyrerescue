import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, drivers } from '@/lib/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

interface TimeSlot {
  time: string;
  label: string;
  available: boolean;
  spotsLeft: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

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

    // Check if date is in valid range (tomorrow to 14 days from now)
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + 1);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 14);

    if (selectedDate < minDate || selectedDate > maxDate) {
      return NextResponse.json(
        { error: 'Date must be between tomorrow and 14 days from now' },
        { status: 400 }
      );
    }

    // Generate time slots for the day (8am to 8pm, hourly slots)
    const baseSlots: { time: string; label: string }[] = [];
    for (let hour = 8; hour <= 20; hour++) {
      const time = `${hour.toString().padStart(2, '0')}:00`;
      const label = formatTimeLabel(hour);
      baseSlots.push({ time, label });
    }

    // Get total number of drivers available for this date
    // For simplicity, count all active drivers
    const activeDrivers = await db
      .select({ count: sql<number>`count(*)` })
      .from(drivers)
      .where(eq(drivers.status, 'available'));
    
    const totalDrivers = Math.max(activeDrivers[0]?.count || 0, 2); // Minimum 2 slots for demo
    const slotsPerTimeSlot = totalDrivers;

    // Get existing bookings for this date
    const dateStart = new Date(`${date}T00:00:00`);
    const dateEnd = new Date(`${date}T23:59:59`);

    const existingBookings = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM scheduled_at)::int`,
        count: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.scheduledAt, dateStart),
          lte(bookings.scheduledAt, dateEnd),
          // Only count active bookings (not cancelled or completed)
          sql`status NOT IN ('cancelled', 'completed', 'refunded')`
        )
      )
      .groupBy(sql`EXTRACT(HOUR FROM scheduled_at)`);

    // Create a map of hour -> booked count
    const bookedMap = new Map<number, number>();
    for (const booking of existingBookings) {
      bookedMap.set(booking.hour, Number(booking.count));
    }

    // Build final slots with availability
    const slots: TimeSlot[] = baseSlots.map((slot) => {
      const hour = parseInt(slot.time.split(':')[0], 10);
      const bookedCount = bookedMap.get(hour) || 0;
      const spotsLeft = Math.max(0, slotsPerTimeSlot - bookedCount);

      return {
        time: slot.time,
        label: slot.label,
        available: spotsLeft > 0,
        spotsLeft,
      };
    });

    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Error fetching availability slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}

function formatTimeLabel(hour: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'am' : 'pm';
  return `${h}:00${ampm}`;
}
