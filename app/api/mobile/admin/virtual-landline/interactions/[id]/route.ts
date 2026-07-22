import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { VIRTUAL_LANDLINE_PREVIEW_ONLY } from '@/lib/virtual-landline/mode';
import {
  linkVirtualLandlineInteractionToBooking,
  markVirtualLandlineInteractionReviewed,
} from '@/lib/virtual-landline/server';
import { maybeVirtualLandlineMigrationMissingResponse, virtualLandlinePreviewOnlyResponse } from '../../_lib';

interface Props {
  params: Promise<{ id: string }>;
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_reviewed') }),
  z.object({ action: z.literal('link_booking'), bookingRef: z.string().min(1).max(40) }),
]);

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  if (VIRTUAL_LANDLINE_PREVIEW_ONLY) return virtualLandlinePreviewOnlyResponse();

  const { id } = await params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid Virtual Landline action.' }, { status: 400 });
  }

  try {
    if (parsed.data.action === 'mark_reviewed') {
      const updated = await markVirtualLandlineInteractionReviewed(id, user.id);
      if (!updated) return NextResponse.json({ error: 'Interaction not found.' }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    const linked = await linkVirtualLandlineInteractionToBooking({
      interactionId: id,
      bookingRef: parsed.data.bookingRef,
      adminId: user.id,
    });
    if (!linked.ok) return NextResponse.json({ error: linked.error }, { status: linked.status });
    return NextResponse.json({ ok: true, booking: linked.booking });
  } catch (error) {
    const migrationResponse = maybeVirtualLandlineMigrationMissingResponse(error);
    if (migrationResponse) return migrationResponse;
    console.error('[virtual-landline:action] failed', error);
    return NextResponse.json({ error: 'Failed to update Virtual Landline interaction.' }, { status: 500 });
  }
}
