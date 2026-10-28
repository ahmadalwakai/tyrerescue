import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { getBonlineConfig, canReadBonlineCalls } from '@/lib/bonline/config';
import { BonlineLinkError, linkBonlineCall } from '@/lib/bonline/attribution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, Cookie' };
const bodySchema = z.object({ quoteId: z.string().uuid().optional(), bookingId: z.string().uuid().optional() })
  .strict().refine((value) => value.quoteId || value.bookingId);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  const config = getBonlineConfig();
  if (!config || !canReadBonlineCalls(config, user.id)) {
    return NextResponse.json({ error: 'Call management is unavailable.' }, { status: 403, headers });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && !request.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
  }
  const { id } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(id)) return NextResponse.json({ error: 'Invalid call.' }, { status: 400, headers });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Select a saved quote or booking.' }, { status: 400, headers });
  try {
    return NextResponse.json(await linkBonlineCall(config.scope, id, user.id, parsed.data), { headers });
  } catch (error) {
    if (error instanceof BonlineLinkError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: 'Call attribution is temporarily unavailable.' }, { status: 503, headers });
  }
}
