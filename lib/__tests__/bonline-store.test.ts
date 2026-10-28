import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BonlineCallEvent } from '@/lib/bonline/events';
import { BUSINESS_PHONE_E164 } from '@/lib/config/business-contact';

const state = vi.hoisted(() => ({ execute: null as null | ((query: unknown) => Promise<unknown>) }));
vi.mock('@/lib/db', () => ({ db: { execute: (query: unknown) => state.execute!(query) } }));

import { readBonlineFeed, storeBonlineEvent } from '@/lib/bonline/store';

let pg: PGlite;
const event = (id: string, overrides: Partial<BonlineCallEvent> = {}): BonlineCallEvent => ({
  key: createHash('sha256').update(id).digest('hex'), callId: id, kind: 'call_created', phone: '+447700900123',
  createdAt: new Date().toISOString(), ...overrides,
});

beforeAll(async () => {
  pg = new PGlite();
  const database = drizzle(pg);
  state.execute = (query) => database.execute(query as Parameters<typeof database.execute>[0]);
  await pg.exec(readFileSync(resolve('scripts/bonline-call-events.sql'), 'utf8'));
  await pg.exec(readFileSync(resolve('scripts/bonline-call-management.sql'), 'utf8'));
  // The migration must be safely repeatable.
  await pg.exec(readFileSync(resolve('scripts/bonline-call-events.sql'), 'utf8'));
  await pg.exec(readFileSync(resolve('scripts/bonline-call-management.sql'), 'utf8'));
});
beforeEach(async () => {
  await pg.exec('TRUNCATE bonline_call_events, bonline_call_followups, bonline_calls; UPDATE bonline_event_state SET cursor = 0;');
});
afterAll(async () => { await pg.close(); });

describe('persistent bOnline call feed', () => {
  it('keeps a durable missed call and one assigned follow-up across retries and live-feed expiry', async () => {
    const created = event('durable-missed', { verifiedInbound: true });
    const ended = { ...created, kind: 'call_ended' as const, endedAt: new Date().toISOString(), unansweredAtEnd: true };
    await storeBonlineEvent('scope-a', created);
    await storeBonlineEvent('scope-a', ended);
    await pg.exec("UPDATE bonline_call_followups SET status = 'claimed', assigned_to = 'admin-one', claimed_at = clock_timestamp();");
    await storeBonlineEvent('scope-a', ended);
    const tasks = await pg.query<{ status: string; assigned_to: string }>('SELECT status, assigned_to FROM bonline_call_followups');
    expect(tasks.rows).toEqual([{ status: 'claimed', assigned_to: 'admin-one' }]);
    expect((await pg.query<{ outcome: string; phone: string }>('SELECT outcome, phone FROM bonline_calls')).rows)
      .toEqual([{ outcome: 'missed', phone: '+447700900123' }]);
    await pg.exec("UPDATE bonline_call_events SET received_at = clock_timestamp() - interval '2 days';");
    await storeBonlineEvent('scope-a', event('cleanup-trigger'));
    expect((await pg.query('SELECT * FROM bonline_calls')).rows).toHaveLength(1);
    expect((await pg.query('SELECT * FROM bonline_call_followups')).rows).toHaveLength(1);
  });
  it('lets verified answer evidence win over missed events in either order and closes only open tasks', async () => {
    const call = event('answer-late', { verifiedInbound: true });
    const ended = { ...call, kind: 'call_ended' as const, endedAt: new Date().toISOString(), unansweredAtEnd: true };
    await storeBonlineEvent('scope-a', ended);
    await storeBonlineEvent('scope-a', { ...call, answeredAt: call.createdAt });
    await storeBonlineEvent('scope-a', ended);
    expect((await pg.query<{ outcome: string }>('SELECT outcome FROM bonline_calls')).rows).toEqual([{ outcome: 'answered' }]);
    expect((await pg.query<{ status: string; resolution: string }>('SELECT status, resolution FROM bonline_call_followups')).rows)
      .toEqual([{ status: 'resolved', resolution: 'Answered call confirmed' }]);
    expect((await readBonlineFeed('scope-a', null)).events).toEqual([]);
    const firstAnswered = event('answer-first', { verifiedInbound: true, answeredAt: new Date().toISOString() });
    await storeBonlineEvent('scope-a', firstAnswered);
    await storeBonlineEvent('scope-a', { ...firstAnswered, answeredAt: null, kind: 'call_ended', unansweredAtEnd: true });
    expect((await pg.query('SELECT * FROM bonline_call_followups')).rows).toHaveLength(1);
    expect((await pg.query<{ outcome: string }>('SELECT outcome FROM bonline_calls')).rows.every((row) => row.outcome === 'answered')).toBe(true);
  });
  it('keeps empty ended tombstones unknown in either order and preserves the earlier phone', async () => {
    const created = event('unknown-end', { verifiedInbound: true });
    await storeBonlineEvent('scope-a', created);
    await storeBonlineEvent('scope-a', { ...created, verifiedInbound: false, kind: 'call_ended', phone: null, createdAt: null });
    const beforeCreate = event('end-before-create', { kind: 'call_ended', phone: null, createdAt: null });
    await storeBonlineEvent('scope-a', beforeCreate);
    expect((await pg.query('SELECT * FROM bonline_calls')).rows).toHaveLength(1);
    await storeBonlineEvent('scope-a', event('end-before-create', { verifiedInbound: true }));
    expect((await pg.query<{ outcome: string; phone: string }>('SELECT outcome, phone FROM bonline_calls')).rows)
      .toEqual([{ outcome: 'unknown', phone: '+447700900123' }, { outcome: 'unknown', phone: '+447700900123' }]);
    expect((await pg.query('SELECT * FROM bonline_call_followups')).rows).toEqual([]);
    expect((await readBonlineFeed('scope-a', null)).events).toEqual([]);
  });
  it('retains verified answer/end metadata until a later create establishes the incoming direction', async () => {
    const created = event('unknown-direction-answered', { verifiedInbound: true });
    const answerTime = created.createdAt!;
    const endTime = new Date().toISOString();
    await storeBonlineEvent('scope-a', { ...created, kind: 'call_ended', verifiedInbound: false, phone: null, answeredAt: answerTime, endedAt: endTime });
    expect((await pg.query('SELECT * FROM bonline_calls')).rows).toEqual([]);
    await storeBonlineEvent('scope-a', created);
    await storeBonlineEvent('scope-a', { ...created, kind: 'call_ended', unansweredAtEnd: true });
    const rows = await pg.query<{ outcome: string; answered_at: Date; ended_at: Date; phone: string }>('SELECT outcome, answered_at, ended_at, phone FROM bonline_calls');
    expect(rows.rows[0]).toMatchObject({ outcome: 'answered', phone: '+447700900123' });
    expect(rows.rows[0].answered_at.toISOString()).toBe(answerTime);
    expect(rows.rows[0].ended_at.toISOString()).toBe(endTime);
    expect((await pg.query('SELECT * FROM bonline_call_followups')).rows).toEqual([]);
    expect((await readBonlineFeed('scope-a', null)).events).toEqual([]);
  });
  it('isolates durable calls/tasks by scope and never replays a verified late answer into the live feed', async () => {
    const created = event('scope-call', { verifiedInbound: true, createdAt: new Date(Date.now() - 600_000).toISOString() });
    await storeBonlineEvent('scope-a', { ...created, answeredAt: created.createdAt });
    await storeBonlineEvent('scope-b', { ...created, kind: 'call_ended', unansweredAtEnd: true });
    expect((await pg.query<{ scope: string; outcome: string }>('SELECT scope, outcome FROM bonline_calls ORDER BY scope')).rows)
      .toEqual([{ scope: 'scope-a', outcome: 'answered' }, { scope: 'scope-b', outcome: 'missed' }]);
    expect((await pg.query<{ scope: string }>('SELECT scope FROM bonline_call_followups')).rows).toEqual([{ scope: 'scope-b' }]);
    expect((await readBonlineFeed('scope-a', null)).events).toEqual([]);
  });
  it('does not create a ledger without verified incoming direction or a follow-up without an external number', async () => {
    await storeBonlineEvent('scope-a', event('unverified'));
    expect((await pg.query('SELECT * FROM bonline_calls')).rows).toEqual([]);
    for (const [id, phone] of [['anonymous', null], ['own-number', BUSINESS_PHONE_E164]] as const) {
      await storeBonlineEvent('scope-a', event(id, { kind: 'call_ended', verifiedInbound: true, unansweredAtEnd: true, phone }));
    }
    expect((await pg.query<{ phone: string | null }>('SELECT phone FROM bonline_calls')).rows).toEqual([{ phone: null }, { phone: null }]);
    expect((await pg.query('SELECT * FROM bonline_call_followups')).rows).toEqual([]);
  });
  it('rolls back the whole webhook write if the durable migration is missing', async () => {
    await pg.exec('ALTER TABLE bonline_calls RENAME TO bonline_calls_unavailable;');
    try {
      await expect(storeBonlineEvent('scope-a', event('missing-migration', { verifiedInbound: true }))).rejects.toThrow();
      expect((await pg.query('SELECT * FROM bonline_call_events')).rows).toEqual([]);
      expect((await pg.query<{ cursor: number }>('SELECT cursor FROM bonline_event_state')).rows[0].cursor).toBe(0);
    } finally {
      await pg.exec('ALTER TABLE bonline_calls_unavailable RENAME TO bonline_calls;');
    }
  });
  it('suppresses a previously stored business number without hiding later customer calls or stalling the cursor', async () => {
    await storeBonlineEvent('scope-a', event('legacy-own-line', { phone: BUSINESS_PHONE_E164 }));
    const suppressed = await readBonlineFeed('scope-a', null);
    expect(suppressed.events).toEqual([]);
    expect(suppressed.cursor).toBe('1');
    await storeBonlineEvent('scope-a', event('external-customer'));
    const next = await readBonlineFeed('scope-a', suppressed.cursor);
    expect(next.events.map((item) => item.phone)).toEqual(['+447700900123']);
    expect(next.cursor).toBe('2');
  });
  it('returns a currently ringing call on first open, then only new calls after the cursor', async () => {
    await storeBonlineEvent('scope-a', event('ringing'));
    const baseline = await readBonlineFeed('scope-a', null);
    expect(baseline.cursor).toBe('1');
    expect(baseline.events.map((item) => item.callId)).toEqual(['ringing']);
    await storeBonlineEvent('scope-a', event('new'));
    const next = await readBonlineFeed('scope-a', baseline.cursor);
    expect(next.events.map((item) => item.callId)).toEqual(['new']);
    expect(Number.isFinite(Date.parse(next.serverTime))).toBe(true);
    expect((await readBonlineFeed('scope-a', next.cursor)).events).toEqual([]);
  });
  it('deduplicates retries without advancing the event or changing the customer phone', async () => {
    const call = event('duplicate');
    await storeBonlineEvent('scope-a', call);
    await storeBonlineEvent('scope-a', { ...call, phone: '+447700900999' });
    const result = await readBonlineFeed('scope-a', '0');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ id: '1', phone: '+447700900123' });
    expect(result.cursor).toBe('2');
  });
  it('suppresses ended calls and prevents an out-of-order create from reopening a call', async () => {
    await storeBonlineEvent('scope-a', event('ended-first', { kind: 'call_ended', phone: null, createdAt: null }));
    await storeBonlineEvent('scope-a', event('ended-first'));
    await storeBonlineEvent('scope-a', event('ended-second'));
    await storeBonlineEvent('scope-a', event('ended-second', { kind: 'call_ended', phone: null, createdAt: null }));
    expect((await readBonlineFeed('scope-a', null)).events).toEqual([]);
  });
  it('isolates scopes and expires calls outside the fresh window', async () => {
    await storeBonlineEvent('scope-a', event('other-project'));
    await storeBonlineEvent('scope-b', event('own'));
    await storeBonlineEvent('scope-b', event('stale', { createdAt: new Date(Date.now() - 180_000).toISOString() }));
    expect((await readBonlineFeed('scope-b', null)).events.map((item) => item.callId)).toEqual(['own']);
  });
  it('paginates at 50 without skipping remaining calls', async () => {
    for (let i = 0; i < 52; i++) await storeBonlineEvent('scope-a', event(`call-${i}`));
    const first = await readBonlineFeed('scope-a', '0');
    expect(first.events).toHaveLength(50);
    const second = await readBonlineFeed('scope-a', first.cursor);
    expect(second.events.map((item) => item.callId)).toEqual(['call-50', 'call-51']);
  });
  it('fails closed if migration initialization is missing', async () => {
    await pg.exec('DELETE FROM bonline_event_state;');
    try {
      await expect(storeBonlineEvent('scope-a', event('missing-state'))).rejects.toThrow('not initialized');
      await expect(readBonlineFeed('scope-a', null)).rejects.toThrow('not initialized');
    } finally {
      await pg.exec('INSERT INTO bonline_event_state (id, cursor) VALUES (1, 0);');
    }
  });
});
