import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db, callMeBack } from '@/lib/db';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'all';
  const { page, perPage, offset } = parsePageParams(url, { page: 1, perPage: 25, maxPerPage: 100 });

  const whereClause = status !== 'all' ? eq(callMeBack.status, status) : undefined;

  const [items, countRows, pendingRows] = await Promise.all([
    db.select().from(callMeBack).where(whereClause).orderBy(desc(callMeBack.createdAt)).limit(perPage).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(callMeBack).where(whereClause),
    db.select({ count: sql<number>`count(*)::int` }).from(callMeBack).where(eq(callMeBack.status, 'pending')),
  ]);

  const totalCount = Number(countRows[0]?.count || 0);

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt?.toISOString() ?? null,
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
    })),
    page,
    perPage,
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
    pendingCount: Number(pendingRows[0]?.count || 0),
  });
}
