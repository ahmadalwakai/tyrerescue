import { NextResponse } from 'next/server';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { VIRTUAL_LANDLINE_PREVIEW_ONLY, VIRTUAL_LANDLINE_PREVIEW_ONLY_MESSAGE } from '@/lib/virtual-landline/mode';
import { listVirtualLandlineInteractions } from '@/lib/virtual-landline/server';
import { maybeVirtualLandlineMigrationMissingResponse } from '../_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const { page, perPage, offset } = parsePageParams(url, { page: 1, perPage: 25, maxPerPage: 100 });
  const search = url.searchParams.get('search') || '';
  const direction = url.searchParams.get('direction') || 'all';
  const reviewed = url.searchParams.get('reviewed') || 'all';

  if (VIRTUAL_LANDLINE_PREVIEW_ONLY) {
    return NextResponse.json({
      items: [],
      page,
      perPage,
      totalCount: 0,
      totalPages: 0,
      pendingMissedCount: 0,
      previewMode: true,
      message: VIRTUAL_LANDLINE_PREVIEW_ONLY_MESSAGE,
    });
  }

  try {
    const result = await listVirtualLandlineInteractions({
      search,
      direction,
      reviewed,
      limit: perPage,
      offset,
    });

    return NextResponse.json({
      ...result,
      page,
      perPage,
      totalPages: Math.ceil(result.totalCount / perPage),
    });
  } catch (error) {
    const migrationResponse = maybeVirtualLandlineMigrationMissingResponse(error);
    if (migrationResponse) return migrationResponse;
    console.error('[virtual-landline:list] failed', error);
    return NextResponse.json({ error: 'Failed to load Virtual Landline interactions.' }, { status: 500 });
  }
}
