import { NextResponse } from 'next/server';
import { getBonlineConfig, matchesBonlineSecret } from '@/lib/bonline/config';
import { BonlineBodyError, parseBonlineEvent, readBonlineBody } from '@/lib/bonline/events';
import { storeBonlineEvent } from '@/lib/bonline/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export async function POST(request: Request, context: { params: Promise<{ secret: string }> }) {
  const config = getBonlineConfig();
  const { secret } = await context.params;
  if (!config || !matchesBonlineSecret(secret, config.secret)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
  }
  try {
    const parsed = parseBonlineEvent(await readBonlineBody(request), request.headers, config);
    if (parsed.type === 'invalid' || parsed.type === 'forbidden') {
      return NextResponse.json({ error: parsed.reason }, { status: parsed.type === 'forbidden' ? 403 : 400, headers });
    }
    if (parsed.type === 'ignored') {
      return NextResponse.json({ received: true, accepted: false }, { status: 202, headers });
    }
    await storeBonlineEvent(config.scope, parsed.event);
    return NextResponse.json({ received: true, accepted: true }, { headers });
  } catch (error) {
    if (error instanceof BonlineBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    // Neither URL nor payload is logged: the path is secret and calls contain PII.
    console.error('[bonline] Call event could not be persisted.');
    return NextResponse.json({ error: 'Call event could not be stored. Please retry.' }, { status: 503, headers });
  }
}
