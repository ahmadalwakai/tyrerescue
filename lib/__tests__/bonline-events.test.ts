import { afterEach, describe, expect, it, vi } from 'vitest';
import { canReadBonlineCalls, getBonlineConfig, matchesBonlineSecret, type BonlineConfig } from '@/lib/bonline/config';
import { BONLINE_MAX_BODY_BYTES, normalizeBonlinePhone, parseBonlineEvent, readBonlineBody } from '@/lib/bonline/events';
import { isBonlineCursor } from '@/lib/bonline/store';

const now = Date.parse('2026-10-27T22:00:00Z');
const config: BonlineConfig = { secret: 'a'.repeat(64), scope: 'scope', tenantIds: ['tenant-1'], providerUserIds: ['user-1'], adminUserIds: [] };
const payload = { call_id: '123.45', caller_id_number: '+44 7700 900123', creation_time: new Date(now).toISOString(), user_uuid: 'user-1', direction: 'inbound', status: 'Ring' };
const headers = (name = 'call_created', tenant = 'tenant-1') => new Headers({ name, tenant_uuid: tenant });

afterEach(() => vi.unstubAllEnvs());

describe('bOnline event contract', () => {
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
  });
});
