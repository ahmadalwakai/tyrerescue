import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ execute: null as null | ((query: unknown) => Promise<unknown>) }));
vi.mock('@/lib/db', () => ({ db: { execute: (query: unknown) => state.execute!(query) } }));

import { parseBonlineCallsQuery, parseBonlineFollowUpCommand, readBonlineCalls, updateBonlineFollowUp, type BonlineCallOutcome } from '@/lib/bonline/calls';

let pg: PGlite;
const key = (id: string) => createHash('sha256').update(id).digest('hex');
const fixedTime = '2026-10-28T09:00:00.123456Z';
async function seed(id: string, options: { scope?: string; outcome?: BonlineCallOutcome; time?: string; task?: boolean } = {}) {
  const scope = options.scope ?? 'scope-a';
  await pg.query(`INSERT INTO bonline_calls (scope,event_key,call_id,phone,started_at,first_received_at,last_received_at,outcome)
    VALUES ($1,$2,$3,$4,$5,$5,$5,$6)`, [scope, key(id), id, '+447700900123', options.time ?? fixedTime, options.outcome ?? 'missed']);
  if (options.task !== false) await pg.query('INSERT INTO bonline_call_followups (scope,event_key) VALUES ($1,$2)', [scope, key(id)]);
  return key(id);
}
const claim = { action: 'claim', resolution: null } as const;
const release = { action: 'release', resolution: null } as const;
const finish = { action: 'resolve', resolution: 'Customer called back.' } as const;

beforeAll(async () => {
  pg = new PGlite();
  const database = drizzle(pg);
  state.execute = (query) => database.execute(query as Parameters<typeof database.execute>[0]);
  await pg.exec(readFileSync(resolve('scripts/bonline-call-events.sql'), 'utf8'));
  const migration = readFileSync(resolve('scripts/bonline-call-management.sql'), 'utf8');
  await pg.exec(migration);
  await pg.exec(migration);
});
beforeEach(async () => { await pg.exec('TRUNCATE bonline_calls CASCADE;'); });
afterAll(async () => { await pg.close(); });

describe('call history query boundaries', () => {
  it('validates bounded exact filters and rejects duplicate or unknown arguments', () => {
    expect(parseBonlineCallsQuery(new URLSearchParams())).toEqual({ limit: 50 });
    expect(parseBonlineCallsQuery(new URLSearchParams('limit=100&outcome=missed&followUp=open')))
      .toEqual({ limit: 100, outcome: 'missed', followUp: 'open' });
    for (const invalid of ['limit=0', 'limit=101', 'limit=1.5', 'limit=01', 'limit=-1', 'limit=1&limit=2',
      'outcome=other', 'outcome=', 'followUp=other', 'before=', 'before=not-a-cursor', 'phone=x', 'after=1']) {
      expect(parseBonlineCallsQuery(new URLSearchParams(invalid))).toBeNull();
    }
  });
  it('rejects malformed and impossible cursor timestamps and injected identifiers', () => {
    for (const pair of [
      ['2026-02-31T09:00:00.123456Z', key('a')],
      ['0000-01-01T00:00:00.000000Z', key('a')],
      [fixedTime, "'; DROP TABLE bonline_calls"],
      [fixedTime, key('a'), 'extra'],
    ]) {
      const cursor = Buffer.from(JSON.stringify(pair)).toString('base64url');
      expect(parseBonlineCallsQuery(new URLSearchParams({ before: cursor }))).toBeNull();
    }
  });
  it('allows only self actions and a bounded resolution on resolve', () => {
    expect(parseBonlineFollowUpCommand({ action: 'resolve', resolution: '  Called back  ' }))
      .toEqual({ action: 'resolve', resolution: 'Called back' });
    expect(parseBonlineFollowUpCommand({ action: 'claim' })).toEqual(claim);
    for (const value of [null, [], {}, { action: 'reopen' }, { action: 'claim', assignedTo: 'other' },
      { action: 'claim', resolution: 'x' }, { action: 'resolve', resolution: null }, { action: 'resolve', resolution: 1 },
      { action: 'resolve', resolution: 'x'.repeat(501) }]) expect(parseBonlineFollowUpCommand(value)).toBeNull();
  });
});

describe('durable call history and follow-up storage', () => {
  it('isolates scopes and returns nullable task and call times without leaking storage fields', async () => {
    await seed('other-scope', { scope: 'scope-b' });
    await seed('unknown', { outcome: 'unknown', task: false });
    const page = await readBonlineCalls('scope-a', { limit: 50 });
    expect(page.calls).toHaveLength(1);
    expect(page.calls[0]).toMatchObject({ id: key('unknown'), callId: 'unknown', outcome: 'unknown', followUp: null, answeredAt: null, endedAt: null });
    expect(page.calls[0]).not.toHaveProperty('scope');
    expect(page.calls[0]).not.toHaveProperty('explicit_unanswered');
    expect(page.nextCursor).toBeNull();
  });
  it('paginates tied timestamps and preserves PostgreSQL microseconds', async () => {
    await seed('same-a'); await seed('same-b');
    await seed('later', { time: '2026-10-28T09:00:00.123457Z' });
    const first = await readBonlineCalls('scope-a', { limit: 1 });
    expect(first.calls[0].callId).toBe('later');
    const decoded = parseBonlineCallsQuery(new URLSearchParams({ limit: '1', before: first.nextCursor! }));
    expect(decoded?.before?.at).toBe('2026-10-28T09:00:00.123457Z');
    const second = await readBonlineCalls('scope-a', decoded!);
    const third = await readBonlineCalls('scope-a', parseBonlineCallsQuery(new URLSearchParams({ limit: '1', before: second.nextCursor! }))!);
    expect(new Set([...first.calls, ...second.calls, ...third.calls].map((call) => call.id)).size).toBe(3);
    expect([second.calls[0].id, third.calls[0].id]).toEqual([key('same-a'), key('same-b')].sort().reverse());
    expect(third.nextCursor).toBeNull();
  });
  it('filters verified outcomes and pending/claimed open tasks without inventing tasks', async () => {
    await seed('pending');
    const claimed = await seed('claimed');
    const resolved = await seed('resolved');
    await seed('answered', { outcome: 'answered', task: false });
    await updateBonlineFollowUp('scope-a', claimed, 'admin-1', claim);
    await updateBonlineFollowUp('scope-a', resolved, 'admin-1', finish);
    expect((await readBonlineCalls('scope-a', { limit: 50, outcome: 'answered' })).calls.map((call) => call.callId)).toEqual(['answered']);
    expect((await readBonlineCalls('scope-a', { limit: 50, followUp: 'open' })).calls.map((call) => call.callId).sort()).toEqual(['claimed', 'pending']);
    expect((await readBonlineCalls('scope-a', { limit: 50, followUp: 'resolved' })).calls.map((call) => call.callId)).toEqual(['resolved']);
    expect((await readBonlineCalls('scope-a', { limit: 50, outcome: 'answered', followUp: 'pending' })).calls).toEqual([]);
  });
  it('summarizes all open missed tasks independently of filters, cursor, page size and other scopes', async () => {
    await seed('recent-pending');
    const oldClaim = await seed('old-claimed');
    const resolved = await seed('old-resolved');
    const answered = await seed('late-answered', { outcome: 'answered' });
    await seed('other-scope', { scope: 'scope-b' });
    await updateBonlineFollowUp('scope-a', oldClaim, 'admin-1', claim);
    await updateBonlineFollowUp('scope-a', resolved, 'admin-1', finish);
    await pg.query(`UPDATE bonline_call_followups SET created_at = clock_timestamp() - interval '16 minutes'
      WHERE event_key IN ($1, $2, $3)`, [oldClaim, resolved, answered]);
    const filtered = await readBonlineCalls('scope-a', { limit: 1, outcome: 'answered' });
    expect(filtered.calls).toHaveLength(1);
    expect(filtered.summary).toEqual({ openFollowUps: 2, overdueFollowUps: 1 });
    for (const followUp of ['open', 'pending', 'claimed'] as const) {
      const actionable = await readBonlineCalls('scope-a', { limit: 50, followUp });
      expect(actionable.calls.every((call) => call.outcome === 'missed')).toBe(true);
      expect(actionable.calls.some((call) => call.callId === 'late-answered')).toBe(false);
    }
    const emptyPage = await readBonlineCalls('scope-a', { limit: 1, outcome: 'unknown',
      before: { at: '2000-01-01T00:00:00.000000Z', id: key('none') } });
    expect(emptyPage.calls).toEqual([]);
    expect(emptyPage.summary).toEqual(filtered.summary);
    expect((await readBonlineCalls('empty-scope', { limit: 1 })).summary).toEqual({ openFollowUps: 0, overdueFollowUps: 0 });
  });
  it('allows only one administrator to claim and prevents takeover, release or resolve by another', async () => {
    const id = await seed('race');
    const results = await Promise.all([
      updateBonlineFollowUp('scope-a', id, 'admin-1', claim),
      updateBonlineFollowUp('scope-a', id, 'admin-2', claim),
    ]);
    expect(results.map((result) => result.result).sort()).toEqual(['conflict', 'updated']);
    const owner = (await readBonlineCalls('scope-a', { limit: 1 })).calls[0].followUp!.assignedTo!;
    const other = owner === 'admin-1' ? 'admin-2' : 'admin-1';
    for (const command of [claim, release, finish]) {
      expect(await updateBonlineFollowUp('scope-a', id, other, command)).toEqual({ result: 'conflict' });
    }
    const repeated = await updateBonlineFollowUp('scope-a', id, owner, claim);
    expect(repeated.result).toBe('updated');
  });
  it('releases an own claim and records an explicit resolution by the next administrator', async () => {
    const id = await seed('handoff');
    await updateBonlineFollowUp('scope-a', id, 'admin-1', claim);
    const released = await updateBonlineFollowUp('scope-a', id, 'admin-1', release);
    expect(released).toMatchObject({ result: 'updated', followUp: { status: 'pending', assignedTo: null, claimedAt: null } });
    const resolved = await updateBonlineFollowUp('scope-a', id, 'admin-2', finish);
    expect(resolved).toMatchObject({ result: 'updated', followUp: { status: 'resolved', assignedTo: 'admin-2', resolvedBy: 'admin-2', resolution: 'Customer called back.' } });
    if (resolved.result === 'updated') expect(Number.isFinite(Date.parse(resolved.followUp.resolvedAt!))).toBe(true);
    for (const action of [claim, release, finish]) expect(await updateBonlineFollowUp('scope-a', id, 'admin-2', action)).toEqual({ result: 'conflict' });
  });
  it('never creates follow-ups for nonmissed calls and blocks late-answered tasks', async () => {
    for (const outcome of ['unknown', 'ringing', 'answered'] as const) {
      const id = await seed(outcome, { outcome, task: false });
      expect(await updateBonlineFollowUp('scope-a', id, 'admin-1', claim)).toEqual({ result: 'conflict' });
    }
    const noTask = await seed('missed-no-task', { task: false });
    expect(await updateBonlineFollowUp('scope-a', noTask, 'admin-1', claim)).toEqual({ result: 'conflict' });
    const late = await seed('late-answered', { outcome: 'answered' });
    expect(await updateBonlineFollowUp('scope-a', late, 'admin-1', claim)).toEqual({ result: 'conflict' });
    const count = await pg.query<{ count: number }>('SELECT count(*)::int AS count FROM bonline_call_followups');
    expect(count.rows[0].count).toBe(1);
  });
  it('returns not found for absent or cross-scope calls without touching another scope', async () => {
    const id = await seed('private', { scope: 'scope-b' });
    expect(await updateBonlineFollowUp('scope-a', id, 'admin-1', claim)).toEqual({ result: 'not_found' });
    expect((await readBonlineCalls('scope-b', { limit: 1 })).calls[0].followUp?.status).toBe('pending');
    expect(await updateBonlineFollowUp('scope-a', key('missing'), 'admin-1', claim)).toEqual({ result: 'not_found' });
  });
});
