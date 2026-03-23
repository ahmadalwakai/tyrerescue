import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { demandSnapshots } from '@/lib/db/schema';
import { gte, desc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const twelveHoursAgo = new Date();
  twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

  const snapshots = await db
    .select()
    .from(demandSnapshots)
    .where(gte(demandSnapshots.hourStart, twelveHoursAgo))
    .orderBy(desc(demandSnapshots.hourStart))
    .limit(12);

  // Find real current-hour snapshot — do NOT fabricate data if absent
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);
  const current = snapshots.find(
    (s) => new Date(s.hourStart).getTime() === hourStart.getTime()
  ) ?? null;

  return NextResponse.json({
    current,
    hasCurrentData: current !== null,
    history: snapshots,
  });
}
