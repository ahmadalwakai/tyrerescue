import { isAdminDeviceSessionToken, revokeAdminDeviceSession } from '@/lib/auth/admin-device-sessions';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';

/** The opaque secret authenticates revocation even when already revoked. */
export async function POST(request: Request) {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const response = (body: unknown, status = 200) => jsonWithExpoDevCors(request, body,
    { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!isAdminDeviceSessionToken(token)) return response({ error: 'Unauthorized' }, 401);
  try {
    if (!await revokeAdminDeviceSession(token)) return response({ error: 'Unauthorized' }, 401);
    return response({ ok: true });
  } catch {
    return response({ error: 'Could not revoke this device session. Please try again.' }, 503);
  }
}

export async function OPTIONS(request: Request) { return expoDevCorsPreflight(request); }
