import { errors } from 'jose';
import { verifyMobileToken } from '@/lib/auth';
import { db, users } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { AdminDeviceSessionUnauthorizedError, adminDeviceSessionMetadataFromRequest, createAdminDeviceSession, isAdminDeviceSessionToken } from '@/lib/auth/admin-device-sessions';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';

/** Upgrade a still-valid mobile admin credential; web cookies cannot opt in. */
export async function POST(request: Request) {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const response = (body: unknown, status = 200) => jsonWithExpoDevCors(request, body,
    { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!token) return response({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verifyMobileToken(token);
    if (payload.role !== 'admin') return response({ error: 'Unauthorized' }, 401);
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
      .where(and(eq(users.id, payload.id), eq(users.role, 'admin'), eq(users.emailVerified, true))).limit(1);
    if (!user) return response({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => null);
    const persistentToken = isAdminDeviceSessionToken(token) ? token : await createAdminDeviceSession(user.id,
      adminDeviceSessionMetadataFromRequest(request, body?.device));
    return response({ token: persistentToken, user: { ...user, role: 'admin' } });
  } catch (error) {
    if (error instanceof AdminDeviceSessionUnauthorizedError || error instanceof errors.JOSEError) return response({ error: 'Unauthorized' }, 401);
    return response({ error: 'Session service is unavailable. Please try again.' }, 503);
  }
}

export async function OPTIONS(request: Request) { return expoDevCorsPreflight(request); }
