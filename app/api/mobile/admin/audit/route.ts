import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db, auditLogs } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);

  return NextResponse.json({
    items: logs.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt?.toISOString() ?? null,
    })),
  });
}
