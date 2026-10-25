import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '../_lib';
import { listDriverJourneyItems } from '@/lib/tracking/driver-journeys';

export async function GET(request: Request) {
  if (!await getMobileAdminUser(request)) return unauthorizedResponse();
  const eventId = new URL(request.url).searchParams.get('eventId') ?? undefined;
  if (eventId && !z.string().uuid().safeParse(eventId).success) return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  try {
    const items = await listDriverJourneyItems(eventId);
    return NextResponse.json({ ok: true, items }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Driver monitoring is unavailable. Try again.' }, { status: 503 });
  }
}
