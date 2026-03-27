import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, notifications, adminNotifications, users, bookings } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '20', 10)));

  const conditions = [];
  if (unreadOnly) conditions.push(eq(adminNotifications.isRead, false));
  if (cursor) conditions.push(lt(adminNotifications.createdAt, new Date(cursor)));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [alerts, unreadRows, failed] = await Promise.all([
    db
      .select()
      .from(adminNotifications)
      .where(whereClause)
      .orderBy(desc(adminNotifications.createdAt))
      .limit(limit + 1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminNotifications)
      .where(eq(adminNotifications.isRead, false)),
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        channel: notifications.channel,
        status: notifications.status,
        attempts: notifications.attempts,
        lastError: notifications.lastError,
        createdAt: notifications.createdAt,
        userName: users.name,
        userEmail: users.email,
        bookingRef: bookings.refNumber,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.userId, users.id))
      .leftJoin(bookings, eq(notifications.bookingId, bookings.id))
      .where(eq(notifications.status, 'failed'))
      .orderBy(desc(notifications.createdAt))
      .limit(30),
  ]);

  const hasMore = alerts.length > limit;
  const items = hasMore ? alerts.slice(0, limit) : alerts;

  return NextResponse.json({
    notifications: items.map((item) => ({
      ...item,
      createdAt: item.createdAt?.toISOString() ?? null,
      readAt: item.readAt?.toISOString() ?? null,
    })),
    unreadCount: Number(unreadRows[0]?.count || 0),
    hasMore,
    nextCursor: hasMore ? items[items.length - 1]?.createdAt?.toISOString() || null : null,
    failedNotifications: failed.map((item) => ({
      ...item,
      createdAt: item.createdAt?.toISOString() ?? null,
    })),
  });
}

export async function PATCH(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();

  if (body?.markAllRead === true) {
    await db
      .update(adminNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(adminNotifications.isRead, false));

    return NextResponse.json({ success: true, marked: 'all' });
  }

  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide 'ids' or 'markAllRead: true'" }, { status: 400 });
  }

  await db
    .update(adminNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(inArray(adminNotifications.id, ids));

  return NextResponse.json({ success: true, marked: ids.length });
}
