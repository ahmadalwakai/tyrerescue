import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getCustomerMobileUser, unauthorizedResponse } from '../_lib';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const deletionSchema = z.object({ password: z.string().min(1).max(1024), confirmation: z.literal('DELETE') }).strict();
const deletionLimit = { limit: 5, windowMs: 15 * 60_000 };

export async function DELETE(request: Request) {
  if (!request.headers.get('authorization')?.startsWith('Bearer ')) return unauthorizedResponse();
  try {
    const user = await getCustomerMobileUser(request);
    if (!user) return unauthorizedResponse();
    const limits = await Promise.all([
      checkRateLimit(`customer-delete-user:${user.id}`, deletionLimit),
      checkRateLimit(`customer-delete-ip:${getClientIp(request)}`, deletionLimit),
    ]);
    const exceeded = limits.find((limit) => !limit.ok);
    if (exceeded) return rateLimitedResponse(exceeded);
    const parsed = deletionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter your current password and type DELETE to confirm.' }, { status: 400 });
    const [credentials] = await db.select({ passwordHash: users.passwordHash }).from(users)
      .where(and(eq(users.id, user.id), eq(users.role, 'customer'))).limit(1);
    if (!credentials?.passwordHash || !await bcrypt.compare(parsed.data.password, credentials.passwordHash)) {
      return NextResponse.json({ error: 'Your current password is incorrect. If needed, use Forgot password before deleting your account.' }, { status: 403 });
    }
    // One atomic statement works with Neon HTTP. A tombstone preserves booking,
    // invoice and statutory audit foreign keys without retaining account identity.
    // Recheck the verified hash in the UPDATE to reject a concurrent credential change.
    const anonymousEmail = `deleted-${randomUUID()}@account.invalid`;
    const result = await db.execute(sql`
      WITH deleted AS (
        UPDATE users SET name = 'Deleted customer', email = ${anonymousEmail},
          phone = NULL, password_hash = NULL, email_verified = false, role = 'deleted_customer', updated_at = NOW()
        WHERE id = ${user.id}::uuid AND role = 'customer' AND password_hash = ${credentials.passwordHash}
        RETURNING id
      ), oauth_removed AS (
        DELETE FROM accounts WHERE user_id IN (SELECT id FROM deleted)
      ), reset_removed AS (
        DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM deleted)
      ), verification_removed AS (
        DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM deleted)
      ), subscriptions_removed AS (
        DELETE FROM customer_push_subscriptions WHERE owner_user_id IN (SELECT id FROM deleted)
          OR push_token_id IN (SELECT id FROM customer_push_tokens WHERE user_id IN (SELECT id FROM deleted))
      ), push_removed AS (
        DELETE FROM customer_push_tokens WHERE user_id IN (SELECT id FROM deleted)
      ), participants_removed AS (
        DELETE FROM conversation_participants WHERE user_id IN (SELECT id FROM deleted)
      ), reads_removed AS (
        DELETE FROM message_read_state WHERE user_id IN (SELECT id FROM deleted)
      ), memory_removed AS (
        DELETE FROM agent_memory WHERE user_id IN (SELECT id FROM deleted)
      ), sessions_removed AS (
        DELETE FROM chat_sessions WHERE user_id IN (SELECT id FROM deleted)
      ) SELECT id FROM deleted
    `);
    if (!result.rows.length) return unauthorizedResponse();
    return NextResponse.json({ success: true, message: 'Your account has been deleted. Required service and financial records are retained.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to delete your account. Please try again.' }, { status: 500 });
  }
}
