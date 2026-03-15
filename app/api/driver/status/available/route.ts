import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { drivers, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/driver/status/available
 * 
 * Public endpoint to check if any driver is currently available.
 * Used by the booking wizard to show driver availability status.
 */
export async function GET() {
  try {
    // Find available online drivers
    const availableDrivers = await db
      .select({
        id: drivers.id,
        name: users.name,
        locationAt: drivers.locationAt,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(
        and(
          eq(drivers.isOnline, true),
          eq(drivers.status, 'available')
        )
      )
      .limit(5);

    // Check if we have any recent locations (within 60 minutes)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const activeDrivers = availableDrivers.filter(d => {
      if (!d.locationAt) return true; // Online but no GPS yet — still available
      return new Date(d.locationAt) > oneHourAgo;
    });

    return NextResponse.json({
      available: activeDrivers.length > 0,
      count: activeDrivers.length,
      message: activeDrivers.length > 0
        ? `${activeDrivers.length} driver${activeDrivers.length > 1 ? 's' : ''} available now`
        : 'No drivers available at the moment',
    });
  } catch (error) {
    console.error('Error checking driver availability:', error);
    return NextResponse.json(
      { available: false, count: 0, message: 'Unable to check availability' },
      { status: 500 }
    );
  }
}
