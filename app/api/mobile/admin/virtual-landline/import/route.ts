import { NextResponse } from 'next/server';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { createAdminNotification } from '@/lib/notifications/create-admin-notification';
import { NOTIFICATION_TYPES } from '@/lib/notifications/types';
import { importVirtualLandlineCalls } from '@/lib/virtual-landline/server';
import {
  maybeVirtualLandlineMigrationMissingResponse,
  readVirtualLandlineCsvFromRequest,
  virtualLandlinePreviewOnlyResponse,
} from '../_lib';
import { VIRTUAL_LANDLINE_PREVIEW_ONLY } from '@/lib/virtual-landline/mode';

export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  if (VIRTUAL_LANDLINE_PREVIEW_ONLY) return virtualLandlinePreviewOnlyResponse();

  const result = await readVirtualLandlineCsvFromRequest(request);
  if (!result.ok) return result.response;

  if (!result.confirmed) {
    return NextResponse.json(
      { error: 'Preview and explicit confirmation are required before importing Virtual Landline calls.' },
      { status: 400 },
    );
  }

  try {
    const summary = await importVirtualLandlineCalls({
      parsed: result.parsed,
      fileName: result.fileName,
      adminId: user.id,
    });

    await Promise.all(
      summary.missedInteractionIds.map((interactionId) =>
        createAdminNotification({
          type: NOTIFICATION_TYPES.VIRTUAL_LANDLINE_MISSED_CALLS_IMPORTED,
          title: 'Missed Virtual Landline call',
          body: 'A missed call was imported from Virtual Landline and is ready for review.',
          entityType: 'virtual_landline',
          entityId: interactionId,
          severity: 'info',
          link: '/admin/notifications',
          metadata: {
            adminPath: '/admin/notifications',
            missedCalls: 1,
          },
          createdBy: user.id,
        }),
      ),
    );

    const state =
      summary.imported === 0 && summary.duplicate > 0
        ? 'duplicate_rows'
        : summary.invalid > 0 || summary.duplicate > 0
          ? 'partially_succeeded'
          : 'succeeded';

    return NextResponse.json({
      state,
      fileName: result.fileName,
      ...summary,
    });
  } catch (error) {
    const migrationResponse = maybeVirtualLandlineMigrationMissingResponse(error);
    if (migrationResponse) return migrationResponse;
    console.error('[virtual-landline:import] failed', error);
    return NextResponse.json({ error: 'Failed to import Virtual Landline calls.' }, { status: 500 });
  }
}
