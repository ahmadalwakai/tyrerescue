import { getMobileAdminUser } from '../../_lib';
import { AdminDeviceSessionUnauthorizedError, getCurrentAdminDeviceSessionId, listAdminDeviceSessions } from '@/lib/auth/admin-device-sessions';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';

export async function GET(request: Request) {
  const response = (body: unknown, status = 200) => jsonWithExpoDevCors(request, body,
    { status, headers: { 'Cache-Control': 'private, no-store' } });
  const user = await getMobileAdminUser(request);
  if (!user) return response({ error: 'Unauthorized' }, 401);
  try {
    const header = request.headers.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const currentSessionId = await getCurrentAdminDeviceSessionId(token, user.id);
    return response({ ok: true, currentSessionId, items: await listAdminDeviceSessions(user.id, currentSessionId) });
  } catch (error) {
    return error instanceof AdminDeviceSessionUnauthorizedError ? response({ error: 'Unauthorized' }, 401)
      : response({ error: 'Devices are unavailable. Please try again.' }, 503);
  }
}

export async function OPTIONS(request: Request) { return expoDevCorsPreflight(request); }
