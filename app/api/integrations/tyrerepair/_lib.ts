import { NextResponse } from 'next/server';

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
  const secret = (process.env.TYREREPAIR_INTEGRATION_SECRET ?? '').trim();
  if (!secret) return false;
  const provided = (request.headers.get('x-integration-key') ?? '').trim();
  if (!provided) return false;
  // Constant-time-ish comparison to avoid trivial timing leaks.
  if (provided.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}

export function integrationUnauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
