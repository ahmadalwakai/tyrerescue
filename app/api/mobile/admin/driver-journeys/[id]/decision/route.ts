import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '../../../_lib';
import { decideDriverJourney } from '@/lib/tracking/driver-journeys';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = z.object({ decision: z.enum(['yes', 'no']) }).strict().safeParse(body);
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  try {
    const status = await decideDriverJourney(id, parsed.data.decision, user.id);
    if (!status) return NextResponse.json({ error: 'This suggestion is no longer current or was answered by another admin. Refresh the list.' }, { status: 409 });
    return NextResponse.json({ ok: true, status });
  } catch {
    return NextResponse.json({ error: 'Could not save the answer. Try again.' }, { status: 503 });
  }
}
