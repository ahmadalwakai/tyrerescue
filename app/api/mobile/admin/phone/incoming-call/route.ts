import { NextResponse } from 'next/server';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { canReadBonlineCalls, getBonlineConfig } from '@/lib/bonline/config';
import { isBonlineCursor, readBonlineFeed } from '@/lib/bonline/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, Cookie' };

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  const config = getBonlineConfig();
  if (!config || !canReadBonlineCalls(config, user.id)) {
    return NextResponse.json({ enabled: false, cursor: '0', serverTime: new Date().toISOString(), events: [] }, { headers });
  }
  const after = new URL(request.url).searchParams.get('after');
  if (after !== null && !isBonlineCursor(after)) {
    return NextResponse.json({ error: 'Invalid call cursor.' }, { status: 400, headers });
  }
  try {
    return NextResponse.json({ enabled: true, ...await readBonlineFeed(config.scope, after) }, { headers });
  } catch {
    console.error('[bonline] Incoming call feed could not be read.');
    return NextResponse.json({ error: 'Incoming calls are temporarily unavailable.' }, { status: 503, headers });
  }
}
