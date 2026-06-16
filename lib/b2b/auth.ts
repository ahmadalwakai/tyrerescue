/**
 * B2B API Key Authentication Utility
 *
 * Validates Authorization: Bearer <key> on B2B-facing endpoints.
 * Rate limiting is DB-backed (counts audit log entries per key in the last 60s)
 * so it remains accurate on serverless deployments where in-memory state is ephemeral.
 */

import { db } from '@/lib/db';
import { b2bApiKeys, b2bApiClients, b2bApiKeyAuditLogs } from '@/lib/db/schema';
import { eq, and, gt, count } from 'drizzle-orm';
import { hashB2BApiKey, isValidB2BKeyFormat } from './crypto';
import type { B2BScope, B2BPlatform } from './types';

// ── Response types ─────────────────────────────────────

export interface B2BAuthSuccess {
  ok: true;
  keyId: string;
  clientId: string;
  scopes: B2BScope[];
  platforms: B2BPlatform[];
  allowedStockFilters: Record<string, unknown> | null;
}

export interface B2BAuthFailure {
  ok: false;
  status: 401 | 403 | 410 | 429 | 500;
  code: string;
  message: string;
}

export type B2BAuthResult = B2BAuthSuccess | B2BAuthFailure;

// ── Audit log writer ───────────────────────────────────

interface AuditParams {
  apiKeyId: string | null;
  clientId: string | null;
  action: string;
  route: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  statusCode: number | null;
  metadata: Record<string, unknown> | null;
}

async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await db.insert(b2bApiKeyAuditLogs).values({
      apiKeyId: params.apiKeyId,
      clientId: params.clientId,
      action: params.action,
      route: params.route,
      ipAddress: params.ipAddress as string | null,
      userAgent: params.userAgent,
      statusCode: params.statusCode,
      metadata: params.metadata,
    });
  } catch {
    // Never let audit logging break the request
  }
}

// ── DB-backed rate limit check ─────────────────────────
// Counts `api_request` audit log entries for the key in the last 60 seconds.
// Writing the success audit log is fire-and-forget AFTER the check completes,
// so the current request is not yet in the count — effectively the window
// allows exactly `rateLimitPerMinute` requests.

async function isWithinRateLimit(keyId: string, limitPerMinute: number): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60_000);
    const result = await db
      .select({ total: count() })
      .from(b2bApiKeyAuditLogs)
      .where(
        and(
          eq(b2bApiKeyAuditLogs.apiKeyId, keyId),
          eq(b2bApiKeyAuditLogs.action, 'api_request'),
          gt(b2bApiKeyAuditLogs.createdAt, since),
        ),
      );
    return (result[0]?.total ?? 0) < limitPerMinute;
  } catch {
    // Fail open so legitimate clients are not incorrectly rejected if the
    // rate-limit query itself errors.
    return true;
  }
}

// ── Main validator ─────────────────────────────────────

export async function validateB2BApiKey(
  request: Request,
  requiredScope: B2BScope,
  platform?: B2BPlatform,
): Promise<B2BAuthResult> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent') ?? null;
  const route = new URL(request.url).pathname;

  const authHeader = request.headers.get('authorization');
  const rawKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!rawKey) {
    await writeAuditLog({
      apiKeyId: null,
      clientId: null,
      action: 'auth_rejected',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 401,
      metadata: { reason: 'missing_key' },
    });
    return { ok: false, status: 401, code: 'missing_api_key', message: 'Missing API key.' };
  }

  if (!isValidB2BKeyFormat(rawKey)) {
    await writeAuditLog({
      apiKeyId: null,
      clientId: null,
      action: 'auth_rejected',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 401,
      metadata: { reason: 'invalid_format' },
    });
    return { ok: false, status: 401, code: 'invalid_api_key', message: 'Invalid API key.' };
  }

  // Hash and look up the key record
  const keyHash = hashB2BApiKey(rawKey);

  let keyRow: (typeof b2bApiKeys.$inferSelect) | undefined;
  try {
    const rows = await db
      .select()
      .from(b2bApiKeys)
      .where(eq(b2bApiKeys.keyHash, keyHash))
      .limit(1);
    keyRow = rows[0];
  } catch {
    return { ok: false, status: 500, code: 'internal_error', message: 'Internal server error.' };
  }

  if (!keyRow) {
    await writeAuditLog({
      apiKeyId: null,
      clientId: null,
      action: 'auth_rejected',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 401,
      metadata: { reason: 'not_found' },
    });
    return { ok: false, status: 401, code: 'invalid_api_key', message: 'Invalid API key.' };
  }

  // Check key status
  if (keyRow.status === 'revoked') {
    await writeAuditLog({
      apiKeyId: keyRow.id,
      clientId: keyRow.clientId,
      action: 'auth_rejected',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 410,
      metadata: { reason: 'key_revoked' },
    });
    return { ok: false, status: 410, code: 'key_revoked', message: 'API key has been revoked.' };
  }

  if (keyRow.status === 'suspended') {
    await writeAuditLog({
      apiKeyId: keyRow.id,
      clientId: keyRow.clientId,
      action: 'auth_rejected',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 403,
      metadata: { reason: 'key_suspended' },
    });
    return { ok: false, status: 403, code: 'key_suspended', message: 'API key is suspended.' };
  }

  // Check expiry
  if (keyRow.expiresAt && keyRow.expiresAt < new Date()) {
    await writeAuditLog({
      apiKeyId: keyRow.id,
      clientId: keyRow.clientId,
      action: 'auth_rejected',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 410,
      metadata: { reason: 'key_expired' },
    });
    return { ok: false, status: 410, code: 'key_expired', message: 'API key has expired.' };
  }

  // Check client status
  let clientRow: (typeof b2bApiClients.$inferSelect) | undefined;
  try {
    const rows = await db
      .select()
      .from(b2bApiClients)
      .where(eq(b2bApiClients.id, keyRow.clientId))
      .limit(1);
    clientRow = rows[0];
  } catch {
    return { ok: false, status: 500, code: 'internal_error', message: 'Internal server error.' };
  }

  if (!clientRow || clientRow.status !== 'active') {
    await writeAuditLog({
      apiKeyId: keyRow.id,
      clientId: keyRow.clientId,
      action: 'auth_rejected',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 403,
      metadata: { reason: 'client_inactive', clientStatus: clientRow?.status ?? 'not_found' },
    });
    return {
      ok: false,
      status: 403,
      code: 'client_inactive',
      message: 'API client account is not active.',
    };
  }

  // Rate limit (DB-backed)
  const withinLimit = await isWithinRateLimit(keyRow.id, keyRow.rateLimitPerMinute);
  if (!withinLimit) {
    await writeAuditLog({
      apiKeyId: keyRow.id,
      clientId: keyRow.clientId,
      action: 'rate_limited',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 429,
      metadata: { limitPerMinute: keyRow.rateLimitPerMinute },
    });
    return { ok: false, status: 429, code: 'rate_limited', message: 'Rate limit exceeded. Please slow down.' };
  }

  // Check scope
  const scopes = (keyRow.allowedScopes as B2BScope[]) ?? [];
  if (!scopes.includes(requiredScope)) {
    await writeAuditLog({
      apiKeyId: keyRow.id,
      clientId: keyRow.clientId,
      action: 'scope_denied',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 403,
      metadata: { required: requiredScope, granted: scopes },
    });
    return {
      ok: false,
      status: 403,
      code: 'insufficient_scope',
      message: `This API key does not have the required scope: ${requiredScope}`,
    };
  }

  // Check platform (optional — only enforced when caller passes a platform)
  const platforms = (keyRow.allowedPlatforms as B2BPlatform[]) ?? [];
  if (platform && !platforms.includes(platform)) {
    await writeAuditLog({
      apiKeyId: keyRow.id,
      clientId: keyRow.clientId,
      action: 'platform_denied',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 403,
      metadata: { required: platform, granted: platforms },
    });
    return {
      ok: false,
      status: 403,
      code: 'platform_not_allowed',
      message: `Platform not permitted: ${platform}`,
    };
  }

  // Success — update last_used_at and write success audit log (both fire-and-forget)
  const now = new Date();
  Promise.all([
    db
      .update(b2bApiKeys)
      .set({ lastUsedAt: now })
      .where(eq(b2bApiKeys.id, keyRow.id))
      .catch(() => {}),
    db
      .update(b2bApiClients)
      .set({ lastUsedAt: now })
      .where(eq(b2bApiClients.id, keyRow.clientId))
      .catch(() => {}),
    writeAuditLog({
      apiKeyId: keyRow.id,
      clientId: keyRow.clientId,
      action: 'api_request',
      route,
      ipAddress: ip,
      userAgent,
      statusCode: 200,
      metadata: { scope: requiredScope, ...(platform ? { platform } : {}) },
    }),
  ]).catch(() => {});

  return {
    ok: true,
    keyId: keyRow.id,
    clientId: keyRow.clientId,
    scopes,
    platforms,
    allowedStockFilters: keyRow.allowedStockFilters as Record<string, unknown> | null,
  };
}

// ── Admin audit log helper (for admin-action logging) ──

export async function writeAdminAuditLog(params: {
  adminUserId: string;
  action: string;
  clientId?: string | null;
  keyId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  route?: string | null;
}): Promise<void> {
  await writeAuditLog({
    apiKeyId: params.keyId ?? null,
    clientId: params.clientId ?? null,
    action: params.action,
    route: params.route ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    statusCode: 200,
    metadata: { adminUserId: params.adminUserId, ...params.metadata },
  });
}
