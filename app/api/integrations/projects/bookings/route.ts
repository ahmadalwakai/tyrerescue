import { NextResponse } from 'next/server';
import { getProjectSourceFromRequest } from '@/lib/integrations/project-sources';
import { isAuthorizedProjectIntegrationRequest } from '@/lib/integrations/project-auth';
import { handleProjectBookingHandoff } from '@/lib/integrations/booking-handoff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as unknown;
  const bodySourceApp =
    body && typeof body === 'object' && 'sourceApp' in body
      ? String((body as { sourceApp?: unknown }).sourceApp ?? '')
      : null;
  const source = getProjectSourceFromRequest(request, bodySourceApp);

  if (!source) {
    return NextResponse.json(
      { error: 'Unknown or missing sourceApp' },
      { status: 400 },
    );
  }

  if (!isAuthorizedProjectIntegrationRequest(request, source)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleProjectBookingHandoff(request, source, body);
}
