import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminMobile } from '@/lib/auth';
import { normalizeUkPhoneNumber, sendVoodooSms } from '@/lib/voodoo-sms';
import { checkRateLimit, getClientIp, RATE_LIMITS, logSecurityRejection } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const smsSchema = z.object({
  to: z.string().min(1, 'Phone number is required'),
  message: z.string().trim().min(1, 'Message body is required').max(1600, 'Message too long'),
});

export async function POST(request: Request) {
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`sms:${ip}`, RATE_LIMITS.sms);
  if (!rl.ok) {
    logSecurityRejection({ req: request, reason: 'rate_limited', route: '/api/mobile/admin/sms', status: 429, routeKey: 'sms' });
    return NextResponse.json(
      { ok: false, error: 'Too many SMS requests. Please try again shortly.', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = smsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid SMS request' }, { status: 400 });
  }

  const { to, message } = parsed.data;
  const normalized = normalizeUkPhoneNumber(to);
  if (!normalized) {
    return NextResponse.json({ error: 'Invalid UK mobile number' }, { status: 400 });
  }

  const result = await sendVoodooSms({ to, message });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to send SMS', provider: result.provider },
      { status: result.error?.includes('not configured') ? 400 : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
  });
}
