import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { adminDeviceSessions, db, users } from '@/lib/db';
import { getClientIp } from '@/lib/security/request-meta';

const SESSION_PREFIX = 'acs_v1.';
const SESSION_PATTERN = /^acs_v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

export interface AdminDeviceSessionPayload {
  id: string;
  email: string;
  name: string;
  role: 'admin';
  sub: string;
  driverId?: string;
}

export interface AdminDeviceDetails {
  deviceName?: string;
  modelName?: string;
  platform?: string;
  osVersion?: string;
  appVersion?: string;
}

export interface AdminDeviceSessionMetadata extends AdminDeviceDetails {
  userAgent?: string;
  ip?: string;
  /** Set by the password-login route, never read from a client timestamp/flag. */
  passwordLogin?: boolean;
}

export interface DeviceSessionItem {
  id: string;
  deviceName: string | null;
  modelName: string | null;
  platform: string | null;
  osVersion: string | null;
  appVersion: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  firstIp: string | null;
  lastIp: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
}

function boundedLabel(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\p{Cc}\p{Cf}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || undefined;
}

/** Device descriptions are untrusted labels, never an authorization identity. */
export function normaliseAdminDeviceDetails(value: unknown): AdminDeviceDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const limits = { deviceName: 120, modelName: 120, platform: 24, osVersion: 64, appVersion: 40 } as const;
  const details: AdminDeviceDetails = {};
  for (const field of Object.keys(limits) as Array<keyof AdminDeviceDetails>) {
    const label = boundedLabel(raw[field], limits[field]);
    if (label !== undefined) details[field] = label;
  }
  if (details.platform && !['ios', 'android', 'web', 'windows', 'macos'].includes(details.platform)) delete details.platform;
  return details;
}

export function adminDeviceSessionMetadataFromRequest(request: Request, device: unknown, passwordLogin = false): AdminDeviceSessionMetadata {
  const ip = getClientIp(request);
  return { ...normaliseAdminDeviceDetails(device), userAgent: boundedLabel(request.headers.get('user-agent'), 256),
    ...(isIP(ip) ? { ip } : {}), passwordLogin };
}

export class AdminDeviceSessionUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'AdminDeviceSessionUnauthorizedError';
  }
}

/** Prefix dispatch also sends malformed persistent tokens down the strict parser. */
export function isAdminDeviceSessionToken(token: string): boolean {
  return token.startsWith(SESSION_PREFIX);
}

function parseToken(token: string): { id: string; hash: Buffer } | null {
  const match = SESSION_PATTERN.exec(token);
  if (!match || Buffer.from(match[2], 'base64url').toString('base64url') !== match[2]) return null;
  return { id: match[1], hash: createHash('sha256').update(token).digest() };
}

function matchesHash(hash: Buffer, stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored) && timingSafeEqual(hash, Buffer.from(stored, 'hex'));
}

/** Only this opt-in admin app issues these tokens. No plaintext token is persisted. */
export async function createAdminDeviceSession(userId: string, metadata: AdminDeviceSessionMetadata = {}): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'admin'), eq(users.emailVerified, true))).limit(1);
  if (!user) throw new AdminDeviceSessionUnauthorizedError();
  const id = randomUUID();
  const token = `${SESSION_PREFIX}${id}.${randomBytes(32).toString('base64url')}`;
  const now = new Date();
  const ip = metadata.ip && isIP(metadata.ip) ? metadata.ip : null;
  await db.insert(adminDeviceSessions).values({ id, userId: user.id,
    tokenHash: createHash('sha256').update(token).digest('hex'), ...normaliseAdminDeviceDetails(metadata),
    userAgent: boundedLabel(metadata.userAgent, 256) ?? null, firstIp: ip, lastIp: ip,
    lastLoginAt: metadata.passwordLogin === true ? now : null, lastSeenAt: now });
  return token;
}

/** No clock or inactivity deadline: explicit device revocation ends the session. */
export async function verifyAdminDeviceSession(token: string): Promise<AdminDeviceSessionPayload> {
  const parsed = parseToken(token);
  if (!parsed) throw new AdminDeviceSessionUnauthorizedError();
  const [row] = await db.select({ session: adminDeviceSessions, user: users }).from(adminDeviceSessions)
    .innerJoin(users, eq(adminDeviceSessions.userId, users.id))
    .where(eq(adminDeviceSessions.id, parsed.id)).limit(1);
  if (!row || !matchesHash(parsed.hash, row.session.tokenHash) || row.session.revokedAt
    || row.user.role !== 'admin' || row.user.emailVerified !== true) throw new AdminDeviceSessionUnauthorizedError();
  const now = new Date();
  if (!row.session.lastSeenAt || now.getTime() - row.session.lastSeenAt.getTime() >= 60_000) {
    try {
      await db.update(adminDeviceSessions).set({ lastSeenAt: now }).where(and(eq(adminDeviceSessions.id, row.session.id),
        isNull(adminDeviceSessions.revokedAt), or(isNull(adminDeviceSessions.lastSeenAt), lte(adminDeviceSessions.lastSeenAt, new Date(now.getTime() - 60_000)))));
    } catch { /* Best-effort activity telemetry must never invalidate sign-in. */ }
  }
  return { id: row.user.id, sub: row.user.id, email: row.user.email, name: row.user.name, role: 'admin' };
}

/** Idempotent for the same valid secret, including after its role was removed. */
export async function revokeAdminDeviceSession(token: string): Promise<boolean> {
  const parsed = parseToken(token);
  if (!parsed) return false;
  const [session] = await db.select().from(adminDeviceSessions).where(eq(adminDeviceSessions.id, parsed.id)).limit(1);
  if (!session || !matchesHash(parsed.hash, session.tokenHash)) return false;
  return revokeOwnedAdminDeviceSession(session.id, session.userId);
}

/** Safe for API/push registration consumers; an unverified UUID is never enough. */
export async function getCurrentAdminDeviceSessionId(token: string, expectedUserId: string): Promise<string | null> {
  if (!isAdminDeviceSessionToken(token)) return null;
  const payload = await verifyAdminDeviceSession(token);
  return payload.id === expectedUserId ? parseToken(token)!.id : null;
}

/** Only the matching secret can reveal explicit removal, including after revoke. */
export async function getRevokedAdminDeviceSessionId(token: string): Promise<string | null> {
  const parsed = parseToken(token);
  if (!parsed) return null;
  const [session] = await db.select().from(adminDeviceSessions).where(eq(adminDeviceSessions.id, parsed.id)).limit(1);
  return session?.revokedAt && matchesHash(parsed.hash, session.tokenHash) ? session.id : null;
}

/** Both the credential and its linked push registrations are revoked atomically. */
export async function revokeOwnedAdminDeviceSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    WITH revoked AS (
      UPDATE admin_device_sessions SET revoked_at = COALESCE(revoked_at, NOW()), revoked_by = COALESCE(revoked_by, ${userId}::uuid)
      WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid RETURNING id
    ), removed_push AS (
      DELETE FROM admin_push_tokens WHERE user_id = ${userId}::uuid AND device_session_id IN (SELECT id FROM revoked) RETURNING id
    ) SELECT id FROM revoked
  `);
  return result.rows.length > 0;
}

export async function listAdminDeviceSessions(userId: string, currentSessionId: string | null): Promise<DeviceSessionItem[]> {
  const rows = await db.select({ id: adminDeviceSessions.id, deviceName: adminDeviceSessions.deviceName,
    modelName: adminDeviceSessions.modelName, platform: adminDeviceSessions.platform, osVersion: adminDeviceSessions.osVersion,
    appVersion: adminDeviceSessions.appVersion, createdAt: adminDeviceSessions.createdAt, lastLoginAt: adminDeviceSessions.lastLoginAt,
    lastSeenAt: adminDeviceSessions.lastSeenAt, lastActiveAt: adminDeviceSessions.lastActiveAt,
    firstIp: adminDeviceSessions.firstIp, lastIp: adminDeviceSessions.lastIp, revokedAt: adminDeviceSessions.revokedAt,
  }).from(adminDeviceSessions).where(and(eq(adminDeviceSessions.userId, userId),
    or(isNull(adminDeviceSessions.revokedAt), gte(adminDeviceSessions.revokedAt, new Date(Date.now() - 30 * 24 * 60 * 60_000)))))
    .orderBy(sql`CASE WHEN ${adminDeviceSessions.id} = ${currentSessionId}::uuid THEN 0 WHEN ${adminDeviceSessions.revokedAt} IS NULL THEN 1 ELSE 2 END`,
      desc(sql`COALESCE(${adminDeviceSessions.lastActiveAt},${adminDeviceSessions.lastSeenAt},${adminDeviceSessions.createdAt})`), desc(adminDeviceSessions.createdAt)).limit(100);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null, lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null, isCurrent: row.id === currentSessionId }));
}

export async function recordAdminDeviceHeartbeat(token: string, metadata: AdminDeviceSessionMetadata): Promise<boolean> {
  const payload = await verifyAdminDeviceSession(token);
  const parsed = parseToken(token)!;
  const [updated] = await db.update(adminDeviceSessions).set({ ...normaliseAdminDeviceDetails(metadata),
    lastActiveAt: new Date(), ...(metadata.ip && isIP(metadata.ip) ? { lastIp: metadata.ip } : {}),
    ...(metadata.userAgent ? { userAgent: boundedLabel(metadata.userAgent, 256) } : {}),
  }).where(and(eq(adminDeviceSessions.id, parsed.id), eq(adminDeviceSessions.userId, payload.id), isNull(adminDeviceSessions.revokedAt)))
    .returning({ id: adminDeviceSessions.id });
  return Boolean(updated);
}
