import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trackingSessions } from '@/lib/db/schema';
import { getTrackingSessionByDriverToken, toPublicState } from '@/lib/tracking-session';

/**
 * Driver hits this when they tap "Finish job". Marks the session as
 * completed. This does NOT touch the booking row — booking lifecycle is
 * managed by the existing driver workflow.
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
  if (session.status === 'expired') {
    return NextResponse.json({ error: 'Tracking session expired' }, { status: 409 });
  }

  const now = new Date();
  const [updated] = await db
    .update(trackingSessions)
    .set({
      status: 'completed',
      completedAt: session.completedAt ?? now,
      updatedAt: now,
    })
    .where(eq(trackingSessions.id, session.id))
    .returning();

  return NextResponse.json({ bookingId: updated.bookingId, state: toPublicState(updated) });
}
