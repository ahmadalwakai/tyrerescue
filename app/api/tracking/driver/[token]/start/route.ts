import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trackingSessions } from '@/lib/db/schema';
import { getTrackingSessionByDriverToken, toPublicState } from '@/lib/tracking-session';

/**
 * Driver hits this when they tap "Start journey". Transitions
 * pending|paused → in_progress and stamps startedAt (only once).
 * Returns 409 if already completed/expired.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await getTrackingSessionByDriverToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Tracking session not found' }, { status: 404 });
  }
  if (session.status === 'completed' || session.status === 'expired') {
    return NextResponse.json({ error: 'Tracking session already finished' }, { status: 409 });
  }

  const now = new Date();
  const [updated] = await db
    .update(trackingSessions)
    .set({
      status: 'in_progress',
      startedAt: session.startedAt ?? now,
      lastUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(trackingSessions.id, session.id))
    .returning();

  return NextResponse.json({ bookingId: updated.bookingId, state: toPublicState(updated) });
}
