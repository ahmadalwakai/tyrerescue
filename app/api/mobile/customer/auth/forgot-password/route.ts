import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getOutboundUrl } from '@/lib/config/site';
import { db } from '@/lib/db';
import { passwordResetTokens, users } from '@/lib/db/schema';
import { createNotificationAndSend } from '@/lib/email/resend';
import { resetPassword } from '@/lib/email/templates';
import { checkRateLimit, getClientIp, RATE_LIMITS, logSecurityRejection } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const SUCCESS_MESSAGE = 'If an account with that email exists, we have sent a password reset link.';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`customer-forgot-password:${ip}`, RATE_LIMITS.forgotPassword);
  if (!rl.ok) {
    logSecurityRejection({ req: request, reason: 'rate_limited', route: '/api/mobile/customer/auth/forgot-password', status: 429, routeKey: 'customer-forgot-password' });
    // Return success shape to prevent email enumeration — attacker cannot distinguish
    // a rate-limited response from a genuine "email not found" response.
    return NextResponse.json(
      { success: true, message: SUCCESS_MESSAGE },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || user.role !== 'customer') {
      return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      used: false,
    });

    try {
      const resetUrl = `${getOutboundUrl()}/reset-password/${token}`;
      const resetEmail = resetPassword({
        name: user.name || 'Customer',
        resetUrl,
      });

      await createNotificationAndSend({
        to: user.email,
        subject: resetEmail.subject,
        html: resetEmail.html,
        type: 'reset-password',
        userId: user.id,
      });
    } catch (emailError) {
      console.error('[mobile-customer:forgot-password] email failed:', emailError);
    }

    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
  } catch (error) {
    console.error('[mobile-customer:forgot-password] error:', error);
    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
  }
}
