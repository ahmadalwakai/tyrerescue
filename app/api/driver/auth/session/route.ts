import { errors } from 'jose';
import { verifyMobileToken } from '@/lib/auth';
import { createDriverDeviceSession, DriverDeviceSessionUnauthorizedError, getCurrentDriverSessionUser,
  isDriverDeviceSessionToken, isRevokedDriverDeviceSession } from '@/lib/auth/driver-device-sessions';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';

/** Upgrade only a still-valid driver Bearer credential; cookies cannot opt in. */
export async function POST(request: Request) {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const response = (body: unknown, status = 200) => jsonWithExpoDevCors(request, body,
    { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!token) return response({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verifyMobileToken(token);
    if (payload.role !== 'driver' || !payload.driverId) return response({ error: 'Unauthorized' }, 401);
    const user = await getCurrentDriverSessionUser(payload.id, payload.driverId);
    const body = await request.json().catch(() => null);
    const persistentToken = isDriverDeviceSessionToken(token) ? token : await createDriverDeviceSession(user.id, body?.device);
    return response({ token: persistentToken, user: { id: user.id, email: user.email,
      name: user.name, role: user.role, driverId: user.driverId } });
  } catch (error) {
    if (error instanceof DriverDeviceSessionUnauthorizedError || error instanceof errors.JOSEError) {
      try {
        if (await isRevokedDriverDeviceSession(token)) return response({ error: 'This device session was removed.', code: 'SESSION_REVOKED' }, 401);
      } catch { return response({ error: 'Session service is unavailable. Please try again.' }, 503); }
      return response({ error: 'Please verify your driver sign-in.', code: 'SESSION_VERIFICATION_REQUIRED' }, 401);
    }
    return response({ error: 'Session service is unavailable. Please try again.' }, 503);
  }
}
export async function OPTIONS(request: Request) { return expoDevCorsPreflight(request); }
