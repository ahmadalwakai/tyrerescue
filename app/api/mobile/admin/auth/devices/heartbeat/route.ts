import { z } from 'zod';
import { AdminDeviceSessionUnauthorizedError, adminDeviceSessionMetadataFromRequest, getRevokedAdminDeviceSessionId,
  isAdminDeviceSessionToken, recordAdminDeviceHeartbeat } from '@/lib/auth/admin-device-sessions';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';

const label = z.string().max(4096).optional();
const schema = z.object({ state: z.literal('active'), device: z.object({ deviceName: label, modelName: label,
  platform: label, osVersion: label, appVersion: label }).strict() }).strict();

export async function POST(request: Request) {
  const response = (body: unknown, status = 200) => jsonWithExpoDevCors(request, body,
    { status, headers: { 'Cache-Control': 'private, no-store' } });
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!isAdminDeviceSessionToken(token)) return response({ error: 'Unauthorized' }, 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: 'Invalid active-device update' }, 400);
  try {
    if (!await recordAdminDeviceHeartbeat(token, adminDeviceSessionMetadataFromRequest(request, parsed.data.device))) throw new AdminDeviceSessionUnauthorizedError();
    return response({ ok: true });
  } catch (error) {
    if (error instanceof AdminDeviceSessionUnauthorizedError) {
      try {
        const sessionId = await getRevokedAdminDeviceSessionId(token);
        return response({ error: 'Unauthorized', ...(sessionId ? { code: 'DEVICE_SESSION_REVOKED', sessionId } : {}) }, 401);
      } catch { /* A store failure cannot be reported as explicit removal. */ }
    }
    return response({ error: 'Device activity is unavailable. Please try again.' }, 503);
  }
}

export async function OPTIONS(request: Request) { return expoDevCorsPreflight(request); }
