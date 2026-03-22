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

  // Current hour snapshot
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);
  const current = snapshots.find(
    (s) => new Date(s.hourStart).getTime() === hourStart.getTime()
  ) ?? {
    pageViews: 0,
    callClicks: 0,
    bookingStarts: 0,
    bookingCompletes: 0,
    whatsappClicks: 0,
    surchargeApplied: '0.00',
  };

  return NextResponse.json({
    current,
    history: snapshots,
  });
}
