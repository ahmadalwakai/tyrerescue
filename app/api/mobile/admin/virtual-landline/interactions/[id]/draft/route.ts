import { NextResponse } from 'next/server';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { VIRTUAL_LANDLINE_PREVIEW_ONLY } from '@/lib/virtual-landline/mode';
import { getVirtualLandlineDraftPrefill } from '@/lib/virtual-landline/server';
import { maybeVirtualLandlineMigrationMissingResponse, virtualLandlinePreviewOnlyResponse } from '../../../_lib';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  if (VIRTUAL_LANDLINE_PREVIEW_ONLY) return virtualLandlinePreviewOnlyResponse();

  const { id } = await params;
  let draft: Awaited<ReturnType<typeof getVirtualLandlineDraftPrefill>>;
  try {
    draft = await getVirtualLandlineDraftPrefill(id);
  } catch (error) {
    const migrationResponse = maybeVirtualLandlineMigrationMissingResponse(error);
    if (migrationResponse) return migrationResponse;
    console.error('[virtual-landline:draft] failed', error);
    return NextResponse.json({ error: 'Failed to create Virtual Landline draft.' }, { status: 500 });
  }

  if (!draft) {
    return NextResponse.json({ error: 'Interaction not found.' }, { status: 404 });
  }

  return NextResponse.json({ draft });
}
