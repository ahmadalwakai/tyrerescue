import { NextResponse } from 'next/server';
import { isAuthorizedProjectIntegrationRequest } from '@/lib/integrations/project-auth';
import { getProjectSource, type IntegratedProjectSourceApp } from '@/lib/integrations/project-sources';
import { handleProjectBookingHandoff } from '@/lib/integrations/booking-handoff';

export function createProjectBookingPostHandler(sourceApp: IntegratedProjectSourceApp) {
  return async function POST(request: Request) {
    const source = getProjectSource(sourceApp);
    if (!source) {
      return NextResponse.json({ error: 'Project source is not configured' }, { status: 500 });
    }

    if (!isAuthorizedProjectIntegrationRequest(request, source)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as unknown;
    return handleProjectBookingHandoff(request, source, body);
  };
}
