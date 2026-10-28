import { NextResponse } from 'next/server';
import { getMobileAdminUser } from '@/app/api/mobile/admin/_lib';
import { canReadBonlineCalls, getBonlineConfig } from '@/lib/bonline/config';
import { parseBonlineCallsQuery, readBonlineCalls } from '@/lib/bonline/calls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, Cookie' };

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const config = getBonlineConfig();
  if (!config || !canReadBonlineCalls(config, user.id)) {
    return NextResponse.json({ enabled: false, currentAdminId: user.id, calls: [], nextCursor: null,
      summary: { openFollowUps: 0, overdueFollowUps: 0 } }, { headers });
  }
  const query = parseBonlineCallsQuery(new URL(request.url).searchParams);
  if (!query) return NextResponse.json({ error: 'Invalid call filters or cursor.' }, { status: 400, headers });
  try {
    return NextResponse.json({ enabled: true, currentAdminId: user.id, ...await readBonlineCalls(config.scope, query) }, { headers });
  } catch {
    console.error('[bonline] Call history could not be read.');
    return NextResponse.json({ error: 'Call history is temporarily unavailable.' }, { status: 503, headers });
  }
}
