import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db, driverDeviceSessions, drivers, users } from '@/lib/db';

const PREFIX = 'dcs_v1.';
const PATTERN = /^dcs_v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
export interface DriverDeviceDetails {
  deviceName?: string;
  modelName?: string;
  platform?: string;
  osVersion?: string;
  appVersion?: string;
}
export interface DriverDeviceSessionPayload {
  id: string; sub: string; email: string; name: string; role: 'driver'; driverId: string;
}
export class DriverDeviceSessionUnauthorizedError extends Error {
  constructor() { super('Unauthorized'); this.name = 'DriverDeviceSessionUnauthorizedError'; }
}
export function normaliseDriverDeviceDetails(value: unknown): DriverDeviceDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const result: DriverDeviceDetails = {};
  const limits = { deviceName: 120, modelName: 120, platform: 24, osVersion: 64, appVersion: 40 } as const;
  for (const field of Object.keys(limits) as (keyof DriverDeviceDetails)[]) {
    if (typeof raw[field] !== 'string') continue;
    const text = (raw[field] as string).replace(/[\p{Cc}\p{Cf}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limits[field]);
    if (text) result[field] = text;
  }
  if (result.platform && !['ios', 'android', 'web'].includes(result.platform)) delete result.platform;
  return result;
}
export function isDriverDeviceSessionToken(token: string): boolean { return token.startsWith(PREFIX); }
function parse(token: string): { id: string; hash: Buffer } | null {
  const match = PATTERN.exec(token);
  if (!match || Buffer.from(match[2], 'base64url').toString('base64url') !== match[2]) return null;
  return { id: match[1], hash: createHash('sha256').update(token).digest() };
}
function matches(hash: Buffer, stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored) && timingSafeEqual(hash, Buffer.from(stored, 'hex'));
}
/** Live account/driver lookup prevents cached identities granting driver access. */
export async function getCurrentDriverSessionUser(userId: string, expectedDriverId?: string): Promise<DriverDeviceSessionPayload> {
  const [row] = await db.select({ id: users.id, email: users.email, name: users.name, role: users.role,
    emailVerified: users.emailVerified, driverId: drivers.id }).from(users)
    .innerJoin(drivers, eq(drivers.userId, users.id)).where(eq(users.id, userId)).limit(1);
  if (!row || row.role !== 'driver' || row.emailVerified !== true ||
      (expectedDriverId && row.driverId !== expectedDriverId)) throw new DriverDeviceSessionUnauthorizedError();
  return { id: row.id, sub: row.id, email: row.email, name: row.name, role: 'driver', driverId: row.driverId };
}
export async function createDriverDeviceSession(userId: string, details: unknown = {}, passwordLogin = false): Promise<string> {
  const user = await getCurrentDriverSessionUser(userId);
  const id = randomUUID();
  const token = `${PREFIX}${id}.${randomBytes(32).toString('base64url')}`;
  const now = new Date();
  await db.insert(driverDeviceSessions).values({ id, userId: user.id,
    tokenHash: createHash('sha256').update(token).digest('hex'), ...normaliseDriverDeviceDetails(details),
    lastLoginAt: passwordLogin ? now : null, lastSeenAt: now });
  return token;
}
export async function verifyDriverDeviceSession(token: string): Promise<DriverDeviceSessionPayload> {
  const parsed = parse(token);
  if (!parsed) throw new DriverDeviceSessionUnauthorizedError();
  const [session] = await db.select().from(driverDeviceSessions).where(eq(driverDeviceSessions.id, parsed.id)).limit(1);
  if (!session || !matches(parsed.hash, session.tokenHash) || session.revokedAt) throw new DriverDeviceSessionUnauthorizedError();
  const user = await getCurrentDriverSessionUser(session.userId);
  const now = new Date();
  if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() >= 60_000) {
    try {
      await db.update(driverDeviceSessions).set({ lastSeenAt: now }).where(and(eq(driverDeviceSessions.id, session.id),
        isNull(driverDeviceSessions.revokedAt), or(isNull(driverDeviceSessions.lastSeenAt), lte(driverDeviceSessions.lastSeenAt, new Date(now.getTime() - 60_000)))));
    } catch { /* Activity telemetry cannot expire a valid session. */ }
  }
  return user;
}
/** A matching secret can revoke itself idempotently even after role removal. */
export async function revokeDriverDeviceSession(token: string): Promise<boolean> {
  const parsed = parse(token);
  if (!parsed) return false;
  const [session] = await db.select().from(driverDeviceSessions).where(eq(driverDeviceSessions.id, parsed.id)).limit(1);
  if (!session || !matches(parsed.hash, session.tokenHash)) return false;
  await db.update(driverDeviceSessions).set({ revokedAt: session.revokedAt ?? new Date() })
    .where(and(eq(driverDeviceSessions.id, session.id), eq(driverDeviceSessions.tokenHash, session.tokenHash)));
  return true;
}
export async function isRevokedDriverDeviceSession(token: string): Promise<boolean> {
  const parsed = parse(token);
  if (!parsed) return false;
  const [session] = await db.select().from(driverDeviceSessions).where(eq(driverDeviceSessions.id, parsed.id)).limit(1);
  return !!session?.revokedAt && matches(parsed.hash, session.tokenHash);
}
