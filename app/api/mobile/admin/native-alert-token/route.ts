import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminPushTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getMobileAdminUser, unauthorizedResponse } from '../_lib';

/**
 * POST /api/mobile/admin/native-alert-token
 *
 * Register or refresh a native Android FCM token for the admin-alert-android app.
 *
 * Native FCM tokens are stored in the same admin_push_tokens table as Expo tokens,
 * distinguished by the token format:
 *   - Expo tokens  : start with "ExponentPushToken["
 *   - Native tokens: plain FCM registration token (no prefix)
 *
 * The expo-admin-push.ts sender filters for ExponentPushToken prefix so native
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, platform } = body as { token?: string; platform?: string };

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  // Reject Expo push tokens — this endpoint is for native FCM tokens only.
  if (token.startsWith('ExponentPushToken[')) {
    return NextResponse.json(
      { error: 'Use /api/mobile/admin/push-token for Expo tokens' },
      { status: 400 },
    );
  }

  const safePlatform = platform === 'ios' ? 'ios' : 'android';

  // Remove any stale native tokens for this user (one device at a time).
  // We scope the delete to non-Expo tokens so the Expo push token is kept.
  const existingRows = await db
    .select({ id: adminPushTokens.id, token: adminPushTokens.token })
    .from(adminPushTokens)
    .where(eq(adminPushTokens.userId, user.id));

  const staleNativeIds = existingRows
    .filter((r) => !r.token.startsWith('ExponentPushToken['))
    .map((r) => r.id);

  for (const id of staleNativeIds) {
    await db.delete(adminPushTokens).where(eq(adminPushTokens.id, id));
  }

  // Insert the new native FCM token.
  await db
    .insert(adminPushTokens)
    .values({ userId: user.id, token: token.trim(), platform: safePlatform })
    .onConflictDoUpdate({
      target: adminPushTokens.token,
      set: { userId: user.id, platform: safePlatform, updatedAt: new Date() },
    });

  console.log(`[native-alert-token] Native token registered user=${user.id} tokenSuffix=${token.trim().slice(-8)}`);

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/mobile/admin/native-alert-token
 *
 * Unregister all native FCM tokens for the authenticated admin user.
 * Does not affect Expo push tokens.
 */
export async function DELETE(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const existingRows = await db
    .select({ id: adminPushTokens.id, token: adminPushTokens.token })
    .from(adminPushTokens)
    .where(eq(adminPushTokens.userId, user.id));

  const nativeIds = existingRows
    .filter((r) => !r.token.startsWith('ExponentPushToken['))
    .map((r) => r.id);

  for (const id of nativeIds) {
    await db.delete(adminPushTokens).where(eq(adminPushTokens.id, id));
  }

  console.log(`[native-alert-token] Native tokens unregistered user=${user.id} removed=${nativeIds.length}`);

  return NextResponse.json({ ok: true });
}
