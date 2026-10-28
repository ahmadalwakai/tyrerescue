import 'server-only';
import { createHash } from 'node:crypto';
import { normalizeBonlinePhone, isBonlineBusinessPhone } from './events';
import { UUID_PATTERN, type OutboundConfig } from './outbound-config';
import { originateOutboundCall } from './outbound-provider';
import { finishOutboundAttempt, reserveOutboundAttempt, type OutboundAttempt } from './outbound-store';

export interface OutboundRequest {
  phone: string;
  idempotencyKey: string;
  confirmed: true;
  bookingId: string | null;
  sourceCallId: string | null;
}

export function parseOutboundRequest(value: unknown): OutboundRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['phone', 'idempotencyKey', 'confirmed', 'bookingId', 'sourceCallId'].includes(key))
    || data.confirmed !== true || typeof data.phone !== 'string' || !/^[+\d ()-]{8,40}$/.test(data.phone)
    || typeof data.idempotencyKey !== 'string' || !UUID_PATTERN.test(data.idempotencyKey)) return null;
  const phone = normalizeBonlinePhone(data.phone);
  // Ordinary UK landline/non-geographic and mobile destinations only. Reject
  // emergency, internal, premium-rate, personal-number and dial-string inputs.
  if (!phone || !/^\+44(?:[123]\d{9}|7[1-57-9]\d{8})$/.test(phone) || isBonlineBusinessPhone(phone)) return null;
  if (data.bookingId !== undefined && (typeof data.bookingId !== 'string' || !UUID_PATTERN.test(data.bookingId))) return null;
  if (data.sourceCallId !== undefined && (typeof data.sourceCallId !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(data.sourceCallId))) return null;
  return {
    phone, idempotencyKey: data.idempotencyKey.toLowerCase(), confirmed: true,
    bookingId: typeof data.bookingId === 'string' ? data.bookingId.toLowerCase() : null,
    sourceCallId: typeof data.sourceCallId === 'string' ? data.sourceCallId : null,
  };
}

export interface OutboundResponse {
  statusCode: number;
  body: Record<string, unknown>;
  retryAfter?: number;
}

function attemptResponse(attempt: OutboundAttempt, replayed: boolean): OutboundResponse {
  const messages = {
    accepted: 'bOnline accepted the call request. Answer your assigned phone to connect; this does not confirm the customer answered.',
    pending: 'This call request is already being processed. Check your bOnline phone before starting another call.',
    unknown: 'The call may have started, but its outcome could not be confirmed. Check your bOnline phone before starting another call.',
    failed: 'bOnline rejected this call request. Check the assigned phone and calling permissions before trying again.',
  };
  return {
    statusCode: attempt.status === 'failed' ? 502 : 202,
    body: { attemptId: attempt.id, status: attempt.status, message: messages[attempt.status], replayed,
      ...(attempt.failure_code ? { reason: attempt.failure_code } : {}) },
  };
}

export async function requestOutboundCall(config: OutboundConfig, adminUserId: string, input: OutboundRequest): Promise<OutboundResponse> {
  const requestHash = createHash('sha256').update(JSON.stringify({
    phone: input.phone, bookingId: input.bookingId, sourceCallId: input.sourceCallId, origin: config.origin,
  })).digest('hex');
  let reservation: Awaited<ReturnType<typeof reserveOutboundAttempt>>;
  try {
    reservation = await reserveOutboundAttempt({
      scope: config.scope, adminUserId, idempotencyKey: input.idempotencyKey, requestHash,
      phone: input.phone, bookingId: input.bookingId, sourceCallId: input.sourceCallId,
    });
  } catch {
    return { statusCode: 503, body: { reason: 'audit_unavailable', message: 'Calling is temporarily unavailable because the call request could not be safely recorded.' } };
  }
  if (reservation.kind === 'rate_limited') return {
    statusCode: 429, retryAfter: 30,
    body: { reason: 'rate_limited', message: 'Please wait before starting another call. Retrying the same request will not place a duplicate call.' },
  };
  const attempt = reservation.attempt;
  if (attempt.request_hash !== requestHash) return {
    statusCode: 409, body: { reason: 'idempotency_conflict', message: 'This request key belongs to different call details. Review the destination before starting a new call.' },
  };
  if (reservation.kind === 'existing') return attemptResponse(attempt, true);
  const result = await originateOutboundCall(config, input.phone);
  try {
    return attemptResponse(await finishOutboundAttempt(attempt.id, result), false);
  } catch {
    // The provider may have accepted the call. The durable pending reservation
    // remains and blocks duplicate origination even when the audit update fails.
    return attemptResponse({ ...attempt, status: 'unknown', failure_code: 'audit_update_unavailable' }, false);
  }
}
