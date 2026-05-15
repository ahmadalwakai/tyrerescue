import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adminPushTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getMobileAdminUser, unauthorizedResponse } from '../_lib';

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

  const safePlatform = platform === 'ios' ? 'ios' : 'android';

  // Remove any stale tokens for this user (one device at a time).
  await db
    .delete(adminPushTokens)
    .where(eq(adminPushTokens.userId, user.id));

  // Insert fresh token (or update if another admin already registered the same token).
  await db
    .insert(adminPushTokens)
    .values({ userId: user.id, token, platform: safePlatform })
    .onConflictDoUpdate({
      target: adminPushTokens.token,
      set: { userId: user.id, platform: safePlatform, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}

// DELETE /api/mobile/admin/push-token
// Unregister all Expo push tokens for the authenticated admin user (call on logout).
export async function DELETE(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  await db
    .delete(adminPushTokens)
    .where(eq(adminPushTokens.userId, user.id));

  return NextResponse.json({ ok: true });
}
