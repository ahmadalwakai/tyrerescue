import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminPushTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getMobileAdminUser, unauthorizedResponse } from '../_lib';

const EXPO_TOKEN_PREFIX = 'ExponentPushToken[';

// POST /api/mobile/admin/push-token
// Register or update an Expo push token for the authenticated admin user.
// Each admin user keeps only their latest token (delete old, insert new).
export async function POST(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json() as { token?: string; platform?: string };
  const { token, platform = 'android' } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  if (!token.startsWith(EXPO_TOKEN_PREFIX)) {
    return NextResponse.json(
      { error: 'Use /api/mobile/admin/native-alert-token for native FCM tokens' },
      { status: 400 },
    );
  }

  const safePlatform = platform === 'ios' ? 'ios' : 'android';

  // Remove only stale Expo tokens for this user.
  const existingRows = await db
    .select({ id: adminPushTokens.id, token: adminPushTokens.token })
    .from(adminPushTokens)
    .where(eq(adminPushTokens.userId, user.id));

  const staleExpoIds = existingRows
    .filter((r) => r.token.startsWith(EXPO_TOKEN_PREFIX))
    .map((r) => r.id);

  for (const id of staleExpoIds) {
    await db.delete(adminPushTokens).where(eq(adminPushTokens.id, id));
  }

  // Insert fresh token (or update if another admin already registered the same token).
  await db
    .insert(adminPushTokens)
    .values({ userId: user.id, token, platform: safePlatform })
    .onConflictDoUpdate({
      target: adminPushTokens.token,
      set: { userId: user.id, platform: safePlatform, updatedAt: new Date() },
    });

  console.log(`[admin-push-token] Expo token registered user=${user.id} tokenSuffix=${token.slice(-8)}`);

  return NextResponse.json({ ok: true });
}

// DELETE /api/mobile/admin/push-token
// Unregister all Expo push tokens for the authenticated admin user (call on logout).
export async function DELETE(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const existingRows = await db
    .select({ id: adminPushTokens.id, token: adminPushTokens.token })
    .from(adminPushTokens)
    .where(eq(adminPushTokens.userId, user.id));

  const expoIds = existingRows
    .filter((r) => r.token.startsWith(EXPO_TOKEN_PREFIX))
    .map((r) => r.id);

  for (const id of expoIds) {
    await db.delete(adminPushTokens).where(eq(adminPushTokens.id, id));
  }

  console.log(`[admin-push-token] Expo tokens unregistered user=${user.id} removed=${expoIds.length}`);

  return NextResponse.json({ ok: true });
}
