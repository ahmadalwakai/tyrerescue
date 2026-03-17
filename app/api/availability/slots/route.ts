import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, drivers, serviceAreas } from '@/lib/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { haversineDistanceMiles } from '@/lib/mapbox';

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

    // ── Location-aware capacity ──────────────────────────────
    // If lat/lng provided, find nearest service area and use its drivers.
    // Otherwise fall back to global count.
    let slotsPerTimeSlot: number;

    const parsedLat = lat ? parseFloat(lat) : null;
    const parsedLng = lng ? parseFloat(lng) : null;

    if (parsedLat !== null && parsedLng !== null && !isNaN(parsedLat) && !isNaN(parsedLng)) {
      // Find the nearest active service area within range
      const areas = await db
        .select({
          id: serviceAreas.id,
          centerLat: serviceAreas.centerLat,
          centerLng: serviceAreas.centerLng,
          radiusMiles: serviceAreas.radiusMiles,
        })
        .from(serviceAreas)
        .where(eq(serviceAreas.active, true));

      let nearestArea: typeof areas[number] | null = null;
      let nearestDist = Infinity;

      for (const area of areas) {
        if (!area.centerLat || !area.centerLng) continue;
        const dist = haversineDistanceMiles(
          { lat: Number(area.centerLat), lng: Number(area.centerLng) },
          { lat: parsedLat, lng: parsedLng },
        );
        const radius = area.radiusMiles ? Number(area.radiusMiles) : 50;
        if (dist <= radius && dist < nearestDist) {
          nearestDist = dist;
          nearestArea = area;
        }
      }

      if (nearestArea) {
        // Count drivers whose last known position is within this service area
        const allDrivers = await db
          .select({
            lat: drivers.currentLat,
            lng: drivers.currentLng,
          })
          .from(drivers)
          .where(eq(drivers.status, 'available'));

        const areaRadius = nearestArea.radiusMiles ? Number(nearestArea.radiusMiles) : 50;
        const driversInArea = allDrivers.filter((d) => {
          if (!d.lat || !d.lng || !nearestArea!.centerLat || !nearestArea!.centerLng) return false;
          const dist = haversineDistanceMiles(
            { lat: Number(d.lat), lng: Number(d.lng) },
            { lat: Number(nearestArea!.centerLat), lng: Number(nearestArea!.centerLng) },
          );
          return dist <= areaRadius;
        });

        slotsPerTimeSlot = Math.max(driversInArea.length, 2);
      } else {
        // Customer outside all areas — fall back to global count
        const activeDrivers = await db
          .select({ count: sql<number>`count(*)` })
          .from(drivers)
          .where(eq(drivers.status, 'available'));
        slotsPerTimeSlot = Math.max(activeDrivers[0]?.count || 0, 2);
      }
    } else {
      // No location — generic capacity
      const activeDrivers = await db
        .select({ count: sql<number>`count(*)` })
        .from(drivers)
        .where(eq(drivers.status, 'available'));
      slotsPerTimeSlot = Math.max(activeDrivers[0]?.count || 0, 2);
    }

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
