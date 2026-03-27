import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db, contactMessages } from '@/lib/db';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'all';
  const { page, perPage, offset } = parsePageParams(url, { page: 1, perPage: 25, maxPerPage: 100 });

  const whereClause = status !== 'all' ? eq(contactMessages.status, status) : undefined;

  const [items, countRows, unreadRows] = await Promise.all([
    db
      .select()
      .from(contactMessages)
      .where(whereClause)
      .orderBy(desc(contactMessages.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(contactMessages).where(whereClause),
    db.select({ count: sql<number>`count(*)::int` }).from(contactMessages).where(eq(contactMessages.status, 'unread')),
  ]);

  const totalCount = Number(countRows[0]?.count || 0);

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt?.toISOString() ?? null,
      repliedAt: item.repliedAt?.toISOString() ?? null,
    })),
    page,
    perPage,
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
    unreadCount: Number(unreadRows[0]?.count || 0),
  });
}
