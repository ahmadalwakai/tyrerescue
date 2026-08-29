import { NextResponse } from 'next/server';
import { isAuthorizedProjectIntegrationRequest } from '@/lib/integrations/project-auth';
import { getProjectSource } from '@/lib/integrations/project-sources';

/**
 * Shared secret guard for the inbound tyrerepair.uk integration.
 *
 * tyrerepair.uk calls these endpoints server-to-server to push field jobs into
 * the tyrerescue dispatch system (so the existing driver app, FCM lock-screen
 * alerts, in-app map and live tracking all work unchanged). Requests must carry
 * the shared secret in the `x-integration-key` header.
 *
 * This is additive: it does not alter any existing tyrerescue behaviour.
 */
export function isAuthorizedIntegrationRequest(request: Request): boolean {
  const source = getProjectSource('tyrerepair_uk');
  return source ? isAuthorizedProjectIntegrationRequest(request, source) : false;
}

export function integrationUnauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
