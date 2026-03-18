import { NextResponse } from 'next/server';
import { db, users, drivers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { user, driverId } = await requireDriverMobile(request);

    const [profile] = await db
      .select({
        name: users.name,
        email: users.email,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [driver] = await db
      .select({
        isOnline: drivers.isOnline,
        status: drivers.status,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    return NextResponse.json({
      id: user.id,
      driverId,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      isOnline: driver?.isOnline ?? false,
      status: driver?.status ?? 'offline',
      createdAt: profile.createdAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
