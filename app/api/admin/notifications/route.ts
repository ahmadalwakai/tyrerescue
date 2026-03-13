import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, notifications, users, bookings } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    await requireAdmin();

    // Get all failed notifications with related data
    const failedNotifications = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        channel: notifications.channel,
        status: notifications.status,
        attempts: notifications.attempts,
        lastError: notifications.lastError,
        createdAt: notifications.createdAt,
        userId: notifications.userId,
        bookingId: notifications.bookingId,
        userName: users.name,
        userEmail: users.email,
        bookingRef: bookings.refNumber,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.userId, users.id))
      .leftJoin(bookings, eq(notifications.bookingId, bookings.id))
      .where(eq(notifications.status, 'failed'))
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    return NextResponse.json({
      success: true,
      notifications: failedNotifications,
      count: failedNotifications.length,
    });
  } catch (error) {
    console.error('Error fetching failed notifications:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
