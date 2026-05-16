import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trackingSessions, type TrackingSession } from '@/lib/db/schema';

// Stale threshold used to flip an in_progress session into "paused" in UI.
// Kept here so server and client agree on the cut-off without an env var.
export const TRACKING_STALE_MS = 75_000; // 75s

export type TrackingDerivedStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'expired';

function newToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Ensures a tracking session exists for the given booking. Idempotent:
 * if a row already exists, it is returned untouched (so tokens remain
 * stable across repeated dispatch retries).
 */
export async function ensureTrackingSession(bookingId: string): Promise<TrackingSession> {
  const [existing] = await db
    .select()
    .from(trackingSessions)
    .where(eq(trackingSessions.bookingId, bookingId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(trackingSessions)
    .values({
      bookingId,
      customerToken: newToken(),
      driverToken: newToken(),
      status: 'pending',
    })
    .returning();
  return created;
}

export async function getTrackingSessionByBookingId(bookingId: string): Promise<TrackingSession | null> {
  const [row] = await db
    .select()
    .from(trackingSessions)
    .where(eq(trackingSessions.bookingId, bookingId))
    .limit(1);
  return row ?? null;
}

export async function getTrackingSessionByDriverToken(token: string): Promise<TrackingSession | null> {
  if (!isValidToken(token)) return null;
  const [row] = await db
    .select()
    .from(trackingSessions)
    .where(eq(trackingSessions.driverToken, token))
    .limit(1);
  return row ?? null;
}

export async function getTrackingSessionByCustomerToken(token: string): Promise<TrackingSession | null> {
  if (!isValidToken(token)) return null;
  const [row] = await db
    .select()
    .from(trackingSessions)
    .where(eq(trackingSessions.customerToken, token))
    .limit(1);
  return row ?? null;
}

export function isValidToken(token: string): boolean {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

/**
 * Derives the UI-facing status (`paused` is not stored — it's computed from
 * lastUpdatedAt staleness). Backend stores only the canonical states.
 */
export function deriveStatus(session: Pick<TrackingSession, 'status' | 'lastUpdatedAt'>, nowMs: number = Date.now()): TrackingDerivedStatus {
  if (session.status === 'completed') return 'completed';
  if (session.status === 'expired') return 'expired';
  if (session.status === 'pending') return 'pending';
  // in_progress: paused if no recent update
  const last = session.lastUpdatedAt?.getTime() ?? 0;
  if (last > 0 && nowMs - last > TRACKING_STALE_MS) return 'paused';
  return 'in_progress';
}

/**
 * Public-safe projection of a tracking session. Includes the latest
 * driver location, the derived status, and timestamps. No tokens.
 */
export interface PublicTrackingState {
  status: TrackingDerivedStatus;
  startedAt: string | null;
  completedAt: string | null;
  lastUpdatedAt: string | null;
  driverLat: number | null;
  driverLng: number | null;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
}

export function toPublicState(session: TrackingSession): PublicTrackingState {
  return {
    status: deriveStatus(session),
    startedAt: session.startedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    lastUpdatedAt: session.lastUpdatedAt?.toISOString() ?? null,
    driverLat: session.lastLatitude != null ? Number(session.lastLatitude) : null,
    driverLng: session.lastLongitude != null ? Number(session.lastLongitude) : null,
    accuracyMeters: session.lastAccuracy ?? null,
    headingDegrees: session.lastHeading ?? null,
    speedMetersPerSecond: session.lastSpeed ?? null,
  };
}
