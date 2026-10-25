import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminPushTokens } from '@/lib/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getMobileAdminUser, unauthorizedResponse } from '../_lib';
import { registerDeviceBoundAdminPush } from '@/lib/notifications/admin-device-push';

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/**
 * POST /api/mobile/admin/native-alert-token
 *
 * Register or refresh a native Android FCM token for the admin-alert-android app.
 *
 * Native FCM tokens are stored in the same admin_push_tokens table as Expo tokens,
 * distinguished by the token format:
 *   - Expo tokens  : start with "ExponentPushToken[" or "ExpoPushToken["
 *   - Native tokens: plain FCM registration token (no prefix)
 *
 * The expo-admin-push.ts sender filters for both Expo token prefixes so native
 * tokens are never sent via the Expo relay. The FCM direct sender (fcm.ts) is
 * used for native tokens via lib/notifications/native-admin-push.ts.
 *
 * Auth: Authorization: Bearer <admin JWT>
 * Body: { "token": "<fcm_registration_token>", "platform": "android" }
 */
export async function POST(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, platform } = body as { token?: string; platform?: string };

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'token is required' }, { status: 400 });
  }

  // Reject Expo push tokens — this endpoint is for native FCM tokens only.
  if (isExpoPushToken(token.trim())) {
    return NextResponse.json(
      { ok: false, error: 'Use /api/mobile/admin/push-token for Expo tokens' },
      { status: 400 },
    );
  }

  const safePlatform = platform === 'ios' ? 'ios' : 'android';

  try {
    const deviceRegistration = await registerDeviceBoundAdminPush(request, user.id, token.trim(), safePlatform);
    if (deviceRegistration !== null) {
      return deviceRegistration ? NextResponse.json({ ok: true, registered: true }) : unauthorizedResponse();
    }

    // Legacy clients replace only unlinked native registrations. Managed
    // sessions and Expo registrations belong to independent installations.
    const existingRows = await db
      .select({ id: adminPushTokens.id, token: adminPushTokens.token, deviceSessionId: adminPushTokens.deviceSessionId })
      .from(adminPushTokens)
      .where(eq(adminPushTokens.userId, user.id));

    const staleNativeRows = existingRows
      .filter((r) => !isExpoPushToken(r.token) && !r.deviceSessionId);

    for (const row of staleNativeRows) {
      await db.delete(adminPushTokens).where(and(eq(adminPushTokens.id, row.id), eq(adminPushTokens.userId, user.id),
        eq(adminPushTokens.token, row.token), isNull(adminPushTokens.deviceSessionId)));
    }

    // Insert the new native FCM token.
    await db
      .insert(adminPushTokens)
      .values({ userId: user.id, token: token.trim(), platform: safePlatform })
      .onConflictDoUpdate({
        target: adminPushTokens.token,
        set: { userId: user.id, platform: safePlatform, updatedAt: new Date(),
          deviceSessionId: sql`CASE WHEN ${adminPushTokens.userId} = ${user.id} THEN ${adminPushTokens.deviceSessionId} ELSE NULL END` },
      });

    console.log(`[native-alert-token] Native token registered user=${user.id} tokenSuffix=${token.trim().slice(-8)}`);

    return NextResponse.json({ ok: true, registered: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to register native token';
    console.error(`[native-alert-token] registration failed user=${user.id} error=${message}`);
    return NextResponse.json({ ok: false, error: 'Failed to register native token' }, { status: 500 });
  }
}

/**
 * DELETE /api/mobile/admin/native-alert-token
 *
 * Unregister unlinked legacy native FCM tokens for the authenticated admin.
 * Managed sessions and Expo push tokens remain independent.
 */
export async function DELETE(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const existingRows = await db
    .select({ id: adminPushTokens.id, token: adminPushTokens.token, deviceSessionId: adminPushTokens.deviceSessionId })
    .from(adminPushTokens)
    .where(eq(adminPushTokens.userId, user.id));

  const nativeRows = existingRows
    .filter((r) => !isExpoPushToken(r.token) && !r.deviceSessionId);

  for (const row of nativeRows) {
    await db.delete(adminPushTokens).where(and(eq(adminPushTokens.id, row.id), eq(adminPushTokens.userId, user.id),
      eq(adminPushTokens.token, row.token), isNull(adminPushTokens.deviceSessionId)));
  }

  console.log(`[native-alert-token] Native unregister processed user=${user.id} matched=${nativeRows.length}`);

  return NextResponse.json({ ok: true });
}
