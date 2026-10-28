import { NextResponse } from 'next/server';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { getBonlineConfig, canReadBonlineCalls } from '@/lib/bonline/config';
import { readBonlineAnalytics } from '@/lib/bonline/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, Cookie' };

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  const config = getBonlineConfig();
  if (!config || !canReadBonlineCalls(config, user.id)) return NextResponse.json({ enabled: false }, { headers });
  const rawDays = new URL(request.url).searchParams.get('days') ?? '30';
  if (!['7', '30', '90'].includes(rawDays)) return NextResponse.json({ error: 'Choose 7, 30 or 90 days.' }, { status: 400, headers });
  try {
    return NextResponse.json({ enabled: true, ...await readBonlineAnalytics(config.scope, Number(rawDays) as 7 | 30 | 90) }, { headers });
  } catch {
    return NextResponse.json({ error: 'Call reporting is temporarily unavailable.' }, { status: 503, headers });
  }
}
