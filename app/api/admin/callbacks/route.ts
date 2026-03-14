import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { callMeBack } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'all';
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = 25;
  const offset = (page - 1) * perPage;

  const where = status !== 'all' ? eq(callMeBack.status, status) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(callMeBack)
      .where(where)
      .orderBy(desc(callMeBack.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(callMeBack).where(where),
  ]);

  const totalCount = Number(countResult[0]?.count || 0);

  return NextResponse.json({
    items,
    page,
    totalPages: Math.ceil(totalCount / perPage),
    totalCount,
  });
}
