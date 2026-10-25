import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '../../../../_lib';
import { readDriverJourneyEvent } from '@/lib/tracking/driver-journeys';

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  if (!await getMobileAdminUser(request)) return unauthorizedResponse();
  const { eventId } = await params;
  if (!z.string().uuid().safeParse(eventId).success) return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  try {
    if (!await readDriverJourneyEvent(eventId)) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not update notification' }, { status: 503 });
  }
}
