import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminPushTokens } from '@/lib/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getMobileAdminUser, unauthorizedResponse } from '../_lib';
import { registerDeviceBoundAdminPush } from '@/lib/notifications/admin-device-push';

function isExpoPushToken(token: string): boolean {
  return /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

// POST /api/mobile/admin/push-token
// Register or update an Expo push token for the authenticated admin user.
// Keep each registered device; signing in elsewhere must not silence an iPhone.
export async function POST(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  let body: { token?: string; platform?: string };
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { token, platform = 'android' } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  if (!isExpoPushToken(token)) {
    return NextResponse.json(
      { error: 'Use /api/mobile/admin/native-alert-token for native FCM tokens' },
      { status: 400 },
    );
  }

  const safePlatform = platform === 'ios' ? 'ios' : 'android';

  const deviceRegistration = await registerDeviceBoundAdminPush(request, user.id, token, safePlatform);
  if (deviceRegistration !== null) {
    return deviceRegistration ? NextResponse.json({ ok: true }) : unauthorizedResponse();
  }

  // Insert fresh token (or update if another admin already registered the same token).
  await db
    .insert(adminPushTokens)
    .values({ userId: user.id, token, platform: safePlatform })
    .onConflictDoUpdate({
      target: adminPushTokens.token,
      set: { userId: user.id, platform: safePlatform, updatedAt: new Date(),
        deviceSessionId: sql`CASE WHEN ${adminPushTokens.userId} = ${user.id} THEN ${adminPushTokens.deviceSessionId} ELSE NULL END` },
    });

  console.log(`[admin-push-token] Expo token registered user=${user.id} tokenSuffix=${token.slice(-8)}`);

  return NextResponse.json({ ok: true });
}

// DELETE /api/mobile/admin/push-token
// Current clients unregister only their device. Empty legacy requests remove
// unlinked legacy registrations and leave managed device sessions intact.
export async function DELETE(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  let currentDeviceSessionId: string | null = null;
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (bearer.startsWith('acs_v1.')) {
    try {
      const { getCurrentAdminDeviceSessionId } = await import('@/lib/auth/admin-device-sessions');
      currentDeviceSessionId = await getCurrentAdminDeviceSessionId(bearer, user.id);
      if (!currentDeviceSessionId) return unauthorizedResponse();
    } catch { return unauthorizedResponse(); }
  }

  let deviceToken: string | null = null;
  try {
    const rawBody = await request.text();
    if (rawBody) {
      const body: unknown = JSON.parse(rawBody);
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || !('token' in body) || typeof body.token !== 'string' || !isExpoPushToken(body.token)) {
        return NextResponse.json({ error: 'A valid device token is required' }, { status: 400 });
      }
      deviceToken = body.token;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existingRows = await db
    .select({ id: adminPushTokens.id, token: adminPushTokens.token, deviceSessionId: adminPushTokens.deviceSessionId })
    .from(adminPushTokens)
    .where(eq(adminPushTokens.userId, user.id));

  const expoRows = existingRows
    .filter((r) => isExpoPushToken(r.token) && (deviceToken
      ? r.token === deviceToken && (!r.deviceSessionId || r.deviceSessionId === currentDeviceSessionId)
      : !r.deviceSessionId));

  for (const row of expoRows) {
    // Recheck the captured token/binding in the write, not only the earlier
    // SELECT: an older logout must not delete a freshly rebound installation.
    await db.delete(adminPushTokens).where(and(eq(adminPushTokens.id, row.id), eq(adminPushTokens.userId, user.id),
      eq(adminPushTokens.token, deviceToken ?? row.token), row.deviceSessionId
        ? eq(adminPushTokens.deviceSessionId, row.deviceSessionId) : isNull(adminPushTokens.deviceSessionId)));
  }

  console.log(`[admin-push-token] Expo unregister processed user=${user.id} matched=${expoRows.length}`);

  return NextResponse.json({ ok: true });
}
