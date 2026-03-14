import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { callMeBack } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(callMeBack)
    .where(eq(callMeBack.status, 'pending'));

  return NextResponse.json({ count: Number(result?.count || 0) });
}
