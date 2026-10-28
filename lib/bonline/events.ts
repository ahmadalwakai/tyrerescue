import { createHash } from 'node:crypto';
import { normalizeCustomerPhoneInput } from '@/lib/contact-normalization';
import { BUSINESS_PHONE_E164 } from '@/lib/config/business-contact';
import type { BonlineConfig } from './config';

export const BONLINE_MAX_BODY_BYTES = 32 * 1024;
export const BONLINE_FRESH_CALL_MS = 90_000;

export interface BonlineCallEvent {
  key: string;
  callId: string;
  kind: 'call_created' | 'call_ended';
  phone: string | null;
  createdAt: string | null;
  /** Missing direction must never create a durable incoming-call record. */
  verifiedInbound?: boolean;
  answeredAt?: string | null;
  endedAt?: string | null;
  /** True only for a complete terminal snapshot explicitly declaring no answer. */
  unansweredAtEnd?: boolean;
}

type ParsedEvent =
  | { type: 'accepted'; event: BonlineCallEvent }
  | { type: 'ignored'; reason: string }
  | { type: 'invalid'; reason: string }
  | { type: 'forbidden'; reason: string };

function text(value: unknown, max = 256): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): number {
  const valueText = text(value, 64);
  return valueText ? Date.parse(valueText) : Number.NaN;
}

/** Wazo's default HTTP service sends only CallSchema data, without event headers.
 * Created/updated/answered share that schema, so an active snapshot is an
 * idempotent start, not proof that the original event was call_created.
 * Sources: wazo-webhookd/services/http/plugin.py and
 * wazo-calld/plugins/calls/{schemas,notifier,services}.py.
 */
function snapshotKind(payload: Record<string, unknown>, now: number): BonlineCallEvent['kind'] | null {
  const nullableText = (value: unknown) => value === null || typeof value === 'string';
  const createdMs = timestamp(payload.creation_time);
  if (!text(payload.call_id, 200) || !Number.isFinite(createdMs)
    || !text(payload.status, 32)
    || !['inbound', 'incoming', 'outbound', 'outgoing', 'internal', 'unknown'].includes(text(payload.direction, 32)?.toLowerCase() ?? '')
    || typeof payload.is_caller !== 'boolean'
    || !nullableText(payload.caller_id_number) || !nullableText(payload.peer_caller_id_number)
    || !nullableText(payload.user_uuid)
    || !Array.isArray(payload.bridges) || !payload.bridges.every((bridge) => typeof bridge === 'string')
    || !isRecord(payload.talking_to) || !Object.values(payload.talking_to).every(nullableText)
    || (payload.answer_time !== null && !Number.isFinite(timestamp(payload.answer_time)))) return null;

  if (payload.hangup_time !== null) {
    const endedMs = timestamp(payload.hangup_time);
    return Number.isFinite(endedMs) && endedMs >= createdMs && endedMs <= now + 30_000 ? 'call_ended' : null;
  }
  return /^(down|ring|ringing|up)$/i.test(text(payload.status, 32) ?? '') ? 'call_created' : null;
}

export function normalizeBonlinePhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 80 || /[a-z]/i.test(value)) return null;
  let phone = normalizeCustomerPhoneInput(value);
  if (phone.startsWith('0')) phone = `+44${phone.slice(1)}`;
  else if (/^44\d{9,10}$/.test(phone)) phone = `+${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function isBonlineBusinessPhone(value: unknown): boolean {
  return normalizeBonlinePhone(value) === BUSINESS_PHONE_E164;
}

/** Accept only the bOnline call-event format, never caller data from arbitrary URLs. */
export function parseBonlineEvent(
  value: unknown,
  headers: Headers,
  config: BonlineConfig,
  now = Date.now(),
): ParsedEvent {
  if (!isRecord(value)) {
    return { type: 'invalid', reason: 'Expected a call event object.' };
  }
  // Accept the bus-style JSON envelope or an explicitly named HTTP template,
  // while preserving existing header deliveries. Explicit unsupported names
  // must never fall through to snapshot inference.
  const headerName = headers.get('name');
  const names: unknown[] = [
    ...(headerName === null ? [] : [headerName]),
    ...('name' in value ? [value.name] : []),
    ...('event_name' in value ? [value.event_name] : []),
  ];
  if (names.some((name) => !['call_created', 'call_ended', 'call_updated', 'call_answered'].includes(String(name)))) {
    return { type: 'ignored', reason: 'Unsupported event.' };
  }
  if (names.some((name) => name !== names[0])) {
    return { type: 'invalid', reason: 'Conflicting event identity.' };
  }
  let payload = value;
  if ('data' in value) {
    if (!names.length || !isRecord(value.data)) return { type: 'invalid', reason: 'Expected named call event data.' };
    payload = value.data;
  }
  const providerKind = names[0] ?? snapshotKind(payload, now);
  if (providerKind !== 'call_created' && providerKind !== 'call_ended' && providerKind !== 'call_updated' && providerKind !== 'call_answered') {
    return { type: 'ignored', reason: 'Unsupported event.' };
  }
  const tenants = [headers.get('tenant_uuid'), value.tenant_uuid, payload.tenant_uuid]
    .filter((tenant) => tenant !== null && tenant !== undefined);
  const tenantId = text(tenants[0]);
  if (tenants.some((tenant) => !text(tenant) || text(tenant) !== tenantId)) {
    return { type: 'forbidden', reason: 'Account does not match.' };
  }
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
  const direction = text(payload.direction, 32)?.toLowerCase();
  const verifiedInbound = direction === 'inbound' || direction === 'incoming';
  // Even terminal payloads must not introduce outgoing/internal records.
  // An unnamed-direction tombstone can only close a previously known call.
  if (direction && !verifiedInbound && direction !== 'unknown') {
    return { type: 'ignored', reason: 'Not an incoming external call.' };
  }
  const createdMs = timestamp(payload.creation_time);
  const rawEndedMs = timestamp(payload.hangup_time);
  const endedMs = Number.isFinite(rawEndedMs) && rawEndedMs <= now + 30_000
    && (!Number.isFinite(createdMs) || rawEndedMs >= createdMs) ? rawEndedMs : Number.NaN;
  const rawAnsweredMs = timestamp(payload.answer_time);
  const answeredMs = Number.isFinite(createdMs) && Number.isFinite(rawAnsweredMs)
    && rawAnsweredMs >= createdMs && rawAnsweredMs <= now + 30_000
    && (!Number.isFinite(endedMs) || rawAnsweredMs <= endedMs) ? rawAnsweredMs : Number.NaN;
  const isUpdate = providerKind === 'call_updated' || providerKind === 'call_answered';
  // Named updates without verified answer/end evidence remain unsupported.
  if (isUpdate && !Number.isFinite(answeredMs) && !Number.isFinite(endedMs)) {
    return { type: 'ignored', reason: 'No verified call state change.' };
  }
  const kind = providerKind === 'call_ended' || (isUpdate && Number.isFinite(endedMs)) ? 'call_ended' : 'call_created';
  if (kind !== 'call_ended' && !verifiedInbound) {
    return { type: 'ignored', reason: 'Not an incoming external call.' };
  }
  if (kind === 'call_created' && (payload.hangup_time || /^(hungup|ended)$/i.test(text(payload.status, 32) ?? ''))) {
    return { type: 'ignored', reason: 'Call has already ended.' };
  }
  if (kind === 'call_created' && !Number.isFinite(createdMs)) return { type: 'invalid', reason: 'Missing call creation time.' };
  // Verified late answers update the durable ledger; the unchanged live-feed
  // freshness predicate still prevents those old calls reopening a popup.
  if (kind === 'call_created' && (createdMs > now + 30_000
    || (createdMs < now - BONLINE_FRESH_CALL_MS && !Number.isFinite(answeredMs)))) {
    return { type: 'ignored', reason: 'Call event is outside the live window.' };
  }
  // Wazo's flag can default to false for destinations other than a user or an
  // outgoing call; it does not always establish which field is the customer.
  // https://github.com/wazo-platform/wazo-calld/blob/master/wazo_calld/plugins/calls/api.yml
  // Keep normal leg selection, but never publish our own number. Only an exact
  // known-business match permits using the other field; a withheld/invalid
  // preferred caller must not fall back to an arbitrary recipient number.
  if (payload.is_caller !== undefined && typeof payload.is_caller !== 'boolean') {
    return { type: 'invalid', reason: 'Invalid call leg metadata.' };
  }
  const preferredPhone = normalizeBonlinePhone(payload.is_caller === false ? payload.peer_caller_id_number : payload.caller_id_number);
  const phone = isBonlineBusinessPhone(preferredPhone)
    ? normalizeBonlinePhone(payload.is_caller === false ? payload.caller_id_number : payload.peer_caller_id_number)
    : preferredPhone;
  const externalPhone = phone && !isBonlineBusinessPhone(phone) ? phone : null;
  if (kind === 'call_created' && !externalPhone && !Number.isFinite(answeredMs)) return { type: 'ignored', reason: 'Caller number is withheld or unavailable.' };
  return {
    type: 'accepted',
    event: {
      key, callId, kind, phone: externalPhone,
      createdAt: Number.isFinite(createdMs) && createdMs <= now + 30_000 ? new Date(createdMs).toISOString() : null,
      verifiedInbound,
      answeredAt: Number.isFinite(answeredMs) ? new Date(answeredMs).toISOString() : null,
      endedAt: Number.isFinite(endedMs) ? new Date(endedMs).toISOString() : null,
      unansweredAtEnd: kind === 'call_ended' && verifiedInbound && payload.answer_time === null
        && snapshotKind(payload, now) === 'call_ended' && !/^up$/i.test(text(payload.status, 32) ?? ''),
    },
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
