import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { z } from 'zod';
import { DirectDriverChatError, getOrCreateDirectDriverConversation } from '@/lib/chat/direct-driver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const input = z.object({ driverId: z.string().uuid() }).strict();

/** Staff-only direct chat; the server derives both participants. */
export async function POST(request: NextRequest) {
  const session = await authMobile(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Select a valid driver.' }, { status: 400 });
  try {
    const result = await getOrCreateDirectDriverConversation(session.user.id, parsed.data.driverId);
    return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DirectDriverChatError) {
      return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    }
    console.error('[direct-driver-chat] Could not open conversation');
    return NextResponse.json({ error: 'Could not open driver chat. Please try again.' }, { status: 500 });
  }
}
