import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getMobileAdminUser, unauthorizedResponse } from '../../_lib';
import { getCurrentAdminDeviceSessionId } from '@/lib/auth/admin-device-sessions';
import { db } from '@/lib/db';
import { sendAdminSelfTestPush } from '@/lib/notifications/admin-self-test-push';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { rateLimitedResponse } from '@/lib/security/responses';

const headers = { 'Cache-Control': 'private, no-store' };
const expoTokenPattern = String.raw`^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$`;
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/** No recipient, user, message or booking can be supplied by the client. */
export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
      return response({ error: 'Send an empty notification test request.' }, 400);
    }
  } catch {
    return response({ error: 'Invalid JSON body.' }, 400);
  }

  const authorization = request.headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  // Legacy JWTs identify an administrator but cannot prove which of their
  // devices is making this request. Never fall back to every registered phone.
  if (!bearer.startsWith('acs_v1.')) {
    return response({ error: 'Verify this device session before sending a test notification.' }, 409);
  }
  try {
    const sessionId = await getCurrentAdminDeviceSessionId(bearer, user.id);
    if (!sessionId) return unauthorizedResponse();
    const limit = await checkRateLimit(`adminNotificationTest:${user.id}:${sessionId}`, { limit: 1, windowMs: 60_000 });
    if (!limit.ok) return rateLimitedResponse(limit);

    // Recheck ownership, role and revocation in the recipient query as well as
    // credential verification. Unlinked legacy tokens are never eligible.
    const result = await db.execute<{ token: string }>(sql`
      SELECT push.token FROM admin_push_tokens push
      JOIN admin_device_sessions device ON device.id = push.device_session_id
        AND device.user_id = push.user_id
      JOIN users actor ON actor.id = device.user_id
      WHERE push.user_id = ${user.id}::uuid AND push.device_session_id = ${sessionId}::uuid
        AND device.revoked_at IS NULL AND actor.role = 'admin' AND actor.email_verified = TRUE
        AND push.platform IN ('ios','android') AND push.token ~ ${expoTokenPattern}
      ORDER BY push.updated_at DESC LIMIT 1
    `);
    const token = result.rows[0]?.token;
    if (!token) return response({ error: 'Enable notifications on this device, then try the test again.' }, 409);

    const outcome = await sendAdminSelfTestPush(token);
    if (outcome === 'accepted') return response({ ok: true, status: 'accepted' });
    if (outcome === 'rejected') return response({ error: 'The push service did not accept this device. Enable notifications again and retry.' }, 502);
    return response({ error: 'The notification service is unavailable. Please try again later.' }, 503);
  } catch {
    return response({ error: 'Could not verify or test this device. Please try again.' }, 503);
  }
}
