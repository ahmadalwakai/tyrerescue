// app/api/admin/admin-notifications/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { adminNotifications } from '@/lib/db/schema';
import { desc, eq, sql, and, lt, inArray } from 'drizzle-orm';

// GET /api/admin/admin-notifications?page=1&limit=20&unreadOnly=false
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10))
    );
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const cursor = searchParams.get('cursor'); // ISO date string

    const conditions = [];
    if (unreadOnly) {
      conditions.push(eq(adminNotifications.isRead, false));
    }
    if (cursor) {
      conditions.push(lt(adminNotifications.createdAt, new Date(cursor)));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const notifications = await db
      .select()
      .from(adminNotifications)
      .where(whereClause)
      .orderBy(desc(adminNotifications.createdAt))
      .limit(limit + 1);

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString()
      : null;

    const [{ count: unreadCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminNotifications)
      .where(eq(adminNotifications.isRead, false));

    return NextResponse.json({
      notifications: items,
      unreadCount,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('[GET /api/admin/admin-notifications] Error:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/admin-notifications
// Body: { ids: string[] } or { markAllRead: true }
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();

    if (body.markAllRead === true) {
      await db
        .update(adminNotifications)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(adminNotifications.isRead, false));

      return NextResponse.json({ success: true, marked: 'all' });
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      // Validate IDs are non-empty strings
      const safeIds = body.ids.filter(
        (id: unknown) => typeof id === 'string' && id.length > 0
      );
      if (safeIds.length === 0) {
        return NextResponse.json(
          { error: 'No valid IDs provided' },
          { status: 400 }
        );
      }

      await db
        .update(adminNotifications)
        .set({ isRead: true, readAt: new Date() })
        .where(inArray(adminNotifications.id, safeIds));

      return NextResponse.json({ success: true, marked: safeIds.length });
    }

    return NextResponse.json(
      { error: "Provide 'ids' array or 'markAllRead: true'" },
      { status: 400 }
    );
  } catch (error) {
    console.error('[PATCH /api/admin/admin-notifications] Error:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}
