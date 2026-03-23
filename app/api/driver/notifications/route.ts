import { NextResponse } from 'next/server';
import { db, driverNotifications } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { driverId } = await requireDriverMobile(request);

    const rows = await db
      .select()
      .from(driverNotifications)
      .where(eq(driverNotifications.driverId, driverId))
      .orderBy(desc(driverNotifications.createdAt))
      .limit(100);

    return NextResponse.json({ notifications: rows });
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Mark one or all notifications as read */
export async function PATCH(request: Request) {
  try {
    const { driverId } = await requireDriverMobile(request);
    const body = await request.json();
    const { id } = body as { id?: string };

    const now = new Date();

    if (id) {
      // Mark single notification as read — scoped to this driver
      await db
        .update(driverNotifications)
        .set({ isRead: true, readAt: now })
        .where(
          and(
            eq(driverNotifications.id, id),
            eq(driverNotifications.driverId, driverId),
          ),
        );
    } else {
      // Mark all as read
      await db
        .update(driverNotifications)
        .set({ isRead: true, readAt: now })
        .where(eq(driverNotifications.driverId, driverId));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
