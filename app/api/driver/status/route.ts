import { NextResponse } from 'next/server';
import { requireDriver } from '@/lib/auth';
import { db, drivers } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const session = await requireDriver();
    const { is_online } = await request.json();

    if (typeof is_online !== 'boolean') {
      return NextResponse.json(
        { error: 'is_online must be a boolean' },
        { status: 400 }
      );
    }

    // Get driver record
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, session.user.id))
      .limit(1);

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver record not found' },
        { status: 404 }
      );
    }

    // Update driver status
    await db
      .update(drivers)
      .set({
        isOnline: is_online,
        status: is_online ? 'available' : 'offline',
        // Clear location when going offline
        ...(is_online ? {} : { currentLat: null, currentLng: null, locationAt: null }),
      })
      .where(eq(drivers.id, driver.id));

    return NextResponse.json({
      success: true,
      isOnline: is_online,
    });
  } catch (error) {
    console.error('Error updating driver status:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Driver access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await requireDriver();

    // Get driver record
    const [driver] = await db
      .select({
        isOnline: drivers.isOnline,
        status: drivers.status,
      })
      .from(drivers)
      .where(eq(drivers.userId, session.user.id))
      .limit(1);

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      isOnline: driver.isOnline ?? false,
      status: driver.status ?? 'offline',
    });
  } catch (error) {
    console.error('Error fetching driver status:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Driver access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
