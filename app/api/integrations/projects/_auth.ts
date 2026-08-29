import { NextResponse } from 'next/server';
import {
  getProjectSourceFromRequest,
  type ProjectSource,
} from '@/lib/integrations/project-sources';
import { isAuthorizedProjectIntegrationRequest } from '@/lib/integrations/project-auth';

export function projectIntegrationUnauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function getProjectSourceForRequest(request: Request, fallback?: string | null): ProjectSource | NextResponse {
  const source = getProjectSourceFromRequest(request, fallback);
  if (!source) {
    return NextResponse.json({ error: 'Unknown or missing sourceApp' }, { status: 400 });
  }

  if (!isAuthorizedProjectIntegrationRequest(request, source)) {
    return projectIntegrationUnauthorized();
  }

  return source;
}

export function getProjectSourceFromBodyOrRequest(request: Request, body: unknown): ProjectSource | NextResponse {
  const fallback =
    body && typeof body === 'object' && 'sourceApp' in body
      ? String((body as { sourceApp?: unknown }).sourceApp ?? '')
      : null;
  return getProjectSourceForRequest(request, fallback);
}
