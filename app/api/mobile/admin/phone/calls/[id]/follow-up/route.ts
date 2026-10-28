import { NextResponse } from 'next/server';
import { getMobileAdminUser } from '@/app/api/mobile/admin/_lib';
import { canReadBonlineCalls, getBonlineConfig } from '@/lib/bonline/config';
import { BonlineBodyError, readBonlineBody } from '@/lib/bonline/events';
import { isBonlineCallId, parseBonlineFollowUpCommand, updateBonlineFollowUp } from '@/lib/bonline/calls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, Cookie' };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMobileAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const config = getBonlineConfig();
  if (!config || !canReadBonlineCalls(config, user.id)) {
    return NextResponse.json({ error: 'Call follow-up is not enabled for this administrator.' }, { status: 403, headers });
  }
  const { id } = await params;
  if (!isBonlineCallId(id)) return NextResponse.json({ error: 'Invalid call identifier.' }, { status: 400, headers });
  try {
    const command = parseBonlineFollowUpCommand(await readBonlineBody(request));
    if (!command) return NextResponse.json({ error: 'Invalid follow-up action or resolution.' }, { status: 400, headers });
    const result = await updateBonlineFollowUp(config.scope, id, user.id, command);
    if (result.result === 'not_found') return NextResponse.json({ error: 'Call not found.' }, { status: 404, headers });
    if (result.result === 'conflict') {
      return NextResponse.json({ error: 'This follow-up is unavailable, already resolved, or assigned to another administrator.' }, { status: 409, headers });
    }
    return NextResponse.json({ followUp: result.followUp }, { headers });
  } catch (error) {
    if (error instanceof BonlineBodyError) return NextResponse.json({ error: 'Invalid follow-up request body.' }, { status: error.status, headers });
    console.error('[bonline] Call follow-up could not be updated.');
    return NextResponse.json({ error: 'Call follow-up is temporarily unavailable.' }, { status: 503, headers });
  }
}
