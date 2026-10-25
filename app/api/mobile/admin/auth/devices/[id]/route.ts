import { z } from 'zod';
import { getMobileAdminUser } from '../../../_lib';
import { AdminDeviceSessionUnauthorizedError, getCurrentAdminDeviceSessionId, revokeOwnedAdminDeviceSession } from '@/lib/auth/admin-device-sessions';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const response = (body: unknown, status = 200) => jsonWithExpoDevCors(request, body,
    { status, headers: { 'Cache-Control': 'private, no-store' } });
  const user = await getMobileAdminUser(request);
  if (!user) return response({ error: 'Unauthorized' }, 401);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return response({ error: 'Invalid device' }, 400);
  try {
    const header = request.headers.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const currentSessionId = await getCurrentAdminDeviceSessionId(token, user.id);
    if (!await revokeOwnedAdminDeviceSession(id, user.id)) return response({ error: 'Device not found' }, 404);
    return response({ ok: true, removedCurrent: id === currentSessionId });
  } catch (error) {
    return error instanceof AdminDeviceSessionUnauthorizedError ? response({ error: 'Unauthorized' }, 401)
      : response({ error: 'Could not remove this device. Please try again.' }, 503);
  }
}

export async function OPTIONS(request: Request) { return expoDevCorsPreflight(request); }
