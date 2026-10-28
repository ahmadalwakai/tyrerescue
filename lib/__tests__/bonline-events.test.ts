import { afterEach, describe, expect, it, vi } from 'vitest';
import { canReadBonlineCalls, getBonlineConfig, matchesBonlineSecret, type BonlineConfig } from '@/lib/bonline/config';
import { BONLINE_MAX_BODY_BYTES, isBonlineBusinessPhone, normalizeBonlinePhone, parseBonlineEvent, readBonlineBody } from '@/lib/bonline/events';
import { isBonlineCursor } from '@/lib/bonline/store';

const now = Date.parse('2026-10-27T22:00:00Z');
const config: BonlineConfig = { secret: 'a'.repeat(64), scope: 'scope', tenantIds: ['tenant-1'], providerUserIds: ['user-1'], adminUserIds: [] };
const payload = { call_id: '123.45', caller_id_number: '+44 7700 900123', creation_time: new Date(now).toISOString(), user_uuid: 'user-1', direction: 'inbound', status: 'Ring' };
const headers = (name = 'call_created', tenant = 'tenant-1') => new Headers({ name, tenant_uuid: tenant });
const defaultHttpConfig: BonlineConfig = { ...config, tenantIds: [] };
// Wazo CallSchema as emitted by the default HTTP service (event.data only).
const snapshot = { ...payload, is_caller: false, caller_id_number: '+441932509613', peer_caller_id_number: '+447700900123', bridges: [], talking_to: {}, answer_time: null, hangup_time: null };

afterEach(() => vi.unstubAllEnvs());

describe('bOnline event contract', () => {
  it('preserves verified answer and terminal state without guessing from missing fields', () => {
    const endedSnapshot = { ...snapshot, status: 'Down', hangup_time: new Date(now + 1_000).toISOString() };
    expect(parseBonlineEvent(endedSnapshot, new Headers(), defaultHttpConfig, now)).toMatchObject({
      type: 'accepted', event: { kind: 'call_ended', verifiedInbound: true, phone: '+447700900123', answeredAt: null, unansweredAtEnd: true },
    });
    const missingAnswer: Record<string, unknown> = { ...endedSnapshot };
    delete missingAnswer.answer_time;
    expect(parseBonlineEvent(missingAnswer, headers('call_ended'), config, now)).toMatchObject({
      type: 'accepted', event: { kind: 'call_ended', unansweredAtEnd: false, answeredAt: null },
    });
    expect(parseBonlineEvent({ call_id: payload.call_id, user_uuid: payload.user_uuid }, headers('call_ended'), config, now)).toMatchObject({
      type: 'accepted', event: { phone: null, createdAt: null, answeredAt: null, endedAt: null, verifiedInbound: false, unansweredAtEnd: false },
    });
    expect(parseBonlineEvent({ ...endedSnapshot, status: 'Up' }, new Headers(), defaultHttpConfig, now)).toMatchObject({
      type: 'accepted', event: { unansweredAtEnd: false },
    });
  });
  it('accepts verified late answers for the ledger but never treats an absent answer time as an answer', () => {
    const lateAnswer = { ...snapshot, status: 'Up', creation_time: new Date(now - 600_000).toISOString(), answer_time: new Date(now - 590_000).toISOString() };
    for (const deliveryHeaders of [new Headers(), new Headers({ name: 'call_updated' }), new Headers({ name: 'call_answered' })]) {
      expect(parseBonlineEvent(lateAnswer, deliveryHeaders, defaultHttpConfig, now)).toMatchObject({
        type: 'accepted', event: { kind: 'call_created', answeredAt: lateAnswer.answer_time, verifiedInbound: true },
      });
    }
    expect(parseBonlineEvent({ ...lateAnswer, caller_id_number: null, peer_caller_id_number: null }, new Headers(), defaultHttpConfig, now)).toMatchObject({
      type: 'accepted', event: { phone: null, answeredAt: lateAnswer.answer_time },
    });
    expect(parseBonlineEvent({ ...lateAnswer, answer_time: null }, new Headers({ name: 'call_answered' }), defaultHttpConfig, now).type).toBe('ignored');
  });
  it('rejects outgoing/internal terminal payloads and does not infer missed from invalid answer metadata', () => {
    const ended = { ...snapshot, hangup_time: new Date(now + 1_000).toISOString(), status: 'Down' };
    for (const direction of ['outgoing', 'outbound', 'internal']) {
      expect(parseBonlineEvent({ ...ended, direction }, headers('call_ended'), config, now).type).toBe('ignored');
    }
    for (const answer_time of ['invalid', '', new Date(now - 1_000).toISOString(), new Date(now + 2_000).toISOString()]) {
      expect(parseBonlineEvent({ ...ended, answer_time }, headers('call_ended'), config, now)).toMatchObject({
        type: 'accepted', event: { answeredAt: null, unansweredAtEnd: false },
      });
    }
  });
  it('rescues the external caller only when the preferred field is the known business line', () => {
    const ownFormats = ['01932 509613', '+441932509613', '441932509613', '00441932509613', '+44 (0) 1932 509613'];
    for (const own of ownFormats) {
      for (const is_caller of [false, true, undefined]) {
        const call = {
          ...snapshot,
          is_caller,
          caller_id_number: is_caller === false ? '+447700900555' : own,
          peer_caller_id_number: is_caller === false ? own : '+447700900555',
        };
        const deliveries = [
          parseBonlineEvent(call, headers(), config, now),
          parseBonlineEvent({ ...call, event_name: 'call_created', tenant_uuid: 'tenant-1' }, new Headers(), config, now),
        ];
        if (is_caller !== undefined) deliveries.push(parseBonlineEvent(call, new Headers(), defaultHttpConfig, now));
        else expect(parseBonlineEvent(call, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
        for (const result of deliveries) expect(result).toMatchObject({ type: 'accepted', event: { phone: '+447700900555' } });
      }
    }
  });
  it('never accepts our number when both fields contain it or the other field is unavailable', () => {
    for (const is_caller of [false, true, undefined]) {
      for (const alternate of ['+441932509613', '01932509613', null, undefined, '', 'anonymous', '1001', 'invalid-number']) {
        const call = {
          ...snapshot,
          is_caller,
          caller_id_number: is_caller === false ? alternate : '01932 509613',
          peer_caller_id_number: is_caller === false ? '01932 509613' : alternate,
        };
        expect(parseBonlineEvent(call, headers(), config, now).type).toBe('ignored');
        expect(parseBonlineEvent({ ...call, event_name: 'call_created', tenant_uuid: 'tenant-1' }, new Headers(), config, now).type).toBe('ignored');
        expect(parseBonlineEvent(call, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
      }
    }
  });
  it('does not replace a withheld or invalid preferred caller with an arbitrary public number', () => {
    for (const is_caller of [false, true, undefined]) {
      for (const preferred of [null, undefined, '', 'anonymous', 'withheld', '1001', 'invalid-number']) {
        const call = {
          ...snapshot,
          is_caller,
          caller_id_number: is_caller === false ? '+447700900555' : preferred,
          peer_caller_id_number: is_caller === false ? preferred : '+447700900555',
        };
        expect(parseBonlineEvent(call, headers(), config, now).type).toBe('ignored');
        expect(parseBonlineEvent({ ...call, event_name: 'call_created', tenant_uuid: 'tenant-1' }, new Headers(), config, now).type).toBe('ignored');
        expect(parseBonlineEvent(call, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
      }
    }
  });
  it('accepts explicitly named JSON envelopes and HTTP templates without event headers', () => {
    for (const body of [
      { name: 'call_created', tenant_uuid: 'tenant-1', data: payload },
      { event_name: 'call_created', tenant_uuid: 'tenant-1', ...payload },
    ]) {
      expect(parseBonlineEvent(body, new Headers(), config, now)).toMatchObject({ type: 'accepted', event: { kind: 'call_created', phone: '+447700900123' } });
    }
    expect(parseBonlineEvent({ name: 'call_ended', tenant_uuid: 'tenant-1', data: { call_id: payload.call_id, user_uuid: payload.user_uuid } }, new Headers(), config, now))
      .toMatchObject({ type: 'accepted', event: { kind: 'call_ended', phone: null } });
  });
  it('recognizes a fresh full default HTTP call snapshot without claiming an exact provider event', () => {
    for (const status of ['Down', 'Ring', 'Ringing', 'Up']) {
      expect(parseBonlineEvent({ ...snapshot, status }, new Headers(), defaultHttpConfig, now))
        .toMatchObject({ type: 'accepted', event: { kind: 'call_created', phone: '+447700900123' } });
    }
    expect(parseBonlineEvent({ ...snapshot, talking_to: { 'external-channel': null }, creation_time: '2026-10-27T17:00:00-0500' }, new Headers(), defaultHttpConfig, now).type).toBe('accepted');
  });
  it('accepts full terminal snapshots and keeps create/update/end deliveries idempotent', () => {
    const created = parseBonlineEvent(snapshot, new Headers(), defaultHttpConfig, now);
    const updated = parseBonlineEvent({ ...snapshot, status: 'Up', answer_time: new Date(now).toISOString() }, new Headers(), defaultHttpConfig, now);
    const ended = parseBonlineEvent({ ...snapshot, caller_id_number: null, peer_caller_id_number: null, hangup_time: new Date(now).toISOString(), reason_code: 16 }, new Headers(), defaultHttpConfig, now);
    expect(created.type).toBe('accepted');
    expect(updated.type).toBe('accepted');
    expect(ended).toMatchObject({ type: 'accepted', event: { kind: 'call_ended', phone: null } });
    if (created.type === 'accepted' && updated.type === 'accepted' && ended.type === 'accepted') {
      expect(updated.event.key).toBe(created.event.key);
      expect(ended.event.key).toBe(created.event.key);
    }
    // A long call's terminal snapshot still closes the original call.
    expect(parseBonlineEvent({ ...snapshot, creation_time: new Date(now - 600_000).toISOString(), hangup_time: new Date(now).toISOString() }, new Headers(), defaultHttpConfig, now).type).toBe('accepted');
    expect(parseBonlineEvent({ ...snapshot, direction: 'unknown', hangup_time: new Date(now).toISOString() }, new Headers(), defaultHttpConfig, now).type).toBe('accepted');
  });
  it('does not infer calls from minimal unrelated events, status alone, or malformed snapshots', () => {
    for (const body of [
      { call_id: payload.call_id, user_uuid: payload.user_uuid }, // also call_held/call_resumed
      { ...payload, status: 'Ring' },
      { ...snapshot, creation_time: 'invalid' },
      { ...snapshot, hangup_time: undefined },
      { ...snapshot, hangup_time: 'invalid' },
      { ...snapshot, hangup_time: new Date(now - 1).toISOString() },
      { ...snapshot, hangup_time: new Date(now + 30_001).toISOString() },
      { ...snapshot, answer_time: undefined },
      { ...snapshot, answer_time: 'invalid' },
      { ...snapshot, bridges: {} },
      { ...snapshot, talking_to: [] },
      { ...snapshot, talking_to: { channel: 42 } },
      { ...snapshot, is_caller: 'false' },
      { ...snapshot, status: 'hungup' },
      { ...snapshot, status: 'anything-else' },
    ]) expect(parseBonlineEvent(body, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
  });
  it('keeps scope, age, direction and selected caller protections for default HTTP data', () => {
    expect(parseBonlineEvent(snapshot, new Headers(), config, now).type).toBe('forbidden');
    expect(parseBonlineEvent({ ...snapshot, user_uuid: 'user-2' }, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
    for (const direction of ['outbound', 'outgoing', 'internal', 'unknown']) {
      expect(parseBonlineEvent({ ...snapshot, direction }, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
    }
    for (const age of [-90_001, 30_001]) {
      expect(parseBonlineEvent({ ...snapshot, creation_time: new Date(now + age).toISOString() }, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
    }
    expect(parseBonlineEvent({ ...snapshot, peer_caller_id_number: null }, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
    expect(parseBonlineEvent({ ...snapshot, is_caller: true, caller_id_number: '+447700900555', peer_caller_id_number: null }, new Headers(), defaultHttpConfig, now))
      .toMatchObject({ type: 'accepted', event: { phone: '+447700900555' } });
  });
  it('never falls back from explicit unsupported or conflicting event metadata', () => {
    for (const name of ['call_updated', 'call_answered', 'fax_outbound_created', '', null, 42]) {
      const body = { ...snapshot, name };
      expect(parseBonlineEvent(body, new Headers(), defaultHttpConfig, now).type).toBe('ignored');
    }
    expect(parseBonlineEvent(snapshot, headers('call_updated'), defaultHttpConfig, now).type).toBe('ignored');
    expect(parseBonlineEvent({ ...payload, event_name: 'call_ended' }, headers(), config, now).type).toBe('invalid');
    expect(parseBonlineEvent({ ...payload, tenant_uuid: 'tenant-2' }, headers(), config, now).type).toBe('forbidden');
    expect(parseBonlineEvent({ name: 'call_created', data: [] }, new Headers(), defaultHttpConfig, now).type).toBe('invalid');
    expect(parseBonlineEvent({ data: snapshot }, new Headers(), defaultHttpConfig, now).type).toBe('invalid');
  });
  it('accepts current inbound ringing calls and normalises the customer number', () => {
    expect(parseBonlineEvent(payload, headers(), config, now)).toMatchObject({ type: 'accepted', event: { callId: '123.45', phone: '+447700900123', kind: 'call_created' } });
    expect(parseBonlineEvent({ ...payload, direction: 'incoming' }, headers(), config, now).type).toBe('accepted');
    // Asterisk may create a channel in Down before it changes to Ring. Only a
    // hangup marker or explicit ended event makes this an ended call.
    expect(parseBonlineEvent({ ...payload, status: 'Down' }, headers(), config, now).type).toBe('accepted');
  });
  it('selects the remote caller on a receiving Wazo leg instead of our own line', () => {
    expect(parseBonlineEvent({ ...payload, is_caller: false, caller_id_number: '+441411234567', peer_caller_id_number: '+447700900555' }, headers(), config, now)).toMatchObject({
      type: 'accepted', event: { phone: '+447700900555' },
    });
    expect(parseBonlineEvent({ ...payload, is_caller: true, peer_caller_id_number: '+441411234567' }, headers(), config, now)).toMatchObject({
      type: 'accepted', event: { phone: '+447700900123' },
    });
    expect(parseBonlineEvent({ ...payload, is_caller: false, peer_caller_id_number: 'anonymous' }, headers(), config, now).type).toBe('ignored');
    expect(parseBonlineEvent({ ...payload, is_caller: 'false' }, headers(), config, now).type).toBe('invalid');
  });
  it('never turns outgoing or internal calls into incoming customer numbers', () => {
    for (const direction of ['outbound', 'outgoing', 'internal', '', undefined]) {
      expect(parseBonlineEvent({ ...payload, direction }, headers(), config, now).type).toBe('ignored');
    }
  });
  it('rejects cross-account events and ignores other configured users', () => {
    expect(parseBonlineEvent(payload, headers('call_created', 'tenant-2'), config, now).type).toBe('forbidden');
    expect(parseBonlineEvent({ ...payload, user_uuid: 'user-2' }, headers(), config, now).type).toBe('ignored');
  });
  it('ignores withheld numbers and never substitutes the peer business number', () => {
    for (const caller_id_number of ['anonymous', 'withheld', '1001', '', null]) {
      expect(parseBonlineEvent({ ...payload, caller_id_number, peer_caller_id_number: '+441411234567' }, headers(), config, now).type).toBe('ignored');
    }
  });
  it('ignores old, future, and already-ended created events', () => {
    for (const age of [-90_001, 30_001]) {
      expect(parseBonlineEvent({ ...payload, creation_time: new Date(now + age).toISOString() }, headers(), config, now).type).toBe('ignored');
    }
    expect(parseBonlineEvent({ ...payload, hangup_time: new Date(now).toISOString() }, headers(), config, now).type).toBe('ignored');
    expect(parseBonlineEvent({ ...payload, creation_time: 'invalid' }, headers(), config, now).type).toBe('invalid');
  });
  it('accepts ended tombstones even without a caller number and treats duplicates consistently', () => {
    const created = parseBonlineEvent(payload, headers(), config, now);
    const ended = parseBonlineEvent({ call_id: payload.call_id, user_uuid: payload.user_uuid }, headers('call_ended'), config, now);
    expect(created.type).toBe('accepted');
    expect(ended.type).toBe('accepted');
    if (created.type === 'accepted' && ended.type === 'accepted') expect(ended.event.key).toBe(created.event.key);
  });
  it('ignores unsupported event types and rejects malformed payloads', () => {
    expect(parseBonlineEvent(payload, headers('call_updated'), config, now).type).toBe('ignored');
    expect(parseBonlineEvent([], headers(), config, now).type).toBe('invalid');
    expect(parseBonlineEvent({ ...payload, call_id: '' }, headers(), config, now).type).toBe('invalid');
    expect(parseBonlineEvent({ ...payload, call_id: 'x'.repeat(201) }, headers(), config, now).type).toBe('invalid');
  });
});

describe('bOnline request boundaries', () => {
  it('enforces body size without trusting Content-Length', async () => {
    const request = new Request('https://example.test/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(BONLINE_MAX_BODY_BYTES) }) });
    await expect(readBonlineBody(request)).rejects.toMatchObject({ status: 413 });
  });
  it('requires JSON and rejects malformed bodies', async () => {
    await expect(readBonlineBody(new Request('https://example.test', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 415 });
    await expect(readBonlineBody(new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).rejects.toMatchObject({ status: 400 });
    await expect(readBonlineBody(new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{}' }))).resolves.toEqual({});
  });
  it('only enables a sufficiently strong server configuration', () => {
    vi.stubEnv('BONLINE_WEBHOOK_SECRET', 'short');
    expect(getBonlineConfig()).toBeNull();
    vi.stubEnv('BONLINE_WEBHOOK_SECRET', 'x'.repeat(64));
    vi.stubEnv('BONLINE_ADMIN_USER_IDS', ' admin-1,admin-2 ');
    const configured = getBonlineConfig()!;
    expect(configured.scope).not.toContain(configured.secret);
    expect(canReadBonlineCalls(configured, 'admin-1')).toBe(true);
    expect(canReadBonlineCalls(configured, 'admin-3')).toBe(false);
    expect(matchesBonlineSecret('x'.repeat(64), configured.secret)).toBe(true);
    expect(matchesBonlineSecret('x', configured.secret)).toBe(false);
  });
  it('validates cursors without bigint overflow or SQL input', () => {
    expect(isBonlineCursor('0')).toBe(true);
    expect(isBonlineCursor('9223372036854775807')).toBe(true);
    for (const value of ['', '-1', '01', '1e3', '9223372036854775808', '1; DROP TABLE users']) expect(isBonlineCursor(value)).toBe(false);
  });
  it('normalizes UK and international public numbers but rejects malformed inputs', () => {
    expect(normalizeBonlinePhone('07700 900123')).toBe('+447700900123');
    expect(normalizeBonlinePhone('0044 (0) 7700 900123')).toBe('+447700900123');
    expect(normalizeBonlinePhone('+49 151 12345678')).toBe('+4915112345678');
    expect(normalizeBonlinePhone('1001')).toBeNull();
    for (const own of ['01932 509613', '+441932509613', '441932509613', '00441932509613', '+44 (0) 1932 509613']) {
      expect(isBonlineBusinessPhone(own)).toBe(true);
    }
    for (const other of ['+447700900123', 'anonymous', null, undefined, '']) expect(isBonlineBusinessPhone(other)).toBe(false);
  });
});
