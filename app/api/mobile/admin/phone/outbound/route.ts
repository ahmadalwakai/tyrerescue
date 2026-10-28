import { NextResponse } from 'next/server';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { getOutboundConfiguration } from '@/lib/bonline/outbound-config';
import { checkOutboundStorage } from '@/lib/bonline/outbound-store';
import { parseOutboundRequest, requestOutboundCall } from '@/lib/bonline/outbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...headers, ...extra } });

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  const { capability } = getOutboundConfiguration(user.id);
  if (capability.enabled) {
    try { await checkOutboundStorage(); } catch {
      return json({ enabled: false, reason: 'audit_unavailable', message: 'The calling audit database is not available yet.' });
    }
  }
  return json(capability);
}

export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  const origin = request.headers.get('origin');
  const bearer = /^Bearer \S+$/.test(request.headers.get('authorization') ?? '');
  if ((origin && origin !== new URL(request.url).origin) || (!bearer && !origin)) {
    return json({ reason: 'origin_not_allowed', message: 'This call request is not allowed from this origin.' }, 403);
  }
  const { capability, config } = getOutboundConfiguration(user.id);
  if (!capability.enabled || !config) return json(capability, 503);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return json({ reason: 'invalid_request', message: 'An explicit JSON call request is required.' }, 400);
  }
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_048) { await reader.cancel(); return json({ reason: 'invalid_request', message: 'The call request is too large.' }, 413); }
      chunks.push(value);
    }
    input = parseOutboundRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    return json({ reason: 'invalid_request', message: 'The call request could not be read.' }, 400);
  }
  if (!input) return json({ reason: 'invalid_request', message: 'Confirm the call and provide a valid UK customer number and a unique request key.' }, 400);
  const result = await requestOutboundCall(config, user.id, input);
  return json(result.body, result.statusCode, result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : {});
}
