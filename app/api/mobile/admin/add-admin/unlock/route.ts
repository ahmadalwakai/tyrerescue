import { NextResponse } from 'next/server';

import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import {
  addAdminUnlockSchema,
  buildAddAdminAttemptKey,
  getAddAdminPinCooldownMs,
  isOwnerLevelAdmin,
  issueAddAdminUnlock,
  recordAddAdminPinFailure,
  recordAdminManagementAudit,
  resetAddAdminPinFailures,
  revokeAddAdminUnlock,
  verifyOrBootstrapAddAdminPin,
} from '@/lib/admin-management';
import { RATE_LIMITS, checkRateLimit } from '@/lib/security';
import { logSecurityRejection } from '@/lib/security/log';
import { getClientIp, getUserAgent } from '@/lib/security/request-meta';
import { rateLimitedResponse } from '@/lib/security/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

function incorrectPinResponse(retryAfterSeconds?: number) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (retryAfterSeconds && retryAfterSeconds > 0) headers['Retry-After'] = String(retryAfterSeconds);
  return NextResponse.json(
    {
      error: 'Security PIN is incorrect.',
      code: retryAfterSeconds ? 'PIN_COOLDOWN' : 'PIN_INCORRECT',
      retryAfterSeconds,
    },
    { status: retryAfterSeconds ? 429 : 403, headers },
  );
}

export async function POST(request: Request) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const ownerAllowed = await isOwnerLevelAdmin(admin.id);
  if (!ownerAllowed) {
    await recordAdminManagementAudit({
      request,
      actorUserId: admin.id,
      action: 'add_admin_unlock_forbidden',
      afterJson: { reason: 'not_owner_level' },
    });
    return forbiddenResponse();
  }

  const attemptKey = buildAddAdminAttemptKey({
    adminId: admin.id,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  const cooldownMs = getAddAdminPinCooldownMs(attemptKey);
  if (cooldownMs > 0) {
    const retryAfterSeconds = Math.ceil(cooldownMs / 1000);
    await recordAdminManagementAudit({
      request,
      actorUserId: admin.id,
      action: 'add_admin_pin_rate_limited',
      afterJson: { retryAfterSeconds },
    });
    return incorrectPinResponse(retryAfterSeconds);
  }

  const rl = checkRateLimit(attemptKey, RATE_LIMITS.adminAddAdminPin);
  if (!rl.ok) {
    await recordAdminManagementAudit({
      request,
      actorUserId: admin.id,
      action: 'add_admin_pin_rate_limited',
      afterJson: { retryAfterSeconds: rl.retryAfterSeconds },
    });
    logSecurityRejection({
      req: request,
      route: '/api/mobile/admin/add-admin/unlock',
      routeKey: 'adminAddAdminPin',
      status: 429,
      reason: 'rate_limited',
    });
    return rateLimitedResponse(rl);
  }

  const body = await request.json().catch(() => null);
  const parsed = addAdminUnlockSchema.safeParse(body);
  if (!parsed.success) {
    const failure = recordAddAdminPinFailure(attemptKey);
    await recordAdminManagementAudit({
      request,
      actorUserId: admin.id,
      action: 'add_admin_pin_failed',
      afterJson: { reason: 'invalid_shape', failureCount: failure.count },
    });
    return incorrectPinResponse(Math.ceil(getAddAdminPinCooldownMs(attemptKey) / 1000) || undefined);
  }

  const result = await verifyOrBootstrapAddAdminPin({
    pin: parsed.data.pin,
    actorUserId: admin.id,
    request,
  });

  if (!result.ok) {
    const failure = recordAddAdminPinFailure(attemptKey);
    await recordAdminManagementAudit({
      request,
      actorUserId: admin.id,
      action: 'add_admin_pin_failed',
      afterJson: {
        reason: 'incorrect_pin',
        failureCount: failure.count,
        cooldownSeconds: Math.ceil(getAddAdminPinCooldownMs(attemptKey) / 1000),
      },
    });
    return incorrectPinResponse(Math.ceil(getAddAdminPinCooldownMs(attemptKey) / 1000) || undefined);
  }

  resetAddAdminPinFailures(attemptKey);
  const unlock = issueAddAdminUnlock(admin.id);
  await recordAdminManagementAudit({
    request,
    actorUserId: admin.id,
    action: 'add_admin_unlock_granted',
    afterJson: {
      bootstrappedPinHash: result.bootstrapped,
      expiresAt: unlock.expiresAt.toISOString(),
    },
  });

  return NextResponse.json(
    {
      success: true,
      unlockToken: unlock.token,
      expiresAt: unlock.expiresAt.toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function DELETE(request: Request) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const token = typeof body?.unlockToken === 'string' ? body.unlockToken : '';
  if (token) revokeAddAdminUnlock(admin.id, token);

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
