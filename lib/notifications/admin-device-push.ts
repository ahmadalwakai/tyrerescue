import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminPushTokens } from '@/lib/db/schema';

/** A revoked linked installation must not remain an iOS push recipient. */
export function activeAdminPushSession() {
  return sql`(${adminPushTokens.deviceSessionId} IS NULL OR EXISTS (
    SELECT 1 FROM admin_device_sessions push_session
    JOIN users push_user ON push_user.id = push_session.user_id
    WHERE push_session.id = ${adminPushTokens.deviceSessionId}
      AND push_session.user_id = ${adminPushTokens.userId}
      AND push_session.revoked_at IS NULL
      AND push_user.role = 'admin' AND push_user.email_verified = TRUE
  ))`;
}

/**
 * null: a legacy registration retains its existing behavior.
 * false: the authenticated durable device was revoked while registering.
 * true: registered atomically against an active session of this administrator.
 */
export async function registerDeviceBoundAdminPush(
  request: Request, userId: string, token: string, platform: string,
): Promise<boolean | null> {
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!bearer.startsWith('acs_v1.')) return null;
  const { getCurrentAdminDeviceSessionId } = await import('@/lib/auth/admin-device-sessions');
  const sessionId = await getCurrentAdminDeviceSessionId(bearer, userId);
  if (!sessionId) return false;
  const result = await db.execute(sql`
    WITH active_session AS (
      SELECT id FROM admin_device_sessions WHERE id = ${sessionId}::uuid
        AND user_id = ${userId}::uuid AND revoked_at IS NULL FOR UPDATE
    )
    INSERT INTO admin_push_tokens (user_id,token,platform,device_session_id)
    SELECT ${userId}::uuid,${token},${platform},id FROM active_session
    ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform, device_session_id = EXCLUDED.device_session_id,
      updated_at = NOW()
    RETURNING id
  `);
  return result.rows.length > 0;
}
