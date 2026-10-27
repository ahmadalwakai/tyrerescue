import { createHash } from 'node:crypto';
import { normalizeCustomerPhoneInput } from '@/lib/contact-normalization';
import type { BonlineConfig } from './config';

export const BONLINE_MAX_BODY_BYTES = 32 * 1024;
export const BONLINE_FRESH_CALL_MS = 90_000;

export interface BonlineCallEvent {
  key: string;
  callId: string;
  kind: 'call_created' | 'call_ended';
  phone: string | null;
  createdAt: string | null;
}

type ParsedEvent =
  | { type: 'accepted'; event: BonlineCallEvent }
  | { type: 'ignored'; reason: string }
  | { type: 'invalid'; reason: string }
  | { type: 'forbidden'; reason: string };

function text(value: unknown, max = 256): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value.trim() : null;
}

export function normalizeBonlinePhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 80 || /[a-z]/i.test(value)) return null;
  let phone = normalizeCustomerPhoneInput(value);
  if (phone.startsWith('0')) phone = `+44${phone.slice(1)}`;
  else if (/^44\d{9,10}$/.test(phone)) phone = `+${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

/** Accept only the bOnline call-event format, never caller data from arbitrary URLs. */
export function parseBonlineEvent(
  value: unknown,
  headers: Headers,
  config: BonlineConfig,
  now = Date.now(),
): ParsedEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { type: 'invalid', reason: 'Expected a call event object.' };
  }
  const payload = value as Record<string, unknown>;
  const kind = headers.get('name');
  if (kind !== 'call_created' && kind !== 'call_ended') {
    return { type: 'ignored', reason: 'Unsupported event.' };
  }
  const tenantId = text(headers.get('tenant_uuid'));
  const userId = text(payload.user_uuid);
  if (config.tenantIds.length && (!tenantId || !config.tenantIds.includes(tenantId))) {
    return { type: 'forbidden', reason: 'Account does not match.' };
  }
  if (config.providerUserIds.length && (!userId || !config.providerUserIds.includes(userId))) {
    return { type: 'ignored', reason: 'User is outside the configured call feed.' };
  }
  const callId = text(payload.call_id, 200);
  if (!callId) return { type: 'invalid', reason: 'Missing call identifier.' };
  // Scope the provider identity by tenant, but not user, so retries or repeated
  // publication of the same call to multiple users cannot duplicate it.
  const key = createHash('sha256').update(`${tenantId ?? ''}\0${callId}`).digest('hex');
  if (kind === 'call_ended') {
    return { type: 'accepted', event: { key, callId, kind, phone: null, createdAt: null } };
  }
  const direction = text(payload.direction, 32)?.toLowerCase();
  if (direction !== 'inbound' && direction !== 'incoming') {
    return { type: 'ignored', reason: 'Not an incoming external call.' };
  }
  if (payload.hangup_time || /^(hungup|ended)$/i.test(text(payload.status, 32) ?? '')) {
    return { type: 'ignored', reason: 'Call has already ended.' };
  }
  const createdAt = text(payload.creation_time, 64);
  const createdMs = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isFinite(createdMs)) return { type: 'invalid', reason: 'Missing call creation time.' };
  if (createdMs < now - BONLINE_FRESH_CALL_MS || createdMs > now + 30_000) {
    return { type: 'ignored', reason: 'Call event is outside the live window.' };
  }
  // Wazo's fields describe this channel, not always the originating customer:
  // on the receiving user's leg (is_caller=false), the external caller is the
  // peer. Never fall back to the recipient's own number when its peer is hidden.
  // bOnline payloads without leg metadata use its documented caller ID field.
  // Source: wazo-calld/integration_tests/suite/test_calls.py recipient assertions.
  if (payload.is_caller !== undefined && typeof payload.is_caller !== 'boolean') {
    return { type: 'invalid', reason: 'Invalid call leg metadata.' };
  }
  const phone = normalizeBonlinePhone(payload.is_caller === false ? payload.peer_caller_id_number : payload.caller_id_number);
  if (!phone) return { type: 'ignored', reason: 'Caller number is withheld or unavailable.' };
  return {
    type: 'accepted',
    event: { key, callId, kind, phone, createdAt: new Date(createdMs).toISOString() },
  };
}

export class BonlineBodyError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

/** Stream with a hard limit even when Content-Length is absent or misleading. */
export async function readBonlineBody(request: Request): Promise<unknown> {
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') throw new BonlineBodyError(415, 'Expected application/json.');
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > BONLINE_MAX_BODY_BYTES) {
    throw new BonlineBodyError(413, 'Call event is too large.');
  }
  if (!request.body) throw new BonlineBodyError(400, 'Missing call event.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > BONLINE_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BonlineBodyError(413, 'Call event is too large.');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof BonlineBodyError) throw error;
    throw new BonlineBodyError(400, 'Invalid call event JSON.');
  } finally {
    reader.releaseLock();
  }
}
