import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trackingSessions } from '@/lib/db/schema';
import { getTrackingSessionByDriverToken, toPublicState } from '@/lib/tracking-session';

const locationSchema = z.object({
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
  accuracy: z.number().finite().nonnegative().lte(100_000).optional().nullable(),
  heading: z.number().finite().gte(0).lt(360).optional().nullable(),
  speed: z.number().finite().gte(0).lte(200).optional().nullable(), // m/s; reject absurd
});

/**
 * Driver page POSTs this every few seconds while the page is open.
 * Token IS the auth. We auto-promote pending→in_progress so even drivers
 * who skip the "Start" button still get tracked.
 */
export async function POST(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = locationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid location payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const promoteToInProgress = session.status === 'pending';
  const [updated] = await db
    .update(trackingSessions)
    .set({
      status: 'in_progress',
      startedAt: session.startedAt ?? (promoteToInProgress ? now : session.startedAt),
      lastLatitude: parsed.data.latitude.toFixed(6),
      lastLongitude: parsed.data.longitude.toFixed(6),
      lastAccuracy: parsed.data.accuracy ?? null,
      lastHeading: parsed.data.heading ?? null,
      lastSpeed: parsed.data.speed ?? null,
      lastUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(trackingSessions.id, session.id))
    .returning();

  return NextResponse.json({ bookingId: updated.bookingId, state: toPublicState(updated) });
}
