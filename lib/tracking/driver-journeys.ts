import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, bookings, drivers, users, driverJourneyStates, driverJourneyObservations, driverJourneyEvents } from '@/lib/db';
import { getDirections, haversineDistanceMiles } from '@/lib/mapbox';
import { createAdminNotification } from '@/lib/notifications/create-admin-notification';
import { sendAdminStatusUpdatePushWithResult } from '@/lib/notifications/admin-status-push';
import {
  advanceJourneyMonitor, initialJourneyMonitorState, isEligibleJourneyBooking,
  isUsableJourneyFix, selectJourneyCandidates, ukServiceDay,
  type CandidateBooking, type GeoFix, type JourneyMonitorState,
} from './driver-journey-policy';

const EVIDENCE_MAX_AGE_MS = 90_000;
const PROPOSAL_LIFETIME_MS = 10 * 60_000;
const ROUTE_INTERVAL_MS = 60_000;
const PROPOSAL_RETRY_COOLDOWN_MS = 15 * 60_000;
type Observation = typeof driverJourneyObservations.$inferSelect;
type ObservationState = {
  monitor: JourneyMonitorState;
  distanceMeters: number | null;
  etaSeconds: number | null;
  routeCheckedAt: number;
  lastLocationAt: number;
  confidence?: string;
};

function stateOf(row: Observation): ObservationState {
  return { monitor: initialJourneyMonitorState(), distanceMeters: null, etaSeconds: null,
    routeCheckedAt: 0, lastLocationAt: 0, ...row.state } as ObservationState;
}

function candidateOf(row: typeof bookings.$inferSelect): CandidateBooking {
  return { id: row.id, refNumber: row.refNumber, lat: Number(row.lat), lng: Number(row.lng),
    status: row.status, scheduledAt: row.scheduledAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? '', bookingType: row.bookingType };
}

// Recheck in the mutating statement, so cancellation/rescheduling/offline that
// races a preceding SELECT cannot confirm a journey or create/send an update.
function currentEligibility(now: number) {
  return sql`EXISTS (
    SELECT 1 FROM bookings current_booking JOIN drivers current_driver ON current_driver.id = driver_journey_observations.driver_id
    WHERE current_booking.id = driver_journey_observations.booking_id AND current_driver.is_online = true
      AND current_booking.status IN ('awaiting_payment','payment_failed','paid','deposit_paid','driver_assigned','en_route')
      AND to_char(COALESCE(current_booking.scheduled_at,current_booking.created_at) AT TIME ZONE 'Europe/London','YYYY-MM-DD') = ${ukServiceDay(now)}
      AND driver_journey_observations.service_day = ${ukServiceDay(now)}
      AND current_driver.location_at >= ${new Date(now - EVIDENCE_MAX_AGE_MS)}
      AND current_driver.location_at <= ${new Date(now + 10_000)}
  )`;
}

function currentEventEvidence(now: number) {
  return sql`driver_journey_observations.last_evidence_at >= ${new Date(now - EVIDENCE_MAX_AGE_MS)} AND (
    (driver_journey_events.kind = 'confirmation' AND driver_journey_observations.status = 'pending'
      AND driver_journey_observations.expires_at > ${new Date(now)})
    OR (driver_journey_events.kind = 'near' AND driver_journey_observations.status = 'confirmed'
      AND (driver_journey_observations.state->>'etaSeconds')::double precision BETWEEN 0 AND 300
      AND (driver_journey_observations.state->>'routeCheckedAt')::double precision >= ${now - EVIDENCE_MAX_AGE_MS})
    OR (driver_journey_events.kind = 'stopped' AND driver_journey_observations.status = 'confirmed'
      AND driver_journey_observations.state#>>'{monitor,stopSent}' = 'true'
      AND driver_journey_events.event_key = driver_journey_observations.id::text || ':stopped:' || (driver_journey_observations.state#>>'{monitor,stationarySince}'))
  )`;
}

/** A durable lease serialises inference across serverless instances, not just a device. */
async function acquireDriverLease(driverId: string, now: number) {
  await db.insert(driverJourneyStates).values({ driverId }).onConflictDoNothing();
  const token = randomUUID();
  const [row] = await db.update(driverJourneyStates).set({ leaseToken: token, leaseUntil: new Date(now + 45_000) })
    .where(and(eq(driverJourneyStates.driverId, driverId), sql`(${driverJourneyStates.leaseUntil} IS NULL OR ${driverJourneyStates.leaseUntil} < ${new Date(now)})`))
    .returning();
  return row ? { token, fixes: Array.isArray(row.fixes) ? row.fixes as GeoFix[] : [] } : null;
}

/** Only a newly accepted, identified, online driver's real GPS sample enters inference. */
export async function processDriverJourneyFix(driverId: string, fix: GeoFix): Promise<void> {
  const now = Date.now();
  if (!isUsableJourneyFix(fix, now)) return;
  const [driver] = await db.select({ isOnline: drivers.isOnline }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (!driver?.isOnline) return;
  const lease = await acquireDriverLease(driverId, now);
  if (!lease) return;
  let fixes = lease.fixes;
  try {
    const latest = fixes[fixes.length - 1];
    if (!isUsableJourneyFix(fix, now, latest?.at)) return;
    fixes = [...fixes.filter((point) => point.at >= fix.at - 4 * 60_000), fix].slice(-30);
    const day = ukServiceDay(now);
    // Every origin and booking type participates. Payment, pricing and driver
    // assignment are not changed by an observation or an administrator's answer.
    const todaysBookings = await db.select().from(bookings).where(sql`
      to_char(COALESCE(${bookings.scheduledAt}, ${bookings.createdAt}) AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') = ${day}
      AND ${bookings.status} NOT IN ('draft','pricing_ready','completed','cancelled','cancelled_refund_pending','refunded','refunded_partial')
    `);
    const byId = new Map(todaysBookings.map((booking) => [booking.id, booking]));
    const observations = await db.select().from(driverJourneyObservations)
      .where(and(eq(driverJourneyObservations.driverId, driverId), sql`(${driverJourneyObservations.serviceDay} = ${day} OR ${driverJourneyObservations.status} IN ('pending','confirmed'))`));
    let active = observations.find((row) => row.status === 'pending' || row.status === 'confirmed');
    if (active && (!byId.has(active.bookingId) || ['arrived', 'in_progress'].includes(byId.get(active.bookingId)!.status)
      || !isEligibleJourneyBooking(candidateOf(byId.get(active.bookingId)!), now)
      || active.serviceDay !== day || (active.status === 'pending' && active.expiresAt.getTime() <= now))) {
      await db.update(driverJourneyObservations).set({ status: active.status === 'pending' ? 'expired' : 'ended', revision: active.revision + 1 })
        .where(and(eq(driverJourneyObservations.id, active.id), eq(driverJourneyObservations.revision, active.revision)));
      active = undefined;
    }
    const candidates = selectJourneyCandidates(todaysBookings.map(candidateOf), fixes, now);
    if (active?.status === 'confirmed') {
      const booking = byId.get(active.bookingId)!;
      if (booking.status === 'arrived' || booking.status === 'in_progress') {
        await db.update(driverJourneyObservations).set({ status: 'ended', revision: active.revision + 1 })
          .where(and(eq(driverJourneyObservations.id, active.id), eq(driverJourneyObservations.revision, active.revision)));
      } else {
        await updateConfirmedObservation(active, fix, candidateOf(booking), now);
      }
    } else if (active) {
      const matchingEvidence = candidates.find((candidate) => candidate.bookingId === active!.bookingId);
      if (matchingEvidence) {
        await db.update(driverJourneyObservations).set({ lastEvidenceAt: new Date(fix.at),
          state: { ...stateOf(active), distanceMeters: matchingEvidence.distanceMeters, lastLocationAt: fix.at }, revision: active.revision + 1 })
          .where(and(eq(driverJourneyObservations.id, active.id), eq(driverJourneyObservations.revision, active.revision), eq(driverJourneyObservations.status, 'pending')));
      } else if (now - active.lastEvidenceAt.getTime() > EVIDENCE_MAX_AGE_MS) {
        await db.update(driverJourneyObservations).set({ status: 'expired', revision: active.revision + 1 })
          .where(and(eq(driverJourneyObservations.id, active.id), eq(driverJourneyObservations.revision, active.revision)));
      }
    } else {
      // No suppresses the pair for the London service day. A timed-out
      // suggestion may be proposed again after a cooldown with a new event ID.
      // When several jobs fit the same direction we ask about one, never bind
      // a destination or publish customer tracking from proximity alone.
      const seen = new Set(observations.filter((row) => row.serviceDay === day && (row.status !== 'expired'
        || now < row.expiresAt.getTime() + PROPOSAL_RETRY_COOLDOWN_MS)).map((row) => row.bookingId));
      const candidate = candidates.find((item) => !seen.has(item.bookingId));
      if (candidate) {
        const observationId = randomUUID();
        const state: ObservationState = { monitor: initialJourneyMonitorState(), distanceMeters: candidate.distanceMeters,
          etaSeconds: null, routeCheckedAt: 0, lastLocationAt: fix.at, confidence: candidate.confidence };
        await db.execute(sql`
          WITH observation AS (
            INSERT INTO driver_journey_observations (id,driver_id,booking_id,service_day,state,expires_at,last_evidence_at)
            SELECT ${observationId}::uuid,${driverId}::uuid,${candidate.bookingId}::uuid,${day},${JSON.stringify(state)}::jsonb,${new Date(now + PROPOSAL_LIFETIME_MS)}::timestamptz,${new Date(fix.at)}::timestamptz
            FROM bookings b JOIN drivers d ON d.id = ${driverId}::uuid
            WHERE b.id = ${candidate.bookingId}::uuid AND d.is_online = true
              AND b.status IN ('awaiting_payment','payment_failed','paid','deposit_paid','driver_assigned','en_route')
              AND to_char(COALESCE(b.scheduled_at,b.created_at) AT TIME ZONE 'Europe/London','YYYY-MM-DD') = ${day}
            ON CONFLICT DO NOTHING RETURNING id
          )
          INSERT INTO driver_journey_events (observation_id,event_key,kind)
          SELECT id, id::text || ':confirmation', 'confirmation' FROM observation
          ON CONFLICT (event_key) DO NOTHING
        `);
      }
    }
  } finally {
    await db.update(driverJourneyStates).set({ fixes, updatedAt: new Date(), leaseToken: null, leaseUntil: null })
      .where(and(eq(driverJourneyStates.driverId, driverId), eq(driverJourneyStates.leaseToken, lease.token)));
  }
  // Transport latency must not hold the per-driver inference lease or turn
  // otherwise continuous GPS into a false stationary-sample gap.
  await flushDriverJourneyPushes(driverId);
}

async function updateConfirmedObservation(row: Observation, fix: GeoFix, booking: CandidateBooking, now: number) {
  const old = stateOf(row);
  let freshEta: number | null = null;
  const state = { ...old };
  if (now - old.routeCheckedAt >= ROUTE_INTERVAL_MS) {
    state.routeCheckedAt = now; // Failed route requests are also rate limited.
    try {
      const route = await getDirections({ lat: fix.lat, lng: fix.lng }, { lat: booking.lat, lng: booking.lng });
      if (route && Number.isFinite(route.duration) && route.duration >= 0 && Number.isFinite(route.distance) && route.distance >= 0) freshEta = route.duration;
    } catch { /* Missing routing credentials does not become an invented ETA. */ }
    state.etaSeconds = freshEta;
  }
  const evaluation = advanceJourneyMonitor(old.monitor, fix, { lat: booking.lat, lng: booking.lng }, freshEta, now);
  state.monitor = evaluation.state;
  state.lastLocationAt = fix.at;
  state.distanceMeters = haversineDistanceMiles({ lat: fix.lat, lng: fix.lng }, { lat: booking.lat, lng: booking.lng }) * 1609.344;
  // Stop and ETA episodes are claimed in the same SQL statement as state.
  // A conflicting administrator decision / GPS request cannot emit a phantom event.
  const events = evaluation.events.map((kind) => ({ kind,
    key: `${row.id}:${kind}:${kind === 'near' ? 'once' : evaluation.state.stationarySince ?? fix.at}` }));
  await db.execute(sql`
    WITH changed AS (
      UPDATE driver_journey_observations SET state = ${JSON.stringify(state)}::jsonb,
        last_evidence_at = ${new Date(fix.at)}, revision = revision + 1,
        status = ${evaluation.state.arrived ? 'ended' : 'confirmed'}
      WHERE id = ${row.id} AND status = 'confirmed' AND revision = ${row.revision} AND ${currentEligibility(now)}
      RETURNING id
    )
    INSERT INTO driver_journey_events (observation_id,event_key,kind)
    SELECT changed.id, event.key, event.kind FROM changed,
      jsonb_to_recordset(${JSON.stringify(events)}::jsonb) AS event(key text,kind text)
    ON CONFLICT (event_key) DO NOTHING
  `);
}

export async function listDriverJourneyItems(eventId?: string) {
  const rows = await db.select({ event: driverJourneyEvents, observation: driverJourneyObservations,
    booking: bookings, driverName: users.name, driverOnline: drivers.isOnline })
    .from(driverJourneyEvents)
    .innerJoin(driverJourneyObservations, eq(driverJourneyEvents.observationId, driverJourneyObservations.id))
    .innerJoin(bookings, eq(driverJourneyObservations.bookingId, bookings.id))
    .innerJoin(drivers, eq(driverJourneyObservations.driverId, drivers.id))
    .leftJoin(users, eq(drivers.userId, users.id))
    .where(eventId ? eq(driverJourneyEvents.id, eventId) : sql`${driverJourneyEvents.createdAt} >= NOW() - INTERVAL '24 hours'`)
    .orderBy(desc(driverJourneyEvents.createdAt)).limit(50);
  const now = Date.now();
  return rows.map(({ event, observation, booking, driverName, driverOnline }) => {
    const state = stateOf(observation);
    const active = !['arrived', 'in_progress'].includes(booking.status)
      && isEligibleJourneyBooking(candidateOf(booking), now) && observation.serviceDay === ukServiceDay(now);
    const stale = observation.expiresAt.getTime() <= now || !driverOnline || now - observation.lastEvidenceAt.getTime() > EVIDENCE_MAX_AGE_MS;
    const status = !active ? (observation.status === 'pending' ? 'expired' : 'ended')
      : observation.status === 'pending' && stale ? 'expired' : observation.status;
    return { id: observation.id, eventId: event.id, driverId: observation.driverId, driverName: driverName ?? 'Driver',
      bookingId: booking.id, refNumber: booking.refNumber, customerName: booking.customerName,
      locationLabel: booking.addressLine, status, kind: event.kind, createdAt: event.createdAt.toISOString(),
      expiresAt: observation.expiresAt.toISOString(), etaSeconds: now - state.routeCheckedAt <= EVIDENCE_MAX_AGE_MS ? state.etaSeconds : null,
      distanceMeters: state.distanceMeters, lastLocationAt: state.lastLocationAt ? new Date(state.lastLocationAt).toISOString() : null,
      isRead: Boolean(event.readAt) };
  });
}

export async function decideDriverJourney(id: string, decision: 'yes' | 'no', adminId: string) {
  const now = Date.now();
  const [row] = await db.select({ observation: driverJourneyObservations, booking: bookings, driver: drivers })
    .from(driverJourneyObservations).innerJoin(bookings, eq(driverJourneyObservations.bookingId, bookings.id))
    .innerJoin(drivers, eq(driverJourneyObservations.driverId, drivers.id))
    .where(eq(driverJourneyObservations.id, id)).limit(1);
  if (!row || row.observation.status !== 'pending' || !row.driver.isOnline
    || row.observation.serviceDay !== ukServiceDay(now) || row.observation.expiresAt.getTime() <= now
    || now - row.observation.lastEvidenceAt.getTime() > EVIDENCE_MAX_AGE_MS
    || !row.driver.locationAt || now - row.driver.locationAt.getTime() > EVIDENCE_MAX_AGE_MS
    || ['arrived', 'in_progress'].includes(row.booking.status)
    || !isEligibleJourneyBooking(candidateOf(row.booking), now)) return null;
  const status = decision === 'yes' ? 'confirmed' : 'rejected';
  // Seed movement evidence, but never emit an approach/stop event before Yes.
  const [tracking] = await db.select().from(driverJourneyStates).where(eq(driverJourneyStates.driverId, row.driver.id)).limit(1);
  let monitor = initialJourneyMonitorState();
  if (decision === 'yes' && Array.isArray(tracking?.fixes)) {
    for (const fix of tracking.fixes as GeoFix[]) {
      monitor = advanceJourneyMonitor(monitor, fix, { lat: Number(row.booking.lat), lng: Number(row.booking.lng) }, null, now).state;
    }
  }
  const [updated] = await db.update(driverJourneyObservations).set({ status, respondedAt: new Date(now), respondedBy: adminId,
    state: { ...stateOf(row.observation), monitor }, revision: row.observation.revision + 1 })
    .where(and(eq(driverJourneyObservations.id, id), eq(driverJourneyObservations.status, 'pending'), eq(driverJourneyObservations.revision, row.observation.revision),
      sql`${driverJourneyObservations.expiresAt} > ${new Date(now)}`, sql`${driverJourneyObservations.lastEvidenceAt} >= ${new Date(now - EVIDENCE_MAX_AGE_MS)}`, currentEligibility(now)))
    .returning({ status: driverJourneyObservations.status });
  if (!updated) return null;
  await db.update(driverJourneyEvents).set({ readAt: new Date(now) }).where(eq(driverJourneyEvents.observationId, id));
  return status;
}

export async function readDriverJourneyEvent(eventId: string) {
  const [row] = await db.update(driverJourneyEvents).set({ readAt: new Date() }).where(eq(driverJourneyEvents.id, eventId)).returning({ id: driverJourneyEvents.id });
  return Boolean(row);
}

/** Retry zero-acceptance sends with a durable lease; acceptance is not delivery. */
async function flushDriverJourneyPushes(driverId: string) {
  const now = Date.now();
  const rows = await db.select({ event: driverJourneyEvents, observation: driverJourneyObservations,
    refNumber: bookings.refNumber, customerName: bookings.customerName, driverName: users.name })
    .from(driverJourneyEvents).innerJoin(driverJourneyObservations, eq(driverJourneyEvents.observationId, driverJourneyObservations.id))
    .innerJoin(bookings, eq(driverJourneyObservations.bookingId, bookings.id))
    .innerJoin(drivers, eq(driverJourneyObservations.driverId, drivers.id)).leftJoin(users, eq(drivers.userId, users.id))
    .where(and(eq(driverJourneyObservations.driverId, driverId), sql`${driverJourneyEvents.pushAcceptedAt} IS NULL`,
      sql`${driverJourneyEvents.pushAttempts} < 3`,
      sql`(${driverJourneyEvents.pushClaimedUntil} IS NULL OR ${driverJourneyEvents.pushClaimedUntil} < ${new Date(now)})`,
      sql`(${driverJourneyEvents.pushAttemptedAt} IS NULL OR ${driverJourneyEvents.pushAttemptedAt} < ${new Date(now - 30_000)})`,
      sql`${driverJourneyEvents.createdAt} > ${new Date(now - 10 * 60_000)}`,
      currentEventEvidence(now), currentEligibility(now))).limit(5);
  for (const { event, observation, refNumber, customerName, driverName } of rows) {
    const claimNow = Date.now();
    if (event.kind === 'confirmation' && (observation.status !== 'pending' || observation.expiresAt.getTime() <= claimNow)) continue;
    if (event.kind !== 'confirmation' && observation.status !== 'confirmed') continue;
    const [claimed] = await db.update(driverJourneyEvents).set({ pushAttemptedAt: new Date(claimNow), pushClaimedUntil: new Date(claimNow + 30_000), pushAttempts: sql`${driverJourneyEvents.pushAttempts} + 1` })
      .where(and(eq(driverJourneyEvents.id, event.id), sql`${driverJourneyEvents.pushAcceptedAt} IS NULL`, sql`${driverJourneyEvents.pushAttempts} < 3`,
        sql`(${driverJourneyEvents.pushClaimedUntil} IS NULL OR ${driverJourneyEvents.pushClaimedUntil} < ${new Date(claimNow)})`,
        sql`(${driverJourneyEvents.pushAttemptedAt} IS NULL OR ${driverJourneyEvents.pushAttemptedAt} < ${new Date(claimNow - 30_000)})`,
        sql`${driverJourneyEvents.createdAt} > ${new Date(claimNow - 10 * 60_000)}`,
        sql`EXISTS (SELECT 1 FROM driver_journey_observations WHERE driver_journey_observations.id = ${event.observationId}
          AND ${currentEventEvidence(claimNow)} AND ${currentEligibility(claimNow)})`))
      .returning({ id: driverJourneyEvents.id, attempts: driverJourneyEvents.pushAttempts });
    if (!claimed) continue;
    const name = driverName ?? 'Driver';
    const title = event.kind === 'confirmation' ? 'Confirm driver journey'
      : event.kind === 'near' ? 'Driver within 5 minutes' : 'Driver stopped for over 2 minutes';
    const body = event.kind === 'confirmation' ? `Is ${name} heading to ${refNumber} (${customerName})? Open to answer Yes or No.`
      : event.kind === 'near' ? `${name} is about 5 minutes or less from ${refNumber}.`
        : `${name} has remained stationary on the way to ${refNumber}. Check with the driver.`;
    if (claimed.attempts === 1) await createAdminNotification({ type: 'driver.status.changed', title, body, entityType: 'booking', entityId: observation.bookingId,
      link: `/admin/bookings/${refNumber}`, metadata: { journeyId: observation.id, eventId: event.id, refNumber, driverName: name, updateType: `driver_journey_${event.kind}` } });
    const result = await sendAdminStatusUpdatePushWithResult({ bookingId: observation.bookingId, refNumber, title, body,
      type: `driver_journey_${event.kind}`, data: { eventId: event.id, journeyId: observation.id }, platforms: ['ios'], skipFcm: claimed.attempts > 1 });
    // Partial success is not resent to every admin device. Expo receipt checks
    // and per-device retries belong to transport delivery, not GPS inference.
    await db.update(driverJourneyEvents).set({ pushClaimedUntil: null, ...(result.accepted > 0 ? { pushAcceptedAt: new Date() } : {}) })
      .where(and(eq(driverJourneyEvents.id, event.id), eq(driverJourneyEvents.pushAttempts, claimed.attempts)));
  }
}
