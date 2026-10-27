import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BonlineCallEvent } from '@/lib/bonline/events';

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
  // The migration must be safely repeatable.
  await pg.exec(readFileSync(resolve('scripts/bonline-call-events.sql'), 'utf8'));
});
beforeEach(async () => {
  await pg.exec('TRUNCATE bonline_call_events; UPDATE bonline_event_state SET cursor = 0;');
});
afterAll(async () => { await pg.close(); });

describe('persistent bOnline call feed', () => {
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
