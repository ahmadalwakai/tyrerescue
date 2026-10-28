import 'server-only';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { OriginationResult } from './outbound-provider';

export interface OutboundAttempt {
  id: string;
  request_hash: string;
  status: 'pending' | 'accepted' | 'failed' | 'unknown';
  provider_call_id: string | null;
  failure_code: string | null;
}

export interface OutboundReservation {
  scope: string;
  adminUserId: string;
  idempotencyKey: string;
  requestHash: string;
  phone: string;
  bookingId: string | null;
  sourceCallId: string | null;
}

export async function checkOutboundStorage(): Promise<void> {
  await db.execute(sql`SELECT id FROM bonline_outbound_attempts LIMIT 1`);
}

/** Unique DB constraints arbitrate concurrent servers; never retry a claimed attempt upstream. */
export async function reserveOutboundAttempt(input: OutboundReservation): Promise<
  { kind: 'new' | 'existing'; attempt: OutboundAttempt } | { kind: 'rate_limited' }
> {
  const inserted = await db.execute(sql`
    INSERT INTO bonline_outbound_attempts
      (id, scope, admin_user_id, idempotency_key, request_hash, phone, booking_id, source_call_id, rate_bucket, status)
    VALUES (${randomUUID()}::uuid, ${input.scope}, ${input.adminUserId}, ${input.idempotencyKey}::uuid,
      ${input.requestHash}, ${input.phone}, ${input.bookingId}, ${input.sourceCallId},
      floor(extract(epoch FROM clock_timestamp()) / 30)::bigint, 'pending')
    ON CONFLICT DO NOTHING
    RETURNING id, request_hash, status, provider_call_id, failure_code
  `);
  if (inserted.rows.length) return { kind: 'new', attempt: inserted.rows[0] as unknown as OutboundAttempt };
  // A separate statement observes a competing INSERT after its unique-key wait.
  const existing = await db.execute(sql`
    SELECT id, request_hash, status, provider_call_id, failure_code FROM bonline_outbound_attempts
    WHERE scope = ${input.scope} AND admin_user_id = ${input.adminUserId}
      AND idempotency_key = ${input.idempotencyKey}::uuid
    LIMIT 1
  `);
  return existing.rows.length
    ? { kind: 'existing', attempt: existing.rows[0] as unknown as OutboundAttempt }
    : { kind: 'rate_limited' };
}

export async function finishOutboundAttempt(id: string, result: OriginationResult): Promise<OutboundAttempt> {
  const response = await db.execute(sql`
    UPDATE bonline_outbound_attempts SET status = ${result.status}, provider_call_id = ${result.providerCallId},
      failure_code = ${result.failureCode}, updated_at = clock_timestamp()
    WHERE id = ${id}::uuid AND status = 'pending'
    RETURNING id, request_hash, status, provider_call_id, failure_code
  `);
  if (response.rows.length !== 1) throw new Error('Outbound audit update was not persisted.');
  return response.rows[0] as unknown as OutboundAttempt;
}
