import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { driverLocationHistory } from '@/lib/db/schema';
import { lte, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Delete location history older than 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const result = await db
    .delete(driverLocationHistory)
    .where(lte(driverLocationHistory.recordedAt, cutoff));

  return NextResponse.json({ cleaned: true });
}
